const socket = io({
    reconnection: true, 
    reconnectionAttempts: Infinity, 
    reconnectionDelay: 1000,     
    reconnectionDelayMax: 5000
});

function closeBtnChatUpdate() {
    try {
        const button = document.getElementById('close-chat-btn');
        const screen = document.getElementById('message-chats');
        const screenWidth = window.innerWidth;

        if (screenWidth > 751) {
            button.onclick = function() {
                document.getElementById('no-chat-content').classList.remove('hidden');
                document.getElementById('chat-content').classList.add('hidden');
                document.querySelectorAll('.open_chat').forEach(elem => {
                    elem.classList.remove('open_chat');
                });
            };
            screen.removeAttribute('data-swipe');
        } else {
            button.onclick = function() {
                closeActiveScreen(2);
                document.querySelectorAll('.open_chat').forEach(elem => {
                    elem.classList.remove('open_chat');
                });
            };
            screen.setAttribute('data-swipe', "true");
        }
    } catch (error) {
        d_alert("Ошибка", `Ошибка в closeBtnChatUpdate: ${error}`, "ok")
    }
}

document.addEventListener('DOMContentLoaded', closeBtnChatUpdate);
document.addEventListener('DOMContentLoaded', () => {closeBtnChatUpdate(); resizeObserver.observe(document.body);});
window.addEventListener('resize', closeBtnChatUpdate);
window.addEventListener('orientationchange', closeBtnChatUpdate);
const resizeObserver = new ResizeObserver(() => {closeBtnChatUpdate();});

document.addEventListener("DOMContentLoaded", () => {
  const messageArea = document.getElementById("messages-area");
  const welcomePanel = document.getElementById("welcome-panel");

  if (!messageArea || !welcomePanel) return;

  window.updateWelcomePanel = function updateWelcomePanel() {
    const hasMessages = messageArea.querySelector(".message-wrapper") !== null;
    welcomePanel.classList.toggle("hidden", hasMessages);
  };

  window.updateWelcomePanel();

  const observer = new MutationObserver(() => {
    window.updateWelcomePanel();
  });

  observer.observe(messageArea, {
    childList: true,
    subtree: true,
  });
});

async function get_public_key(pem) {
    const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n|\r/g, '');
    const binary = window.atob(b64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

    return await window.crypto.subtle.importKey(
        "spki",
        bytes,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );
}

async function get_private_key() {
    const db = await openDoveryDB();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(DOVERY_STORE_NAME, 'readonly');
            const store = transaction.objectStore(DOVERY_STORE_NAME);
            const getRequest = store.get('private_key');
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error || new Error('Ошибка извлечения ключа'));
        });
    } finally {
        db.close();
    }
}

async function calc_key_chat(myPrivateKey, opponentPublicKey) {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: opponentPublicKey },
        myPrivateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

let debounceTimer;

function photoAvatarHtml(src) {
    return `<img src="${src}" class="ava avatar-pending" alt="">`;
}

function normalizeBlockState(state) {
    return {
        blocked_by_me: !!state?.blocked_by_me,
        blocked_me: !!state?.blocked_me,
        can_send: state?.can_send !== false,
        hide_avatar: !!state?.hide_avatar,
    };
}

