const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

function cacheImage(src) {
    if (!src) return;
    const img = new Image();
    img.src = src;
}

function buildChatListAvatar(chat) {
    if (chat.hide_avatar) {
        const firstLetter = chat.name ? chat.name.charAt(0).toUpperCase() : '?';
        return `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
    }
    if (chat.avatar && chat.avatar !== 'avatarkins.png' && chat.avatar !== 'null') {
        const avatarSrc = `static/files/avatars/${chat.avatar}`;
        cacheImage(avatarSrc);
        return typeof window.photoAvatarHtml === 'function'
            ? window.photoAvatarHtml(avatarSrc)
            : `<img src="${avatarSrc}" class="ava avatar-pending" alt="">`;
    }
    const firstLetter = chat.name ? chat.name.charAt(0).toUpperCase() : '?';
    return `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
}

function buildChatListSkeleton(separator = false, widths = {}) {
    const row = document.createElement('div');
    row.className = 'item loading-skeleton';
    const sep = separator ? 'separator' : '';
    const titleW = widths.title || '42%';
    const subtitleW = widths.subtitle || '28%';
    row.innerHTML = `
        <div class="left">
            <div class="ava"></div>
        </div>
        <div class="right ${sep}">
            <div class="text twoline">
                <div class="label body1"><span class="skeleton-line title" style="width:${titleW}"></span></div>
                <div class="label subtitle subtitle1"><span class="skeleton-line subtitle" style="width:${subtitleW}"></span></div>
            </div>
        </div>
    `;
    return row;
}

function showChatListSkeletons(count = 7) {
    const listContainer = document.getElementById('chats-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const widths = [
        { title: '48%', subtitle: '32%' },
        { title: '36%', subtitle: '24%' },
        { title: '54%', subtitle: '40%' },
        { title: '40%', subtitle: '22%' },
        { title: '44%', subtitle: '30%' },
        { title: '52%', subtitle: '26%' },
        { title: '38%', subtitle: '34%' },
    ];
    for (let i = 0; i < count; i++) {
        listContainer.appendChild(buildChatListSkeleton(i < count - 1, widths[i % widths.length]));
    }
}

function shouldShowChatListSkeleton(listContainer) {
    if (!listContainer) return true;
    return listContainer.querySelectorAll('.item[data-user-id]').length === 0;
}

async function loadMyChats({ showSkeleton = null } = {}) {
    const listContainer = document.getElementById('chats-list');
    if (!listContainer) return;

    const useSkeleton = showSkeleton == null
        ? shouldShowChatListSkeleton(listContainer)
        : !!showSkeleton;
    if (useSkeleton) {
        showChatListSkeletons();
    }

    try {
        const response = await fetch('/get_my_chats');
        if (!response.ok) {
            d_alert("Ошибка", `Ошибка загрузки списка чатов`, "ok");
        }
        const chats = await response.json();
        let inx = 0;
        listContainer.innerHTML = ''; 

        if (!chats || chats.length === 0) {
            const big_header = document.createElement('div');
            big_header.className = 'big-header';
            big_header.onclick = () => openScreen(1);
            big_header.innerHTML = `
                <img src="static/img/first_page.png">
                <div class="big-header-title label headline6">Добро пожаловать в Dovery</div>
                <div class="label body1">Ищите своих собеседников используя поиск чатов выше</div>
            `;
            listContainer.appendChild(big_header);
        }

        window.chatIdToUserId = {};
        chats.forEach((chat, index) => {
            const currentStatus = (chatsData[chat.id] && chatsData[chat.id].status) ? chatsData[chat.id].status : chat.status;
            const shownStatus = typeof window.displayedPresenceText === 'function'
                ? window.displayedPresenceText(currentStatus, true)
                : currentStatus;

            const avatarHtml = buildChatListAvatar(chat);
            const userKey = String(chat.id);
            const prev = chatsData[userKey] || {};
            const chatId = chat.chat_id != null ? String(chat.chat_id) : '';

            chatsData[userKey] = {
                chatId: chatId || prev.chatId || null,
                userId: chat.id,
                username: chat.username,
                name: chat.name,
                avatar: avatarHtml,
                avatarRaw: chat.avatar,
                hideAvatar: !!chat.hide_avatar,
                publicKey: chat.public_key,
                status: currentStatus,
                realStatus: chat.real_status || currentStatus,
                blockState: chat.block_state || null,
                keychat: prev.keychat
            };
            if (chatId) {
                window.chatIdToUserId[chatId] = userKey;
            }
            if (String(chat.id) === String(window.userId)) return;
            const item = document.createElement('div');
            item.className = 'item clicked';
            item.setAttribute('data-user-id', chat.id);
            const str_status = typeof window.presenceClass === 'function'
                ? window.presenceClass(currentStatus, true)
                : (currentStatus === 'в сети' ? 'active subtitle2' : 'subtitle subtitle1');
            let sepa = "";
            if (index < chats.length - 1) {
                sepa = "separator";
            }
            const safeName = escapeHtml(chat.name);
            window.unreadCounts = window.unreadCounts || {};
            const chatKey = String(chat.chat_id);
            const liveUnread = window.unreadCounts[chatKey];
            const unread = liveUnread != null ? liveUnread : (Number(chat.unread_count) || 0);
            window.unreadCounts[chatKey] = unread;
            const unreadHtml = unread > 0
                ? `<div class="element"><div class="badge caption2">${unread}</div></div>`
                : '';
            item.innerHTML = `
                <div class="left"> 
                    ${avatarHtml}
                </div>
                <div class="right ${sepa}">
                    <div class="text twoline"> 
                        <div class="label body1">${safeName}</div> 
                        <div class="label status_of_user_in_list_chats ${str_status}">${escapeHtml(shownStatus)}</div> 
                    </div>
                    ${unreadHtml}
                </div>
            `;
            item.onclick = async () => {
                await openDirectWindow(chat.chat_id);
            };
            listContainer.appendChild(item);
            if (typeof window.bindAvatarLoad === 'function') {
                window.bindAvatarLoad(item);
            }
            inx++;
        });
        Object.keys(window.unreadCounts || {}).forEach((id) => {
            setChatUnreadBadge(id, window.unreadCounts[id]);
        });
    } catch {
        d_alert("Ошибка", `Ошибка загрузки списка чатов`, "ok");
        return;
    }
}

showChatListSkeletons();

window.onload = () => {
    loadMyChats({ showSkeleton: false });
};

socket.on("chat_created", (data) => {
    loadMyChats({ showSkeleton: false }); 
});

function setChatUnreadBadge(chatId, count) {
    const n = Math.max(0, Number(count) || 0);
    window.unreadCounts = window.unreadCounts || {};
    if (chatId != null && chatId !== '') {
        window.unreadCounts[String(chatId)] = n;
    }

    const map = window.chatIdToUserId || {};
    const userId = map[chatId] || map[String(chatId)];
    if (!userId) return;
    const item = document.querySelector(`#chats-list .item[data-user-id="${userId}"]`);
    if (!item) return;
    const right = item.querySelector('.right');
    if (!right) return;

    let element = right.querySelector(':scope > .element');
    if (n <= 0) {
        if (element) element.remove();
        return;
    }
    if (!element) {
        element = document.createElement('div');
        element.className = 'element';
        right.appendChild(element);
    }
    let badge = element.querySelector('.badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'badge caption2';
        element.appendChild(badge);
    }
    badge.textContent = String(n);
}

window.setChatUnreadBadge = setChatUnreadBadge;
window.showChatListSkeletons = showChatListSkeletons;

socket.on('unread_update', (data) => {
    if (!data) return;
    setChatUnreadBadge(data.chat_id, data.unread);
});
