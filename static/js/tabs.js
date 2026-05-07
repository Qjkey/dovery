document.addEventListener('DOMContentLoaded', function() {
    // Находим все хедеры вкладок
    const tabHeaders = document.querySelectorAll('.tab-header');

    tabHeaders.forEach(header => {
        const tabs = header.querySelectorAll('.tab');
        const isAdaptive = header.classList.contains('adaptive');

        // 2. Создаем линию
        const underline = document.createElement('div');
        underline.classList.add('tab-underline');
        header.appendChild(underline);

        const updateLine = () => {
            const activeTab = header.querySelector('.tab.actives');
            if (activeTab) {
                const textNode = activeTab.querySelector('span');
                if (textNode) {
                    underline.style.width = textNode.offsetWidth + 'px';
                    underline.style.left = (activeTab.offsetLeft + textNode.offsetLeft) + 'px';
                }
            }
        };

        // 3. Обработка клика
        tabs.forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Переключаем класс actives у табов именно В ЭТОМ хедере
                tabs.forEach(t => t.classList.remove('actives'));
                this.classList.add('actives');

                // Плавный скролл (для адаптивного режима)
                if (isAdaptive) {
                    this.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }

                // --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ЭКРАНОВ ---
                const targetId = this.getAttribute('data-tab');
                
                // Ищем секции везде. Если нужно ограничить — укажи контейнер вместо document
                const allScreens = document.querySelectorAll('section.tab-content');
                
                allScreens.forEach(screen => {
                    // Если ID секции совпадает с data-tab нажатой вкладки — показываем
                    if (screen.id === targetId) {
                        screen.classList.add('actives_section'); // Показываем нужную
                    } else {
                        // Скрываем только те секции, которые относятся к ЭТОЙ группе вкладок
                        // Если у тебя секции 1, 2, 3 и 4, то при клике на "2" — "1, 3, 4" спрячутся
                        screen.classList.remove('actives_section');
                    }
                });

                updateLine();
            });
        });

        // Следим за ресайзом
        new ResizeObserver(updateLine).observe(header);
        window.addEventListener('load', updateLine);
        updateLine();
    });
});
