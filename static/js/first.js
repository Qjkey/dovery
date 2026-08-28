const dbName = "Dovery";
const storeName = "secrets";

async function detectDeviceInfo() {
    const ua = navigator.userAgent || '';
    let deviceOs = 'unknown';
    let deviceName = '';

    try {
        const uaData = navigator.userAgentData;
        if (uaData) {
            const platform = String(uaData.platform || '').toLowerCase();
            if (platform.includes('win')) deviceOs = 'windows';
            else if (platform.includes('android')) deviceOs = 'android';
            else if (platform.includes('mac') || platform.includes('ios')) deviceOs = 'apple';

            if (typeof uaData.getHighEntropyValues === 'function') {
                const hints = await uaData.getHighEntropyValues(['model', 'platformVersion', 'platform']);
                if (hints.model && String(hints.model).trim()) {
                    deviceName = String(hints.model).trim();
                }
                const plat = String(hints.platform || uaData.platform || '').toLowerCase();
                if (plat.includes('win')) {
                    deviceOs = 'windows';
                    if (!deviceName) {
                        const major = parseInt(String(hints.platformVersion || '0').split('.')[0], 10);
                        deviceName = Number.isFinite(major) && major >= 13 ? 'Windows 11' : 'Windows 10';
                    }
                } else if (plat.includes('android')) {
                    deviceOs = 'android';
                } else if (plat.includes('mac') || plat.includes('ios')) {
                    deviceOs = 'apple';
                }
            }
        }
    } catch (e) {
        // Client Hints могут быть недоступны — fallback по UA
    }

    if (!deviceOs || deviceOs === 'unknown') {
        if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)) deviceOs = 'apple';
        else if (/Android/i.test(ua)) deviceOs = 'android';
        else if (/Windows/i.test(ua)) deviceOs = 'windows';
    }

    if (!deviceName) {
        if (/iPhone/i.test(ua)) deviceName = 'iPhone';
        else if (/iPad/i.test(ua)) deviceName = 'iPad';
        else if (/Macintosh|Mac OS X/i.test(ua)) deviceName = 'macOS';
        else if (/Android/i.test(ua)) {
            const m = ua.match(/;\s*([^;)]+?)\s+Build\//i);
            deviceName = (m && m[1].trim()) || 'Android';
        } else if (/Windows NT 10/i.test(ua)) deviceName = 'Windows 10';
        else if (/Windows NT 6\.3/i.test(ua)) deviceName = 'Windows 8.1';
        else if (/Windows NT 6\.1/i.test(ua)) deviceName = 'Windows 7';
        else if (/Windows/i.test(ua)) deviceName = 'Windows';
        else if (/Linux/i.test(ua)) deviceName = 'Linux';
        else deviceName = 'Неизвестное устройство';
    }

    if (deviceOs === 'unknown' && deviceName) {
        const lower = deviceName.toLowerCase();
        if (lower.includes('windows')) deviceOs = 'windows';
        else if (lower.includes('android')) deviceOs = 'android';
        else if (/iphone|ipad|mac|ios|apple/.test(lower)) deviceOs = 'apple';
    }

    return {
        device_name: String(deviceName).slice(0, 80),
        device_os: deviceOs
    };
}

function appendDeviceInfo(formData, info) {
    if (!formData || !info) return;
    formData.append('device_name', info.device_name || '');
    formData.append('device_os', info.device_os || 'unknown');
}

let selectedAvatarFile = null;

document.getElementById('overlay_profile').addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
        if (e.target.files[0]) {
            selectedAvatarFile = e.target.files[0];
            document.querySelector('.ava').src = URL.createObjectURL(selectedAvatarFile);
        }
    };
    fileInput.click();
});

function initDB() {
    return openDoveryDB();
}

async function saveUserData(userData, privateKey, signingPrivateKey = null) {
    const db = await initDB();
    try {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);

        store.put(privateKey, "private_key");
        if (signingPrivateKey) {
            store.put(signingPrivateKey, "signing_private_key");
        }
        store.put(userData, "user_profile");

        await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('idb_abort'));
        });
    } finally {
        db.close();
    }
}