function letterAvatarHtml(name) {
    const firstLetter = name ? String(name).charAt(0).toUpperCase() : '?';
    return `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
}

function getDisplayAvatarHtml(user) {
    if (!user) return '';
    if (user.hideAvatar) return letterAvatarHtml(user.name);
    return user.avatar || letterAvatarHtml(user.name);
}

function getEffectiveStatus(user) {
    if (user?.blockState?.blocked_me) return 'Вас заблокировали';
    return user?.realStatus || user?.status || 'был(а) недавно';
}

function getComposerBlockedText(state) {
    if (state?.blocked_by_me) return 'Вы заблокировали';
    if (state?.blocked_me) return 'Вас заблокировали';
    return 'Сообщение';
}

function bindAvatarLoad(root) {
    if (!root) return;
    const imgs = [];
    if (root.matches && root.matches('img')) imgs.push(root);
    if (root.querySelectorAll) {
        root.querySelectorAll('img').forEach((img) => {
            if (!imgs.includes(img)) imgs.push(img);
        });
    }
    imgs.forEach((img) => {
        const profileBox = img.closest('.avatar');
        const finish = () => {
            img.classList.remove('avatar-pending');
            if (profileBox) profileBox.classList.remove('avatar-pending');
        };
        if (img.complete && img.naturalWidth > 0) {
            finish();
            return;
        }
        img.classList.add('avatar-pending');
        if (profileBox) profileBox.classList.add('avatar-pending');
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
    });
}

window.photoAvatarHtml = photoAvatarHtml;
window.bindAvatarLoad = bindAvatarLoad;

async function openProfile(userId, is_my_profile = false, url_open = false) {
    if (!userId) {
        userId = window.userId;
        is_my_profile = true;
    }
    userId = userId != null ? String(userId) : '';

    let user = chatsData[userId];
    if (!user) {
        try {
            const response = await fetch(`/get_use_profile/${userId}`);
            if (response.ok) {
                const data = await response.json();
                let avatarHtml = '';
                if (data.hide_avatar) {
                    avatarHtml = letterAvatarHtml(data.name);
                } else if (data.avatar && data.avatar !== 'avatarkins.png' && data.avatar !== 'null') {
                    avatarHtml = photoAvatarHtml(`static/files/avatars/${data.avatar}`);
                } else {
                    avatarHtml = letterAvatarHtml(data.name);
                }
                chatsData[userId] = {
                    username: data.username,
                    name: data.name,
                    avatar: avatarHtml,
                    avatarRaw: data.avatar,
                    hideAvatar: !!data.hide_avatar,
                    publicKey: data.public_key,
                    signingPublicKey: data.signing_public_key || '',
                    publicKeySig: data.public_key_sig || '',
                    status: data.status,
                    realStatus: data.real_status || data.status,
                    blockState: normalizeBlockState(data.block_state)
                };
                user = chatsData[userId];
            }
        } catch (e) {
            console.error("Ошибка загрузки профиля:", e);
        }
    }

    if (!userId || !user) {
        d_alert("Ошибка", "Профиль не найден", "ok");
        return;
    }

    const isSelf = !!is_my_profile || String(userId) === String(window.userId);

    document.getElementById('profile-name').textContent = user.name || '';
    document.getElementById('profile-id').textContent = userId;
    document.getElementById('profile-status').textContent = getEffectiveStatus(user);
    document.getElementById('profile-username').textContent = '@' + (user.username || '');

    const avatar = document.getElementById('profile-avatar');
    if (avatar) {
        avatar.classList.remove('avatar-pending');
        avatar.innerHTML = '';
        if (getDisplayAvatarHtml(user)) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(getDisplayAvatarHtml(user), 'text/html');
            const avatarElement = doc.body.firstChild;
            if (avatarElement && avatarElement.classList && avatarElement.classList.contains('letter-ava')) {
                avatarElement.classList.replace('letter-ava', 'letter-ava1');
            }
            if (avatarElement) avatar.appendChild(avatarElement);
            bindAvatarLoad(avatar);
        }
    }

    syncProfileActionButtons(userId, isSelf);

    openScreen('3');
}

function openProfileChat(userId) {
    closeProfile();
    const chatId = getChatIdByUserId(userId);
    if (chatId) {
        openDirectWindow(chatId);
    } else {
        startChat(userId);
    }
}

function syncProfileBlockLabel(userId) {
    const blockText = document.getElementById('profile-block-text');
    if (!blockText) return;
    const chatId = getChatIdByUserId(userId);
    const state = getChatBlockState(chatId);
    blockText.textContent = state.blocked_by_me ? 'Разблокировать' : 'Заблокировать';
}

function syncProfileActionButtons(userId, isSelf = false) {
    const actions = document.getElementById('profileBlock3');
    const openChatSection = document.getElementById('profile-open-chat-section');
    const writeBtn = document.getElementById('profile-write-btn');
    const deleteBtn = document.getElementById('profile-delete-btn');
    const blockBtn = document.getElementById('profile-block-btn');

    if (openChatSection) openChatSection.classList.add('hidden');

    if (isSelf) {
        if (actions) actions.classList.add('hidden');
        return;
    }

    if (actions) actions.classList.remove('hidden');
    syncProfileBlockLabel(userId);

    if (writeBtn) {
        writeBtn.onclick = (e) => {
            e.preventDefault();
            const uid = document.getElementById('profile-id')?.textContent?.trim() || userId;
            openProfileChat(uid);
        };
    }
    if (deleteBtn) {
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            const uid = document.getElementById('profile-id')?.textContent?.trim() || userId;
            await delete_chat(getChatIdByUserId(uid));
        };
    }
    if (blockBtn) {
        blockBtn.onclick = async (e) => {
            e.preventDefault();
            const uid = document.getElementById('profile-id')?.textContent?.trim() || userId;
            await toggle_chat_block(getChatIdByUserId(uid));
        };
    }
}

function closeProfile() {
    closeActiveScreen('3');
}

window.openProfile = openProfile;
window.closeProfile = closeProfile;

document.getElementById('search-field').addEventListener('input', function(e) {
    const query = e.target.value.trim();
    document.getElementById('search-field').focus;
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }

    debounceTimer = setTimeout(() => {
        fetchUsers(query);
    }, 500); 
});

const chatsData = {};

// Кэш пользователей по username для быстрого доступа при клике на @username в сообщениях
const usernameCache = {};

/**
 * Получает данные пользователя по username.
 * Сначала проверяет кэш, если нет — делает запрос на сервер.
 * @param {string} username - username без символа @
 * @returns {Promise<Object|null>} - данные пользователя или null
 */
async function getUserByUsername(username) {
    if (!username) return null;

    // Проверяем кэш
    if (usernameCache[username]) {
        return usernameCache[username];
    }

    try {
        const response = await fetch(`/get_user_by_username/${encodeURIComponent(username)}`);
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const user = await response.json();

        // Кэшируем результат
        usernameCache[username] = user;

        return user;
    } catch (err) {
        console.error("Ошибка при получении пользователя по username:", err);
        return null;
    }
}

/**
 * Открывает профиль пользователя по username.
 * Если пользователь есть в кэше chatsData — открывает сразу.
 * Иначе запрашивает данные с сервера и кэширует.
 * @param {string} username - username без символа @
 */
async function openProfileByUsername(username) {
    if (!username) return;

    const lowerUsername = username.toLowerCase();

    for (const userId in chatsData) {
        if (chatsData[userId].username.toLowerCase() === lowerUsername) {
            openProfile(userId, false, false);
            return;
        }
    }

    const user = await getUserByUsername(username);
    if (!user) {
        d_pop("Ошибка", "Пользователь не найден", "Оки");
        return;
    }

    const userId = String(user.id);

    // Если уже есть в chatsData, просто открываем профиль
    if (chatsData[userId]) {
        openProfile(userId, false, false);
        return;
    }

    // Формируем аватар
    let avatarHtml = '';
    if (user.hide_avatar) {
        avatarHtml = letterAvatarHtml(user.name);
    } else if (user.avatar && user.avatar !== 'avatarkins.png' && user.avatar !== 'null') {
        avatarHtml = photoAvatarHtml(`static/files/avatars/${user.avatar}`);
    } else {
        avatarHtml = letterAvatarHtml(user.name);
    }

    // Добавляем в кэш
    chatsData[userId] = {
        username: user.username,
        name: user.name,
        avatar: avatarHtml,
        avatarRaw: user.avatar,
        hideAvatar: !!user.hide_avatar,
        publicKey: user.public_key,
        signingPublicKey: user.signing_public_key || '',
        publicKeySig: user.public_key_sig || '',
        status: user.status,
        realStatus: user.real_status || user.status,
        blockState: normalizeBlockState(user.block_state)
    };

    openProfile(userId, false, false);
}

window.getUserByUsername = getUserByUsername;
window.openProfileByUsername = openProfileByUsername;

async function startChat(userId) {
    try {
        const response = await fetch('/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: userId })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.chat_id) {
                rememberChatUserMapping(data.chat_id, userId);
            }
            await loadMyChats();
            if (data.chat_id) {
                rememberChatUserMapping(data.chat_id, userId);
                await openDirectWindow(data.chat_id);
            }
            closeActiveScreen(1);
        }
    } catch (err) {
        console.error("Ошибка при создании чата:", err);
    }
}

socket.on("user_status_update", (data) => {
    try {
        const userId = String(data.user_id);
        const idEpt = document.getElementById('id_ept');
        const activeChatId = idEpt ? idEpt.innerText : null;
        const activePartnerId = activeChatId ? window.chatIdToUserId[activeChatId] : null;
        
        if (chatsData[userId]) {
            chatsData[userId].status = data.status;
            chatsData[userId].realStatus = data.status;
        }

        if (idEpt && userId === activePartnerId) {
            const currentStatus = document.getElementById('user-status');
            if (currentStatus) {
                const keepHidden = currentStatus.classList.contains('hidden') && !getConnectionStatusLabel();
                setOpenChatPresence(getEffectiveStatus(chatsData[userId]));
                if (keepHidden) currentStatus.classList.add('hidden');
            }
        }

        const profileScreen = document.getElementById('profile-screen');
        const profileId = document.getElementById('profile-id');
        if (
            profileScreen
            && !profileScreen.classList.contains('hidden')
            && profileId
            && profileId.textContent === userId
        ) {
            document.getElementById('profile-status').textContent = getEffectiveStatus(chatsData[userId]);
        }

        const currentChatElem = document.querySelector(`[data-user-id="${userId}"]`);
        if (currentChatElem) {
            const statusInList = currentChatElem.querySelector('.status_of_user_in_list_chats');
            if (statusInList) {
                const effectiveStatus = getEffectiveStatus(chatsData[userId]);
                statusInList.className = `label status_of_user_in_list_chats ${presenceClass(effectiveStatus, true)}`;
                statusInList.textContent = displayedPresenceText(effectiveStatus, true);
            }
        }
    } catch (err) {
        console.log(err);
        d_alert("Ошибка", "Ошибка при изменении статуса пользователя", "ok");
    }
});

function getConnectionStatusLabel() {
    return typeof window.getDoveryConnectionLabel === 'function'
        ? window.getDoveryConnectionLabel()
        : null;
}

function displayedPresenceText(realStatus, inList) {
    if (!inList) {
        const override = getConnectionStatusLabel();
        if (override) return override;
    }
    return realStatus || 'был(а) недавно';
}

function presenceClass(realStatus, inList) {
    if (!inList && getConnectionStatusLabel()) {
        return 'subtitle';
    }
    if (inList) {
        return realStatus === 'в сети' ? 'active subtitle2' : 'subtitle subtitle1';
    }
    return realStatus === 'в сети' ? 'active' : 'subtitle';
}

function setOpenChatPresence(realStatus) {
    const headerStatus = document.getElementById('user-status');
    if (!headerStatus) return;

    const override = getConnectionStatusLabel();
    headerStatus.className = `subtitle2 ${presenceClass(realStatus, false)}`;
    headerStatus.textContent = displayedPresenceText(realStatus);

    if (override) {
        headerStatus.classList.remove('hidden');
        const typingEl = document.getElementById('user-typing');
        if (typingEl) typingEl.classList.add('hidden');
    }
}

function getCurrentOpenPartner() {
    const chatId = getOpenChatId() || getActiveChatId();
    const partnerId = chatId && window.chatIdToUserId ? window.chatIdToUserId[chatId] : null;
    return partnerId ? chatsData[String(partnerId)] : null;
}

function getChatBlockState(chatId) {
    const id = chatId != null ? String(chatId) : '';
    if (!id) return normalizeBlockState();
    if (chatHash[id]?.blockState) return normalizeBlockState(chatHash[id].blockState);
    const partnerId = window.chatIdToUserId ? window.chatIdToUserId[id] : null;
    if (partnerId && chatsData[String(partnerId)]?.blockState) {
        return normalizeBlockState(chatsData[String(partnerId)].blockState);
    }
    return normalizeBlockState();
}

function syncBlockMenuItem() {
    if (!Array.isArray(window.list_items_icon_02)) return;
    const idx = window.list_items_icon_02.findIndex((entry) => entry.id === 'toggle-block');
    const chatId = getActiveChatId();
    const state = getChatBlockState(chatId);
    const item = {
        id: 'toggle-block',
        label: state.blocked_by_me ? 'Разблокировать' : 'Заблокировать',
        onclick: 'toggle_chat_block();',
        icon: 'block'
    };
    if (idx >= 0) window.list_items_icon_02[idx] = item;
    else window.list_items_icon_02.splice(1, 0, item);

    const profileId = document.getElementById('profile-id')?.textContent?.trim();
    if (profileId) syncProfileBlockLabel(profileId);
}

function updateComposerBlockedState(chatId) {
    if (!msgInput || !sendBtn) return;
    const state = getChatBlockState(chatId);
    const blocked = !state.can_send;
    msgInput.disabled = blocked;
    msgInput.readOnly = blocked;
    msgInput.placeholder = getComposerBlockedText(state);
    sendBtn.disabled = blocked;
    sendBtn.classList.toggle('is-disabled', blocked);
    if (blocked) {
        msgInput.value = '';
        syncComposerTyping();
    }
}

function refreshAllPresenceDisplays() {
    const idEpt = document.getElementById('id_ept');
    const chatId = idEpt ? idEpt.innerText.trim() : '';
    const partnerId = chatId && window.chatIdToUserId ? window.chatIdToUserId[chatId] : null;
    const real = partnerId && chatsData[partnerId]
        ? getEffectiveStatus(chatsData[partnerId])
        : 'был(а) недавно';
    setOpenChatPresence(real);

    if (!getConnectionStatusLabel() && typeof refreshPartnerTypingHeader === 'function') {
        refreshPartnerTypingHeader();
    }

    document.querySelectorAll('[data-user-id]').forEach((item) => {
        const el = item.querySelector('.status_of_user_in_list_chats');
        if (!el) return;
        const uid = item.getAttribute('data-user-id');
        const st = chatsData[uid] ? getEffectiveStatus(chatsData[uid]) : 'был(а) недавно';
        el.className = `label status_of_user_in_list_chats ${presenceClass(st, true)}`;
        el.textContent = displayedPresenceText(st, true);
    });
}

window.displayedPresenceText = displayedPresenceText;
window.presenceClass = presenceClass;
window.refreshAllPresenceDisplays = refreshAllPresenceDisplays;

window.keychat = null;

function getChatIdByUserId(userId) {
    if (userId == null || String(userId).trim() === '') return null;
    const uid = String(userId).trim();

    // 1) Открытый чат с этим собеседником — самый надёжный источник (как в меню чата)
    const activeId = getActiveChatId();
    if (activeId) {
        const activePartner = window.chatIdToUserId
            ? (window.chatIdToUserId[activeId] ?? window.chatIdToUserId[String(activeId)])
            : null;
        if (activePartner != null && String(activePartner) === uid) {
            return String(activeId);
        }
        if (chatsData[uid]?.chatId != null && String(chatsData[uid].chatId) === String(activeId)) {
            return String(activeId);
        }
    }

    // 2) Кэш профиля/списка
    const cached = chatsData[uid]?.chatId;
    if (cached != null && String(cached).trim() !== '') {
        return String(cached);
    }

    // 3) Карта chat → user
    if (window.chatIdToUserId) {
        for (const chatId of Object.keys(window.chatIdToUserId)) {
            if (String(window.chatIdToUserId[chatId]) === uid) {
                return String(chatId);
            }
        }
    }

    return null;
}

function rememberChatUserMapping(chatId, userId) {
    if (chatId == null || userId == null) return;
    const cid = String(chatId);
    const uid = String(userId);
    window.chatIdToUserId = window.chatIdToUserId || {};
    window.chatIdToUserId[cid] = uid;
    if (chatsData[uid]) {
        chatsData[uid].chatId = cid;
    }
}

const tx = document.getElementById('messages-textarea');
const ma = document.getElementById('messages-area');
const bottomBar = document.querySelector('.bottom-bar');
const COMPOSER_BASE_HEIGHT = 77;
const SCROLL_DOWN_ROW_HEIGHT = 62;

function isScrollToBottomVisible() {
    const row = document.getElementById('scroll-to-bottom');
    return !!(row && !row.classList.contains('hidden'));
}

function getComposerBarHeight() {
    if (!tx || !bottomBar) return COMPOSER_BASE_HEIGHT;
    const currentRows = parseInt(tx.getAttribute('rows') || '1', 10);
    let totalBarHeight;

    if (currentRows <= 1) {
        totalBarHeight = COMPOSER_BASE_HEIGHT;
    } else {
        const textareaHeight = tx.offsetHeight;
        const barPaddingTop = parseFloat(window.getComputedStyle(bottomBar).paddingTop) || 0;
        const barPaddingBottom = parseFloat(window.getComputedStyle(bottomBar).paddingBottom) || 0;
        totalBarHeight = textareaHeight + barPaddingTop + barPaddingBottom;
    }

    if (isScrollToBottomVisible()) {
        totalBarHeight += SCROLL_DOWN_ROW_HEIGHT;
    }
    return totalBarHeight;
}

function syncComposerBarLayout() {
    const totalBarHeight = getComposerBarHeight();
    if (bottomBar) bottomBar.style.top = `calc(100% - ${totalBarHeight}px)`;
    if (ma) ma.style.paddingBottom = `${totalBarHeight}px`;
}

tx.addEventListener('input', function() {
    this.setAttribute('rows', '1');
    const computedStyle = window.getComputedStyle(this);
    const computedLineHeight = parseFloat(computedStyle.lineHeight);
    const currentRows = Math.round(this.scrollHeight / computedLineHeight);
    this.setAttribute('rows', currentRows);
    syncComposerBarLayout();
});

async function assertContactPublicKeyTrusted(user) {
    if (!user?.publicKey) return false;
    const result = await verifyEcdhPublicKey(
        user.signingPublicKey,
        user.publicKey,
        user.publicKeySig
    );
    if (result.reason === 'invalid') {
        d_alert(
            'Безопасность',
            'Публичный ключ собеседника не прошёл проверку подписи. Возможна подмена на сервере.',
            'ok'
        );
        return false;
    }
    if (result.reason === 'unsigned') {
        d_pop(
            'Безопасность',
            'Ключ собеседника ещё не подписан. Попросите войти в аккаунт снова для обновления ключей.',
            'Хорошо'
        );
    }
    return true;
}

async function openDirectWindow(chatId) {
    try {
        chatId = chatId != null ? String(chatId) : '';
        let partnerId = window.chatIdToUserId ? window.chatIdToUserId[chatId] : null;
        if (!partnerId && window.chatIdToUserId) {
            // на случай числового ключа в карте
            for (const [cid, uid] of Object.entries(window.chatIdToUserId)) {
                if (String(cid) === chatId) {
                    partnerId = uid;
                    break;
                }
            }
        }
        if (!partnerId) { 
            return;
        }
        partnerId = String(partnerId);
        rememberChatUserMapping(chatId, partnerId);
        const user = chatsData[partnerId];
        if (!user) { 
            return;
        }
        document.querySelectorAll('.open_chat').forEach(elem => {
            elem.classList.remove('open_chat');
        });
        const currentChatElem = document.querySelector(`[data-user-id="${partnerId}"]`);
        const screenWidth = window.innerWidth;

        if (screenWidth > 751) {
            if (currentChatElem) {
                currentChatElem.classList.add('open_chat');
            }
        }

        const headerPanel = document.getElementById('user-header');
        const headerName = document.getElementById('user-name');
        const headerStatus = document.getElementById('user-status');
        const headerAvatar = document.getElementById('user-avatar');
        const msgInput = document.getElementById('messages-textarea');

        if (headerName) headerName.innerText = user.name;
        if (headerStatus) {
            setOpenChatPresence(getEffectiveStatus(user));
        }
        const typingEl = document.getElementById('user-typing');
        if (typingEl) typingEl.classList.add('hidden');
        if (headerAvatar) {
            headerAvatar.innerHTML = getDisplayAvatarHtml(user);
            bindAvatarLoad(headerAvatar);
        }

        const container = document.getElementById('id_ept');
        container.textContent = chatId; 

        if (headerPanel) {
            headerPanel.onclick = () => openProfile(partnerId, false, false);
        }
        try {
            if (!await assertContactPublicKeyTrusted(user)) {
                return;
            }
            const private_key = await get_private_key(); 
            const public_key = await get_public_key(user.publicKey);
            window.keychat = await calc_key_chat(private_key, public_key);
            chatsData[partnerId].keychat = window.keychat;
        } catch (err) {
            console.error("Ошибка установки защищенного соединения:", err);
        }
        msgInput.value = '';
        updateComposerBlockedState(chatId);
        syncBlockMenuItem();
        loadChat(chatId);
        document.getElementById('no-chat-content').classList.add('hidden');
        document.getElementById('chat-content').classList.remove('hidden');
        // На планшете/ноуте панель сообщений уже видна — openScreen только блокировал скролл списка
        if (screenWidth <= 751) {
            openScreen(2);
        }
        if (typeof window.refreshPartnerTypingHeader === 'function') {
            window.refreshPartnerTypingHeader();
        }
        if (typeof window.syncComposerTyping === 'function') {
            window.syncComposerTyping();
        }
        if (typeof window.setChatUnreadBadge === 'function') {
            window.setChatUnreadBadge(chatId, 0);
        }
        if (typeof window.syncChatViewing === 'function') {
            window.syncChatViewing();
        }
    } catch (err) {
        d_alert("Ошибка", "Ошибка в открытии чата", "ok");
        console.log(err);
    }
}

const CHAT_LIST_WIDTH_KEY = 'dovery-chat-list-width';
const CHAT_LIST_MIN_WIDTH = 250;
const CHAT_LIST_MAX_WIDTH = 560;
const CHAT_PANEL_MIN_WIDTH = 380;

function clampChatListWidth(widthPx) {
    const maxW = Math.min(
        CHAT_LIST_MAX_WIDTH,
        Math.max(CHAT_LIST_MIN_WIDTH, window.innerWidth - CHAT_PANEL_MIN_WIDTH)
    );
    return Math.round(Math.min(maxW, Math.max(CHAT_LIST_MIN_WIDTH, widthPx)));
}

function applyChatListWidth(widthPx) {
    const width = clampChatListWidth(widthPx);
    const value = `${width}px`;
    document.documentElement.style.setProperty('--width-chat-list', value);
    const sidebar = document.getElementById('app');
    if (!sidebar) return width;

    // На узких экранах боковая панель должна растягиваться на всю ширину.
    // Inline-сайзинг из сохранённого значения ломает это (и список начинает "вставать" по центру).
    if (canResizeChatList()) {
        sidebar.style.width = value;
        sidebar.style.minWidth = value;
        sidebar.style.maxWidth = value;
        sidebar.style.flexBasis = value;
    } else {
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
        sidebar.style.maxWidth = '';
        sidebar.style.flexBasis = '';
    }
    return width;
}

function canResizeChatList() {
    return window.innerWidth >= 751;
}

function hideChatListResizer() {
    const resizer = document.getElementById('dragbar');
    if (!resizer) return;
    resizer.classList.remove('is-active', 'dragging');
    document.body.classList.remove('is-resizing-chats');
}

function showChatListResizer() {
    if (!canResizeChatList()) return;
    const resizer = document.getElementById('dragbar');
    if (!resizer) return;
    resizer.classList.add('is-active');
}

function beginChatListResize() {
    if (!canResizeChatList()) return;
    showChatListResizer();
    if (typeof hideDropdown === 'function') hideDropdown();
}

window.beginChatListResize = beginChatListResize;
window.showChatListResizer = showChatListResizer;
window.hideChatListResizer = hideChatListResizer;
window.canResizeChatList = canResizeChatList;

function syncResizeMenuItem() {
    if (!Array.isArray(window.list_items_icon_01)) return;
    const idx = window.list_items_icon_01.findIndex((entry) => entry.id === 'resize-chats');
    if (canResizeChatList()) {
        const item = {
            id: 'resize-chats',
            label: 'Изменить',
            onclick: 'beginChatListResize();',
            icon: 'edit'
        };
        if (idx >= 0) window.list_items_icon_01[idx] = item;
        else window.list_items_icon_01.push(item);
    } else if (idx >= 0) {
        window.list_items_icon_01.splice(idx, 1);
        hideChatListResizer();
    }
}

window.syncResizeMenuItem = syncResizeMenuItem;

function initChatListResizer() {
    const resizer = document.getElementById('dragbar');
    const sidebar = document.getElementById('app');
    if (!resizer || !sidebar) return;

    const saved = parseInt(localStorage.getItem(CHAT_LIST_WIDTH_KEY), 10);
    if (Number.isFinite(saved)) applyChatListWidth(saved);
    syncResizeMenuItem();

    let dragging = false;
    let pointerId = null;
    let startLeft = 0;
    let grabOffset = 0;
    let veil = null;

    const persistWidth = () => {
        const current = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--width-chat-list'),
            10
        );
        if (Number.isFinite(current)) {
            localStorage.setItem(CHAT_LIST_WIDTH_KEY, String(current));
        }
    };

    const stopDragging = (e) => {
        if (!dragging) return;
        if (e && pointerId != null && e.pointerId !== pointerId) return;
        dragging = false;
        pointerId = null;
        resizer.classList.remove('dragging');
        document.body.classList.remove('is-resizing-chats');
        if (veil) {
            veil.remove();
            veil = null;
        }
        persistWidth();
        hideChatListResizer();
    };

    const onPointerMove = (e) => {
        if (!dragging) return;
        if (pointerId != null && e.pointerId !== pointerId) return;
        applyChatListWidth(e.clientX - grabOffset - startLeft);
    };

    resizer.addEventListener('pointerdown', (e) => {
        if (!canResizeChatList() || !resizer.classList.contains('is-active')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        pointerId = e.pointerId;
        const rect = sidebar.getBoundingClientRect();
        startLeft = rect.left;
        grabOffset = e.clientX - rect.right;
        resizer.classList.add('dragging');
        document.body.classList.add('is-resizing-chats');
        veil = document.createElement('div');
        veil.className = 'chat-list-resize-veil';
        document.body.appendChild(veil);
    });

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', stopDragging, true);
    document.addEventListener('pointercancel', stopDragging, true);
    window.addEventListener('blur', () => stopDragging());

    document.addEventListener('click', (e) => {
        if (!resizer.classList.contains('is-active') || dragging) return;
        if (e.target.closest('#dragbar') || e.target.closest('#tagDropdown') || e.target.closest('#cntxt_menu_btn_01')) {
            return;
        }
        hideChatListResizer();
    });

    window.addEventListener('resize', () => {
        syncResizeMenuItem();
        if (!canResizeChatList()) return;
        const current = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--width-chat-list'),
            10
        );
        if (Number.isFinite(current)) applyChatListWidth(current);
    });
}

document.addEventListener('DOMContentLoaded', initChatListResizer);

const TYPING_HEARTBEAT_MS = 2500;
const TYPING_EXPIRE_MS = 4500;
const VIEWING_HEARTBEAT_MS = 2500;
const typingPartners = new Set();
let emittedTypingChatId = null;
let typingHeartbeatTimer = null;
let typingExpireTimers = {};
let emittedViewingChatId = null;
let viewingHeartbeatTimer = null;

function getOpenChatId() {
    const chatContent = document.getElementById('chat-content');
    if (!chatContent || chatContent.classList.contains('hidden')) return null;
    if (window.innerWidth <= 751) {
        const screen = document.getElementById('message-chats');
        if (!screen || !screen.classList.contains('active')) return null;
    }
    const chatId = document.getElementById('id_ept')?.textContent?.trim();
    return chatId || null;
}

function isChatComposerKeyboardOpen() {
    const ta = document.getElementById('messages-textarea');
    if (!ta) return false;
    return document.activeElement === ta && document.visibilityState === 'visible';
}

function setHeaderTypingVisible(show) {
    const statusEl = document.getElementById('user-status');
    const typingEl = document.getElementById('user-typing');
    if (!statusEl || !typingEl) return;
    typingEl.classList.toggle('hidden', !show);
    statusEl.classList.toggle('hidden', show);
}

function refreshPartnerTypingHeader() {
    if (getConnectionStatusLabel()) {
        setHeaderTypingVisible(false);
        return;
    }
    const openId = getOpenChatId();
    setHeaderTypingVisible(!!(openId && typingPartners.has(String(openId))));
}

function emitComposerTyping(isTyping, force) {
    const chatId = isTyping ? getOpenChatId() : (getOpenChatId() || emittedTypingChatId);
    if (!chatId) return;
    if (isTyping) {
        if (emittedTypingChatId && emittedTypingChatId !== chatId) {
            socket.emit('typing', { chat_id: emittedTypingChatId, typing: false });
        } else if (emittedTypingChatId === chatId && !force) {
            return;
        }
        socket.emit('typing', { chat_id: chatId, typing: true });
        emittedTypingChatId = chatId;
    } else if (emittedTypingChatId) {
        socket.emit('typing', { chat_id: emittedTypingChatId, typing: false });
        emittedTypingChatId = null;
    }
}

function syncComposerTyping() {
    const shouldType = !!getOpenChatId() && isChatComposerKeyboardOpen();
    if (shouldType) {
        emitComposerTyping(true);
        if (!typingHeartbeatTimer) {
            typingHeartbeatTimer = setInterval(() => {
                if (getOpenChatId() && isChatComposerKeyboardOpen()) {
                    emitComposerTyping(true, true);
                } else {
                    syncComposerTyping();
                }
            }, TYPING_HEARTBEAT_MS);
        }
    } else {
        if (typingHeartbeatTimer) {
            clearInterval(typingHeartbeatTimer);
            typingHeartbeatTimer = null;
        }
        emitComposerTyping(false);
    }
}

window.refreshPartnerTypingHeader = refreshPartnerTypingHeader;
window.syncComposerTyping = syncComposerTyping;

socket.on('partner_typing', (data) => {
    const chatId = data?.chat_id != null ? String(data.chat_id) : '';
    if (!chatId) return;

    if (data.typing) {
        typingPartners.add(chatId);
        if (typingExpireTimers[chatId]) clearTimeout(typingExpireTimers[chatId]);
        typingExpireTimers[chatId] = setTimeout(() => {
            typingPartners.delete(chatId);
            delete typingExpireTimers[chatId];
            refreshPartnerTypingHeader();
        }, TYPING_EXPIRE_MS);
    } else {
        typingPartners.delete(chatId);
        if (typingExpireTimers[chatId]) {
            clearTimeout(typingExpireTimers[chatId]);
            delete typingExpireTimers[chatId];
        }
    }
    refreshPartnerTypingHeader();
});

socket.on('disconnect', () => {
    emittedTypingChatId = null;
    if (typingHeartbeatTimer) {
        clearInterval(typingHeartbeatTimer);
        typingHeartbeatTimer = null;
    }
    emittedViewingChatId = null;
    if (viewingHeartbeatTimer) {
        clearInterval(viewingHeartbeatTimer);
        viewingHeartbeatTimer = null;
    }
});

socket.on('connect', () => {
    syncComposerTyping();
    syncChatViewing();
});

document.addEventListener('DOMContentLoaded', () => {
    const ta = document.getElementById('messages-textarea');
    if (ta) {
        ta.addEventListener('focus', syncComposerTyping);
        ta.addEventListener('blur', () => {
            setTimeout(syncComposerTyping, 0);
        });
    }

    const chatScreen = document.getElementById('message-chats');
    const chatContent = document.getElementById('chat-content');
    const classObs = new MutationObserver(() => {
        syncComposerTyping();
        refreshPartnerTypingHeader();
        syncChatViewing();
    });
    if (chatScreen) classObs.observe(chatScreen, { attributes: true, attributeFilter: ['class'] });
    if (chatContent) classObs.observe(chatContent, { attributes: true, attributeFilter: ['class'] });
});

document.addEventListener('visibilitychange', () => {
    syncComposerTyping();
    syncChatViewing();
});
window.addEventListener('pagehide', () => {
    emitComposerTyping(false);
    emitChatViewing(false);
});

function isChatViewingNow() {
    return !!getOpenChatId() && document.visibilityState === 'visible';
}

function emitChatViewing(isViewing, force) {
    const chatId = isViewing ? getOpenChatId() : (getOpenChatId() || emittedViewingChatId);
    if (!chatId) return;
    if (isViewing) {
        const switched = emittedViewingChatId && emittedViewingChatId !== chatId;
        if (switched) {
            socket.emit('viewing_chat', { chat_id: emittedViewingChatId, viewing: false });
        }
        if (switched || emittedViewingChatId !== chatId || force) {
            socket.emit('viewing_chat', { chat_id: chatId, viewing: true });
        }
        if (emittedViewingChatId !== chatId) {
            socket.emit('mark_chat_read', { chat_id: chatId });
            if (typeof window.setChatUnreadBadge === 'function') {
                window.setChatUnreadBadge(chatId, 0);
            }
        }
        emittedViewingChatId = chatId;
    } else if (emittedViewingChatId) {
        socket.emit('viewing_chat', { chat_id: emittedViewingChatId, viewing: false });
        emittedViewingChatId = null;
    }
}

function syncChatViewing() {
    const shouldView = isChatViewingNow();
    if (shouldView) {
        emitChatViewing(true);
        if (!viewingHeartbeatTimer) {
            viewingHeartbeatTimer = setInterval(() => {
                if (isChatViewingNow()) {
                    emitChatViewing(true, true);
                } else {
                    syncChatViewing();
                }
            }, VIEWING_HEARTBEAT_MS);
        }
    } else {
        if (viewingHeartbeatTimer) {
            clearInterval(viewingHeartbeatTimer);
            viewingHeartbeatTimer = null;
        }
        emitChatViewing(false);
    }
}

window.syncChatViewing = syncChatViewing;

function copy_message(id) {
    // Ищем элемент, у которого data-id совпадает с переданным
    const msgElement = document.querySelector(`.message-wrapper[data-id="${id}"]`)
        || document.querySelector(`[data-id="${id}"]`);
    
    if (msgElement) {
        // Находим внутри него блок с текстом
        const textContent = msgElement.querySelector('.message-content');
        
        if (textContent) {
            const text = textContent.innerText;
            
            navigator.clipboard.writeText(text).then(() => {
                hideDropdown();
            }).catch(err => {
                console.error("Ошибка при копировании:", err);
            });
        } else {
            console.error("Блок .message-content не найден внутри сообщения");
        }
    } else {
        console.error(`Сообщение ${id} не найдено в DOM`);
    }
}

window.copy_message = copy_message;

function copy_who(who) {
    const username = document.getElementById('profile-username').innerText;
    const u_username = username.slice(1);
    navigator.clipboard.writeText(who + u_username).then(() => {
        hideDropdown();
    }).catch(err => {
        console.error("Ошибка при копировании:", err);
    });
}

function copy_username() {
    copy_who('@');
}

function copy_link_username() {
    copy_who('https://dovery.space/');
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    
    const showProfile = params.get('profile');
    const userId = params.get('user_id');

    // Если мы пришли после редиректа
    if (showProfile === 'true' && userId) {
        // try {
            // Запрашиваем данные у созданного API роута
            const response = await fetch(`/get_use_profile/${userId}`);
            
            if (response.ok) {
                const user = await response.json();

                // Инициализируем кэш, если его нет
                if (typeof chatsData === 'undefined') window.chatsData = {};
                if (typeof chatHash === 'undefined') window.chatHash = {};

                let avatarHtml = '';
                if (user.hide_avatar) {
                    avatarHtml = letterAvatarHtml(user.name);
                } else if (user.avatar && user.avatar !== 'avatarkins.png' && user.avatar !== 'null') {
                    avatarHtml = photoAvatarHtml(`static/files/avatars/${user.avatar}`);
                } else {
                    avatarHtml = letterAvatarHtml(user.name);
                }

                chatsData[userId] = {
                    username: user.username,
                    name: user.name,
                    avatar: avatarHtml,
                    avatarRaw: user.avatar,
                    hideAvatar: !!user.hide_avatar,
                    publicKey: user.public_key,
                    signingPublicKey: user.signing_public_key || '',
                    publicKeySig: user.public_key_sig || '',
                    status: user.status,
                    realStatus: user.real_status || user.status,
                    blockState: normalizeBlockState(user.block_state)
                };
                console.log(chatsData);
                openProfile(userId, false, true);
            }
        // } catch (error) {
        //     console.error("Ошибка загрузки профиля:", error);
        // }
        
        // МГНОВЕННО УБИРАЕМ ХВОСТ ИЗ ССЫЛКИ
        // В адресной строке останется строго "/"
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
});

window.snapDelete = async function(id) {
    const cleanId = id.trim();

    if (typeof hideDropdown === 'function') hideDropdown();
    socket.emit('delete_message', { msg_id: cleanId });
};

socket.on('message_deleted', async (data) => {
    try {
        const chatId = data.chat_id;
        let shouldRemoveDateHeader = false;
        let dateLabelToRemove = null;

        if (typeof chatHash !== 'undefined' && chatHash[chatId]) {
            const msgToDelete = chatHash[chatId].messages.find(msg => msg.id === data.msg_id);
            
            if (msgToDelete) {
                dateLabelToRemove = getShortDateLabel(msgToDelete.time);
                
                chatHash[chatId].messages = chatHash[chatId].messages.filter(msg => msg.id !== data.msg_id);
                
                const hasMoreMessagesThisDay = chatHash[chatId].messages.some(
                    msg => getShortDateLabel(msg.time) === dateLabelToRemove
                );
                if (!hasMoreMessagesThisDay) {
                    shouldRemoveDateHeader = true;
                }
            }
        }

        const messageElement = document.querySelector(`[data-id="${data.msg_id}"]`);
        if (messageElement) {
            const wrapper = messageElement.closest('.message-wrapper');
            if (wrapper) {
                try {
                    let dateHeaderElement = null;
                    if (shouldRemoveDateHeader && dateLabelToRemove) {
                        const headers = messagesArea.querySelectorAll('.chat-date-group');
                        for (let header of headers) {
                            if (header.textContent.trim() === dateLabelToRemove) {
                                dateHeaderElement = header;
                                break;
                            }
                        }
                    }

                    const pixels = await htmlToImage.toPixelData(wrapper, { pixelRatio: 1 });
                    
                    const width = wrapper.offsetWidth;
                    const height = wrapper.offsetHeight;
                    const rect = wrapper.getBoundingClientRect();

                    wrapper.style.visibility = 'hidden';
                    
                    if (dateHeaderElement) {
                        dateHeaderElement.style.transition = 'opacity 0.2s ease-out, transform 0.5s ease-out';
                        dateHeaderElement.style.opacity = '0';
                    }

                    const layersCount = 20;
                    const layers = [];
                    
                    for (let i = 0; i < layersCount; i++) {
                        const c = document.createElement('canvas');
                        c.width = width;
                        c.height = height;
                        c.className = 'dust';
                        c.style.cssText = `
                            position: absolute;
                            left: ${rect.left}px;
                            top: ${rect.top + window.scrollY}px;
                            width: ${width}px;
                            height: ${height}px;
                            pointer-events: none;
                            z-index: 9999;
                            transition: transform 0.8s ease-out, opacity 0.6s ease-out;
                        `;
                        document.body.appendChild(c);
                        layers.push({ c, ctx: c.getContext('2d'), imgData: c.getContext('2d').createImageData(width, height) });
                    }

                    for (let i = 0; i < pixels.length; i += 12) { 
                        const x = (i / 4) % width;
                        const lIdx = Math.floor(layersCount * (Math.random() + (2 * x / width)) / 3) % layersCount;
                        const d = layers[lIdx].imgData.data;

                        d[i] = pixels[i]; 
                        d[i+1] = pixels[i+1]; 
                        d[i+2] = pixels[i+2]; 
                        d[i+3] = pixels[i+3];
                    }

                    layers.forEach((l, i) => {
                        l.ctx.putImageData(l.imgData, 0, 0);
                        requestAnimationFrame(() => {
                            const x = (i - layersCount / 2) * 10;
                            const y = 0 - Math.random() * 40;
                            l.c.style.transform = `translate(${x}px, ${y}px) rotate(${(Math.random()-0.5)}rad)`;
                            l.c.style.opacity = '0';
                        });
                        setTimeout(() => l.c.remove(), 1000);
                    });

                    setTimeout(() => {
                        wrapper.remove();
                        if (dateHeaderElement) {
                            dateHeaderElement.remove();
                        }
                        applyMessageGrouping(messagesArea);
                        scheduleStickyChatDateUpdate();
                    }, 500);

                } catch (err) {
                    wrapper.remove();
                    if (dateHeaderElement) {
                        const headers = messagesArea.querySelectorAll('.chat-date-group');
                        for (let header of headers) {
                            if (header.textContent.trim() === dateLabelToRemove) {
                                header.remove();
                                break;
                            }
                        }
                    }
                    applyMessageGrouping(messagesArea);
                    scheduleStickyChatDateUpdate();
                }
            }
        }
    } catch (err) {
        console.error("Ошибка при удалении сообщения:", err);
    }
});

window.userId = null;
openDoveryDB().then((db) => {
  const transaction = db.transaction(DOVERY_STORE_NAME, 'readonly');
  const store = transaction.objectStore(DOVERY_STORE_NAME);
  const getRequest = store.get('user_profile');
  getRequest.onsuccess = () => {
    const data = getRequest.result;
    if (data) {
      window.userId = String(data.id);
    }
  };
  transaction.oncomplete = () => db.close();
  transaction.onerror = () => db.close();
}).catch((err) => {
  console.warn('Не удалось открыть IndexedDB профиля', err);
});

function getShortDateLabel(timeString) {
    const date = new Date(timeString);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function createDateHeaderElement(dateLabel) {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'chat-date-group';
    dateHeader.dataset.date = dateLabel;
    dateHeader.innerHTML = `<span class="chat-date-header caption1-medium">${dateLabel}</span>`;
    return dateHeader;
}

let stickyDateRaf = null;
let stickyDateBound = false;

function getStickyDateElements() {
    return {
        area: document.getElementById('messages-area'),
        sticky: document.getElementById('sticky-chat-date'),
    };
}

function hideStickyChatDate() {
    const { sticky } = getStickyDateElements();
    if (!sticky) return;
    sticky.hidden = true;
    sticky.classList.remove('is-visible');
    const label = sticky.querySelector('.chat-date-header');
    if (label) label.textContent = '';
}

function ensureSkeletonStyles() {
    if (document.getElementById('skeleton-loading-styles')) return;
    const style = document.createElement('style');
    style.id = 'skeleton-loading-styles';
    style.textContent = `
        .message-wrapper.loading-skeleton {
            opacity: 0.7;
            pointer-events: none;
        }
        .message-wrapper.loading-skeleton .message-bubble {
            background: linear-gradient(90deg,
                color-mix(in srgb, var(--tg-theme-hint-color) 38%, var(--tg-theme-message-bg-color-received)) 25%,
                color-mix(in srgb, var(--tg-theme-hint-color) 14%, var(--tg-theme-message-bg-color-received)) 50%,
                color-mix(in srgb, var(--tg-theme-hint-color) 38%, var(--tg-theme-message-bg-color-received)) 75%);
            background-size: 200% 100%;
            animation: skeletonShimmer 1.4s infinite linear;
        }
        .message-wrapper.loading-skeleton.sent .message-bubble {
            background: linear-gradient(90deg,
                color-mix(in srgb, var(--tg-theme-hint-color) 38%, var(--tg-theme-message-bg-color-sent)) 25%,
                color-mix(in srgb, var(--tg-theme-hint-color) 14%, var(--tg-theme-message-bg-color-sent)) 50%,
                color-mix(in srgb, var(--tg-theme-hint-color) 38%, var(--tg-theme-message-bg-color-sent)) 75%);
            background-size: 200% 100%;
            animation: skeletonShimmer 1.4s infinite linear;
        }
        .message-wrapper.loading-skeleton.received .message-bubble {
            background: linear-gradient(90deg,
                color-mix(in srgb, var(--tg-theme-hint-color) 38%, var(--tg-theme-message-bg-color-received)) 25%,
                color-mix(in srgb, var(--tg-theme-hint-color) 14%, var(--tg-theme-message-bg-color-received)) 50%,
                color-mix(in srgb, var(--tg-theme-hint-color) 38%, var(--tg-theme-message-bg-color-received)) 75%);
            background-size: 200% 100%;
            animation: skeletonShimmer 1.4s infinite linear;
        }
        .message-wrapper.loading-skeleton .message-content {
            color: transparent;
            min-height: 10px;
            width: 60%;
            border-radius: 4px;
        }
        .message-wrapper.loading-skeleton .message-content::after {
            content: '';
            display: inline-block;
            width: 100%;
            height: 100%;
        }
        .message-wrapper.loading-skeleton .message-info {
            opacity: 0.5;
        }
        .message-wrapper.loading-skeleton .message-info span {
            color: transparent;
        }
        @keyframes skeletonShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .history-loading-skeletons {
            display: flex;
            flex-direction: column-reverse;
            width: 100%;
            pointer-events: none;
        }
        #history-load-sentinel {
            height: 1px;
            width: 100%;
            flex-shrink: 0;
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
}

