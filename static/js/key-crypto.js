/**
 * Клиентское шифрование приватного ключа (PBKDF2 + AES-GCM).
 * Соль = username ровно в том виде, как хранится в БД.
 */

const DOVERY_DB_NAME = 'Dovery';
const DOVERY_STORE_NAME = 'secrets';

/**
 * Открывает IndexedDB Dovery и гарантирует наличие store `secrets`.
 * Чинит «пустые» БД (созданные open без onupgradeneeded).
 */
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

/** Полностью удаляет IndexedDB Dovery (ключи, профиль и т.д.). */
function clearDoveryDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.deleteDatabase(DOVERY_DB_NAME);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
            request.onblocked = () => {
                // Другое соединение ещё открыто — считаем очистку запрошенной
                setTimeout(() => resolve(true), 300);
            };
        } catch (_) {
            resolve(false);
        }
    });
}

async function deriveEncryptionKey(password, username) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(username),
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function decryptPrivateKeyRaw(encryptedBase64, password, username) {
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    if (combined.length < 13) {
        throw new Error("invalid_ciphertext");
    }
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const encryptionKey = await deriveEncryptionKey(password, username);
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        ciphertext
    );
}

async function encryptPrivateKeyRaw(privExport, password, username) {
    const encryptionKey = await deriveEncryptionKey(password, username);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        privExport
    );
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);
    let binary = "";
    for (let i = 0; i < combined.length; i++) {
        binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
}

async function decryptAndImportKey(encryptedBase64, password, username) {
    const decryptedRaw = await decryptPrivateKeyRaw(encryptedBase64, password, username);
    return window.crypto.subtle.importKey(
        "pkcs8",
        decryptedRaw,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"]
    );
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Перешифровывает private_key под новый username.
 * Сначала пытается расшифровать серверный blob старой солью;
 * если не вышло (уже сломанная смена) — берёт CryptoKey из IndexedDB.
 */
async function reencryptPrivateKeyForUsername({
    encryptedPrivateKey,
    oldUsername,
    newUsername,
    password,
    localPrivateKey = null,
}) {
    let raw = null;
    try {
        raw = await decryptPrivateKeyRaw(encryptedPrivateKey, password, oldUsername);
    } catch (_) {
        if (!localPrivateKey) {
            throw new Error("decrypt_failed");
        }
        try {
            raw = await crypto.subtle.exportKey("pkcs8", localPrivateKey);
        } catch (_) {
            throw new Error("export_failed");
        }
    }
    const next = await encryptPrivateKeyRaw(raw, password, newUsername);
    // Контрольный round-trip: новый blob обязан открываться новым username
    await decryptPrivateKeyRaw(next, password, newUsername);
    return next;
}