async function loginWithKeyBundle(data, passwordValue, passwordInput) {
    const legacyUsername = data.user_data.username;
    const salt = data.key_salt || legacyUsername;

    let ecdhKey = await decryptAndImportEcdhKey(data.priv_key, passwordValue, salt);
    let signingKey = null;
    if (data.signing_priv_key) {
        signingKey = await decryptAndImportSigningKey(data.signing_priv_key, passwordValue, salt);
    }

  if (!data.key_salt) {
        const hadSigning = !!signingKey;
        const migrated = await migrateLegacyKeysToRandomSalt({
            password: passwordValue,
            legacyUsername: legacyUsername,
            encryptedPrivateKey: data.priv_key,
            encryptedSigningPrivateKey: data.signing_priv_key,
            ecdhPrivateKey: ecdhKey,
            signingPrivateKey: signingKey,
        });
        ecdhKey = migrated.ecdhKey;
        signingKey = migrated.signingKey;

        let signingPublicB64 = data.signing_public_key || '';
        let publicKeySig = data.public_key_sig || '';

        if (!hadSigning || !signingPublicB64 || !publicKeySig) {
            const signPair = await generateSigningKeyPair();
            signingKey = signPair.privateKey;
            signingPublicB64 = await exportSpkiBase64(signPair.publicKey);
            publicKeySig = await signEcdhPublicKey(signingKey, data.public_key);
            migrated.bundle.encrypted_signing_private_key = await encryptPrivateKeyRaw(
                await crypto.subtle.exportKey('pkcs8', signingKey),
                passwordValue,
                migrated.newSalt
            );
        }

        const migrateForm = new FormData();
        migrateForm.append('password', await hashPassword(passwordValue));
        migrateForm.append('key_salt', migrated.bundle.key_salt);
        migrateForm.append('encrypted_private_key', migrated.bundle.encrypted_private_key);
        migrateForm.append('encrypted_signing_private_key', migrated.bundle.encrypted_signing_private_key);
        migrateForm.append('signing_public_key', signingPublicB64);
        migrateForm.append('public_key_sig', publicKeySig);

        const migrateRes = await fetch('/api/me/key_migrate', { method: 'POST', body: migrateForm });
        if (!migrateRes.ok) {
            throw new Error('key_migrate_failed');
        }
    }

    passwordValue = null;
    passwordInput.value = "";
    await saveUserData(data.user_data, ecdhKey, signingKey);
    window.location.href = "/";
}

async function validateAndSubmit_login(el) {
    const form = el.closest('form'); 
    const usernameInput = form.querySelector('input[name="username"]');
    const passwordInput = form.querySelector('input[name="password"]');

    const username = usernameInput.value.trim();
    let passwordValue = passwordInput.value.trim();

    if (username === "" || passwordValue === "") {
        d_pop("Введите логин и пароль", "", "Хорошо");
        return;
    }

    const hashedForServer = await hashPassword(passwordValue);

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', hashedForServer);
    appendDeviceInfo(formData, await detectDeviceInfo());

    try {
        const response = await fetch('/login', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.status === "success") {
            await loginWithKeyBundle(data, passwordValue, passwordInput);
        } else {
            if (data.message === "d102") {
                d_pop("Неверный логин или пароль", "", "Хорошо");
                return;
            } else if (data.message === "d101") {
                d_pop("Введите логин и пароль в поля ввода", "", "Хорошо");
                return;
            } else if (data.message === "d103") {
                d_alert("Ошибка", "Ошибка базы данных", "ok");
                return;
            } else if (data.message === "d207" || response.status === 429) {
                d_pop("Ошибка", "Лимит попыток исчерпан, попробуйте позже", "Хорошо");
                return;
            } else if (data.message === 413 || response.status === 413) {
                d_pop("Файл аватарки слишком большой", "Лимит временно 5 мб, пока мы не вырастем", "Хорошо");
                return;
            }

            d_alert("Ошибка", `${data.message || response.status}`, "ok");
        }
    } catch (err) {
        console.error(err);
        if (err && err.name === "OperationError") {
            d_alert("Ошибка", "Не удалось расшифровать ключ. Проверьте пароль.", "ok");
            return;
        }
        d_alert("Ошибка", `Ошибка сервера ${err}`, "ok");
    }
}

