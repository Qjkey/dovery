const dbName = "Dovery";
const storeName = "secrets";

async function deriveEncryptionKey(password, username) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(username),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false, ["encrypt", "decrypt"]
    );
}

async function decryptAndImportKey(encryptedBase64, password, username) {
    const combined = new Uint8Array(atob(encryptedBase64).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const encryptionKey = await deriveEncryptionKey(password, username);

    const decryptedRaw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        encryptionKey,
        ciphertext
    );

    return await window.crypto.subtle.importKey(
        "pkcs8",
        decryptedRaw,
        { 
            name: "ECDH", 
            namedCurve: "P-256" 
        },
        true,
        ["deriveKey", "deriveBits"]
    );
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveUserData(userData, privateKey) {
    const db = await initDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    store.put(privateKey, "private_key");
    store.put(userData, "user_profile");

    return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
    });
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

    try {
        const response = await fetch('/login', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.status === "success") {
            // Соль = username как при регистрации (канонический с сервера)
            const keyUsername = data.user_data.username;
            const privateKeyObject = await decryptAndImportKey(data.priv_key, passwordValue, keyUsername);
            passwordValue = null;
            passwordInput.value = "";
            await saveUserData(data.user_data, privateKeyObject);
            window.location.href = "/";
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
        const keyPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true, 
            ["deriveKey", "deriveBits"]
        );

        const pubExport = await crypto.subtle.exportKey("spki", keyPair.publicKey);
        const pubBase64 = btoa(String.fromCharCode(...new Uint8Array(pubExport)));

        // Соль = username ровно в том регистре, как ввёл пользователь
        const encryptionKey = await deriveEncryptionKey(passwordValue, username);
        const privExport = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
        
        const iv = crypto.getRandomValues(new Uint8Array(12)); 
        const encryptedContent = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            encryptionKey,
            privExport
        );

        const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encryptedContent), iv.length);
        const privBase64 = btoa(String.fromCharCode(...combined));
        
        const hashedPass = await hashPassword(passwordValue);

        await saveUserData({ username: username, id: "pending" }, keyPair.privateKey);

        const formData = new FormData();
        formData.append('name', name);
        formData.append('username', username);
        formData.append('password', hashedPass);
        formData.append('public_key', pubBase64);
        formData.append('encrypted_private_key', privBase64);

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
            await saveUserData(data.user_data, keyPair.privateKey);
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