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
    return new Promise((resolve, reject) => {
        const DB_NAME = 'Dovery'; 
        const STORE_NAME = 'secrets';

        const request = indexedDB.open(DB_NAME);

        request.onerror = () => reject("Ошибка в открытии IndexedDB");
        
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(STORE_NAME, "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get("private_key");

            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject("Ошибка извлечения ключа");
        };
    });
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
                if (data.avatar && data.avatar !== 'avatarkins.png' && data.avatar !== 'null') {
                    avatarHtml = `<img src="static/files/avatars/${data.avatar}" class="ava">`;
                } else {
                    const firstLetter = data.name ? data.name.charAt(0).toUpperCase() : '?';
                    avatarHtml = `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
                }
                chatsData[userId] = {
                    username: data.username,
                    name: data.name,
                    avatar: avatarHtml,
                    publicKey: data.public_key,
                    status: data.status
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

    document.getElementById('profile-name').textContent = user.name || '';
    document.getElementById('profile-id').textContent = userId;
    document.getElementById('profile-status').textContent = user.status || 'был(а) недавно';
    document.getElementById('profile-username').textContent = '@' + (user.username || '');

    const avatar = document.getElementById('profile-avatar');
    if (avatar) {
        avatar.innerHTML = '';
        if (user.avatar) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(user.avatar, 'text/html');
            const avatarElement = doc.body.firstChild;
            if (avatarElement && avatarElement.classList && avatarElement.classList.contains('letter-ava')) {
                avatarElement.classList.replace('letter-ava', 'letter-ava1');
            }
            if (avatarElement) avatar.appendChild(avatarElement);
        }
    }

    const openChatBtn = document.getElementById('profile-open-chat');
    if (openChatBtn) {
        if (is_my_profile) {
            openChatBtn.classList.add('hidden');
        } else {
            openChatBtn.classList.remove('hidden');
            openChatBtn.onclick = function () {
                closeProfile();
                const chatId = getChatIdByUserId(userId);
                if (chatId) {
                    openDirectWindow(chatId);
                } else {
                    startChat(userId);
                }
            };
        }
    }

    openScreen('3');
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
    if (user.avatar && user.avatar !== 'avatarkins.png' && user.avatar !== 'null') {
        avatarHtml = `<img src="static/files/avatars/${user.avatar}" class="ava">`;
    } else {
        const firstLetter = user.name ? user.name.charAt(0).toUpperCase() : '?';
        avatarHtml = `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
    }

    // Добавляем в кэш
    chatsData[userId] = {
        username: user.username,
        name: user.name,
        avatar: avatarHtml,
        publicKey: user.public_key,
        status: user.status
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
            await loadMyChats();
            if (data.chat_id) {
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
        }

        if (idEpt && userId === activePartnerId) {
            const currentStatus = document.getElementById('user-status');
            if (currentStatus) {
                const keepHidden = currentStatus.classList.contains('hidden') && !getConnectionStatusLabel();
                setOpenChatPresence(data.status);
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
            document.getElementById('profile-status').textContent = data.status;
        }

        const currentChatElem = document.querySelector(`[data-user-id="${userId}"]`);
        if (currentChatElem) {
            const statusInList = currentChatElem.querySelector('.status_of_user_in_list_chats');
            if (statusInList) {
                statusInList.className = `label status_of_user_in_list_chats ${presenceClass(data.status, true)}`;
                statusInList.textContent = displayedPresenceText(data.status, true);
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

function refreshAllPresenceDisplays() {
    const idEpt = document.getElementById('id_ept');
    const chatId = idEpt ? idEpt.innerText.trim() : '';
    const partnerId = chatId && window.chatIdToUserId ? window.chatIdToUserId[chatId] : null;
    const real = (partnerId && chatsData[partnerId] && chatsData[partnerId].status) || 'был(а) недавно';
    setOpenChatPresence(real);

    if (!getConnectionStatusLabel() && typeof refreshPartnerTypingHeader === 'function') {
        refreshPartnerTypingHeader();
    }

    document.querySelectorAll('[data-user-id]').forEach((item) => {
        const el = item.querySelector('.status_of_user_in_list_chats');
        if (!el) return;
        const uid = item.getAttribute('data-user-id');
        const st = (chatsData[uid] && chatsData[uid].status) || 'был(а) недавно';
        el.className = `label status_of_user_in_list_chats ${presenceClass(st, true)}`;
        el.textContent = displayedPresenceText(st, true);
    });
}

window.displayedPresenceText = displayedPresenceText;
window.presenceClass = presenceClass;
window.refreshAllPresenceDisplays = refreshAllPresenceDisplays;

window.keychat = null;

function getChatIdByUserId(userId) {
    for (const chatId in window.chatIdToUserId) {
        if (window.chatIdToUserId[chatId] === String(userId)) {
            return chatId;
        }
    }
    return null;
}

const tx = document.getElementById('messages-textarea');
const ma = document.getElementById('messages-area');
const bottomBar = document.querySelector('.bottom-bar');

tx.addEventListener('input', function() {
    this.setAttribute('rows', '1');
    const computedStyle = window.getComputedStyle(this);
    const computedLineHeight = parseFloat(computedStyle.lineHeight);
    const currentRows = Math.round(this.scrollHeight / computedLineHeight);
    this.setAttribute('rows', currentRows);
    
    let totalBarHeight;

    if (currentRows <= 1) {
        totalBarHeight = 77;
    } else {
        const textareaHeight = this.offsetHeight; 
        const barPaddingTop = parseFloat(window.getComputedStyle(bottomBar).paddingTop) || 0;
        const barPaddingBottom = parseFloat(window.getComputedStyle(bottomBar).paddingBottom) || 0;
        const totalPadding = barPaddingTop + barPaddingBottom;
        
        totalBarHeight = textareaHeight + totalPadding;
    }
    bottomBar.style.top = `calc(100% - ${totalBarHeight}px)`;
    ma.style.paddingBottom = `calc(${totalBarHeight}px)`
});

async function openDirectWindow(chatId) {
    try {
        const partnerId = window.chatIdToUserId ? window.chatIdToUserId[chatId] : null;
        if (!partnerId) { 
            return;
        }
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
            setOpenChatPresence(user.status);
        }
        const typingEl = document.getElementById('user-typing');
        if (typingEl) typingEl.classList.add('hidden');
        if (headerAvatar) headerAvatar.innerHTML = user.avatar;

        const container = document.getElementById('id_ept');
        container.textContent = chatId; 

        if (headerPanel) {
            headerPanel.onclick = () => openProfile(partnerId, false, false);
        }
        try {
            const private_key = await get_private_key(); 
            const public_key = await get_public_key(user.publicKey);
            window.keychat = await calc_key_chat(private_key, public_key);
            chatsData[partnerId].keychat = window.keychat;
        } catch (err) {
            console.error("Ошибка установки защищенного соединения:", err);
        }
        msgInput.value = '';
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
    document.documentElement.style.setProperty('--width-chat-list', `${width}px`);
    return width;
}

function initChatListResizer() {
    const resizer = document.getElementById('dragbar');
    const sidebar = document.getElementById('app');
    if (!resizer || !sidebar) return;

    const saved = parseInt(localStorage.getItem(CHAT_LIST_WIDTH_KEY), 10);
    if (Number.isFinite(saved)) applyChatListWidth(saved);

    let dragging = false;

    const stopDragging = () => {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const current = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--width-chat-list'),
            10
        );
        if (Number.isFinite(current)) {
            localStorage.setItem(CHAT_LIST_WIDTH_KEY, String(current));
        }
    };

    resizer.addEventListener('pointerdown', (e) => {
        if (window.innerWidth < 751) return;
        e.preventDefault();
        dragging = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        if (resizer.setPointerCapture) resizer.setPointerCapture(e.pointerId);
    });

    const onPointerMove = (e) => {
        if (!dragging) return;
        const left = sidebar.getBoundingClientRect().left;
        applyChatListWidth(e.clientX - left);
    };

    resizer.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointermove', onPointerMove);

    resizer.addEventListener('pointerup', stopDragging);
    resizer.addEventListener('pointercancel', stopDragging);

    window.addEventListener('resize', () => {
        if (window.innerWidth < 751) return;
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
const typingPartners = new Set();
let emittedTypingChatId = null;
let typingHeartbeatTimer = null;
let typingExpireTimers = {};

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
});

socket.on('connect', () => {
    syncComposerTyping();
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
    });
    if (chatScreen) classObs.observe(chatScreen, { attributes: true, attributeFilter: ['class'] });
    if (chatContent) classObs.observe(chatContent, { attributes: true, attributeFilter: ['class'] });
});

document.addEventListener('visibilitychange', syncComposerTyping);
window.addEventListener('pagehide', () => emitComposerTyping(false));

function copy_message(id) {
    // Ищем элемент, у которого data-id совпадает с переданным
    const msgElement = document.querySelector(`[data-id="${id}"]`);
    
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
                if (user.avatar && user.avatar !== 'avatarkins.png' && user.avatar !== 'null') {
                    avatarHtml = `<img src="static/files/avatars/${user.avatar}" class="ava">`;
                } else {
                    const firstLetter = user.name ? user.name.charAt(0).toUpperCase() : '?';
                    avatarHtml = `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
                }

                chatsData[userId] = {
                    username: user.username,
                    name: user.name,
                    avatar: avatarHtml,
                    publicKey: user.public_key,
                    status: user.status
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
const request = indexedDB.open("Dovery");

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

function showLoadingSkeletons(container) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    const patterns = [
        { type: 'sent', lines: 2 },
        { type: 'received', lines: 1 },
        { type: 'sent', lines: 3 },
        { type: 'received', lines: 2 },
        { type: 'sent', lines: 1 },
        { type: 'received', lines: 2 }
    ];
    
    patterns.forEach(pattern => {
        fragment.appendChild(createSkeletonMessage(pattern.type, pattern.lines));
    });
    
    container.appendChild(fragment);
}

function updateStickyChatDate() {
    const { area, sticky } = getStickyDateElements();
    if (!area || !sticky) return;

    const messages = area.querySelectorAll('.message-wrapper');
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
    const wrappers = Array.from(area.querySelectorAll('.message-wrapper'));

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

request.onsuccess = (event) => {
  const db = event.target.result;
  const transaction = db.transaction("secrets", "readonly");
  const store = transaction.objectStore("secrets");

  const getRequest = store.get("user_profile");

  getRequest.onsuccess = () => {
    const data = getRequest.result;
    if (data) {
      window.userId = String(data.id);
    }
  };
};

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
    const keychat = chatsData[userid].keychat;
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
    });
}

function isWideChatLayout() {
    // Планшет/ноут: список чатов виден рядом с перепиской
    return window.innerWidth >= 751 && !!document.getElementById('chats-list');
}

function resetMessageComposer() {
    msgInput.value = '';
    msgInput.setAttribute('rows', '1');
    msgInput.style.height = 'auto';
    if (bottomBar) bottomBar.style.top = 'calc(100% - 77px)';
    if (ma) ma.style.paddingBottom = 'calc(77px)';
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
        <div class="message-bubble sent" id="cntxt_menu_btn_03" data-id="${msgId}">
            <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
            <div class="message-info">
                <span class="message-time caption2">${formatTime(time) || ''}</span>
            </div>
        </div>
    `;

    setMessageContent(wrapper.querySelector('.message-content'), text);

    insertNewMessageWithDateCheck(messagesArea, wrapper, time);

    if (chatHash[chatId]) {
        chatHash[chatId].messages.push({
            id: msgId,
            message_text: encryptedText,
            sender_id: userId,
            time: time
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

        if (chatHash[chatId]) {
            const isAlreadyExists = chatHash[chatId].messages.some(m => m.id === data.msg_id);
            
            if (!isAlreadyExists) {
                chatHash[chatId].messages.push({
                    id: data.msg_id,
                    message_text: data.text,
                    sender_id: data.sender_id,
                    time: data.time
                });
            } else if (isMe) {

                return;
            }
        }

        // 2. Рендерим в DOM только если этот чат сейчас открыт перед глазами
        if (activeChatId == chatId) {
            const keyOwnerId = partnerId;
            console.log(keyOwnerId);
            console.log(chatsData[keyOwnerId]);
            if (!chatsData[keyOwnerId] || !chatsData[keyOwnerId].keychat) {
                if (!chatsData[keyOwnerId].keychat) {
                    console.warn(`Нету ключа чата`);
                }
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
                    <div class="message-bubble sent" id="cntxt_menu_btn_03" data-id="${data.msg_id}">
                        <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
                        <div class="message-info">
                            <span class="message-time caption2">${formatTime(data.time) || ''}</span>
                        </div>
                    </div>
                `;
            } else {
                // Отрисовка у ПОЛУЧАТЕЛЯ (как входящее)
                wrapper.className = 'message-wrapper received new-msg';
                wrapper.dataset.id = data.msg_id;
                wrapper.dataset.time = data.time;
                wrapper.dataset.sender = String(data.sender_id);
                wrapper.innerHTML = `
                    <div class="message-bubble received" id="cntxt_menu_btn_03" data-id="${data.msg_id}">
                        <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
                        <div class="message-info">
                            <span class="message-time caption2">${formatTime(data.time) || ''}</span>
                        </div>
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

async function loadChat(chatId) {
    const messagesArea = document.getElementById('messages-area');
    messagesArea.innerHTML = '';
    hideStickyChatDate();

    if (chatHash[chatId]) {
        const messages = await decryptAll(chatHash[chatId].messages);
        renderChat(messagesArea, messages, window.userId);
        return;
    } else {
        try {
            ensureSkeletonStyles();
            showLoadingSkeletons(messagesArea);
            
            const server = await fetch(`/get_history_messages/${chatId}`);
            const messages = await server.json();
            const safe = Array.isArray(messages) ? messages : [];

            chatHash[chatId] = {
                id: chatId,
                messages: safe.map(msg => ({
                    id: msg.id,
                    message_text: msg.message_text,
                    sender_id: msg.sender_id,
                    time: msg.time
                }))
            };

            messagesArea.innerHTML = '';
            const decrypted = await decryptAll(chatHash[chatId].messages);
            renderChat(messagesArea, decrypted, window.userId);
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
        const mne = msg.sender_id != currentUserId;
        const typeClass = mne ? 'received' : 'sent';

        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper ' + typeClass;
        wrapper.id = 'cntxt_menu_btn_03';
        wrapper.dataset.id = msg.id;
        wrapper.dataset.time = msg.time;
        wrapper.dataset.sender = String(msg.sender_id);
        wrapper.innerHTML = `
            <div class="message-bubble ${typeClass}">
                <div class="message-content body1"></div>
                <div class="message-info caption2">
                    <span>${formatTime(msg.time)}</span>
                </div>
            </div>
        `;
        setMessageContent(wrapper.querySelector('.message-content'), msg.decryptedText);
        fragment.appendChild(wrapper);

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


function delete_chat() {
    const targetElement = document.getElementById('id_ept');
    if (!targetElement) return;
    
    const chatId = targetElement.textContent.trim();

    socket.emit('delete_chat', { id: chatId });

    // Удаление объекта из локального списка chatHash
    if (typeof chatHash !== 'undefined' && chatHash[chatId]) {
        delete chatHash[chatId];
    }
}

window.delete_chat = delete_chat; 

socket.on('chat_deleted', async (data) => {
    try {
        const deletedChatId = data.chat_id;

        if (typeof chatHash !== 'undefined' && chatHash[deletedChatId]) {
            delete chatHash[deletedChatId];
        }
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