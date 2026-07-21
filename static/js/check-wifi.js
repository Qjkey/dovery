/**
 * Статус сети для Dovery.
 * Socket.IO уже держит соединение (свой ping/pong) — отдельный HTTP /ping не нужен
 * и только засоряет логи.
 */
(function () {
    const titleEl = () => document.getElementById('title-status');

    function setStatus(text) {
        const el = titleEl();
        if (el) el.textContent = text;
    }

    function syncStatus() {
        if (!navigator.onLine) {
            setStatus('Ожидание сети...');
            return;
        }

        if (typeof socket === 'undefined' || !socket) {
            setStatus('Соединение...');
            return;
        }

        if (socket.connected) {
            setStatus('Dovery');
        } else {
            setStatus('Соединение...');
        }
    }

    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);

    function bindSocket(s) {
        s.on('connect', syncStatus);
        s.on('disconnect', syncStatus);
        s.on('reconnect_attempt', () => setStatus('Соединение...'));
        s.on('reconnect', syncStatus);
        s.on('connect_error', syncStatus);
        syncStatus();
    }

    if (typeof socket !== 'undefined' && socket) {
        bindSocket(socket);
    } else {
        // На случай, если скрипт подключат раньше dovery.js
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof socket !== 'undefined' && socket) bindSocket(socket);
            else syncStatus();
        });
    }

    syncStatus();
})();
