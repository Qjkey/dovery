const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

async function loadMyChats() {
    try {
        const response = await fetch('/get_my_chats');
        if (!response.ok) {
            d_alert("Ошибка", `Ошибка загрузки списка чатов`, "ok");
        }
        const chats = await response.json();
        const listContainer = document.getElementById('chats-list');
        let inx = 1;
        listContainer.innerHTML = ''; 

        if (!chats || chats.length <= 1) {
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
            const str_status = currentStatus === 'в сети' ? 'active subtitle2' : 'subtitle subtitle1';
            let sepa = "";
            if (inx !== chats.length - 1) {
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
                        <div class="label status_of_user_in_list_chats ${str_status}">${currentStatus}</div> 
                    </div>
                </div>
            `;
            // <div class="element"><div class="badge caption2">5</div></div>
            item.onclick = async () => {
                await openDirectWindow(chat.id);
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