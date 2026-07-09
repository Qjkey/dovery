const socket = io();

function focusSearch() {
    setTimeout(() => {
        const input = document.getElementById('search-field');
        if (input) {
            input.focus();
        }
    }, 300);
}

function closeBtnChatUpdate() {
    try {
        const button = document.getElementById('close-chat-btn');
        const screen = document.getElementById('message-chats');
        const screenWidth = window.innerWidth;
        
        if (screenWidth > 751) {
            button.onclick = function() {
                document.getElementById('no-chat-content').classList.remove('hidden');
                document.getElementById('chat-content').classList.add('hidden');
            };
            screen.removeAttribute('data-swipe');
        } else {
            button.onclick = function() {
                closeActiveScreen(2);
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

  function checkMessageArea() {
    if (messageArea.children.length === 0) {
      welcomePanel.classList.remove("hidden");
    } else {
      welcomePanel.classList.add("hidden");
    }
  }

  checkMessageArea();

  const observer = new MutationObserver(() => {
    checkMessageArea();
  });

  observer.observe(messageArea, { 
    childList: true 
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

function openProfile(userId, is_my_profile, url_open) {
    const chat = document.querySelector('.chat-active-content');
    const open = window.getComputedStyle(chat).display;
    const user = chatsData[userId];

    document.getElementById('chat-active-content').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-id').textContent = userId;
    document.getElementById('profile-status').textContent = user.status;
    document.getElementById('profile-username').textContent = '@' + user.username;

    const avatar = document.getElementById('profile-avatar');
    if (avatar && chatsData[userId]?.avatar) {
        avatar.querySelector('.ava')?.remove();

        // Парсим строку HTML из chatsData в реальный элемент
        const parser = new DOMParser();
        const doc = parser.parseFromString(chatsData[userId].avatar, 'text/html');
        const avatarElement = doc.body.firstChild;

        // Если у элемента есть класс letter-ava, меняем его на letter-ava1
        if (avatarElement && avatarElement.classList.contains('letter-ava')) {
            avatarElement.classList.replace('letter-ava', 'letter-ava1');
            avatarElement.classList.replace('letter-ava', 'letter-ava1');
        }

        // Вставляем измененный элемент внутрь контейнера
        avatar.prepend(avatarElement);
    }

    if (is_my_profile) {
        document.getElementById('profile-open-chat').classList.add('hidden');
    }
    document.getElementById('close-profile').onclick = function() {
        closeProfile();
    }

    document.getElementById('profile-open-chat').onclick = function() {
        closeProfile();
        if (url_open) {
            startChat(userId);
        }
        openDirectWindow(userId);
    };
    document.getElementById('profile-block').classList.remove('hidden');
}

function closeProfile() {
    document.getElementById('chat-active-content').style.display = 'flex';
    document.getElementById('profile-block').classList.add('hidden');
}

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

async function fetchUsers(query) {
    try {
        const response = await fetch(`/search_users?q=${encodeURIComponent(query)}`);
        const users = await response.json();
        searchRenderResults(users);
    } catch (err) {
        console.error("Ошибка поиска:", err);
    }
}

function clearSearch() {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
}

function searchRenderResults(users) { 
    const container = document.getElementById('search-results');
    const tag = '<p class="body1" style="padding:var(--margin); color:var(--tg-theme-hint-color);">Ничего не найдено</p>'
    container.innerHTML = '';
    if (users.length === 0) {
        container.innerHTML = tag;
        return;
    }
    let inx = 0;
    let length = users.length;
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'item clicked';
        let separator = ""
        if (!(inx === length - 1)) {
            separator = "separator"
        }
        console.log(user.ava)
        let avatar = '';
        if (user.ava && user.ava !== 'avatarkins.png' && user.ava !== 'null') {
            avatar = `<img src="static/files/avatars/${user.ava}" class="ava">`;
        } else {
            const letter = user.name ? user.name.charAt(0).toUpperCase() : '?';
            avatar = `<div class="ava defult subtitle2-medium letter-ava">${letter}</div>`;
        }

        div.innerHTML = `
            <div class="left"> 
                ${avatar}
            </div>
            <div class="right ${separator}">
                <div class="text twoline"> 
                    <div class="label body1">${user.name}</div> 
                    <div class="label subtitle subtitle1">@${user.username}</div> 
                </div>
            </div>
        `;
        div.addEventListener('click', () => {
            startChat(user.id);
        });
        container.appendChild(div);
        inx++;
    });
}

socket.on("chat_created", (data) => {
    loadMyChats(); 
});
const chatsData = {};

async function startChat(userId) {
    try {
        const csrfElement = document.querySelector('meta[name="csrf-token"]');
        const csrfToken = csrfElement.getAttribute('content');
        const response = await fetch('/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken},
            body: JSON.stringify({ user_id: userId })
        });

        if (response.ok) {
            closeSearch();
            await loadMyChats();
            await openDirectWindow(userId);
        }
    } catch (err) {
        console.error("Ошибка при создании чата:", err);
    }
}

socket.on("user_status_update", (data) => {
    const userId = String(data.user_id);
    const idEpt = document.getElementById('id_ept');
    
    if (chatsData[userId]) {
        chatsData[userId].status = data.status;
    }

    if (idEpt && userId === idEpt.textContent) {
        const currentStatus = document.getElementById('status_of_user');
        if (currentStatus) currentStatus.textContent = data.status;
    }

    const profile = document.getElementById("profile-id").textContent;
    if (profile === userId) {
        document.getElementById("profile-status").textContent = data.status;
    }

    const currentChatElem = document.querySelector(`[data-user-id="${userId}"]`);
    if (currentChatElem) {
        const statusInList = currentChatElem.querySelector('.status_of_user_in_list_chats');
        if (statusInList) {
            const str_status = data.status === 'в сети' ? 'active subtitle2' : 'subtitle subtitle1';
            statusInList.className = `label status_of_user_in_list_chats ${str_status}`;
            statusInList.textContent = data.status;
        }
    }
});

async function loadMyChats() {
    try {
        const response = await fetch('/get_my_chats');
        const chats = await response.json();
        const listContainer = document.getElementById('chats-list');
        let inx = 1;
        listContainer.innerHTML = ''; 

        if (!chats || chats.length === 1) {
            const item = document.createElement('div');
            item.className = 'item clicked';
            item.onclick = () => openScreen(1);
            item.innerHTML = `
                <div class="right">
                    <div class="text oneline"> 
                        <div class="label body1">Ищите чаты через поиск</div> 
                    </div>
                    <div class="element"> 
                        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L6 6L1 11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                </div>
            `;
            listContainer.appendChild(item);
        }

        chats.forEach(chat => {
            const currentStatus = (chatsData[chat.id] && chatsData[chat.id].status) ? chatsData[chat.id].status : chat.status;

            let avatarHtml = '';
            if (chat.avatar && chat.avatar !== 'avatarkins.png' && chat.avatar !== 'null') {
                avatarHtml = `<img src="static/files/avatars/${chat.avatar}" class="ava">`;
            } else {
                const firstLetter = chat.name ? chat.name.charAt(0).toUpperCase() : '?';
                avatarHtml = `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
            }

            chatsData[chat.id] = {
                username: chat.username,
                name: chat.name,
                avatar: avatarHtml,
                publicKey: chat.public_key,
                status: currentStatus
            };
            if (chat.id === window.userId) return;
            const item = document.createElement('div');
            item.className = 'item clicked';
            item.setAttribute('data-user-id', chat.id);
            const str_status = chat.status === 'в сети' ? 'active subtitle2' : 'subtitle subtitle1';
            let sepa = "";
            if (inx !== chats.length - 1) {
                sepa = "separator";
            }
            item.innerHTML = `
                <div class="left"> 
                    ${avatarHtml}
                </div>
                <div class="right ${sepa}">
                    <div class="text twoline"> 
                        <div class="label body1">${chat.name}</div> 
                        <div class="label status_of_user_in_list_chats ${str_status}">${currentStatus}</div> 
                    </div>
                </div>
            `;
            item.onclick = async () => {
                await openDirectWindow(chat.id);
            };
            listContainer.appendChild(item);
            inx++;
        });
    } catch (error) {
        d_alert("Ошибка", `Ошибка загрузки списка чатов: ${error}`);
    }
}

window.onload = () => {
    loadMyChats();
};

window.keychat = null;

const tx = document.getElementById('messages-textarea');

tx.addEventListener('input', function() {
    // Временно сбрасываем rows, чтобы браузер пересчитал реальный scrollHeight контента
    this.setAttribute('rows', '1');
    
    // Получаем точную высоту одной строки в пикселях (из вашего line-height: 1.5em)
    const computedLineHeight = parseFloat(window.getComputedStyle(this).lineHeight);
    
    // Считаем количество строк
    const currentRows = Math.round(this.scrollHeight / computedLineHeight);
    
    // Устанавливаем итоговый атрибут rows
    this.setAttribute('rows', currentRows);
});

async function openDirectWindow(userId) {
    // const user = chatsData[userId];
    // closeProfile();
    // if (!user) { 
    //     return;
    // }

    // document.querySelectorAll('.open_chat').forEach(elem => {
    //     elem.classList.remove('open_chat');
    // });
    // const currentChatElem = document.querySelector(`[data-user-id="${userId}"]`);
    // if (currentChatElem) {
    //     currentChatElem.classList.add('open_chat');
    // }

    // const headerTitle = document.querySelector('.chat-header .label-header');
    // if (headerTitle) headerTitle.innerText = user.name;
    // const container = document.getElementById('id_ept');
    // container.textContent = userId; 
    // const headerAvatar = document.getElementById('chat-headers');
    // const chatHeader = document.getElementById('chat-headers');
    // const status_of_user = document.getElementById('status_of_user');
    // if (status_of_user) {
    //     status_of_user.innerText = user.status;
    // }
    // const chatHeader1 = document.getElementById('chat-headers1');
    // if (chatHeader) {
    //     chatHeader.onclick = () => {openProfile(userId, false, false);};
    //     chatHeader1.onclick = () => {openProfile(userId, false, false);};
    // }   
    // if (headerAvatar && chatsData[userId]?.avatar) {
    //     headerAvatar.querySelector('.ava')?.remove();
    //     headerAvatar.insertAdjacentHTML('afterbegin', chatsData[userId].avatar);
    // }
    // try {
    //     const private_key = await get_private_key(); 
    //     const public_key = await get_public_key(user.publicKey);
    //     window.keychat = await calc_key_chat(private_key, public_key);
    //     chatsData[userId].keychat = window.keychat;
    // } catch (err) {
    //     console.error("Ошибка установки защищенного соединения:", err);
    // }
    // msgInput.value = '';
    // loadChat(userId);
    document.getElementById('no-chat-content').classList.add('hidden');
    document.getElementById('chat-content').classList.remove('hidden');
    openScreen(2);
}

document.addEventListener('DOMContentLoaded', () => {
  const resizer = document.getElementById('dragbar');
  const sidebar = document.querySelector('.sidebar');
  
  if (!resizer || !sidebar) return;

  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    // Отключаем выделение текста при перетаскивании
    document.body.style.userSelect = 'none'; 
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    // Вычисляем новую ширину на основе координаты курсора X
    let newWidth = e.clientX;
    
    // Ограничения безопасности (дублируют min-width и max-width из CSS)
    if (newWidth < 250) newWidth = 250;
    if (newWidth > 600) newWidth = 600;
    
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
});

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
        // Получаем ID текущего открытого чата
        const activeChatUserId = document.getElementById('id_ept') ? document.getElementById('id_ept').innerText : null;
        let shouldRemoveDateHeader = false;
        let dateLabelToRemove = null;

        Object.keys(chatHash).forEach(chatId => {
            // Находим удаляемое сообщение в хэше, чтобы узнать его время
            const msgToDelete = chatHash[chatId].messages.find(msg => msg.id === data.msg_id);
            
            if (msgToDelete) {
                dateLabelToRemove = getShortDateLabel(msgToDelete.time);
                
                // Фильтруем сообщения, удаляя нужное
                chatHash[chatId].messages = chatHash[chatId].messages.filter(msg => msg.id !== data.msg_id);
                
                // Если это текущий активный чат, проверяем, остались ли сообщения с такой же датой
                if (chatId === activeChatUserId) {
                    const hasMoreMessagesThisDay = chatHash[chatId].messages.some(
                        msg => getShortDateLabel(msg.time) === dateLabelToRemove
                    );
                    // Если сообщений этого дня больше не осталось — помечаем плашку на удаление
                    if (!hasMoreMessagesThisDay) {
                        shouldRemoveDateHeader = true;
                    }
                }
            }
        });

        const messageElement = document.querySelector(`[data-id="${data.msg_id}"]`);
        if (messageElement) {
            const wrapper = messageElement.closest('.message-wrapper');
            if (wrapper) {
                try {
                    // ЕСЛИ НУЖНО УДАЛИТЬ ДАТУ: Ищем соответствующую плашку в DOM
                    let dateHeaderElement = null;
                    if (shouldRemoveDateHeader && dateLabelToRemove) {
                        // Ищем плашку, текст внутри которой совпадает с нашей датой
                        const headers = messagesArea.querySelectorAll('.chat-date-group');
                        for (let header of headers) {
                            if (header.textContent.trim() === dateLabelToRemove) {
                                dateHeaderElement = header;
                                break;
                            }
                        }
                    }

                    // Использование самого быстрого метода захвата
                    const pixels = await htmlToImage.toPixelData(wrapper, { pixelRatio: 1 });
                    
                    const width = wrapper.offsetWidth;
                    const height = wrapper.offsetHeight;
                    const rect = wrapper.getBoundingClientRect();

                    // Мгновенно скрываем оригинал сообщения
                    wrapper.style.visibility = 'hidden';
                    
                    // Если нашли плашку даты, тоже плавно её скрываем (растворяем через opacity)
                    if (dateHeaderElement) {
                        dateHeaderElement.style.transition = 'opacity 0.2s ease-out, transform 0.5s ease-out';
                        dateHeaderElement.style.opacity = '0';
                    }

                    const layersCount = 20; // Минимум для Android
                    const layers = [];
                    
                    // Создаем слои БЕЗ заполнения пикселей сначала (для скорости)
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

                    // Быстрое распределение
                    for (let i = 0; i < pixels.length; i += 12) { 
                        const x = (i / 4) % width;
                        const lIdx = Math.floor(layersCount * (Math.random() + (2 * x / width)) / 3) % layersCount;
                        const d = layers[lIdx].imgData.data;

                        // Копируем основной пиксель
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

                    // Удаляем элементы из DOM по окончании анимации
                    setTimeout(() => {
                        wrapper.remove();
                        if (dateHeaderElement) {
                            dateHeaderElement.remove();
                        }
                    }, 500);

                } catch (err) {
                    wrapper.remove();
                    // Если в блоке анимации упала ошибка, аварийно удаляем и плашку тоже
                    const headers = messagesArea.querySelectorAll('.chat-date-group');
                    for (let header of headers) {
                        if (header.textContent.trim() === dateLabelToRemove) {
                            header.remove();
                            break;
                        }
                    }
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

function insertNewMessageWithDateCheck(messagesArea, messageWrapper, msgTime) {
    const dateLabel = getShortDateLabel(msgTime);
    const topHeader = messagesArea.querySelector('.chat-date-group .chat-date-header');
    const lastVisualDate = topHeader ? topHeader.innerText : null;
    if (dateLabel !== lastVisualDate) {
        const dateHeader = document.createElement('div');
        dateHeader.className = 'chat-date-group';
        dateHeader.innerHTML = `<span class="chat-date-header caption1-medium">${dateLabel}</span>`;
        messagesArea.prepend(dateHeader); 
    }

    messagesArea.prepend(messageWrapper); 
}

request.onsuccess = (event) => {
  const db = event.target.result;
  const transaction = db.transaction("secrets", "readonly");
  const store = transaction.objectStore("secrets");

  const getRequest = store.get("user_profile");

  getRequest.onsuccess = () => {
    const data = getRequest.result;
    if (data) {
      userId = data.id;
    }
  };
};

const msgInput = document.getElementById('msgInput');
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

async function sendMessage() {
    const text = msgInput.value;
    if (!text.trim()) return;

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

    const receiverId = document.getElementById('id_ept').innerText;

    socket.emit('send_direct_message', {
        receiver_id: receiverId,
        text: encryptedText,
        msgId: msgId
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper sent new-msg';
    const time = getPreciseISOString(); 
    wrapper.innerHTML = `
        <div class="message-bubble sent" id="cntxt_menu_btn_03" data-id="${msgId}">
            <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
            <div class="message-info">
                <span class="message-time caption2">${formatTime(time) || ''}</span>
            </div>
        </div>
    `;

    wrapper.querySelector('.message-content').textContent = text;

    insertNewMessageWithDateCheck(messagesArea, wrapper, time);

    if (chatHash[receiverId]) {
        chatHash[receiverId].messages.push({
            id: msgId,
            message_text: encryptedText,
            sender_id: userId,
            time: time
        });
    }

    msgInput.value = '';
    msgInput.style.height = 'auto';
    msgInput.focus();
}

socket.on('new_message', async (data) => {
    try {
        // Текущий открытый чат на этой вкладке
        const activeChatUserId = document.getElementById('id_ept') ? document.getElementById('id_ept').innerText : null;
        
        const isMe = (data.sender_id == window.userId);
        
        const chatPartnerId = isMe ? data.receiver_id : data.sender_id;

        if (chatHash[chatPartnerId]) {
            const isAlreadyExists = chatHash[chatPartnerId].messages.some(m => m.id === data.msg_id);
            
            if (!isAlreadyExists) {
                chatHash[chatPartnerId].messages.push({
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
        if (activeChatUserId == chatPartnerId) {
            const keyOwnerId = isMe ? data.receiver_id : data.sender_id;
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
                wrapper.innerHTML = `
                    <div class="message-bubble received" id="cntxt_menu_btn_03" data-id="${data.msg_id}">
                        <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
                        <div class="message-info">
                            <span class="message-time caption2">${formatTime(data.time) || ''}</span>
                        </div>
                    </div>
                `;
            }

            wrapper.querySelector('.message-content').textContent = decryptedText;
            insertNewMessageWithDateCheck(messagesArea, wrapper, data.time);
        }

    } catch (err) {
        console.error("Критическая ошибка обработки сокета new_message:", err);
    }
});

sendBtn.addEventListener('click', async () => {
    await sendMessage();
});

msgInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const isMobile = window.matchMedia("(max-width: 1024px)").matches;
        if (!isMobile) {
            e.preventDefault();
            await sendMessage();
        }
    }
});

const chatHash = {};

async function loadChat(userId) {
    const messagesArea = document.getElementById('messages-area');
    messagesArea.innerHTML = '';

    if (chatHash[userId]) {
        const messages = await decryptAll(chatHash[userId].messages);
        renderChat(messagesArea, messages, userId);
        return;
    } else {
        try {
            const server = await fetch(`/get_history_messages/${userId}`);
            const messages = await server.json();
            const safe = Array.isArray(messages) ? messages : [];

            chatHash[userId] = {
                id: userId,
                messages: safe.map(msg => ({
                    id: msg.id,
                    message_text: msg.message_text,
                    sender_id: msg.sender_id,
                    time: msg.time
                }))
            };

            const decrypted = await decryptAll(chatHash[userId].messages);
            renderChat(messagesArea, decrypted, userId);
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

function renderChat(messagesArea, messages, userId) {
    const fragment = document.createDocumentFragment();
    const sortedMessages = [...messages].sort((a, b) => {
        const dateA = new Date(a.time);
        const dateB = new Date(b.time);
        return dateB - dateA;
    });

    sortedMessages.forEach((msg, index) => {
        const mne = msg.sender_id != userId;
        const typeClass = mne ? 'sent' : 'received';

        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper ' + typeClass;
        wrapper.innerHTML = `
            <div class="message-bubble ${typeClass}" id="cntxt_menu_btn_03" data-id="${msg.id}">
                <div class="message-content body1" style="overflow-wrap: anywhere; white-space: pre-wrap;"></div>
                <div class="message-info">
                    <span class="message-time caption2">${formatTime(msg.time)}</span>
                </div>
            </div>
        `;
        wrapper.querySelector('.message-content').textContent = msg.decryptedText;
        fragment.appendChild(wrapper);

        const currentDateLabel = getShortDateLabel(msg.time);
        const nextMsg = sortedMessages[index + 1];
        const nextDateLabel = nextMsg ? getShortDateLabel(nextMsg.time) : null;
        // Если следующего сообщения нет (это конец массива) ИЛИ у следующего сообщения уже другая дата
        if (!nextMsg || currentDateLabel !== nextDateLabel) {
            const dateHeader = document.createElement('div');
            dateHeader.className = 'chat-date-group';
            dateHeader.innerHTML = `<span class="chat-date-header caption1-medium">${currentDateLabel}</span>`;
            
            // Добавляем плашку даты во фрагмент СРАЗУ за последним сообщением этого дня.
            // При итоговом prepend() этот блок окажется визуально ВЫШЕ этих сообщений.
            fragment.appendChild(dateHeader);
        }
    });

    messagesArea.prepend(fragment);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function formatTime(timeStr) {
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        const deletedChatId = data.chat_s;

        if (typeof chatHash !== 'undefined' && chatHash[deletedChatId]) {
            delete chatHash[deletedChatId];
        }

        toggleChat(false);
        await loadMyChats();
    } catch (error) {
        console.error('Ошибка при обработке удаления чата на клиенте:', error);
    }
});

const inputField = document.querySelector('#msgInput');

function copy_text() {
    const start = inputField.selectionStart;
    const end = inputField.selectionEnd;
    const selectedText = inputField.value.substring(start, end);

    if (selectedText) {
        navigator.clipboard.writeText(selectedText)
            .then(() => hideDropdown())
            .catch(err => console.error('Ошибка копирования:', err));
            inputField.focus();
    }
}

async function paste_text() {
    try {
        const text = await navigator.clipboard.readText();
        const start = inputField.selectionStart;
        const end = inputField.selectionEnd;
        
        inputField.setRangeText(text, start, end, 'end');
        
        hideDropdown();
        inputField.focus();
    } catch (err) {
        console.warn('Доступ к буферу отклонен пользователем' + err);
    }
}

inputField.addEventListener('contextmenu', async function(e) {
    e.preventDefault();

    const selectedText = window.getSelection().toString();
    let hasClipboard = false;

    try {
        const clipboardText = await navigator.clipboard.readText();
        hasClipboard = clipboardText.length > 0;
    } catch (err) {
        hasClipboard = false;
    }

    let items = [];
    if (selectedText) {
        items = list_items_icon_03;
        if (items.length > 0) {
            showDropdown(this, items, 'icon', { x: e.pageX }, paste=false);
        }
    } else if (hasClipboard) {
        items = list_items_icon_04;
        if (items.length > 0) {
            showDropdown(this, items, 'icon', { x: e.pageX }, paste=true);
        }
    }
});