function createSkeletonMessage(type, textLines = 1) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper loading-skeleton ${type}`;
    
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${type}`;
    
    const content = document.createElement('div');
    content.className = 'message-content body1';
    
    const info = document.createElement('div');
    info.className = 'message-info caption2';
    info.innerHTML = '<span>&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;</span>';
    
    bubble.appendChild(content);
    bubble.appendChild(info);
    wrapper.appendChild(bubble);
    return wrapper;
}

const HISTORY_SKELETON_PATTERNS = [
    { type: 'sent', lines: 2 },
    { type: 'received', lines: 1 },
    { type: 'sent', lines: 3 },
    { type: 'received', lines: 2 },
    { type: 'sent', lines: 1 },
    { type: 'received', lines: 2 }
];

function showLoadingSkeletons(container) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    HISTORY_SKELETON_PATTERNS.forEach((pattern) => {
        fragment.appendChild(createSkeletonMessage(pattern.type, pattern.lines));
    });
    container.appendChild(fragment);
}

function appendHistorySkeletons(container) {
    if (!container) return;
    removeHistorySkeletons(container);
    ensureSkeletonStyles();
    const wrap = document.createElement('div');
    wrap.className = 'history-loading-skeletons';
    wrap.setAttribute('aria-hidden', 'true');
    HISTORY_SKELETON_PATTERNS.forEach((pattern) => {
        wrap.appendChild(createSkeletonMessage(pattern.type, pattern.lines));
    });
    const sentinel = container.querySelector('#history-load-sentinel');
    if (sentinel) container.insertBefore(wrap, sentinel);
    else container.appendChild(wrap);
}

