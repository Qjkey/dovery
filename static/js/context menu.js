const tagDropdown = document.getElementById('tagDropdown');
let currentOpenButton = null;

const buttonSelections = new Map();

/**
 * Функция для получения целевого div внутри кнопки, текст которого нужно менять.
 * @param {HTMLElement} buttonElement - Кнопка.
 * @returns {HTMLElement|null} Целевой div или null, если не найден.
 */
function getTargetTextDiv(buttonElement) {
    // Внутри div который является кнопкой, есть div с классом element,
    // внутри которого есть другой div, внутри которого есть надпись.
    return buttonElement.querySelector('.element > div');
}

/**
 * Функция для отображения и заполнения выпадающего меню.
 * @param {HTMLElement} buttonElement - Кнопка, вызвавшая меню.
 * @param {Array<Object>} items - Список элементов для меню.
 * @param {'mark'|'icon'} type - Тип элементов ('mark' для radio-кнопок, 'icon' для ссылок с иконками).
 */
function showDropdown(buttonElement, items, type, msg = null, paste) {
    tagDropdown.innerHTML = ''; // Очищаем предыдущие элементы

    // Получаем текущий текст из div внутри кнопки, чтобы отметить выбранный пункт в меню
    const targetDiv = getTargetTextDiv(buttonElement);
    const currentButtonText = targetDiv ? targetDiv.textContent : null;

    // Генерируем HTML для каждого элемента меню
    items.forEach((item, index) => {
        let itemHtml;

        if (item.separator === true) {
            tagDropdown.insertAdjacentHTML('beforeend', '<div class="dropdown-separator"></div>');
            return; // Переходим к следующей итерации
        }
        if (type === 'mark') {
            let label = item.label;
            let value = item.value || index; // Используем item.value если есть, иначе index
            let checked = "";

            // Специальная обработка для первого элемента как "Никакой"
            if (index === 0) {
                label = "Никакой";
                value = "none"; // Используем 'none' как значение для "Никакой"
                checked = "checked";
            }

            // Проверяем, соответствует ли этот пункт текущему тексту кнопки
            if (currentButtonText === label) {
                checked = "checked";
            } else if (!currentButtonText && index === 0) {
                // Если у кнопки нет текста, и это первый элемент ("Никакой"),
                // считаем его выбранным по умолчанию
                checked = "checked";
            }

            itemHtml = `
                <label class="dropdown-item clicked">
                    <input type="radio" name="tagSelection_${buttonElement.id}" value="${value}" id="tag_item_${buttonElement.id}_${value}" ${checked}>
                    <span class="checkmark-wrapper">
                        <svg class="checkmark-icon" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 7L6.5 12.5L17 1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </span>
                    <span class="item-text">${label}</span>
                </label>
            `;
        } else if (type === 'icon') {
            const dangerClass = item.danger ? 'is-danger' : '';
            if (item.link) {
                itemHtml = `
                    <a href="${item.link}" class="dropdown-item clicked">
                        <span class="icon-wrapper">
                            ${item.icon}
                        </span>
                        <span class="item-text ${dangerClass}">${item.label}</span>
                    </a>
                `;
            } else if (item.onclick) {
                itemHtml = `
                    <a onclick="${item.onclick}" class="dropdown-item clicked">
                        <span class="icon-wrapper">
                            ${item.icon}
                        </span>
                        <span class="item-text ${dangerClass}">${item.label}</span>
                    </a>
                `;
            }
        }
        tagDropdown.insertAdjacentHTML('beforeend', itemHtml);
    });

    // Добавляем обработчики событий для radio-кнопок ТОЛЬКО если тип 'mark'
    if (type === 'mark') {
        tagDropdown.querySelectorAll(`input[name="tagSelection_${buttonElement.id}"]`).forEach(radioInput => {
            radioInput.addEventListener('change', function() {
                if (this.checked) {
                    const selectedLabel = this.closest('.dropdown-item').querySelector('.item-text').textContent;
                    const targetDivToUpdate = getTargetTextDiv(currentOpenButton); // Используем currentOpenButton
                    if (targetDivToUpdate) {
                        targetDivToUpdate.textContent = selectedLabel; // Меняем надпись внутри кнопки
                        buttonSelections.set(currentOpenButton.id, selectedLabel); // Сохраняем выбранный label
                    }
                    hideDropdown(); // Закрываем меню после выбора
                }
            });
        });
    }

    const buttonRect = buttonElement.getBoundingClientRect();
    const buttonHeight = buttonRect.height;
    let hue = 0;
    if (!msg) {
        tagDropdown.style.top = `${buttonRect.top + window.scrollY + ((buttonHeight / 2) / 2)}px`;
        tagDropdown.style.left = `${buttonRect.right - 200}px`;;
    } else {
        if (paste) {
            hue = 50;
        } else {
            hue = 100;
        }
        tagDropdown.style.top = `${buttonRect.top + window.scrollY - hue}px`;
        tagDropdown.style.left = `${msg.x}px`;;
    }

    tagDropdown.style.right = `auto`;
    tagDropdown.style.maxHeight = '264px'; // 6 элементов

    tagDropdown.style.display = 'block'; // Показываем меню
    currentOpenButton = buttonElement; // Запоминаем кнопку, которая его открыла

    // Если нет текущего текста в кнопке и не установлен выбор,
    // устанавливаем его на первый элемент ("Никакой")
    if (!currentButtonText) {
        // Убедимся, что первый элемент (Никакой) выбран по умолчанию
        const firstRadio = tagDropdown.querySelector(`input[name="tagSelection_${buttonElement.id}"][value="none"]`);
        if (firstRadio && !firstRadio.checked) {
             firstRadio.checked = true;
             // Обновляем текст кнопки сразу же
             if (targetDiv) {
                 targetDiv.textContent = "Никакой";
                 buttonSelections.set(buttonElement.id, "Никакой");
             }
        }
    }
}

