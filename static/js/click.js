document.addEventListener('DOMContentLoaded', () => {
    const MIN_ANIMATION_TIME = 200; // Время (мс), за которое круг полностью расширяется

    // 1. ЛОГИКА ЭФФЕКТА (Ripple)
    document.addEventListener('pointerdown', (e) => {
        const item = e.target.closest('.clicked');
        if (!item) return;

        const ripple = document.createElement('span');
        ripple.classList.add('ripple');
        
        const rect = item.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2.5;
        
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left}px`;
        ripple.style.top = `${e.clientY - rect.top}px`;
        
        item.appendChild(ripple);

        const startTime = Date.now(); // Засекаем время начала

        requestAnimationFrame(() => {
            ripple.classList.add('is-active');
        });

        const release = () => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, MIN_ANIMATION_TIME - elapsed);

            // Удаляем только когда палец отпущен И анимация расширения завершена
            setTimeout(() => {
                ripple.classList.add('is-fading');
                setTimeout(() => ripple.remove(), 200); // Время на fade-out
            }, remaining);

            window.removeEventListener('pointerup', release);
            window.removeEventListener('pointercancel', release);
        };

        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
    });

    // 2. ЛОГИКА ИНПУТОВ (Radio/Checkbox)
    document.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.clicked');
        if (!item) return;

        const input_radio = item.querySelector('input[type="radio"]');
        const input_checkbox = item.querySelector('input[type="checkbox"]');

        if (input_radio) {
            if (!input_radio.checked) {
                input_radio.checked = true;
                input_radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else if (input_checkbox) {
            const span = item.querySelector('.slider');
            if (e.target === span) return;

            input_checkbox.checked = !input_checkbox.checked;
            input_checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
});