async function validateAndSubmit(el) {
    const form = el.closest('form');
    const name = form.querySelector('input[name="name"]').value.trim();
    const username = form.querySelector('input[name="username"]').value.trim();
    const passwordInput = form.querySelector('input[name="password"]');
    const repPassInput = form.querySelector('input[name="rep_pass"]');
    const passwordValue = passwordInput.value.trim();
    const repPassValue = repPassInput.value.trim();

    if (!name || !username || !passwordValue || !repPassValue) {
        d_pop("Заполните все поля", "", "Хорошо");
        return;
    }
    if (name.length > 32) {
        d_pop("Имя слишком длинное", "Максимум 32 символа", "Хорошо");
        return;
    }
    const letters = /^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$/;
    if (!letters.test(username)) {
        d_alert("Ошибка", "Username может содержать только латинские буквы, цифры и символ подчеркивания, не идущий подряд, в начале или в конце", "ok");
        return;
    }
    if (!(username.length >= 4 && username.length <= 16)) {
        d_alert("Ошибка", "Username короче 4 символов либо длиннее 16 ", "ok");
        return;
    }
    if (passwordValue.length < 8) {
        d_pop("Слишком короткий пароль", "Минимум 8 символов", "Хорошо");
        return;
    }
    if (passwordValue !== repPassValue) {
        d_pop("Пароли не совпадают", "", "Хорошо");
        return;
    }

    try {
        const ecdhPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey", "deriveBits"]
        );
        const signingPair = await generateSigningKeyPair();

        const pubBase64 = await exportSpkiBase64(ecdhPair.publicKey);
        const signingPublicB64 = await exportSpkiBase64(signingPair.publicKey);
        const publicKeySig = await signEcdhPublicKey(signingPair.privateKey, pubBase64);
        const keySalt = generateKeySaltBase64();

        const bundle = await encryptKeyBundleForServer(
            ecdhPair.privateKey,
            signingPair.privateKey,
            passwordValue,
            keySalt
        );

        const hashedPass = await hashPassword(passwordValue);

        await saveUserData(
            { username: username, id: "pending" },
            ecdhPair.privateKey,
            signingPair.privateKey
        );

        const formData = new FormData();
        formData.append('name', name);
        formData.append('username', username);
        formData.append('password', hashedPass);
        formData.append('public_key', pubBase64);
        formData.append('encrypted_private_key', bundle.encrypted_private_key);
        formData.append('key_salt', bundle.key_salt);
        formData.append('signing_public_key', signingPublicB64);
        formData.append('encrypted_signing_private_key', bundle.encrypted_signing_private_key);
        formData.append('public_key_sig', publicKeySig);
        appendDeviceInfo(formData, await detectDeviceInfo());

        if (selectedAvatarFile) {
            formData.append('avatar', selectedAvatarFile);
        }   

        const response = await fetch('/signup', {
            method: 'POST',
            body: formData
        });

        let data = {};
        try {
            data = await response.json();
        } catch (jsonError) {
            console.error("Сервер прислал плохой JSON:", jsonError);
            if (response.status === 429) {
                data = { message: "d207" }; 
            }
        }

        if (response.ok && data.status === "success") {
            await saveUserData(data.user_data, ecdhPair.privateKey, signingPair.privateKey);
            window.location.href = "/";
            return;
        } 
        
        if (data.message === "d207") {
            d_alert("Ошибка", "Истекло время ожидания, ожидайте 1 час", "ok");
            return;
        } else if (data.message === "d205") {
            d_alert("Ошибка", "На сервере крашнулось создание id", "ok");
            return;
        } else if (data.message === "d203" || data.message === "d103") {
            d_pop("Username занят", "", "Хорошо");
            return;
        } else if (data.message === "d204") {
            d_alert("Ошибка", "База данных слетела", "ok");
            return;
        } else if (data.message === "d201") {
            d_pop("Заполните все поля", "", "Хорошо");
            return;
        } else if (data.message === "d206") {
            d_alert("Ошибка", "Username может содержать только латинские буквы...", "ok");
            return;
        } else if (data.message === "d208") {
            d_alert("Ошибка", "Username короче 4 символов либо длиннее 16 ", "ok");
            return;
        } else if (data.message === 413 || response.status === 413) {
            d_pop("Файл аватарки слишком большой", "Лимит временно 5 мб, пока мы не вырастем", "Хорошо");
            return;
        }

        d_alert("Ошибка", `${data.message || response.status}`, "ok");


    } catch (e) {
        console.error("Критическая ошибка в блоке try:", e);
        d_alert("Ошибка", "Не удалось создать защищенные ключи или ошибка сервера", "ok");
    }
}