function removeHistorySkeletons(container) {
    container?.querySelectorAll('.history-loading-skeletons').forEach((el) => el.remove());
}

function updateStickyChatDate() {
    const { area, sticky } = getStickyDateElements();
    if (!area || !sticky) return;

    const messages = area.querySelectorAll('.message-wrapper:not(.loading-skeleton)');
    const headers = Array.from(area.querySelectorAll('.chat-date-group'));
    const canScroll = area.scrollHeight > area.clientHeight + 8;

    // Мало сообщений или всё и так видно — достаточно дат в потоке
    if (messages.length <= 3 || !canScroll || headers.length === 0) {
        headers.forEach((header) => header.classList.remove('is-covered'));
        hideStickyChatDate();
        return;
    }

    // Линия закрепления совпадает с CSS top плашки (~70px от верха области чата)
    const areaRect = area.getBoundingClientRect();
    const stickyLine = areaRect.top + 82;

    let active = null;
    let activeTop = -Infinity;

    for (const header of headers) {
        const top = header.getBoundingClientRect().top;
        if (top <= stickyLine + 2 && top >= activeTop) {
            active = header;
            activeTop = top;
        }
    }

    if (!active) {
        active = headers.reduce((best, header) => {
            const top = header.getBoundingClientRect().top;
            const bestTop = best.getBoundingClientRect().top;
            return top > bestTop ? header : best;
        });
    }

    const label = (active.dataset.date || active.textContent || '').trim();
    const labelEl = sticky.querySelector('.chat-date-header');
    if (labelEl && labelEl.textContent !== label) {
        labelEl.textContent = label;
    }

    sticky.hidden = false;
    sticky.classList.add('is-visible');

    headers.forEach((header) => {
        const same = (header.dataset.date || header.textContent || '').trim() === label;
        const top = header.getBoundingClientRect().top;
        header.classList.toggle('is-covered', same && top <= stickyLine + 8);
    });
}

function scheduleStickyChatDateUpdate() {
    if (stickyDateRaf) return;
    stickyDateRaf = requestAnimationFrame(() => {
        stickyDateRaf = null;
        updateStickyChatDate();
        updateScrollToBottomButton();
    });
}

function bindStickyChatDate() {
    const { area } = getStickyDateElements();
    if (!area || stickyDateBound) {
        scheduleStickyChatDateUpdate();
        return;
    }
    stickyDateBound = true;
    area.addEventListener('scroll', scheduleStickyChatDateUpdate, { passive: true });
    window.addEventListener('resize', scheduleStickyChatDateUpdate);
    scheduleStickyChatDateUpdate();
}

function insertNewMessageWithDateCheck(messagesArea, messageWrapper, msgTime) {
    const dateLabel = getShortDateLabel(msgTime);
    const topHeader = messagesArea.querySelector('.chat-date-group .chat-date-header');
    const lastVisualDate = topHeader ? topHeader.innerText : null;
    if (dateLabel !== lastVisualDate) {
        messagesArea.prepend(createDateHeaderElement(dateLabel));
    }

    if (msgTime && !messageWrapper.dataset.time) {
        messageWrapper.dataset.time = msgTime;
    }

    messagesArea.prepend(messageWrapper);
    applyMessageGrouping(messagesArea);
    scheduleStickyChatDateUpdate();
}

const MESSAGE_GROUP_GAP_MS = 10 * 60 * 1000;

function hasDateHeaderBetween(newerEl, olderEl) {
    let node = newerEl.nextElementSibling;
    while (node && node !== olderEl) {
        if (node.classList.contains('chat-date-group')) return true;
        node = node.nextElementSibling;
    }
    return false;
}

function canGroupMessages(a, b) {
    if (!a || !b) return false;
    if (a.dataset.sender !== b.dataset.sender) return false;
    const aSent = a.classList.contains('sent');
    const bSent = b.classList.contains('sent');
    if (aSent !== bSent) return false;

    const t1 = new Date(a.dataset.time).getTime();
    const t2 = new Date(b.dataset.time).getTime();
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return false;
    return Math.abs(t1 - t2) < MESSAGE_GROUP_GAP_MS;
}

function applyMessageGrouping(area) {
    if (!area) return;
    const wrappers = Array.from(area.querySelectorAll('.message-wrapper:not(.loading-skeleton)'));

    wrappers.forEach((w) => {
        w.classList.remove('msg-group-first', 'msg-group-middle', 'msg-group-last', 'msg-group-follow');
    });

    // DOM при column-reverse: [0]=новее … дальше=старше
    for (let i = 0; i < wrappers.length; i++) {
        const curr = wrappers[i];
        const older = wrappers[i + 1];
        const newer = wrappers[i - 1];

        const linksOlder = canGroupMessages(curr, older) && !hasDateHeaderBetween(curr, older);
        const linksNewer = canGroupMessages(curr, newer) && !hasDateHeaderBetween(newer, curr);

        if (linksNewer && linksOlder) {
            curr.classList.add('msg-group-middle', 'msg-group-follow');
        } else if (linksNewer && !linksOlder) {
            // Самое старое в группе — радиус как у обычных
            curr.classList.add('msg-group-first');
        } else if (!linksNewer && linksOlder) {
            // Самое новое в группе — 0 у стыковочного угла
            curr.classList.add('msg-group-last', 'msg-group-follow');
        }
    }
}

const msgInput = document.getElementById('messages-textarea');
const sendBtn = document.getElementById('sendBtn');
const messagesArea = document.getElementById('messages-area');

async function encryptText(text) {
    if (!window.keychat) {
        throw new Error("Ключ чата не инициализирован! Сначала открой чат.");
    }
    const encodedText = new TextEncoder().encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        window.keychat,
        encodedText
    );

    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);

    return btoa(String.fromCharCode(...combined));
}

async function decryptText(encryptedBase64) {
    if (!window.keychat) throw new Error("Ключ не инициализирован");
    const combined = new Uint8Array(atob(encryptedBase64).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decryptedContent = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        window.keychat,
        data
    );

    return new TextDecoder().decode(decryptedContent);
}