/**
 * Функция для скрытия выпадающего меню.
 */
function hideDropdown() {
    // 1. Добавляем класс, который запускает анимацию bounceHide из CSS
    tagDropdown.classList.add('closing');

    // 2. Ждем окончания анимации (событие 'animationend')
    tagDropdown.addEventListener('animationend', () => {
        // 3. Только теперь скрываем элемент полностью
        tagDropdown.style.display = 'none';
        
        // 4. Убираем класс закрытия, чтобы при следующем открытии он не мешал
        tagDropdown.classList.remove('closing');
        
        currentOpenButton = null;
    }, { once: true }); // { once: true } автоматически удалит обработчик после выполнения
} 

function createMessageContextMenu(event, button, msgId) {
    event.preventDefault();
    event.stopPropagation();
    const menuConfigs = {
        "items": [
            { label: "Копировать", onclick: `copy_message('${msgId}');`, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" version="1.1" inkscape:export-xdpi="96" inkscape:export-ydpi="96" style="fill: none; stroke: none"> <g inkscape:groupmode="layer" id="surface1491" inkscape:label="surface1491" transform="matrix(1.3333000000000002, 0.0, 0.0, 1.3333000000000002, 0.0, 0.0)"> <g id="g_1" inkscape:label="surface1491" transform="matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)"> <g id="g_2" transform="matrix(0.75, 0.0, 0.0, 0.75, 0.0, 0.0)" style="stroke:var(--tg-theme-hint-color);stroke-opacity:1.0;stroke-width:30.72;stroke-miterlimit:4.0;stroke-linecap:round;stroke-linejoin:miter"> <path d="M 143.04,196.16 C 143.04,196.16 161.18,392.9 161.18,392.9 C 162.64000000000001,408.71 175.9,420.8 191.77,420.8 C 191.77,420.8 320.23,420.8 320.23,420.8 C 336.1,420.8 349.36,408.71 350.82,392.9 C 350.82,392.9 368.96,196.16 368.96,196.16 M 394.96,144.32 C 394.96,144.32 308.56,144.32 308.56,144.32 M 117.04,144.32 C 117.04,144.32 308.56,144.32 308.56,144.32 M 308.56,144.32 C 308.56,144.32 308.56,121.92 308.56,121.92 C 308.56,104.95 294.80999999999995,91.2 277.84,91.2 C 277.84,91.2 234.16,91.2 234.16,91.2 C 217.19,91.2 203.44,104.95 203.44,121.92 C 203.44,121.92 203.44,144.32 203.44,144.32 "/> </g> </g> </g> </svg>' },       
            { label: "Удалить", danger: true, onclick: `snapDelete('${msgId}');`, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" version="1.1" inkscape:export-xdpi="96" inkscape:export-ydpi="96" style="fill: none; stroke: none"> <g inkscape:groupmode="layer" id="surface1491" inkscape:label="surface1491" transform="matrix(1.3333000000000002, 0.0, 0.0, 1.3333000000000002, 0.0, 0.0)"> <g id="g_1" inkscape:label="surface1491" transform="matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)"> <g id="g_2" transform="matrix(0.75, 0.0, 0.0, 0.75, 0.0, 0.0)" style="stroke:var(--tg-theme-destructive-text-color);stroke-opacity:1.0;stroke-width:30.72;stroke-miterlimit:4.0;stroke-linecap:round;stroke-linejoin:miter"> <path d="M 143.04,196.16 C 143.04,196.16 161.18,392.9 161.18,392.9 C 162.64000000000001,408.71 175.9,420.8 191.77,420.8 C 191.77,420.8 320.23,420.8 320.23,420.8 C 336.1,420.8 349.36,408.71 350.82,392.9 C 350.82,392.9 368.96,196.16 368.96,196.16 M 394.96,144.32 C 394.96,144.32 308.56,144.32 308.56,144.32 M 117.04,144.32 C 117.04,144.32 308.56,144.32 308.56,144.32 M 308.56,144.32 C 308.56,144.32 308.56,121.92 308.56,121.92 C 308.56,104.95 294.80999999999995,91.2 277.84,91.2 C 277.84,91.2 234.16,91.2 234.16,91.2 C 217.19,91.2 203.44,104.95 203.44,121.92 C 203.44,121.92 203.44,144.32 203.44,144.32 "/> </g> </g> </g> </svg>' }
    ]}

    if (menuConfigs) {
        showDropdown(button, menuConfigs.items, 'icon');
    }
}

