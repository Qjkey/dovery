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

async function loadMyChats() {
    try {
        const response = await fetch('/get_my_chats');
        if (!response.ok) {
            d_alert("Ошибка", `Ошибка загрузки списка чатов`, "ok");
        }
        const chats = await response.json();
        const listContainer = document.getElementById('chats-list');
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

        window.chatIdToUserId = window.chatIdToUserId || {};
        chats.forEach((chat, index) => {
            const currentStatus = (chatsData[chat.id] && chatsData[chat.id].status) ? chatsData[chat.id].status : chat.status;
            const shownStatus = typeof window.displayedPresenceText === 'function'
                ? window.displayedPresenceText(currentStatus, true)
                : currentStatus;

            let avatarHtml = '';
            if (chat.avatar && chat.avatar !== 'avatarkins.png' && chat.avatar !== 'null') {
                const avatarSrc = `static/files/avatars/${chat.avatar}`;
                cacheImage(avatarSrc); 
                avatarHtml = `<img src="${avatarSrc}" class="ava">`;
            } else {
                const firstLetter = chat.name ? chat.name.charAt(0).toUpperCase() : '?';
                avatarHtml = `<div class="ava defult subtitle2-medium letter-ava">${firstLetter}</div>`;
            }

            chatsData[String(chat.id)] = {
                chatId: chat.chat_id,
                userId: chat.id,
                username: chat.username,
                name: chat.name,
                avatar: avatarHtml,
                publicKey: chat.public_key,
                status: currentStatus
            };
            window.chatIdToUserId[chat.chat_id] = String(chat.id);
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
            item.innerHTML = `
                <div class="left"> 
                    ${avatarHtml}
                </div>
                <div class="right ${sepa}">
                    <div class="text twoline"> 
                        <div class="label body1">${safeName}</div> 
                        <div class="label status_of_user_in_list_chats ${str_status}">${escapeHtml(shownStatus)}</div> 
                    </div>
                </div>
            `;
            item.onclick = async () => {
                await openDirectWindow(chat.chat_id);
            };
            listContainer.appendChild(item);
            inx++;
        });
    } catch {
        d_alert("Ошибка", `Ошибка загрузки списка чатов`, "ok");
        return;
    }
}

window.onload = () => {
    loadMyChats();
};

socket.on("chat_created", (data) => {
    loadMyChats(); 
});