async function decryptText_new_message(encryptedBase64, userid) {
    const keychat = chatsData[userid]?.keychat || window.keychat;
    if (!keychat) throw new Error("Ключ не инициализирован");
    const combined = new Uint8Array(atob(encryptedBase64).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decryptedContent = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        keychat,
        data
    );

    return new TextDecoder().decode(decryptedContent);
}

function getPreciseISOString() {
    const date = new Date();
    const isoString = date.toISOString();
    
    const microseconds = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return isoString.replace('Z', microseconds + '+00:00');
}

function scrollMessagesToLatest() {
    if (!messagesArea) return;
    // flex-direction: column-reverse — актуальные сообщения у визуального низа при scrollTop = 0
    requestAnimationFrame(() => {
        messagesArea.scrollTop = 0;
        scheduleStickyChatDateUpdate();
        updateScrollToBottomButton();
    });
}

function isChatScrolledFarUp() {
    const area = document.getElementById('messages-area');
    if (!area) return false;
    const distance = Math.abs(area.scrollTop);
    const threshold = Math.max(280, area.clientHeight * 0.85);
    return distance > threshold;
}

function updateScrollToBottomButton() {
    const row = document.getElementById('scroll-to-bottom');
    if (!row) return;
    const shouldShow = isChatScrolledFarUp();
    const isShown = !row.classList.contains('hidden');
    if (shouldShow === isShown) return;
    row.classList.toggle('hidden', !shouldShow);
    if (bottomBar) bottomBar.classList.toggle('has-scroll-down', shouldShow);
    syncComposerBarLayout();
}

function initScrollToBottomButton() {
    const btn = document.getElementById('scroll-to-bottom-btn');
    if (!btn || btn.dataset.bound === '1') {
        updateScrollToBottomButton();
        return;
    }
    btn.dataset.bound = '1';
    btn.addEventListener('pointerdown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        scrollMessagesToLatest();
    });
    updateScrollToBottomButton();
}

document.addEventListener('DOMContentLoaded', initScrollToBottomButton);
if (document.readyState !== 'loading') initScrollToBottomButton();

function isWideChatLayout() {
    // Планшет/ноут: список чатов виден рядом с перепиской
    return window.innerWidth >= 751 && !!document.getElementById('chats-list');
}

function resetMessageComposer() {
    msgInput.value = '';
    msgInput.setAttribute('rows', '1');
    msgInput.style.height = 'auto';
    syncComposerBarLayout();
}

const MAX_MESSAGE_LENGTH = 1024;
const MAX_MESSAGES_PER_MINUTE = 20;
const _recentMessageTimes = [];

function canSendMessageClient() {
    const now = Date.now();
    while (_recentMessageTimes.length && now - _recentMessageTimes[0] > 60_000) {
        _recentMessageTimes.shift();
    }
    return _recentMessageTimes.length < MAX_MESSAGES_PER_MINUTE;
}

function noteMessageSentClient() {
    _recentMessageTimes.push(Date.now());
}

function removeOptimisticMessage(msgId) {
    if (!msgId) return;
    const el = messagesArea?.querySelector(`.message-wrapper[data-id="${msgId}"]`)
        || messagesArea?.querySelector(`[data-id="${msgId}"]`)?.closest('.message-wrapper');
    if (el) el.remove();

    const activeChatId = document.getElementById('id_ept')?.innerText;
    if (activeChatId && chatHash[activeChatId]) {
        chatHash[activeChatId].messages = chatHash[activeChatId].messages.filter(
            (m) => m.id !== msgId
        );
    }
    applyMessageGrouping(messagesArea);
    scheduleStickyChatDateUpdate();
}

function isMessageRead(value) {
    return value === true || value === 1 || value === '1';
}
const TICK_DOUBLE_SVG = '<svg class="msg-ticks" width="18" height="9" viewBox="0 0 18 9" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M0.75 5.23153L3.70486 7.9894L11.4614 0.75M16.6324 0.922367L8.87586 8.16177L7.95246 7.29993" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> </svg>'
// const TICK_SINGLE_SVG = '<svg class="msg-ticks" viewBox="0 0 12 11" width="16" height="11" aria-hidden="true"><path d="M1.2 5.8 L4.4 9 L10.8 1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// const TICK_DOUBLE_SVG = '<svg class="msg-ticks" viewBox="0 0 16 11" width="18" height="11" aria-hidden="true"><path d="M0.9 5.8 L4.1 9 L10.5 1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.2 5.8 L8.4 9 L14.8 1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TICK_SINGLE_SVG = '<svg class="msg-ticks" width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M0.75 5.29813L3.94355 8.16177L12.3971 0.75" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> </svg>'


function messageStatusHtml(isRead) {
    return `<span class="message-status${isRead ? ' is-read' : ''}">${isRead ? TICK_DOUBLE_SVG : TICK_SINGLE_SVG}</span>`;
}

function sentMessageInfoHtml(timeStr, isRead) {
    return `<div class="message-info">
                <span class="message-time caption2">${formatTime(timeStr) || ''}</span>
                ${messageStatusHtml(!!isRead)}
            </div>`;
}

function receivedMessageInfoHtml(timeStr) {
    return `<div class="message-info">
                <span class="message-time caption2">${formatTime(timeStr) || ''}</span>
            </div>`;
}

function applyMessageReadStatus(root, isRead) {
    const status = root && root.querySelector('.message-status');
    if (!status) return;
    status.classList.toggle('is-read', !!isRead);
    status.innerHTML = isRead ? TICK_DOUBLE_SVG : TICK_SINGLE_SVG;
}

function setCachedMessageRead(chatId, msgId, isRead) {
    if (!chatId || !chatHash[chatId] || !msgId) return;
    const msg = chatHash[chatId].messages.find((m) => m.id === msgId);
    if (msg) msg.is_read = isRead ? 1 : 0;
}

function markSentMessagesReadInChat(chatId) {
    if (!chatId) return;
    if (chatHash[chatId]) {
        const me = String(window.userId);
        chatHash[chatId].messages.forEach((m) => {
            if (String(m.sender_id) === me) m.is_read = 1;
        });
    }
    if (String(getOpenChatId()) !== String(chatId)) return;
    document.querySelectorAll('#messages-area .message-wrapper.sent').forEach((w) => {
        applyMessageReadStatus(w, true);
    });
}

async function sendMessage() {
    const text = msgInput.value;
    if (!text.trim()) return;

    if (text.length > MAX_MESSAGE_LENGTH) {
        d_pop("Слишком длинное сообщение", `Максимум ${MAX_MESSAGE_LENGTH} символов`, "Хорошо");
        return;
    }

    if (!canSendMessageClient()) {
        d_pop("Слишком часто", "Не больше 20 сообщений в минуту", "Хорошо");
        return;
    }

    let encryptedText;
    try {
        encryptedText = await encryptText(text);
    } catch (err) {
        console.error("Шифрование не удалось:", err);
        return;
    }

    const generateId = (len) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const randomValues = new Uint32Array(len);
        window.crypto.getRandomValues(randomValues);
        for (let i = 0; i < len; i++) {
            result += chars[randomValues[i] % chars.length];
        }
        return result;
    };

    const msgId = "msg_" + generateId(15);
    const time = getPreciseISOString();

    const chatId = document.getElementById('id_ept').innerText;
    const blockState = getChatBlockState(chatId);
    if (!blockState.can_send) {
        updateComposerBlockedState(chatId);
        return;
    }

    noteMessageSentClient();

    socket.emit('send_direct_message', {
        chat_id: chatId,
        text: encryptedText,
        msgId: msgId
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper sent new-msg';
    wrapper.dataset.id = msgId;
    wrapper.dataset.time = time;
    wrapper.dataset.sender = String(userId ?? window.userId ?? '');
    wrapper.innerHTML = `
        <div class="message-bubble sent" data-id="${msgId}">
            <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
            ${sentMessageInfoHtml(time, false)}
        </div>
    `;

    setMessageContent(wrapper.querySelector('.message-content'), text);

    insertNewMessageWithDateCheck(messagesArea, wrapper, time);

        if (chatHash[chatId]) {
            chatHash[chatId].messages.push({
                id: msgId,
                message_text: encryptedText,
                sender_id: userId,
                time: time,
                is_read: 0
            });
        }

    resetMessageComposer();
    scrollMessagesToLatest();
    // keep keyboard / caret — без blur; preventScroll чтобы страница не дёргалась
    msgInput.focus({ preventScroll: true });
}

socket.on('message_error', (data) => {
    const code = data?.code;
    const msgId = data?.msg_id;
    removeOptimisticMessage(msgId);

    if (code === 'too_long') {
        d_pop("Слишком длинное сообщение", `Максимум ${MAX_MESSAGE_LENGTH} символов`, "Хорошо");
    } else if (code === 'rate_limit') {
        d_pop("Слишком часто", "Не больше 20 сообщений в минуту", "Хорошо");
    } else if (code === 'blocked_by_me') {
        d_alert("Сообщения заблокированы", "Вы заблокировали этого пользователя", "ok");
        updateComposerBlockedState(getActiveChatId());
    } else if (code === 'blocked_me') {
        d_alert("Сообщения заблокированы", "Вас заблокировали", "ok");
        updateComposerBlockedState(getActiveChatId());
    } else if (code === 'unauthorized') {
        d_alert("Ошибка", "Сессия истекла, войдите снова", "ok");
    } else {
        d_alert("Ошибка", "Не удалось отправить сообщение", "ok");
    }
});

socket.on('new_message', async (data) => {
    try {
        const activeChatId = document.getElementById('id_ept') ? document.getElementById('id_ept').innerText : null;
        
        const isMe = (data.sender_id == window.userId);
        const chatId = data.chat_id;
        const partnerId = window.chatIdToUserId ? window.chatIdToUserId[chatId] : null;

        const readFlag = isMessageRead(data.is_read);

        if (chatHash[chatId]) {
            const isAlreadyExists = chatHash[chatId].messages.some(m => m.id === data.msg_id);
            
            if (!isAlreadyExists) {
                chatHash[chatId].messages.push({
                    id: data.msg_id,
                    message_text: data.text,
                    sender_id: data.sender_id,
                    time: data.time,
                    is_read: readFlag ? 1 : 0
                });
            } else if (isMe) {
                setCachedMessageRead(chatId, data.msg_id, readFlag);
                const existing = messagesArea?.querySelector(`.message-wrapper[data-id="${data.msg_id}"]`);
                if (existing) applyMessageReadStatus(existing, readFlag);
                return;
            }
        }

        // 2. Рендерим в DOM только если этот чат сейчас открыт перед глазами
        if (activeChatId == chatId) {
            const keyOwnerId = partnerId;
            const partner = keyOwnerId ? chatsData[keyOwnerId] : null;
            if (partner && !partner.keychat && window.keychat) {
                partner.keychat = window.keychat;
            }
            if (!partner || !partner.keychat) {
                console.warn(`Не найден ключ для дешифровки чата ${keyOwnerId}. Возможно чат еще не инициализирован.`);
                return;
            }

            const decryptedText = await decryptText_new_message(data.text, keyOwnerId);

            const wrapper = document.createElement('div');
            
            if (isMe) {
                // Отрисовка на ТВОИХ соседних вкладках (как исходящее)
                wrapper.className = 'message-wrapper sent new-msg';
                wrapper.dataset.id = data.msg_id;
                wrapper.dataset.time = data.time;
                wrapper.dataset.sender = String(data.sender_id);
                wrapper.innerHTML = `
                    <div class="message-bubble sent" data-id="${data.msg_id}">
                        <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
                        ${sentMessageInfoHtml(data.time, readFlag)}
                    </div>
                `;
            } else {
                // Отрисовка у ПОЛУЧАТЕЛЯ (как входящее)
                wrapper.className = 'message-wrapper received new-msg';
                wrapper.dataset.id = data.msg_id;
                wrapper.dataset.time = data.time;
                wrapper.dataset.sender = String(data.sender_id);
                wrapper.innerHTML = `
                    <div class="message-bubble received" data-id="${data.msg_id}">
                        <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
                        ${receivedMessageInfoHtml(data.time)}
                    </div>
                `;
            }

            setMessageContent(wrapper.querySelector('.message-content'), decryptedText);
            insertNewMessageWithDateCheck(messagesArea, wrapper, data.time);

            // Входящие: вниз только если уже были у низа ленты
            if (!isMe) {
                const nearBottom = messagesArea.scrollTop < 80;
                if (nearBottom) scrollMessagesToLatest();
            } else {
                scrollMessagesToLatest();
            }
        }

    } catch (err) {
        console.error("Критическая ошибка обработки сокета new_message:", err);
    }
});

socket.on('messages_read', (data) => {
    const chatId = data && data.chat_id;
    if (!chatId) return;
    markSentMessagesReadInChat(chatId);
});

// Не отдаём фокус кнопке Send — иначе на мобиле закрывается клавиатура
sendBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
});

sendBtn.addEventListener('click', async () => {
    await sendMessage();
    msgInput.focus({ preventScroll: true });
});

msgInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey && isWideChatLayout()) {
        e.preventDefault();
        await sendMessage();
    }
});

const chatHash = {};
const HISTORY_PAGE_SIZE = 20;
let historyObserver = null;
let historyLoadChatId = null;

function getActiveChatId() {
    return document.getElementById('id_ept')?.textContent?.trim() || null;
}

function parseHistoryResponse(data) {
    if (Array.isArray(data)) {
        return { messages: data, hasMore: data.length >= HISTORY_PAGE_SIZE, blockState: normalizeBlockState() };
    }
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    return {
        messages,
        hasMore: Boolean(data?.has_more),
        blockState: normalizeBlockState(data?.block_state)
    };
}

function mapHistoryMessages(list) {
    return (list || []).map((msg) => ({
        id: msg.id,
        message_text: msg.message_text,
        sender_id: msg.sender_id,
        time: msg.time,
        is_read: isMessageRead(msg.is_read) ? 1 : 0
    }));
}

function getOldestCachedMessage(chatId) {
    const list = chatHash[chatId]?.messages;
    if (!list || !list.length) return null;
    return list.reduce((oldest, msg) => {
        const t = new Date(msg.time).getTime();
        const ot = new Date(oldest.time).getTime();
        if (t < ot) return msg;
        if (t === ot && String(msg.id) < String(oldest.id)) return msg;
        return oldest;
    });
}

