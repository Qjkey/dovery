document.addEventListener('DOMContentLoaded', () => {
    const overlayButton = document.getElementById('overlay_profile');
    const overlayContainer = document.querySelector('.overlay-container');
    const profileModal = document.querySelector('.profile-modal');

    let startY = 0;
    let currentY = 0;
    let dist = 0;
    const swipeThreshold = 50; // Расстояние свайпа в пикселях для закрытия

    // Функция для открытия оверлея
    function openOverlay() {
        overlayContainer.classList.add('active');
        // Устанавливаем transform обратно в 0 после небольшого таймаута
        // Это нужно, чтобы анимация translateY(0) сработала корректно
        profileModal.style.transition = 'transform 0.5s ease';
        profileModal.style.transform = 'translateY(0)';
        // Запрещаем прокрутку body, когда оверлей открыт
        document.body.style.overflow = 'hidden';
    }

    // Функция для закрытия оверлея
    function closeOverlay() {
        overlayContainer.classList.remove('active');
        profileModal.style.transition = 'transform 0.3s ease'; // Убедимся, что переход включен
        profileModal.style.transform = 'translateY(100%)';

        // Разрешаем прокрутку body после закрытия оверлея
        setTimeout(() => {
            document.body.style.overflow = '';
        }, 300); // Должно соответствовать длительности transition
    }

    // Открытие окна по клику на кнопку
    overlayButton.addEventListener('click', openOverlay);

    // Закрытие окна по клику на фон
    overlayContainer.addEventListener('click', (event) => {
        if (event.target === overlayContainer) {
            closeOverlay();
        }
    });

    // --- Логика свайпа ---
    profileModal.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        profileModal.style.transition = 'none'; // Отключаем transition для плавного перетаскивания
    });

    profileModal.addEventListener('touchmove', (e) => {
        currentY = e.touches[0].clientY;
        dist = currentY - startY;

        if (dist > 0) { // Только если свайп вниз
            e.preventDefault(); // Предотвращаем прокрутку страницы
            profileModal.style.transform = `translateY(${dist}px)`;
        }
    });

    profileModal.addEventListener('touchend', () => {
        if (dist > swipeThreshold) {
            closeOverlay();
        } else {
            // Возвращаем окно на место, если свайп был недостаточным
            profileModal.style.transition = 'transform 0.3s ease';
            profileModal.style.transform = 'translateY(0)';
        }
        dist = 0; // Сбрасываем расстояние
    });

    // Обработка свайпа также при помощи событий мыши (для ПК)
    let isDragging = false;
    let dragStartY = 0;

    profileModal.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Левая кнопка мыши
            isDragging = true;
            dragStartY = e.clientY;
            profileModal.style.transition = 'none';
        }
    });

    profileModal.addEventListener('mousemove', (e) => {
        if (isDragging) {
            currentY = e.clientY;
            dist = currentY - dragStartY;

            if (dist > 0) {
                profileModal.style.transform = `translateY(${dist}px)`;
            }
        }
    });

    profileModal.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (dist > swipeThreshold) {
                closeOverlay();
            } else {
                profileModal.style.transition = 'transform 0.3s ease';
                profileModal.style.transform = 'translateY(0)';
            }
            dist = 0;
        }
    });

    // Отмена перетаскивания, если мышь покидает окно (чтобы не застряло)
    profileModal.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            profileModal.style.transition = 'transform 0.3s ease';
            profileModal.style.transform = 'translateY(0)';
            dist = 0;
        }
    });
});
