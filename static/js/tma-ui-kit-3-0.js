function d_alert(title = "", description = "", type = "ok") {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'd-alert-overlay';
        
        let buttonsHtml = '';
        
        if (type === "ok") {
            buttonsHtml = `<button class="d-alert-btn clicked activing body1-medium" data-res="ok">OK</button>`;
        } else if (type === "ok_cancel") {
            buttonsHtml = `
                <button class="d-alert-btn clicked activing body1-medium" data-res="cancel">Отмена</button>
                <button class="d-alert-btn clicked activing body1-medium" data-res="ok">OK</button>`;
        } else if (type === "cancel_delete") {
            buttonsHtml = `
                <button class="d-alert-btn clicked activing body1-medium" data-res="cancel">Отмена</button>
                <button class="d-alert-btn danger clicked deleting body1-medium" data-res="delete">Удалить</button>`;
        }

        overlay.innerHTML = `
            <div class="d-alert-box">
                ${title ? `<div class="d-alert-title headline6">${title}</div>` : ''}
                <div class="d-alert-description body1">${description}</div>
                <div class="d-alert-buttons body1-medium">${buttonsHtml}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        setTimeout(() => overlay.classList.add('active'), 10);

        overlay.addEventListener('click', (e) => {
            const btn = e.target.closest('.d-alert-btn');
            
            if (btn) {
                // Клик по кнопке
                const result = btn.getAttribute('data-res');
                close();
                resolve(result);
            } else if (e.target === overlay) {
                // Клик именно по чёрному фону (вне d-alert-box)
                close();
                resolve('cancel'); // Возвращаем 'cancel' при закрытии фоном
            }
        });

        function close() {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 200);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const MIN_ANIMATION_TIME = 200;

    document.addEventListener('pointerdown', (e) => {
        // Если родительский слайдер сейчас перелистывается — полностью игнорируем нажатие
        if (e.target.closest('.is-swiping')) return;

        const item = e.target.closest('.clicked');
        if (!item) return;

        if (e.pointerType === 'mouse' && e.button !== 0) return;

        const ripple = document.createElement('span');
        ripple.classList.add('ripple');
        
        const rect = item.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2.5;
        
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left}px`;
        ripple.style.top = `${e.clientY - rect.top}px`;
        
        item.appendChild(ripple);

        const startTime = Date.now();
        const startX = e.clientX;
        const startY = e.clientY;
        const dragThreshold = 7; 

        requestAnimationFrame(() => {
            ripple.classList.add('is-active');
        });

        const fadeAndRemove = () => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, MIN_ANIMATION_TIME - elapsed);

            setTimeout(() => {
                ripple.classList.add('is-fading');
                setTimeout(() => ripple.remove(), 200);
            }, remaining);

            cleanup();
        };

        const handleMove = (moveEvent) => {
            const diffX = Math.abs(moveEvent.clientX - startX);
            const diffY = Math.abs(moveEvent.clientY - startY);

            // Если во время удержания начался свайп табов
            if (diffX > dragThreshold || diffY > dragThreshold || moveEvent.target.closest('.is-swiping')) {
                fadeAndRemove();
            }
        };

        const cleanup = () => {
            window.removeEventListener('pointerup', fadeAndRemove);
            window.removeEventListener('pointercancel', fadeAndRemove);
            window.removeEventListener('pointermove', handleMove);
            item.removeEventListener('pointerleave', fadeAndRemove);
        };

        window.addEventListener('pointerup', fadeAndRemove);
        window.addEventListener('pointercancel', fadeAndRemove);
        window.addEventListener('pointermove', handleMove);
        item.addEventListener('pointerleave', fadeAndRemove);
    });

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; 
        
        // Запрещаем клики по чекбоксам/радио, если карточку тащат вбок
        if (e.target.closest('.is-swiping')) return;

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


const tagDropdown = document.getElementById('tagDropdown');
let currentOpenButton = null; // Хранит ссылку на кнопку, которая открыла текущее меню