function getLastRealMessage(area) {
    const all = area?.querySelectorAll('.message-wrapper:not(.loading-skeleton)');
    return all && all.length ? all[all.length - 1] : null;
}

function preserveScrollAround(area, anchor, fn) {
    const prevTop = anchor ? anchor.getBoundingClientRect().top : null;
    fn();
    if (!anchor || prevTop == null) return;
    const newTop = anchor.getBoundingClientRect().top;
    area.scrollTop += newTop - prevTop;
}

function teardownHistoryLoader() {
    if (historyObserver) {
        historyObserver.disconnect();
        historyObserver = null;
    }
    historyLoadChatId = null;
}

function ensureHistorySentinel(area) {
    if (!area) return null;
    let sentinel = area.querySelector('#history-load-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'history-load-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');
    }
    area.appendChild(sentinel);
    return sentinel;
}

function setupHistoryLoader(chatId) {
    teardownHistoryLoader();
    const area = document.getElementById('messages-area');
    if (!area || !chatHash[chatId] || chatHash[chatId].hasMore === false) return;

    historyLoadChatId = String(chatId);
    const sentinel = ensureHistorySentinel(area);
    historyObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        loadOlderMessages(chatId);
    }, { root: area, rootMargin: '280px 0px', threshold: 0 });
    historyObserver.observe(sentinel);
}

function rebuildDateHeaders(area) {
    if (!area) return;
    area.querySelectorAll('.chat-date-group').forEach((el) => el.remove());
    const wrappers = Array.from(area.querySelectorAll('.message-wrapper:not(.loading-skeleton)'));
    wrappers.forEach((wrapper, index) => {
        const currentDateLabel = getShortDateLabel(wrapper.dataset.time);
        const older = wrappers[index + 1];
        const olderDateLabel = older ? getShortDateLabel(older.dataset.time) : null;
        if (!older || currentDateLabel !== olderDateLabel) {
            wrapper.after(createDateHeaderElement(currentDateLabel));
        }
    });
}

function buildMessageWrapper(msg, currentUserId) {
    const mne = msg.sender_id != currentUserId;
    const typeClass = mne ? 'received' : 'sent';
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + typeClass;
    wrapper.dataset.id = msg.id;
    wrapper.dataset.time = msg.time;
    wrapper.dataset.sender = String(msg.sender_id);
    wrapper.innerHTML = `
        <div class="message-bubble ${typeClass}">
            <div class="message-content body1"></div>
            ${mne ? receivedMessageInfoHtml(msg.time) : sentMessageInfoHtml(msg.time, isMessageRead(msg.is_read))}
        </div>
    `;
    setMessageContent(wrapper.querySelector('.message-content'), msg.decryptedText);
    return wrapper;
}

async function loadOlderMessages(chatId) {
    const cache = chatHash[chatId];
    if (!cache || cache.loadingMore || cache.hasMore === false) return;
    if (String(getActiveChatId()) !== String(chatId)) return;

    const oldest = getOldestCachedMessage(chatId);
    if (!oldest) return;

    const area = document.getElementById('messages-area');
    if (!area) return;

    cache.loadingMore = true;
    const anchor = getLastRealMessage(area);

    preserveScrollAround(area, anchor, () => {
        appendHistorySkeletons(area);
        ensureHistorySentinel(area);
    });
    scheduleStickyChatDateUpdate();

    try {
        const params = new URLSearchParams({
            before_time: oldest.time,
            before_id: oldest.id
        });
        const server = await fetch(`/get_history_messages/${chatId}?${params.toString()}`);
        const parsed = parseHistoryResponse(await server.json());

        if (String(getActiveChatId()) !== String(chatId)) return;

        const existingIds = new Set((cache.messages || []).map((m) => m.id));
        const fresh = mapHistoryMessages(parsed.messages).filter((m) => m.id && !existingIds.has(m.id));
        cache.hasMore = parsed.hasMore;
        cache.blockState = parsed.blockState;
        if (fresh.length) {
            cache.messages = fresh.concat(cache.messages);
        } else {
            cache.hasMore = false;
        }

        const decrypted = await decryptAll(fresh);
        if (String(getActiveChatId()) !== String(chatId)) return;

        const sorted = [...decrypted].sort((a, b) => new Date(b.time) - new Date(a.time));
        preserveScrollAround(area, anchor, () => {
            removeHistorySkeletons(area);
            if (sorted.length) {
                const fragment = document.createDocumentFragment();
                sorted.forEach((msg) => fragment.appendChild(buildMessageWrapper(msg, window.userId)));
                const lastReal = getLastRealMessage(area);
                if (lastReal) lastReal.after(fragment);
                else area.prepend(fragment);
            }
            rebuildDateHeaders(area);
            applyMessageGrouping(area);
            if (cache.hasMore) ensureHistorySentinel(area);
            else area.querySelector('#history-load-sentinel')?.remove();
        });
        scheduleStickyChatDateUpdate();
    } catch (err) {
        console.error('Ошибка подгрузки истории:', err);
        if (String(getActiveChatId()) === String(chatId)) {
            preserveScrollAround(area, anchor, () => removeHistorySkeletons(area));
        }
    } finally {
        if (cache) cache.loadingMore = false;
        if (String(getActiveChatId()) === String(chatId) && cache?.hasMore) {
            setupHistoryLoader(chatId);
        } else if (String(getActiveChatId()) === String(chatId)) {
            teardownHistoryLoader();
            document.getElementById('history-load-sentinel')?.remove();
        }
    }
}

async function loadChat(chatId) {
    const messagesArea = document.getElementById('messages-area');
    messagesArea.innerHTML = '';
    hideStickyChatDate();
    teardownHistoryLoader();

    if (chatHash[chatId]) {
        const messages = await decryptAll(chatHash[chatId].messages);
        if (String(getActiveChatId()) !== String(chatId)) return;
        renderChat(messagesArea, messages, window.userId);
        updateComposerBlockedState(chatId);
        syncBlockMenuItem();
        setupHistoryLoader(chatId);
        return;
    } else {
        try {
            ensureSkeletonStyles();
            showLoadingSkeletons(messagesArea);
            
            const server = await fetch(`/get_history_messages/${chatId}`);
            const parsed = parseHistoryResponse(await server.json());

            if (String(getActiveChatId()) !== String(chatId)) return;

            chatHash[chatId] = {
                id: chatId,
                messages: mapHistoryMessages(parsed.messages),
                hasMore: parsed.hasMore,
                blockState: parsed.blockState
            };

            messagesArea.innerHTML = '';
            const decrypted = await decryptAll(chatHash[chatId].messages);
            if (String(getActiveChatId()) !== String(chatId)) return;
            renderChat(messagesArea, decrypted, window.userId);
            updateComposerBlockedState(chatId);
            syncBlockMenuItem();
            setupHistoryLoader(chatId);
        } catch (err) {
            console.error("Ошибка загрузки истории:", err);
        }
    }
}

async function decryptAll(messages) {
    return Promise.all(messages.map(async (msg) => {
        try {
            const text = await decryptText(msg.message_text);
            return { ...msg, decryptedText: text };
        } catch (e) {
            return { ...msg, decryptedText: "[Ошибка расшифровки]" };
        }
    }));
}

function renderChat(messagesArea, messages, currentUserId) {
    const fragment = document.createDocumentFragment();
    const sortedMessages = [...messages].sort((a, b) => {
        const dateA = new Date(a.time);
        const dateB = new Date(b.time);
        return dateB - dateA;
    });

    sortedMessages.forEach((msg, index) => {
        fragment.appendChild(buildMessageWrapper(msg, currentUserId));

        const currentDateLabel = getShortDateLabel(msg.time);
        const nextMsg = sortedMessages[index + 1];
        const nextDateLabel = nextMsg ? getShortDateLabel(nextMsg.time) : null;
        if (!nextMsg || currentDateLabel !== nextDateLabel) {
            fragment.appendChild(createDateHeaderElement(currentDateLabel));
        }
    });

    messagesArea.prepend(fragment);
    applyMessageGrouping(messagesArea);
    // column-reverse: низ ленты (новые) при scrollTop = 0
    messagesArea.scrollTop = 0;
    bindStickyChatDate();
}

function formatTime(timeStr) {
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Безопасно заполняет .message-content: ссылки → <a>, @username → подсветка.
 */
function setMessageContent(el, text) {
    if (!el) return;
    el.replaceChildren();
    if (text == null || text === '') return;

    const source = String(text);
    const urlPart =
        String.raw`https?:\/\/[^\s<]+` +
        String.raw`|www\.[^\s<]+` +
        String.raw`|t\.me\/[^\s<]+` +
        String.raw`|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+` +
        String.raw`(?:com|net|org|ru|io|me|dev|app|info|biz|xyz|online|site|pro|tv|cc|co|uk|de|fr|edu|gov|ai|tg|gg|to|ly|link|shop|store|blog|tech|cloud|page|space|fun|live|news|world|club|media|email|agency|design|studio|tools|click|top|vip|one|pw|su|by|ua|kz|uz)` +
        String.raw`(?:\/[^\s<]*)?`;
    const mentionPart = String.raw`@[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*`;
    const pattern = new RegExp(`(${urlPart})|(${mentionPart})`, 'gi');

    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        // Не цепляем домен из email (user@domain.com)
        if (match[1] && match.index > 0 && source[match.index - 1] === '@') {
            el.appendChild(document.createTextNode(source.slice(lastIndex, pattern.lastIndex)));
            lastIndex = pattern.lastIndex;
            continue;
        }

        if (match.index > lastIndex) {
            el.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
        }

        if (match[1]) {
            let raw = match[1];
            let trailing = '';
            while (/[),.!?;:'"\]]$/.test(raw)) {
                trailing = raw.slice(-1) + trailing;
                raw = raw.slice(0, -1);
            }

            const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

            const a = document.createElement('a');
            a.className = 'msg-link';
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = raw;
            el.appendChild(a);

            if (trailing) {
                el.appendChild(document.createTextNode(trailing));
            }
        } else if (match[2]) {
            const currentMention = match[2]; 

            const span = document.createElement('span');
            span.className = 'msg-mention';
            span.textContent = currentMention;
            span.style.cursor = 'pointer';
            span.title = 'Открыть профиль';
            span.addEventListener('click', function(e) {
                e.stopPropagation();
                const username = currentMention.slice(1);
                openProfileByUsername(username);
            });
            el.appendChild(span);
        }

        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < source.length) {
        el.appendChild(document.createTextNode(source.slice(lastIndex)));
    }
}


async function delete_chat(chatId = null) {
    const id = chatId != null && String(chatId).trim() !== ''
        ? String(chatId).trim()
        : getActiveChatId();
    if (!id) {
        d_alert('Удалить чат', 'Чат с этим пользователем ещё не создан', 'ok');
        return;
    }

    const result = await d_alert('Удалить чат', 'Чат будет удалён. Продолжить?', 'ok_cancel');
    if (result !== 'ok') return;

    socket.emit('delete_chat', { id });
}

window.delete_chat = delete_chat; 

async function toggle_chat_block(chatId = null) {
    const id = chatId != null && String(chatId).trim() !== ''
        ? String(chatId).trim()
        : getActiveChatId();
    if (!id) {
        d_alert('Блокировка', 'Сначала начните переписку с пользователем', 'ok');
        return;
    }
    const state = getChatBlockState(id);
    const isUnblock = !!state.blocked_by_me;
    const result = await d_alert(
        isUnblock ? 'Разблокировать пользователя' : 'Заблокировать пользователя',
        isUnblock ? 'Разблокировать этого пользователя?' : 'Заблокировать этого пользователя?',
        'ok_cancel'
    );
    if (result !== 'ok') return;
    socket.emit('toggle_block', { chat_id: id });
}

window.toggle_chat_block = toggle_chat_block;

socket.on('chat_deleted', async (data) => {
    try {
        const deletedChatId = data.chat_id;
        const partnerId = window.chatIdToUserId ? window.chatIdToUserId[deletedChatId] : null;
        const profileId = document.getElementById('profile-id')?.textContent?.trim();
        if (profileId && partnerId && String(profileId) === String(partnerId)) {
            closeProfile();
        }

        if (typeof chatHash !== 'undefined' && chatHash[deletedChatId]) {
            delete chatHash[deletedChatId];
        }
        if (typeof teardownHistoryLoader === 'function') teardownHistoryLoader();
        const screenWidth = window.innerWidth;
        if (screenWidth > 751) {
            document.getElementById('no-chat-content').classList.remove('hidden');
            document.getElementById('chat-content').classList.add('hidden');
        } else {
            closeActiveScreen(2);
        }
        await loadMyChats();
    } catch (error) {
        console.error('Ошибка при обработке удаления чата на клиенте:', error);
    }
});

socket.on('chat_delete_error', (data) => {
    if (data?.code === 'blocked') {
        d_alert("Чат нельзя удалить", "Сначала снимите блокировку, затем удалите чат", "ok");
    }
});

socket.on('block_state_updated', async (data) => {
    const chatId = data?.chat_id != null ? String(data.chat_id) : '';
    if (!chatId) return;
    const state = normalizeBlockState(data.block_state);
    if (!chatHash[chatId]) {
        chatHash[chatId] = { id: chatId, messages: [], hasMore: true };
    }
    chatHash[chatId].blockState = state;

    const partnerId = window.chatIdToUserId ? window.chatIdToUserId[chatId] : null;
    if (partnerId && chatsData[partnerId]) {
        const user = chatsData[partnerId];
        user.blockState = state;
        user.hideAvatar = !!state.hide_avatar;
        user.status = state.blocked_me ? 'Вас заблокировали' : (user.realStatus || user.status);
        if (state.hide_avatar) {
            user.avatar = letterAvatarHtml(user.name);
        }
    }

    syncBlockMenuItem();
    updateComposerBlockedState(chatId);
    refreshAllPresenceDisplays();
    renderPartnerAvatar(partnerId, chatId);

    await loadMyChats();
    const refreshedPartnerId = (window.chatIdToUserId && window.chatIdToUserId[chatId]) || partnerId;
    renderPartnerAvatar(refreshedPartnerId, chatId);
});