document.addEventListener('click', function(event) {
    const button = event.target.closest('[id^="cntxt_menu_btn_"]');

    if (!button) {
        if (tagDropdown.style.display === 'block') hideDropdown();
        return;
    }

    const msgId = button.getAttribute('data-id');
    if (msgId) {
        createMessageContextMenu(event, button, msgId);
        return;
    }

    event.stopPropagation();

    const buttonIdSuffix = button.id.split('_').pop();

    const targetDiv = getTargetTextDiv(button);
    if (targetDiv && !targetDiv.textContent) {
        const initialLabel = buttonSelections.get(button.id) || "Никакой";
        targetDiv.textContent = initialLabel;
        buttonSelections.set(button.id, initialLabel);
    }

    if (currentOpenButton === button && tagDropdown.style.display === 'block') {
        hideDropdown();
        return;
    }

    if (tagDropdown.style.display === 'block') {
        hideDropdown();
    }

    let itemsList = null;
    let listType = '';

    if (typeof window[`list_items_mark_${buttonIdSuffix}`] !== 'undefined') {
        itemsList = window[`list_items_mark_${buttonIdSuffix}`];
        listType = 'mark';
    } else if (typeof window[`list_items_icon_${buttonIdSuffix}`] !== 'undefined') {
        itemsList = window[`list_items_icon_${buttonIdSuffix}`];
        listType = 'icon';
    }

    if (itemsList && itemsList.length > 0) {
        showDropdown(button, itemsList, listType);
        currentOpenButton = button;
    } else {
        console.warn(`Список данных для кнопки ${button.id} не найден.`);
        hideDropdown();
    }
});

// Закрываем меню, если клик произошел вне его или вне кнопки, которая его открыла
document.addEventListener('click', function(event) {
    if (tagDropdown.style.display === 'block' &&
        !tagDropdown.contains(event.target) && // Клик не внутри меню
        currentOpenButton && !currentOpenButton.contains(event.target)) { // Клик не по открывшей кнопке
        hideDropdown();
    }
});

// Дополнительно: закрываем меню по нажатию клавиши Escape
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && tagDropdown.style.display === 'block') {
        hideDropdown();
    }
});