// Глобальный Map для хранения выбранных значений для каждой кнопки
// Ключ: ID кнопки, Значение: выбранный label (строка)
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
function showDropdown(buttonElement, items, type) {

    tagDropdown.innerHTML = ''; // Очищаем предыдущие элементы

    // Получаем текущий текст из div внутри кнопки, чтобы отметить выбранный пункт в меню
    const targetDiv = getTargetTextDiv(buttonElement);
    const currentButtonText = targetDiv ? targetDiv.textContent : null;
    let width_size = 200;
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
                if (!item.icon) {
                    width_size = 250;
                    itemHtml = `
                        <a href="${item.link}" class="dropdown-item clicked">
                            <span class="item-text ${dangerClass}">${item.label}</span>
                        </a>
                    `;
                } else {
                    width_size = 200;
                    itemHtml = `
                        <a href="${item.link}" class="dropdown-item clicked">
                            <span class="icon-wrapper">
                                <svg class="${item.icon}"><use href="#${item.icon}"></use></svg>
                            </span>
                            <span class="item-text ${dangerClass}">${item.label}</span>
                        </a>
                    `;
                }
            } else if (item.onclick) {
                if (!item.icon) {
                    width_size = 250;
                    itemHtml = `
                        <a onclick="${item.onclick}" class="dropdown-item-label clicked">
                            <span class="item-text ${dangerClass}">${item.label}</span>
                        </a>
                    `;
                } else {
                    width_size = 200;
                    itemHtml = `
                            <a onclick="${item.onclick}" class="dropdown-item clicked">
                                <span class="icon-wrapper">
                                    <svg class="${item.icon}"><use href="#${item.icon}"></use></svg>
                                </span>
                                <span class="item-text ${dangerClass}">${item.label}</span>
                            </a>
                        `;
                }
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


    // Позиционируем выпадающее меню согласно вашим требованиям
    const buttonRect = buttonElement.getBoundingClientRect();
    tagDropdown.style.top = `${buttonRect.top + window.scrollY}px`;
    tagDropdown.style.left = `${buttonRect.right - width_size}px`;
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


// Прикрепляем обработчики событий ко всем кнопкам с id, начинающимся на "cntxt_menu_btn_"
document.querySelectorAll('[id^="cntxt_menu_btn_"]').forEach(button => {
    // Инициализация текста кнопки при загрузке страницы, если еще не задано
    const targetDiv = getTargetTextDiv(button);
    if (targetDiv && !targetDiv.textContent) {
        // Здесь вы можете задать текст по умолчанию, например "Никакой"
        // или взять его из buttonSelections, если оно было сохранено ранее (например, при перезагрузке)
        const initialLabel = buttonSelections.get(button.id) || "Никакой";
        targetDiv.textContent = initialLabel;
        buttonSelections.set(button.id, initialLabel);
    }

    button.addEventListener('click', function(event) {
        event.stopPropagation(); // Предотвращаем закрытие меню сразу же по клику на документ

        const buttonIdSuffix = this.id.split('_').pop(); // Извлекаем суффикс ID (например, '01')

        // Если меню уже открыто этой же кнопкой, скрываем его
        if (currentOpenButton === this && tagDropdown.style.display === 'block') {
            hideDropdown();
            return;
        }

        // Скрываем любое открытое меню, прежде чем открывать новое
        if (tagDropdown.style.display === 'block') {
            hideDropdown();
        }

        let itemsList = null;
        let listType = '';

        // Пытаемся найти список с приставкой 'mark'
        if (typeof window[`list_items_mark_${buttonIdSuffix}`] !== 'undefined') {
            itemsList = window[`list_items_mark_${buttonIdSuffix}`];
            listType = 'mark';
        }
        // Если не нашли, пытаемся найти список с приставкой 'icon'
        else if (typeof window[`list_items_icon_${buttonIdSuffix}`] !== 'undefined') {
            itemsList = window[`list_items_icon_${buttonIdSuffix}`];
            listType = 'icon';
        }
        // Если список найден и не пуст, отображаем меню
        if (itemsList && itemsList.length > 0) {
            showDropdown(this, itemsList, listType);
        } else {
            console.warn(`Список данных для кнопки ${this.id} не найден или пуст.`);
            hideDropdown();
        }
    });
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

document.addEventListener('DOMContentLoaded', () => {
    const inputContainers = document.querySelectorAll('.input-container');

    inputContainers.forEach(container => {
        const input = container.querySelector('.input-field');
        const clearBtn = container.querySelector('.clear-button');
        const prefix = input.dataset.prefilled || "";
        const limit = parseInt(input.dataset.limit) || Infinity; 

        if (prefix && !input.value.startsWith(prefix)) {
            input.value = prefix;
        }
        const fixCursorPosition = () => {
            if (prefix && input.selectionStart < prefix.length) {
                input.setSelectionRange(prefix.length, prefix.length);
            }
        };

        input.addEventListener('input', (e) => {

            if (prefix && !input.value.startsWith(prefix)) {
                input.value = prefix;
            }

            if (input.value.length > limit) {
                input.value = input.value.substring(0, limit);
            }
        });

        input.addEventListener('click', fixCursorPosition);
        input.addEventListener('focus', fixCursorPosition);
        
        input.addEventListener('keydown', (e) => {
            setTimeout(fixCursorPosition, 0);

            if (prefix && 
                e.key === 'Backspace' && 
                input.selectionStart === prefix.length && 
                input.selectionEnd === prefix.length) {
                e.preventDefault();
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = prefix;
                input.focus();
                if (prefix) {
                    input.setSelectionRange(prefix.length, prefix.length);
                }
            });
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const swipeThreshold = 50; // Расстояние свайпа в пикселях для закрытия

    // Функция для открытия оверлея
    function openOverlay(overlayId) {
        const overlayContainer = document.querySelector(`[data-overlay="${overlayId}"]`);
        if (!overlayContainer) return;

        const profileModal = overlayContainer.querySelector('.profile-modal'); // Или любой другой класс модалки внутри

        overlayContainer.classList.add('active');
        
        if (profileModal) {
            profileModal.style.transition = 'transform 0.5s ease';
            profileModal.style.transform = 'translateY(0)';
        }
        
        // Запрещаем прокрутку body, когда оверлей открыт
        document.body.style.overflow = 'hidden';

        // Инициализируем свайпы для конкретного оверлея, если еще не инициализированы
        if (profileModal) {
            initOverlaySwipeListeners(overlayContainer, profileModal, overlayId);
        }
    }

    // Функция для закрытия оверлея
    function closeOverlay(overlayId) {
        const overlayContainer = document.querySelector(`[data-overlay="${overlayId}"]`);
        if (!overlayContainer) return;

        const profileModal = overlayContainer.querySelector('.profile-modal');

        overlayContainer.classList.remove('active');
        
        if (profileModal) {
            profileModal.style.transition = 'transform 0.3s ease';
            profileModal.style.transform = 'translateY(100%)';
        }

        // Разрешаем прокрутку body после закрытия оверлея
        setTimeout(() => {
            // Проверяем, нет ли других открытых оверлеев перед тем, как включить скролл обратно
            const anyActive = document.querySelector('[data-overlay].active');
            if (!anyActive) {
                document.body.style.overflow = '';
            }
        }, 300);
    }

    // Экспортируем в глобальную область, если нужно вызывать из других скриптов
    window.openOverlay = openOverlay;
    window.closeOverlay = closeOverlay; 

    // Глобальный делегат кликов (работает для всех data-open-overlay и data-close-overlay)
    document.addEventListener('click', (event) => {
        // Клик на кнопку открытия
        const openTarget = event.target.closest('[data-open-overlay]');
        if (openTarget) {
            const overlayId = openTarget.getAttribute('data-open-overlay');
            openOverlay(overlayId);
            return;
        }

        // Клик на кнопку закрытия
        const closeTarget = event.target.closest('[data-close-overlay]');
        if (closeTarget) {
            const overlayId = closeTarget.getAttribute('data-close-overlay');
            closeOverlay(overlayId);
            return;
        }

        // Клик по фону оверлея (закрытие при клике на затененную область)
        if (event.target.hasAttribute('data-overlay')) {
            const overlayId = event.target.getAttribute('data-overlay');
            closeOverlay(overlayId);
        }
    });

    // Функция инициализации свайпов (вызывается один раз для каждого оверлея при открытии)
    function initOverlaySwipeListeners(overlayContainer, profileModal, overlayId) {
        if (profileModal.dataset.swipeInitialized) return;
        profileModal.dataset.swipeInitialized = "true";

        let startY = 0;
        let currentY = 0;
        let dist = 0;
        let isDragging = false;

        // --- Логика тач-событий (Мобильные) ---
        profileModal.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            profileModal.style.transition = 'none';
        }, { passive: true });

        profileModal.addEventListener('touchmove', (e) => {
            currentY = e.touches[0].clientY;
            dist = currentY - startY;

            if (dist > 0) { // Только свайп вниз
                if (e.cancelable) e.preventDefault();
                profileModal.style.transform = `translateY(${dist}px)`;
            }
        }, { passive: false });

        profileModal.addEventListener('touchend', () => {
            if (dist > swipeThreshold) {
                closeOverlay(overlayId);
            } else {
                profileModal.style.transition = 'transform 0.3s ease';
                profileModal.style.transform = 'translateY(0)';
            }
            dist = 0;
        });

        // --- Логика мыши (ПК) ---
        profileModal.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                isDragging = true;
                startY = e.clientY;
                profileModal.style.transition = 'none';
            }
        });

        profileModal.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            currentY = e.clientY;
            dist = currentY - startY;

            if (dist > 0) {
                profileModal.style.transform = `translateY(${dist}px)`;
            }
        });

        const handleMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            if (dist > swipeThreshold) {
                closeOverlay(overlayId);
            } else {
                profileModal.style.transition = 'transform 0.3s ease';
                profileModal.style.transform = 'translateY(0)';
            }
            dist = 0;
        };

        profileModal.addEventListener('mouseup', handleMouseUp);
        profileModal.addEventListener('mouseleave', handleMouseUp);
    }
});

