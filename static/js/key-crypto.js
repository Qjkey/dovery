/**
 * Клиентское шифрование ключей (PBKDF2 + AES-GCM) и подписи ECDH public_key (ECDSA).
 */

const DOVERY_DB_NAME = 'Dovery';
const DOVERY_STORE_NAME = 'secrets';

function openDoveryDB() {
    return new Promise((resolve, reject) => {
        const openAt = (version) => {
            const request = version == null
                ? indexedDB.open(DOVERY_DB_NAME)
                : indexedDB.open(DOVERY_DB_NAME, version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(DOVERY_STORE_NAME)) {
                    db.createObjectStore(DOVERY_STORE_NAME);
                }
            };

            request.onerror = () => reject(request.error || new Error('idb_open_failed'));

            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(DOVERY_STORE_NAME)) {
                    const nextVersion = db.version + 1;
                    db.close();
                    openAt(nextVersion);
                    return;
                }
                resolve(db);
            };
        };

        openAt();
    });
}

function clearDoveryDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.deleteDatabase(DOVERY_DB_NAME);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
            request.onblocked = () => setTimeout(() => resolve(true), 300);
        } catch (_) {
            resolve(false);
        }
    });
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function generateKeySaltBase64() {
    return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Соль PBKDF2: base64 (новые аккаунты) или legacy username. */
function resolveSalt(saltOrLegacyUsername) {
    if (!saltOrLegacyUsername) {
        throw new Error('no_salt');
    }
    if (typeof saltOrLegacyUsername === 'string' && saltOrLegacyUsername.length >= 16
        && /^[A-Za-z0-9+/]+=*$/.test(saltOrLegacyUsername)) {
        try {
            const bytes = base64ToBytes(saltOrLegacyUsername);
            if (bytes.length >= 16) return bytes;
        } catch (_) {
            /* legacy username */
        }
    }
    return new TextEncoder().encode(String(saltOrLegacyUsername));
}

async function deriveEncryptionKey(password, saltOrLegacyUsername) {
    const salt = resolveSalt(saltOrLegacyUsername);
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function decryptPrivateKeyRaw(encryptedBase64, password, saltOrLegacyUsername) {
    const combined = base64ToBytes(encryptedBase64);
    if (combined.length < 13) {
        throw new Error('invalid_ciphertext');
    }
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const encryptionKey = await deriveEncryptionKey(password, saltOrLegacyUsername);
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        ciphertext
    );
}

async function encryptPrivateKeyRaw(privExport, password, saltOrLegacyUsername) {
    const encryptionKey = await deriveEncryptionKey(password, saltOrLegacyUsername);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        privExport
    );
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);
    return bytesToBase64(combined);
}

async function decryptAndImportEcdhKey(encryptedBase64, password, saltOrLegacyUsername) {
    const decryptedRaw = await decryptPrivateKeyRaw(encryptedBase64, password, saltOrLegacyUsername);
    return window.crypto.subtle.importKey(
        'pkcs8',
        decryptedRaw,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
    );
}

async function decryptAndImportSigningKey(encryptedBase64, password, saltOrLegacyUsername) {
    const decryptedRaw = await decryptPrivateKeyRaw(encryptedBase64, password, saltOrLegacyUsername);
    return window.crypto.subtle.importKey(
        'pkcs8',
        decryptedRaw,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
    );
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateSigningKeyPair() {
    return crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );
}

async function exportSpkiBase64(publicKey) {
    const exported = await crypto.subtle.exportKey('spki', publicKey);
    return bytesToBase64(new Uint8Array(exported));
}

async function signEcdhPublicKey(signingPrivateKey, ecdhPublicKeySpkiBase64) {
    const pubBytes = base64ToBytes(ecdhPublicKeySpkiBase64);
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        signingPrivateKey,
        pubBytes
    );
    return bytesToBase64(new Uint8Array(signature));
}

async function verifyEcdhPublicKey(signingPublicKeySpkiBase64, ecdhPublicKeySpkiBase64, signatureBase64) {
    if (!signingPublicKeySpkiBase64 || !ecdhPublicKeySpkiBase64 || !signatureBase64) {
        return { ok: false, reason: 'unsigned' };
    }
    try {
        const signingPub = await crypto.subtle.importKey(
            'spki',
            base64ToBytes(signingPublicKeySpkiBase64),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        );
        const ok = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            signingPub,
            base64ToBytes(signatureBase64),
            base64ToBytes(ecdhPublicKeySpkiBase64)
        );
        return { ok, reason: ok ? 'ok' : 'invalid' };
    } catch (err) {
        console.warn('verifyEcdhPublicKey failed', err);
        return { ok: false, reason: 'invalid' };
    }
}

async function encryptKeyBundleForServer(ecdhPrivateKey, signingPrivateKey, password, keySaltBase64) {
    const ecdhExport = await crypto.subtle.exportKey('pkcs8', ecdhPrivateKey);
    const bundle = {
        key_salt: keySaltBase64,
        encrypted_private_key: await encryptPrivateKeyRaw(ecdhExport, password, keySaltBase64),
    };
    if (signingPrivateKey) {
        const signingExport = await crypto.subtle.exportKey('pkcs8', signingPrivateKey);
        bundle.encrypted_signing_private_key = await encryptPrivateKeyRaw(
            signingExport,
            password,
            keySaltBase64
        );
    }
    return bundle;
}

async function migrateLegacyKeysToRandomSalt({
    password,
    legacyUsername,
    encryptedPrivateKey,
    encryptedSigningPrivateKey,
    ecdhPrivateKey,
    signingPrivateKey,
}) {
    const newSalt = generateKeySaltBase64();
    let ecdhKey = ecdhPrivateKey;
    let signingKey = signingPrivateKey;

    if (!ecdhKey) {
        ecdhKey = await decryptAndImportEcdhKey(encryptedPrivateKey, password, legacyUsername);
    }
    if (!signingKey && encryptedSigningPrivateKey) {
        signingKey = await decryptAndImportSigningKey(encryptedSigningPrivateKey, password, legacyUsername);
    }

    const bundle = await encryptKeyBundleForServer(ecdhKey, signingKey, password, newSalt);
    return { bundle, ecdhKey, signingKey, newSalt };
}