function renderPartnerAvatar(partnerId, chatId) {
    if (!partnerId || !chatsData[partnerId]) return;
    const user = chatsData[partnerId];
    if (String(getActiveChatId()) === String(chatId)) {
        const headerAvatar = document.getElementById('user-avatar');
        if (headerAvatar) {
            headerAvatar.innerHTML = getDisplayAvatarHtml(user);
            bindAvatarLoad(headerAvatar);
        }
    }
    const profileIdEl = document.getElementById('profile-id');
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileIdEl && profileAvatar && String(profileIdEl.textContent) === String(partnerId)) {
        profileAvatar.classList.remove('avatar-pending');
        profileAvatar.innerHTML = '';
        const html = getDisplayAvatarHtml(user);
        if (!html) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const avatarElement = doc.body.firstChild;
        if (avatarElement && avatarElement.classList && avatarElement.classList.contains('letter-ava')) {
            avatarElement.classList.replace('letter-ava', 'letter-ava1');
        }
        if (avatarElement) profileAvatar.appendChild(avatarElement);
        bindAvatarLoad(profileAvatar);
    }
}

const THEME_STORAGE_KEY = 'dovery-theme';

function getDoveryTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getThemeMenuItem() {
    const dark = getDoveryTheme() === 'dark';
    return {
        id: 'theme',
        label: dark ? 'Светлая тема' : 'Тёмная тема',
        onclick: 'toggleDoveryTheme();',
        icon: dark ? 'sun' : 'moon'
    };
}

function syncThemeMenuItem() {
    if (!Array.isArray(window.list_items_icon_01)) return;
    const item = getThemeMenuItem();
    const idx = window.list_items_icon_01.findIndex((entry) => entry.id === 'theme');
    if (idx >= 0) window.list_items_icon_01[idx] = item;
    else window.list_items_icon_01.push(item);

    const menu = document.getElementById('tagDropdown');
    if (!menu || menu.style.display !== 'block') return;
    menu.querySelectorAll('.dropdown-item').forEach((row) => {
        const text = row.querySelector('.item-text');
        if (!text) return;
        if (text.textContent !== 'Тёмная тема' && text.textContent !== 'Светлая тема') return;
        text.textContent = item.label;
        const wrap = row.querySelector('.icon-wrapper');
        if (wrap) {
            wrap.innerHTML = `<svg class="${item.icon}"><use href="#${item.icon}"></use></svg>`;
        }
        row.setAttribute('onclick', `${item.onclick}; return false;`);
    });
}

function applyDoveryTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (e) {}
    syncThemeMenuItem();
}

function toggleDoveryTheme() {
    applyDoveryTheme(getDoveryTheme() === 'dark' ? 'light' : 'dark');
}

window.getDoveryTheme = getDoveryTheme;
window.toggleDoveryTheme = toggleDoveryTheme;
window.syncThemeMenuItem = syncThemeMenuItem;
window.applyDoveryTheme = applyDoveryTheme;

const E2EE_EMOJI_POOL = [
    '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈',
    '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦',
    '🌽', '🌶️', '🫑', '🥒', '🥬', '🥕', '🫒', '🧄', '🧅', '🥔',
    '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞',
    '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭',
    '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲',
    '🫕', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙',
    '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮',
    '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂',
    '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛'
];

async function buildE2eeEmojiStrip(count = 6) {
    const fallback = ['🔑', '🔒', '🛡️', '✨', '🤝', '🔐'];
    try {
        const key = window.keychat;
        if (!key) return fallback.slice(0, count);
        const raw = await crypto.subtle.exportKey('raw', key);
        const bytes = new Uint8Array(raw);
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push(E2EE_EMOJI_POOL[bytes[i % bytes.length] % E2EE_EMOJI_POOL.length]);
        }
        return out;
    } catch (e) {
        return fallback.slice(0, count);
    }
}

async function openE2eeOverlay() {
    const strip = document.getElementById('e2ee-emoji-strip');
    if (strip) {
        const emojis = await buildE2eeEmojiStrip(6);
        strip.innerHTML = emojis.map((emoji) => `<span>${emoji}</span>`).join('');
    }
    if (typeof window.openOverlay === 'function') {
        window.openOverlay(2);
    }
}

window.openE2eeOverlay = openE2eeOverlay;
window.buildE2eeEmojiStrip = buildE2eeEmojiStrip;

const inputField = document.querySelector('#messages-textarea');

function getComposerSelection() {
    if (!inputField) return '';
    const start = inputField.selectionStart || 0;
    const end = inputField.selectionEnd || 0;
    return start !== end ? inputField.value.substring(start, end) : '';
}

function copy_text() {
    const selectedText = getComposerSelection();
    if (!selectedText || !inputField) return;

    const done = () => {
        hideDropdown();
        inputField.focus({ preventScroll: true });
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(selectedText).then(done).catch(() => {
            try {
                inputField.focus();
                document.execCommand('copy');
            } catch (err) {
                console.error('Ошибка копирования:', err);
            }
            done();
        });
        return;
    }

    try {
        inputField.focus();
        document.execCommand('copy');
    } catch (err) {
        console.error('Ошибка копирования:', err);
    }
    done();
}

async function paste_text() {
    if (!inputField) return;
    const start = inputField.selectionStart || 0;
    const end = inputField.selectionEnd || 0;
    let text = '';

    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
        }
    } catch (err) {
        text = '';
    }

    if (text) {
        inputField.setRangeText(text, start, end, 'end');
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        inputField.focus({ preventScroll: true });
        try {
            document.execCommand('paste');
        } catch (err) {
            console.warn('Доступ к буферу отклонен пользователем', err);
        }
    }

    hideDropdown();
    inputField.focus({ preventScroll: true });
}

let composerMenuAt = 0;
let composerPressTimer = null;

function openComposerContextMenu(x, y) {
    if (!inputField || typeof showDropdown !== 'function') return;
    if (Date.now() - composerMenuAt < 350) return;
    composerMenuAt = Date.now();

    const selectedText = getComposerSelection();
    const items = selectedText
        ? (window.list_items_icon_03 || [])
        : (window.list_items_icon_04 || []);
    if (!items.length) return;

    showDropdown(inputField, items, 'icon', { x, y });
}

if (inputField) {
    inputField.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openComposerContextMenu(e.clientX, e.clientY);
    });

    inputField.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        clearTimeout(composerPressTimer);
        composerPressTimer = setTimeout(() => {
            openComposerContextMenu(touch.clientX, touch.clientY);
        }, 520);
    }, { passive: true });

    const cancelComposerPress = () => clearTimeout(composerPressTimer);
    inputField.addEventListener('touchend', cancelComposerPress);
    inputField.addEventListener('touchcancel', cancelComposerPress);
    inputField.addEventListener('touchmove', cancelComposerPress);
}

function escapeMenuArg(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getMessageMenuItems(msgId) {
    const safeId = escapeMenuArg(msgId);
    return [
        { label: 'Копировать', onclick: `copy_message('${safeId}')`, icon: 'copy' },
        { label: 'Удалить', danger: true, onclick: `snapDelete('${safeId}')`, icon: 'delete' }
    ];
}

function findMessageMenuWrapper(target) {
    if (!target || typeof target.closest !== 'function') return null;
    if (target.closest('#tagDropdown')) return null;
    if (target.closest('a, .msg-mention')) return null;
    if (target.closest('.loading-skeleton')) return null;
    if (!target.closest('.message-bubble')) return null;
    const wrapper = target.closest('.message-wrapper');
    if (!wrapper || !wrapper.dataset.id) return null;
    return wrapper;
}

let messageMenuAt = 0;
let messagePressTimer = null;

function openMessageContextMenu(wrapper, x, y) {
    if (!wrapper || typeof showDropdown !== 'function') return;
    if (Date.now() - messageMenuAt < 350) return;
    messageMenuAt = Date.now();
    showDropdown(wrapper, getMessageMenuItems(wrapper.dataset.id), 'icon', { x, y });
}

if (messagesArea) {
    messagesArea.addEventListener('click', (e) => {
        const wrapper = findMessageMenuWrapper(e.target);
        if (!wrapper) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && wrapper.contains(sel.anchorNode)) return;
        openMessageContextMenu(wrapper, e.clientX, e.clientY);
    });

    messagesArea.addEventListener('contextmenu', (e) => {
        const wrapper = findMessageMenuWrapper(e.target);
        if (!wrapper) return;
        e.preventDefault();
        e.stopPropagation();
        openMessageContextMenu(wrapper, e.clientX, e.clientY);
    }, true);

    messagesArea.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const wrapper = findMessageMenuWrapper(e.target);
        if (!wrapper) return;
        const touch = e.touches[0];
        clearTimeout(messagePressTimer);
        messagePressTimer = setTimeout(() => {
            openMessageContextMenu(wrapper, touch.clientX, touch.clientY);
        }, 520);
    }, { passive: true });

    const cancelMessagePress = () => clearTimeout(messagePressTimer);
    messagesArea.addEventListener('touchend', cancelMessagePress);
    messagesArea.addEventListener('touchcancel', cancelMessagePress);
    messagesArea.addEventListener('touchmove', cancelMessagePress);
}

function sessionDeviceIcon(deviceOs) {
    const key = String(deviceOs || '').toLowerCase();
    if (key === 'windows') return '/static/img/Windows_device.png';
    if (key === 'android') return '/static/img/android_device.png';
    if (key === 'apple') return '/static/img/apple_device.png';
    return '/static/img/none_device.png';
}