/**
 * Вызов кастомного Toast-уведомления (Железобетонный фикс кнопки закрытия)
 */
function d_pop(label = 'Label', description = 'Description', actionLabel = 'Label', icon = 'pop', actionCallback = null) {
  if (document.querySelector('.custom-toast')) return;

  const toast = document.createElement('div');
  toast.className = 'custom-toast';

  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.left = '0';
  toast.style.right = '0';
  toast.style.margin = '0 auto';
  toast.style.width = '90%';
  toast.style.maxWidth = '470px';
  toast.style.zIndex = '9999';

  let desc = "";
  if (description !== "") {
    desc = `<span class="toast-description subtitle2">${description}</span>`;
  }

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-icon">
        <svg class="${icon}"><use href="#${icon}"></use></svg>
      </div>
      <div class="toast-text">
        <span class="toast-label subtitle2-medium"></span>
        ${desc}
      </div>
    </div>
    <button class="toast-action-btn subtitle2-medium clicked activing"></button>
  `;

  toast.querySelector('.toast-label').textContent = label;
  
  const actionBtn = toast.querySelector('.toast-action-btn');
  actionBtn.textContent = actionLabel;

  document.body.appendChild(toast);

  toast.addEventListener('animationend', function initHandler(e) {
    if (e.animationName === 'slideIn') {
      toast.removeEventListener('animationend', initHandler);
      toast.style.animation = 'none'; 
    }
  });

  let autoCloseTimeout = setTimeout(() => {
    closeToast(toast);
  }, 3300);

  function closeToast(targetToast) {
    if (!targetToast || !targetToast.parentNode) return; // Защита от повторного удаления
    targetToast.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
    targetToast.style.animation = 'slideOut 0.22s ease-in forwards';
    targetToast.classList.add('hide-down');
    
    targetToast.addEventListener('animationend', function handler(e) {
      if (e.animationName === 'slideOut') {
        targetToast.removeEventListener('animationend', handler);
        targetToast.remove();
      }
    });
  }

  // ЖЕЛЕЗОБЕТОННЫЙ КЛИК: Чистим всё нахер и удаляем без лишних посредников
  actionBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    clearTimeout(autoCloseTimeout);
    
    if (typeof actionCallback === 'function') {
      actionCallback();
    }
    
    closeToast(toast);
  });

  // --- ЛОГИКА СВАЙПА ---
  let startX = 0;
  let currentX = 0;
  let isDragging = false;
  let hasMovedFar = false;
  const swipeThreshold = 120;

  toast.addEventListener('dragstart', (e) => e.preventDefault());

  toast.addEventListener('click', (e) => {
    if (hasMovedFar) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });

  function startDrag(e) {
    // ЕЩЁ БОЛЕЕ ЖЕСТКАЯ ПРОВЕРКА КНОПКИ: Если тронули кнопку — свайп полностью изолируется
    if (e.target === actionBtn || e.target.closest('.toast-action-btn')) {
      isDragging = false;
      return; 
    }
    if (e.type === 'mousedown' && e.button !== 0) return;

    isDragging = true;
    hasMovedFar = false;
    startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    currentX = startX;
    
    toast.style.animation = 'none'; 
    toast.style.transition = 'none'; 
    clearTimeout(autoCloseTimeout); 
  }

  function moveDrag(e) {
    if (!isDragging) return;
    currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const diffX = currentX - startX;
    
    if (Math.abs(diffX) > 10) {
      hasMovedFar = true;
    }

    toast.style.transform = `translateX(${diffX}px)`;
    toast.style.opacity = Math.max(0, 1 - Math.abs(diffX) / 200);
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    const diffX = currentX - startX;

    if (hasMovedFar && Math.abs(diffX) > swipeThreshold) {
      toast.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      toast.style.transform = `translateX(${diffX > 0 ? 100 : -100}%)`;
      toast.style.opacity = '0';
      
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 200);
    } else {
      toast.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';

      setTimeout(() => {
        if (!isDragging && toast.parentNode) {
          toast.style.animation = 'none';
        }
      }, 200);

      autoCloseTimeout = setTimeout(() => closeToast(toast), 3300);
    }
  }

  // Touch
  toast.addEventListener('touchstart', startDrag, { passive: true });
  toast.addEventListener('touchmove', moveDrag, { passive: false });
  toast.addEventListener('touchend', endDrag);
  toast.addEventListener('touchcancel', endDrag);

  // Mouse
  toast.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);
}

const openedScreens = [];

const DOVERY_DESKTOP_BREAKPOINT = 751;

function isDoveryChatListLayout() {
  // Список чатов Dovery на планшете/ноуте всегда виден рядом с перепиской
  return window.innerWidth >= DOVERY_DESKTOP_BREAKPOINT
    && !!document.getElementById('chats-list');
}

function isDoveryMessagesScreen(screen) {
  return !!(screen && (screen.id === 'message-chats' || screen.classList.contains('messages')));
}

function shouldPreserveChatsScroll(screen) {
  return isDoveryChatListLayout() && isDoveryMessagesScreen(screen);
}

function isChatsScrollContainer(container) {
  return container.classList.contains('chats')
    || container.id === 'chats-list'
    || (container.id === 'app' && container.classList.contains('chats'));
}

// Включение/выключение внутреннего скролла у контейнеров
function toggleInnerScroll(root, isDisable, options = {}) {
  if (!root) return;

  const keepChatsScroll = options.keepChatsScroll === true;

  const scrollContainers = root === document
    ? document.querySelectorAll('.page, .messages, .chats')
    : root.querySelectorAll('.page, .messages, .chats');

  scrollContainers.forEach(container => {
    if (isDisable && keepChatsScroll && isChatsScrollContainer(container)) {
      return;
    }
    container.style.overflowY = isDisable ? 'hidden' : 'auto';
  });
}

// Инициализация свайпов для ЗАКРЫТИЯ ЭКРАНА
function initSwipeListeners(screenId) {
  const topScreen = document.querySelector(`[data-screen="${screenId}"]`);
  if (!topScreen || !topScreen.hasAttribute('data-swipe')) return;

  if (topScreen.dataset.swipeInitialized) return;
  topScreen.dataset.swipeInitialized = "true";

  let startX = 0;
  let startY = 0;
  let dist = 0;
  let isMoving = false;
  let hasMovedFar = false; 
  const swipeThreshold = 80;

  function resetTouchCoordinates() {
    startX = 0;
    startY = 0;
    dist = 0;
    isMoving = false;
    setTimeout(() => {
      hasMovedFar = false;
    }, 50);
  }

  // Перехватываем и глушим любые клики, если экран двигали
  topScreen.addEventListener('click', (e) => {
    if (hasMovedFar) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });

  // --- ТАЧ-СОБЫТИЯ ДЛЯ МОБИЛОК (ЗАКРЫТИЕ ЭКРАНА) ---
  topScreen.addEventListener('touchstart', (e) => {
    if (e.target.closest('.tab-container-slider') || e.target.closest('.tab-header') || e.target.closest('input[type="range"]')) {
      return; 
    }

    e.stopPropagation();
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isMoving = false;
    hasMovedFar = false;
    topScreen.style.transition = 'none';
  }, { passive: true });

  topScreen.addEventListener('touchmove', (e) => {
    if (startX === 0) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    
    dist = currentX - startX;
    const distY = currentY - startY;

    if (dist < 0) dist = 0;

    if (!isMoving && Math.abs(dist) > Math.abs(distY) && Math.abs(dist) > 10) {
      isMoving = true;
      hasMovedFar = true; 
      topScreen.style.overflowY = 'hidden'; 
    }

    if (isMoving) {
      e.stopPropagation(); 
      if (e.cancelable) e.preventDefault(); 
      topScreen.style.transform = `translateX(${dist}px)`;
    }
  }, { passive: false });

  topScreen.addEventListener('touchend', (e) => {
    if (startX === 0) return;
    e.stopPropagation();
    topScreen.style.transition = 'transform 0.18s ease';

    if (isMoving && dist > swipeThreshold) {
      topScreen.style.transform = 'translateX(100%)';
      setTimeout(() => {
        closeActiveScreen(screenId, true);
        resetTouchCoordinates();
      }, 180);
    } else {
      topScreen.style.transform = 'translateX(0)';
      setTimeout(() => {
        topScreen.style.transition = '';
        topScreen.style.overflowY = 'auto'; 
        resetTouchCoordinates();
      }, 180);
    }
  });

  topScreen.addEventListener('touchcancel', (e) => {
    e.stopPropagation();
    topScreen.style.transition = 'transform 0.18s ease';
    topScreen.style.transform = 'translateX(0)';
    setTimeout(() => {
      topScreen.style.transition = '';
      topScreen.style.overflowY = 'auto';
      resetTouchCoordinates();
    }, 180);
  });

  // --- МЫШИНЫЕ СОБЫТИЯ ДЛЯ ПК (ЗАКРЫТИЕ ЭКРАНА) ---
  let isDragging = false;

  topScreen.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tab-container-slider') || e.target.closest('.tab-header') || e.target.closest('input[type="range"]')) {
      return; 
    }

    if (e.button === 0) {
      isDragging = true;
      startX = e.clientX;
      hasMovedFar = false;
      topScreen.style.transition = 'none';
    }
  });

  topScreen.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    dist = e.clientX - startX;
    if (dist < 0) dist = 0;

    if (dist > 10) {
      hasMovedFar = true;
    }
    topScreen.style.transform = `translateX(${dist}px)`;
  });

  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    topScreen.style.transition = 'transform 0.18s ease';

    if (dist > swipeThreshold) {
      topScreen.style.transform = 'translateX(100%)';
      setTimeout(() => {
        closeActiveScreen(screenId, true);
        resetTouchCoordinates();
      }, 180);
    } else {
      topScreen.style.transform = 'translateX(0)';
      setTimeout(() => {
        topScreen.style.transition = '';
        resetTouchCoordinates();
      }, 180);
    }
  };

  topScreen.addEventListener('mouseup', handleMouseUp);
  topScreen.addEventListener('mouseleave', handleMouseUp);
}

// Открытие экрана
function openScreen(screenId) {
  const screen = document.querySelector(`[data-screen="${screenId}"]`);
  if (!screen) return;

  // Не дублируем уже открытый экран в стеке
  if (openedScreens[openedScreens.length - 1] === screenId) {
    return;
  }

  const parentContainer = screen.closest('.page, .messages, .chats');
  const keepChatsScroll = shouldPreserveChatsScroll(screen);

  if (openedScreens.length === 0) {
    if (!keepChatsScroll) {
      toggleInnerScroll(document, true);
      document.body.style.overflow = 'hidden';
    } else {
      // Dovery desktop: список чатов остаётся скроллируемым
      toggleInnerScroll(document, true, { keepChatsScroll: true });
    }
  } else {
    const prevScreenId = openedScreens[openedScreens.length - 1];
    const prevScreen = document.querySelector(`[data-screen="${prevScreenId}"]`);
    if (prevScreen) {
      toggleInnerScroll(prevScreen, true, { keepChatsScroll });
    }
  }

  if (parentContainer && window.innerWidth > 600 && !keepChatsScroll) {
    const currentScroll = parentContainer.scrollTop;
    screen.style.top = `${currentScroll}px`;
  } else {
    screen.style.top = '0px';
  }

  openedScreens.push(screenId);
  
  screen.classList.remove('hidden');
  screen.style.transition = 'none';
  screen.style.transform = 'translateX(100%)';
  screen.style.zIndex = 100 + openedScreens.length;
  screen.style.overflowY = 'auto'; 

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      screen.style.transition = 'transform 0.18s ease';
      screen.classList.add('active');
      screen.style.transform = ''; 
    });
  });

  initSwipeListeners(screenId);
}

// Закрытие экрана
function closeActiveScreen(screenId, isSwiped = false) {
  if (openedScreens.length === 0) return;

  const screen = document.querySelector(`[data-screen="${screenId}"]`);
  
  if (screen) {
    const index = openedScreens.indexOf(screenId);
    if (index !== -1) {
      openedScreens.splice(index, 1);
    }

    const finalizeClose = () => {
      screen.classList.add('hidden');
      screen.classList.remove('active');
      screen.style.transform = ''; 
      screen.style.transition = '';
      screen.style.zIndex = ''; 
      screen.style.overflowY = ''; 
      screen.style.top = '';
      toggleInnerScroll(screen, false);
    };

    if (!isSwiped) {
      screen.style.transition = 'transform 0.18s ease';
      screen.style.transform = 'translateX(100%)';
      setTimeout(finalizeClose, 180); 
    } else {
      finalizeClose();
    }
  }
  if (openedScreens.length === 0) {
    toggleInnerScroll(document, false);
    document.body.style.overflow = '';
  } else {
    const currentTopScreenId = openedScreens[openedScreens.length - 1];
    const currentTopScreen = document.querySelector(`[data-screen="${currentTopScreenId}"]`);
    if (currentTopScreen) {
      toggleInnerScroll(currentTopScreen, false);
    }
  }
}

// --- ЗАЩИТА ОТ СДВИГА ЭКРАНОВ ПРИ РЕСАЙЗЕ ---
window.addEventListener('resize', () => {
  openedScreens.forEach(screenId => {
    const screen = document.querySelector(`[data-screen="${screenId}"]`);
    if (!screen) return;

    if (window.innerWidth <= 600) {
      screen.style.top = '0px';
    } else if (!shouldPreserveChatsScroll(screen)) {
      const parentContainer = screen.closest('.page, .messages, .chats');
      if (parentContainer) {
        screen.style.top = `${parentContainer.scrollTop}px`;
      } else {
        screen.style.top = '0px';
      }
    } else {
      screen.style.top = '0px';
    }
  });

  // При переходе на desktop Dovery — вернуть скролл списку чатов
  if (isDoveryChatListLayout()) {
    document.querySelectorAll('.chats').forEach((el) => {
      const blockingOverlay = openedScreens.some((id) => {
        const s = document.querySelector(`[data-screen="${id}"]`);
        return s && !isDoveryMessagesScreen(s);
      });
      if (!blockingOverlay) {
        el.style.overflowY = 'auto';
      }
    });
  }
});

window.openScreen = openScreen;
window.closeActiveScreen = closeActiveScreen;

// Глобальный делегат кликов
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (event) => {
    const openTarget = event.target.closest('[data-open-screen]');
    if (openTarget) {
      const screenId = openTarget.getAttribute('data-open-screen');
      openScreen(screenId);
      return; 
    }

    const closeTarget = event.target.closest('[data-close-screen]');
    if (closeTarget) {
      const screenId = closeTarget.getAttribute('data-close-screen');
      closeActiveScreen(screenId);
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
    const searchContainer = document.querySelector('.search-panel');
    if (!searchContainer) return;

    const input = searchContainer.querySelector('.search-input');
    const clearBtn = searchContainer.querySelector('.clear-btn');

    clearBtn.addEventListener('click', () => {
        input.value = '';
        input.focus();
    });
});

document.addEventListener('DOMContentLoaded', () => {
  // Весь твой код теперь внутри этой функции
  const slider = document.getElementById('mySlider');
  const valueLabel = document.getElementById('sliderValue');

  function updateSlider() {
    const min = parseInt(slider.min) || 0;
    const max = parseInt(slider.max) || 100;
    const value = parseInt(slider.value);
    
    const percentage = ((value - min) / (max - min)) * 100;
    
    slider.style.setProperty('--slider-progress', percentage);
    valueLabel.textContent = value;
  }

  if (slider && valueLabel) { // Безопасная проверка на существование элементов
    slider.addEventListener('input', updateSlider);
    updateSlider();
  }
});

function initTabsLogic() {
    const tabHeaders = document.querySelectorAll('.tab-header');

    tabHeaders.forEach(header => {
        // Жестко выбираем табы ТОЛЬКО текущего хедера, полностью игнорируя нижний .navbar-capsule
        const tabs = Array.from(header.querySelectorAll('.tab')).filter(tab => !tab.closest('.navbar-capsule'));
        if (tabs.length === 0) return;
        
        const currentScreen = header.closest('.screen');
        const fallbackContainer = header.parentElement;
        const mainContainer = currentScreen || fallbackContainer; 
        if (!mainContainer) return;

        let sliderContainer = mainContainer.querySelector('.tab-container-slider');
        if (!sliderContainer && header.parentElement) {
            sliderContainer = header.parentElement.parentElement ? header.parentElement.parentElement.querySelector('.tab-container-slider') : null;
        }
        if (!sliderContainer) {
            sliderContainer = document.querySelector('.tab-container-slider');
        }

        // Ищем слайды строго внутри этого контейнера
        const allSlides = sliderContainer ? sliderContainer.querySelectorAll('.tab-slide') : [];
        
        const initialClass = header.classList.contains('adaptive') ? 'adaptive' :
                             header.classList.contains('usual') ? 'usual' : 'central';

        let underline = header.querySelector('.tab-underline');
        if (!underline) {
            underline = document.createElement('div');
            underline.classList.add('tab-underline');
            header.appendChild(underline);
        }

        const forceRenderCapsule = () => {
            const activeTab = header.querySelector('.tab.actives') || tabs[0];
            if (!activeTab) return;

            const isScreenHidden = currentScreen && currentScreen.classList.contains('hidden');
            if (isScreenHidden) {
                currentScreen.style.visibility = 'hidden';
                currentScreen.classList.remove('hidden');
            }

            const width = activeTab.offsetWidth;
            const left = activeTab.offsetLeft;

            if (isScreenHidden) {
                currentScreen.classList.add('hidden');
                currentScreen.style.visibility = '';
            }

            if (width > 0) {
                underline.style.width = width + 'px';
                underline.style.left = left + 'px';
            }
        };

        const setSliderTransform = (offsetStyle, useTransition = true) => {
            allSlides.forEach(slide => {
                slide.style.transition = useTransition ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
                slide.style.transform = offsetStyle;
            });
        };

        const updateTabsState = (targetTabId) => {
            const activeTab = header.querySelector(`[data-tab="${targetTabId}"]`);
            if (!activeTab) return;

            tabs.forEach(t => t.classList.remove('actives'));
            activeTab.classList.add('actives');

            if (header.classList.contains('adaptive')) {
                activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }

            forceRenderCapsule();

            if (allSlides.length > 0) {
                const activeIndex = tabs.indexOf(activeTab);
                if (activeIndex !== -1) {
                    setSliderTransform(`translateX(-${activeIndex * 100}%)`, true);
                }
            }
        };

        const adjustLayout = () => {
            if (sliderContainer && sliderContainer.classList.contains('is-swiping')) return;

            if (currentScreen && currentScreen.classList.contains('hidden') && !currentScreen.classList.contains('active')) {
                forceRenderCapsule();
                return;
            }

            const tabsCount = tabs.length;
            const parentWidth = header.parentElement ? header.parentElement.offsetWidth : window.innerWidth;

            header.classList.remove('adaptive', 'usual', 'central');
            header.classList.add('central');
            
            const totalTabsWidth = tabs.reduce((sum, tab) => sum + tab.offsetWidth, 0);
            
            header.classList.remove('central');
            header.classList.add(initialClass);

            if (tabsCount > 5 || totalTabsWidth > parentWidth) {
                header.classList.remove('central', 'usual');
                header.classList.add('adaptive');
            }
            else if (initialClass === 'central' && totalTabsWidth > (parentWidth * 0.8)) {
                header.classList.remove('central');
                header.classList.add('usual');
            }

            forceRenderCapsule();
        };

        let preventClickOnDrag = false;
        tabs.forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                if (preventClickOnDrag) return;
                updateTabsState(this.getAttribute('data-tab'));
            });
        });

        // --- ДВИЖОК СКРОЛЛА ДЛЯ ЛЕНТЫ ТАБОВ ---
        let isHeaderDragging = false;
        let headerStartX = 0;
        let headerScrollLeft = 0;

        header.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            
            isHeaderDragging = true;
            preventClickOnDrag = false;
            headerStartX = e.clientX;
            headerScrollLeft = header.scrollLeft;
            header.style.scrollBehavior = 'auto';
        }, { passive: true });

        window.addEventListener('pointermove', (e) => {
            if (!isHeaderDragging) return;
            e.stopPropagation();

            const x = e.clientX;
            const walkX = (x - headerStartX) * 1.3;
            
            if (Math.abs(walkX) > 5) {
                preventClickOnDrag = true;
            }
            header.scrollLeft = headerScrollLeft - walkX;
        }, { passive: true });

        window.addEventListener('pointerup', (e) => {
            if (isHeaderDragging) {
                e.stopPropagation();
                isHeaderDragging = false;
                header.style.scrollBehavior = 'smooth';
                setTimeout(() => { preventClickOnDrag = false; }, 50);
            }
        }, { passive: true });

        header.addEventListener('pointerleave', () => {
            if (isHeaderDragging) {
                isHeaderDragging = false;
                header.style.scrollBehavior = 'smooth';
            }
        }, { passive: true });

        forceRenderCapsule();
        setTimeout(forceRenderCapsule, 0);

        const observer = new MutationObserver(() => {
            if (!mainContainer.classList.contains('hidden') || mainContainer.classList.contains('active')) {
                adjustLayout();
                setTimeout(forceRenderCapsule, 50);
            }
        });
        observer.observe(mainContainer, { attributes: true, attributeFilter: ['class'] });

        // --- УНИВЕРСАЛЬНЫЕ ЖИВЫЕ СВАЙПЫ КОНТЕНТА ---
        if (sliderContainer && allSlides.length > 0) {
            let startX = 0;
            let startY = 0;
            let isDragging = false;
            let isClickIntent = true;
            let containerWidth = 0;
            let currentTransformOffset = 0;

            const clickThreshold = 7;
            const minSwipeDistance = 50;

            const preventNativeClick = (e) => {
                if (!isClickIntent) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };

            sliderContainer.addEventListener('pointerdown', function(e) {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                
                const activeTab = header.querySelector('.tab.actives') || tabs[0];
                if (!activeTab) return;
                
                const activeIndex = tabs.indexOf(activeTab);
                if (activeIndex === -1) return;
                
                containerWidth = mainContainer.offsetWidth || window.innerWidth;
                currentTransformOffset = -activeIndex * containerWidth;

                startX = e.clientX;
                startY = e.clientY;
                isDragging = true;
                isClickIntent = true;

                sliderContainer.addEventListener('click', preventNativeClick, { capture: true });
            }, { capture: true, passive: true });

            sliderContainer.addEventListener('pointermove', function(e) {
                if (!isDragging) return;

                const currentX = e.clientX;
                const currentY = e.clientY;
                
                const diffX = currentX - startX;
                const diffY = Math.abs(currentY - startY);

                if (Math.abs(diffX) > clickThreshold && isClickIntent) {
                    isClickIntent = false;
                    sliderContainer.classList.add('is-swiping');
                }

                if (diffY > Math.abs(diffX) && isClickIntent) {
                    isDragging = false;
                    return;
                }

                if (!isClickIntent) {
                    let dragOffset = currentTransformOffset + diffX;
                    const maxOffset = 0;
                    
                    // ФИКС: Ограничиваем свайп только количеством реальных слайдов текущего экрана
                    const minOffset = -(allSlides.length - 1) * containerWidth;
                    
                    if (dragOffset > maxOffset) {
                        dragOffset = diffX * 0.25;
                    } else if (dragOffset < minOffset) {
                        const overdrag = dragOffset - minOffset;
                        dragOffset = minOffset + overdrag * 0.25;
                    }

                    setSliderTransform(`translateX(${dragOffset}px)`, false);
                }
            }, { passive: true });

            sliderContainer.addEventListener('pointerup', function(e) {
                if (!isDragging) return;
                isDragging = false;

                sliderContainer.classList.remove('is-swiping');

                if (isClickIntent) {
                    sliderContainer.removeEventListener('click', preventNativeClick, { capture: true });
                    return;
                }

                const endX = e.clientX;
                const totalDragDistance = endX - startX;

                const activeTab = header.querySelector('.tab.actives') || tabs[0];
                const currentIndex = tabs.indexOf(activeTab);
                if (currentIndex === -1) return;
                
                let targetIndex = currentIndex;

                // ФИКС: Сверяем переключение со слайдами
                if (totalDragDistance < -minSwipeDistance && currentIndex < allSlides.length - 1) {
                    targetIndex = currentIndex + 1;
                } else if (totalDragDistance > minSwipeDistance && currentIndex > 0) {
                    targetIndex = currentIndex - 1;
                }

                updateTabsState(tabs[targetIndex].getAttribute('data-tab'));

                setTimeout(() => {
                    sliderContainer.removeEventListener('click', preventNativeClick, { capture: true });
                }, 10);
            }, { passive: true });

            sliderContainer.addEventListener('pointerleave', () => {
                if (isDragging) {
                    isDragging = false;
                    sliderContainer.classList.remove('is-swiping');
                    sliderContainer.removeEventListener('click', preventNativeClick, { capture: true });
                    const activeTab = header.querySelector('.tab.actives') || tabs[0];
                    if (activeTab) updateTabsState(activeTab.getAttribute('data-tab'));
                }
            }, { passive: true });
        }

        new ResizeObserver(adjustLayout).observe(header.parentElement);
        window.addEventListener('load', adjustLayout);
    });
}

document.addEventListener('DOMContentLoaded', initTabsLogic);

document.addEventListener('contextmenu', function(event) {
    event.preventDefault();
}, { capture: true });