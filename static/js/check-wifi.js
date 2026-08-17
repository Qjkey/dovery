/**
 * Статус сети для Dovery.
 * Socket.IO уже держит соединение (свой ping/pong) — отдельный HTTP /ping не нужен
 * и только засоряет логи.
 */
(function () {
    const titleTextEl = () => document.getElementById('title-status-text');
    const titleDotsEl = () => document.querySelector('#title-status .conn-status-dots');

    function getDoveryConnectionLabel() {
        if (!navigator.onLine) return 'Ожидание сети...';
        if (typeof socket === 'undefined' || !socket || !socket.connected) {
            return 'Соединение...';
        }
        return null;
    }

    window.getDoveryConnectionLabel = getDoveryConnectionLabel;

    function setTitleStatus(kind) {
        const textEl = titleTextEl();
        const dotsEl = titleDotsEl();
        if (!textEl) return;

        if (kind === 'offline') {
            textEl.textContent = 'Ожидание сети';
            if (dotsEl) dotsEl.classList.remove('hidden');
        } else if (kind === 'connecting') {
            textEl.textContent = 'Соединение';
            if (dotsEl) dotsEl.classList.remove('hidden');
        } else {
            textEl.textContent = 'Dovery';
            if (dotsEl) dotsEl.classList.add('hidden');
        }
    }

    function syncStatus() {
        let kind = 'connecting';
        if (!navigator.onLine) {
            kind = 'offline';
        } else if (typeof socket !== 'undefined' && socket && socket.connected) {
            kind = 'online';
        }

        setTitleStatus(kind);
        if (typeof window.refreshAllPresenceDisplays === 'function') {
            window.refreshAllPresenceDisplays();
        }
    }

    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);

    function bindSocket(s) {
        s.on('connect', syncStatus);
        s.on('disconnect', syncStatus);
        s.on('reconnect_attempt', syncStatus);
        s.on('reconnect', syncStatus);
        s.on('connect_error', syncStatus);
        syncStatus();
    }

    if (typeof socket !== 'undefined' && socket) {
        bindSocket(socket);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof socket !== 'undefined' && socket) bindSocket(socket);
            else syncStatus();
        });
    }

    syncStatus();
})();
