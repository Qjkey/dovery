function d_alert(title = "", description = "", type = "ok") {
    return new Promise((resolve) => {
        // Создаем элементы
        const overlay = document.createElement('div');
        overlay.className = 'd-alert-overlay';
        
        let buttonsHtml = '';
        
        // Логика кнопок
        if (type === "ok") {
            buttonsHtml = `<button class="d-alert-btn clicked body1-medium" data-res="ok">OK</button>`;
        } else if (type === "ok_cancel") {
            buttonsHtml = `
                <button class="d-alert-btn clicked body1-medium" data-res="cancel">Отмена</button>
                <button class="d-alert-btn clicked body1-medium" data-res="ok">OK</button>`;
        } else if (type === "cancel_delete") {
            buttonsHtml = `
                <button class="d-alert-btn clicked body1-medium" data-res="cancel">Отмена</button>
                <button class="d-alert-btn danger clicked body1-medium" data-res="delete">Удалить</button>`;
        }

        overlay.innerHTML = `
            <div class="d-alert-box">
                ${title ? `<div class="d-alert-title headline6">${title}</div>` : ''}
                <div class="d-alert-description body1">${description}</div>
                <div class="d-alert-buttons body1-medium">${buttonsHtml}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Анимация появления
        setTimeout(() => overlay.classList.add('active'), 10);

        // Обработка клика
        overlay.addEventListener('click', (e) => {
            const btn = e.target.closest('.d-alert-btn');
            if (btn) {
                const result = btn.getAttribute('data-res');
                close();
                resolve(result);
            }
        });

        function close() {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 200);
        }
    });
}
