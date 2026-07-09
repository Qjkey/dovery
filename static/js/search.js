function searchRenderResults(users) { 
    try {
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
    } catch (error) {
        d_alert("Ошибка", `Ошибка вывода поиска: ${error}`, "ok");
    }
}

function focusSearch() {
    setTimeout(() => {
        const input = document.getElementById('search-field');
        if (input) {
            input.focus();
        }
    }, 300);
}

function clearSearch() {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
}

async function fetchUsers(query) {
    try {
        const response = await fetch(`/search_users?q=${encodeURIComponent(query)}`);
        const users = await response.json();
        searchRenderResults(users);
    } catch (error) {
        d_alert("Ошибка", `Ошибка поиска: ${error}`, "ok")
    }
}