function formatSessionStamp(createdAt) {
    if (!createdAt) return '—';
    let raw = String(createdAt).trim();
    if (raw && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) && raw.includes(' ')) {
        raw = raw.replace(' ', 'T') + 'Z';
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return String(createdAt);
    const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${day} • ${time}`;
}

function escapeSessionHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function devicesSectionTitle(label) {
    const row = document.createElement('div');
    row.className = 'item devices-section-title';
    row.innerHTML = `
        <div class="right">
            <div class="title oneline second-title">
                <div class="button1-medium">${escapeSessionHtml(label)}</div>
            </div>
        </div>
    `;
    return row;
}

function clearDevicesSection(section, titleLabel) {
    if (!section) return;
    section.querySelectorAll('[data-session-id]').forEach((el) => el.remove());
    section.querySelectorAll('.loading-skeleton').forEach((el) => el.remove());
    section.querySelectorAll('p').forEach((el) => el.remove());
    let title = section.querySelector('.devices-section-title');
    if (!title) {
        title = devicesSectionTitle(titleLabel);
        section.prepend(title);
    }
}

function buildSessionSkeleton(separator = false) {
    const row = document.createElement('div');
    row.className = 'item loading-skeleton';
    const sep = separator ? 'separator' : '';
    row.innerHTML = `
        <div class="left">
            <div class="ava"></div>
        </div>
        <div class="right ${sep}">
            <div class="right">
                <div class="text twoline">
                    <div class="label body1"><span class="skeleton-line title"></span></div>
                    <div class="label subtitle subtitle1"><span class="skeleton-line subtitle"></span></div>
                </div>
            </div>
            <div class="element">
                <span class="skeleton-btn"></span>
            </div>
        </div>
    `;
    return row;
}

function showDevicesLoadingSkeletons() {
    const currentBox = document.getElementById('devices-current');
    const list = document.getElementById('devices-list');
    clearDevicesSection(currentBox, 'Это устройство');
    clearDevicesSection(list, 'Активные сеансы');
    if (currentBox) {
        currentBox.classList.remove('hidden');
        currentBox.appendChild(buildSessionSkeleton(false));
    }
    if (list) {
        list.appendChild(buildSessionSkeleton(true));
        list.appendChild(buildSessionSkeleton(true));
        list.appendChild(buildSessionSkeleton(false));
    }
}

function buildSessionItem(item, { separator = false, current = false } = {}) {
    const row = document.createElement('div');
    row.className = 'item';
    row.dataset.sessionId = String(item.id);
    const sep = separator ? 'separator' : '';
    const title = escapeSessionHtml(item.device_name || 'Неизвестно');
    const stamp = escapeSessionHtml(formatSessionStamp(item.created_at));
    const icon = sessionDeviceIcon(item.device_os);
    row.innerHTML = `
        <div class="left">
            <img src="${icon}" class="ava" alt="">
        </div>
        <div class="right ${sep}">
            <div class="right">
                <div class="text twoline">
                    <div class="label body1">${title}</div>
                    <div class="label subtitle subtitle1">${stamp}</div>
                </div>
            </div>
            <div class="element">
                <a href="javascript:void(0)" class="button subtitle2-medium session-delete-btn">Удалить</a>
            </div>
        </div>
    `;
    const btn = row.querySelector('.session-delete-btn');
    if (btn) {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await deleteDeviceSession(item.id);
        });
    }
    return row;
}

async function loadDevicesList({ showSkeleton = true } = {}) {
    const currentBox = document.getElementById('devices-current');
    const list = document.getElementById('devices-list');
    if (!list) return;

    if (showSkeleton) {
        showDevicesLoadingSkeletons();
    }

    try {
        const response = await fetch('/api/sessions');
        if (!response.ok) {
            clearDevicesSection(currentBox, 'Это устройство');
            clearDevicesSection(list, 'Активные сеансы');
            d_alert('Ошибка', 'Не удалось загрузить список устройств', 'ok');
            return;
        }
        const data = await response.json();
        const current = data.current || null;
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];

        clearDevicesSection(currentBox, 'Это устройство');
        clearDevicesSection(list, 'Активные сеансы');

        if (currentBox) {
            currentBox.classList.toggle('hidden', !current);
            if (current) {
                currentBox.appendChild(buildSessionItem(current, { current: true }));
            }
        }

        if (!sessions.length) {
            const empty = document.createElement('p');
            empty.className = 'body1';
            empty.style.cssText = 'padding:var(--margin); color:var(--tg-theme-hint-color);';
            empty.textContent = 'Других активных сеансов нет';
            list.appendChild(empty);
            return;
        }

        sessions.forEach((item, index) => {
            list.appendChild(buildSessionItem(item, {
                separator: index < sessions.length - 1
            }));
        });
    } catch (err) {
        console.error(err);
        clearDevicesSection(currentBox, 'Это устройство');
        clearDevicesSection(list, 'Активные сеансы');
        d_alert('Ошибка', 'Не удалось загрузить список устройств', 'ok');
    }
}

async function deleteDeviceSession(sessionId) {
    const result = await d_alert('Удалить сессию', 'Точно удалить сессию?', 'ok_cancel');
    if (result !== 'ok') return;
    try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'DELETE'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            d_alert('Ошибка', 'Не удалось удалить сессию', 'ok');
            return;
        }
        if (data.logout) {
            await clearDoveryDB();
            window.location.href = '/';
            return;
        }
        await loadDevicesList();
    } catch (err) {
        console.error(err);
        d_alert('Ошибка', 'Не удалось удалить сессию', 'ok');
    }
}

function openDevicesScreen() {
    if (typeof window.hideDropdown === 'function') hideDropdown();
    openScreen('5');
    showDevicesLoadingSkeletons();
    loadDevicesList({ showSkeleton: false });
}

socket.on('session_revoked', async () => {
    try {
        await clearDoveryDB();
    } catch (err) {
        console.warn(err);
    }
    window.location.href = '/';
});

async function logoutAccount() {
    if (typeof window.hideDropdown === 'function') hideDropdown();
    if (logoutAccount._busy) return;
    const result = await d_alert('Выход', 'Выйти из аккаунта на этом устройстве?', 'ok_cancel');
    if (result !== 'ok') return;
    logoutAccount._busy = true;
    try {
        await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (err) {
        console.error(err);
    } finally {
        try {
            await clearDoveryDB();
        } catch (err) {
            console.warn(err);
        }
        window.location.href = '/';
    }
}

window.openDevicesScreen = openDevicesScreen;
window.loadDevicesList = loadDevicesList;
window.deleteDeviceSession = deleteDeviceSession;
window.logoutAccount = logoutAccount;

const accountState = {
    name: '',
    username: '',
    avatar: '',
    avatarFile: null,
    avatarPreviewUrl: null,
    saving: false,
};

function accountAvatarSrc(avatar) {
    if (avatar && avatar !== 'avatarkins.png' && avatar !== 'null' && avatar !== '') {
        return `/static/files/avatars/${avatar}`;
    }
    return '/static/img/signup_avatarka.png';
}

function setAccountPreviewAvatar(srcOrHtml, isHtml = false) {
    const preview = document.getElementById('account-preview-avatar');
    const img = document.getElementById('account-avatar-img');
    if (img && !isHtml) {
        img.src = srcOrHtml;
    }
    if (!preview) return;
    preview.innerHTML = '';
    if (isHtml) {
        preview.innerHTML = srcOrHtml;
        bindAvatarLoad(preview);
        return;
    }
    if (srcOrHtml.includes('signup_avatarka') || !accountState.avatar || accountState.avatar === 'avatarkins.png') {
        const letter = (document.getElementById('account-name-input')?.value || accountState.name || '?').charAt(0).toUpperCase();
        preview.innerHTML = `<div class="ava defult subtitle2-medium letter-ava">${letter || '?'}</div>`;
        return;
    }
    preview.innerHTML = photoAvatarHtml(srcOrHtml);
    bindAvatarLoad(preview);
}

function syncAccountSaveButton() {
    const btn = document.getElementById('account-save-btn');
    if (!btn) return;
    const name = (document.getElementById('account-name-input')?.value || '').trim();
    const username = (document.getElementById('account-username-input')?.value || '').trim();
    const dirty = !!accountState.avatarFile
        || name !== accountState.name
        || username !== accountState.username;
    btn.classList.toggle('hidden', !dirty || accountState.saving);
}

function fillAccountForm(data) {
    accountState.name = (data.name || '').trim();
    accountState.username = (data.username || '').trim();
    accountState.avatar = data.avatar || '';
    accountState.avatarFile = null;
    if (accountState.avatarPreviewUrl) {
        URL.revokeObjectURL(accountState.avatarPreviewUrl);
        accountState.avatarPreviewUrl = null;
    }

    const nameInput = document.getElementById('account-name-input');
    const usernameInput = document.getElementById('account-username-input');
    const previewName = document.getElementById('account-preview-name');
    const previewStatus = document.getElementById('account-preview-status');

    if (nameInput) nameInput.value = accountState.name;
    if (usernameInput) usernameInput.value = accountState.username;
    if (previewName) previewName.textContent = accountState.name || 'Без имени';
    if (previewStatus) {
        const presence = data.real_status
            || (data.status && data.status !== 'ok' && data.status !== 'error' ? data.status : null)
            || previewStatus.textContent
            || 'в сети';
        previewStatus.textContent = presence;
    }

    const src = accountAvatarSrc(accountState.avatar);
    const img = document.getElementById('account-avatar-img');
    if (img) img.src = src;
    if (accountState.avatar && accountState.avatar !== 'avatarkins.png' && accountState.avatar !== 'null') {
        setAccountPreviewAvatar(src, false);
        const preview = document.getElementById('account-preview-avatar');
        if (preview) {
            preview.innerHTML = photoAvatarHtml(src);
            bindAvatarLoad(preview);
        }
    } else {
        const letter = (accountState.name || '?').charAt(0).toUpperCase();
        const preview = document.getElementById('account-preview-avatar');
        if (preview) preview.innerHTML = `<div class="ava defult subtitle2-medium letter-ava">${letter || '?'}</div>`;
        if (img) img.src = '/static/img/signup_avatarka.png';
    }
    syncAccountSaveButton();
}

function waitForUserId(timeoutMs = 3000) {
    if (window.userId) return Promise.resolve(String(window.userId));
    return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            if (window.userId) {
                resolve(String(window.userId));
                return;
            }
            if (Date.now() - started >= timeoutMs) {
                resolve(null);
                return;
            }
            setTimeout(tick, 50);
        };
        tick();
    });
}

function readLocalUserProfile() {
    return new Promise(async (resolve) => {
        try {
            const db = await openDoveryDB();
            const tx = db.transaction(DOVERY_STORE_NAME, 'readonly');
            const store = tx.objectStore(DOVERY_STORE_NAME);
            const getReq = store.get('user_profile');
            getReq.onerror = () => {
                db.close();
                resolve(null);
            };
            getReq.onsuccess = () => {
                const value = getReq.result || null;
                tx.oncomplete = () => db.close();
                resolve(value);
            };
        } catch (_) {
            resolve(null);
        }
    });
}

async function fetchJsonSafe(url, options) {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
    } else {
        await response.text().catch(() => '');
    }
    return { response, data };
}

async function loadAccountSettings() {
    try {
        const local = await readLocalUserProfile();
        if (local?.id && !window.userId) {
            window.userId = String(local.id);
        }
        if (local?.name || local?.username) {
            fillAccountForm({
                id: local.id,
                name: local.name || '',
                username: local.username || '',
                avatar: local.avatar || '',
                status: 'в сети',
            });
        }

        let data = null;

        // Сначала /api/me — по cookie-сессии, без ожидания window.userId
        {
            const { response, data: payload } = await fetchJsonSafe('/api/me');
            if (response.ok && payload && payload.status !== 'error') {
                data = payload;
            }
        }

        if (!data) {
            const uid = (await waitForUserId(1500)) || (local?.id ? String(local.id) : null);
            if (uid) {
                const { response, data: payload } = await fetchJsonSafe(
                    `/get_use_profile/${encodeURIComponent(uid)}`
                );
                if (response.ok && payload && !payload.error) {
                    data = payload;
                }
            }
        }

        if (!data) {
            if (!(local?.name || local?.username)) {
                d_alert('Ошибка', 'Не удалось загрузить данные аккаунта', 'ok');
            }
            return;
        }

        fillAccountForm({
            id: data.id,
            name: data.name,
            username: data.username,
            avatar: data.avatar,
            status: data.real_status || data.status || 'в сети',
        });
        if (data.id != null) window.userId = String(data.id);
    } catch (err) {
        console.error(err);
        d_alert('Ошибка', 'Не удалось загрузить данные аккаунта', 'ok');
    }
}

function bindAccountSettingsUi() {
    if (bindAccountSettingsUi.done) return;
    bindAccountSettingsUi.done = true;

    const nameInput = document.getElementById('account-name-input');
    const usernameInput = document.getElementById('account-username-input');
    const pickBtn = document.getElementById('account-avatar-pick');
    const fileInput = document.getElementById('account-avatar-input');

    const onFieldChange = () => {
        const previewName = document.getElementById('account-preview-name');
        if (previewName && nameInput) {
            previewName.textContent = nameInput.value.trim() || 'Без имени';
        }
        if (!accountState.avatarFile
            && (!accountState.avatar || accountState.avatar === 'avatarkins.png' || accountState.avatar === 'null')) {
            const letter = (nameInput?.value || '?').charAt(0).toUpperCase();
            const preview = document.getElementById('account-preview-avatar');
            if (preview) preview.innerHTML = `<div class="ava defult subtitle2-medium letter-ava">${letter || '?'}</div>`;
        }
        syncAccountSaveButton();
    };

    nameInput?.addEventListener('input', onFieldChange);
    usernameInput?.addEventListener('input', syncAccountSaveButton);

    pickBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput?.click();
    });

    fileInput?.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        accountState.avatarFile = file;
        if (accountState.avatarPreviewUrl) URL.revokeObjectURL(accountState.avatarPreviewUrl);
        accountState.avatarPreviewUrl = URL.createObjectURL(file);
        const img = document.getElementById('account-avatar-img');
        if (img) img.src = accountState.avatarPreviewUrl;
        const preview = document.getElementById('account-preview-avatar');
        if (preview) {
            preview.innerHTML = photoAvatarHtml(accountState.avatarPreviewUrl);
            bindAvatarLoad(preview);
        }
        syncAccountSaveButton();
    });
}

async function updateLocalUserProfile(data) {
    try {
        const db = await openDoveryDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(DOVERY_STORE_NAME, 'readwrite');
            const store = tx.objectStore(DOVERY_STORE_NAME);
            const getReq = store.get('user_profile');
            getReq.onsuccess = () => {
                const prev = getReq.result || {};
                store.put({
                    ...prev,
                    id: data.id != null ? data.id : prev.id,
                    username: data.username,
                    name: data.name,
                }, 'user_profile');
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) {
        console.warn('Не удалось обновить IndexedDB профиль', e);
    }
}

function applyAccountDataLocally(data, { isSelf = false } = {}) {
    const uid = String(data.id || data.user_id || '');
    if (!uid) return;
    if (isSelf) window.userId = uid;
    let avatarHtml = '';
    if (data.avatar && data.avatar !== 'avatarkins.png' && data.avatar !== 'null') {
        avatarHtml = photoAvatarHtml(`static/files/avatars/${data.avatar}`);
    } else {
        avatarHtml = letterAvatarHtml(data.name);
    }
    if (!chatsData[uid]) chatsData[uid] = {};
    Object.assign(chatsData[uid], {
        name: data.name,
        username: data.username,
        avatar: avatarHtml,
        avatarRaw: data.avatar,
        hideAvatar: false,
    });
}

async function saveAccountSettings() {
    if (accountState.saving) return;
    const name = (document.getElementById('account-name-input')?.value || '').trim();
    const username = (document.getElementById('account-username-input')?.value || '').trim();

    if (!name || !username) {
        d_pop('Заполните имя и username', '', 'Хорошо');
        return;
    }
    if (name.length > 32) {
        d_pop('Имя слишком длинное', 'Максимум 32 символа', 'Хорошо');
        return;
    }
    if (!(username.length >= 4 && username.length <= 16)) {
        d_alert('Ошибка', 'Username короче 4 символов либо длиннее 16', 'ok');
        return;
    }
    if (!/^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$/.test(username)) {
        d_alert('Ошибка', 'Username может содержать только латинские буквы, цифры и символ подчеркивания', 'ok');
        return;
    }

    accountState.saving = true;
    syncAccountSaveButton();

    const formData = new FormData();
    formData.append('name', name);
    formData.append('username', username);
    if (accountState.avatarFile) {
        formData.append('avatar', accountState.avatarFile);
    }

    try {
        const response = await fetch('/api/me', { method: 'POST', body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (data.message === 'd203') d_pop('Username занят', '', 'Хорошо');
            else if (data.message === 'd206') d_alert('Ошибка', 'Некорректный username', 'ok');
            else if (data.message === 'd208') d_alert('Ошибка', 'Username короче 4 символов либо длиннее 16', 'ok');
            else d_alert('Ошибка', 'Не удалось сохранить изменения', 'ok');
            return;
        }
        await updateLocalUserProfile(data);
        applyAccountDataLocally(data, { isSelf: true });
        fillAccountForm(data);
        if (typeof loadMyChats === 'function') {
            loadMyChats({ showSkeleton: false });
        }
        d_pop('Сохранено', 'Данные аккаунта обновлены', 'Хорошо');
    } catch (err) {
        console.error(err);
        d_alert('Ошибка', 'Не удалось сохранить изменения', 'ok');
    } finally {
        accountState.saving = false;
        syncAccountSaveButton();
    }
}

function openAccountScreen() {
    if (typeof window.hideDropdown === 'function') hideDropdown();
    bindAccountSettingsUi();
    openScreen('6');
    loadAccountSettings();
}

socket.on('contact_profile_updated', (data) => {
    if (!data?.user_id) return;
    const uid = String(data.user_id);
    if (!chatsData[uid]) return;
    applyAccountDataLocally({ ...data, id: uid }, { isSelf: false });
    const listItem = document.querySelector(`#chats-list .item[data-user-id="${uid}"]`);
    if (listItem) {
        const nameEl = listItem.querySelector('.label.body1');
        if (nameEl) nameEl.textContent = data.name || '';
        const left = listItem.querySelector('.left');
        if (left) {
            if (data.avatar && data.avatar !== 'avatarkins.png' && data.avatar !== 'null') {
                left.innerHTML = photoAvatarHtml(`static/files/avatars/${data.avatar}`);
            } else {
                left.innerHTML = letterAvatarHtml(data.name);
            }
            bindAvatarLoad(listItem);
        }
    }
    if (String(getActiveChatId()) && window.chatIdToUserId?.[getActiveChatId()] === uid) {
        const headerName = document.getElementById('user-name');
        const headerAvatar = document.getElementById('user-avatar');
        if (headerName) headerName.textContent = data.name || '';
        if (headerAvatar) {
            headerAvatar.innerHTML = getDisplayAvatarHtml(chatsData[uid]);
            bindAvatarLoad(headerAvatar);
        }
    }
});

window.openAccountScreen = openAccountScreen;
window.saveAccountSettings = saveAccountSettings;
window.loadAccountSettings = loadAccountSettings;