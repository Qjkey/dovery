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

/** Диалог с полем пароля. Возвращает строку пароля или null при отмене. */
function d_password_prompt(title = "", description = "") {
  return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'd-alert-overlay';
      overlay.innerHTML = `
          <div class="d-alert-box">
              ${title ? `<div class="d-alert-title headline6">${title}</div>` : ''}
              ${description ? `<div class="d-alert-description body1">${description}</div>` : ''}
              <div class="d-alert-input-wrap">
                  <input type="password" class="d-alert-input body1" autocomplete="current-password" placeholder="Пароль" />
              </div>
              <div class="d-alert-buttons body1-medium">
                  <button type="button" class="d-alert-btn clicked activing body1-medium" data-res="cancel">Отмена</button>
                  <button type="button" class="d-alert-btn clicked activing body1-medium" data-res="ok">OK</button>
              </div>
          </div>
      `;

      document.body.appendChild(overlay);
      const input = overlay.querySelector('.d-alert-input');
      setTimeout(() => {
          overlay.classList.add('active');
          input?.focus();
      }, 10);

      const finish = (value) => {
          if (input) input.value = '';
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 200);
          resolve(value);
      };

      overlay.addEventListener('click', (e) => {
          const btn = e.target.closest('.d-alert-btn');
          if (btn) {
              const res = btn.getAttribute('data-res');
              if (res === 'ok') finish((input?.value || '').trim() || null);
              else finish(null);
          } else if (e.target === overlay) {
              finish(null);
          }
      });

      input?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
              e.preventDefault();
              finish((input.value || '').trim() || null);
          } else if (e.key === 'Escape') {
              e.preventDefault();
              finish(null);
          }
      });
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
let dropdownClosePromise = null; // Promise текущего закрытия (для смены меню с анимацией)
let dropdownMorphPromise = null;
let dropdownLastAnchor = null;
let dropdownCurrentType = 'icon';
let dropdownIsVertical = false;
let dropdownCurrentItems = null; // актуальный список пунктов (с Back, если уже вложены)
let dropdownHistory = []; // стек предыдущих меню для «Назад»

const DROPDOWN_MORE_SVG = `<svg class="menu1" aria-hidden="true"><use href="#menu1"></use></svg>`;
const DROPDOWN_BACK_LABEL = 'Назад';

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

function dropdownIconHtml(icon) {
  if (!icon) return '';
  const raw = String(icon).trim();
  if (raw.startsWith('<')) {
      return `<span class="icon-wrapper">${raw}</span>`;
  }
  return `<span class="icon-wrapper"><svg class="${raw}"><use href="#${raw}"></use></svg></span>`;
}

function isVerticalMenuButton(buttonElement) {
  if (!buttonElement) return false;
  if (buttonElement.hasAttribute('vertical')) {
      const v = buttonElement.getAttribute('vertical');
      if (v === null || v === '' || /^(true|1|yes)$/i.test(v)) return true;
  }
  if (buttonElement.hasAttribute('data-vertical')) {
      const v = buttonElement.getAttribute('data-vertical');
      if (v === null || v === '' || /^(true|1|yes)$/i.test(v)) return true;
  }
  return false;
}

function resolveMenuItems(ref) {
  if (!ref) return null;
  if (Array.isArray(ref)) return ref;
  if (typeof ref === 'string' && typeof window[ref] !== 'undefined') {
      return window[ref];
  }
  return null;
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetDropdownInlineBox() {
  if (!tagDropdown) return;
  tagDropdown.style.width = '';
  tagDropdown.style.height = '';
  tagDropdown.style.minWidth = '';
  tagDropdown.style.maxHeight = '';
  tagDropdown.style.transition = '';
  tagDropdown.style.overflow = '';
}

function setDropdownOpenDisplay(vertical) {
  dropdownIsVertical = !!vertical;
  tagDropdown.classList.toggle('is-vertical', dropdownIsVertical);
  tagDropdown.classList.remove('is-vertical-expanded');
  tagDropdown.classList.add('is-open');
  tagDropdown.style.display = dropdownIsVertical ? 'flex' : 'block';
  if (dropdownIsVertical) {
      tagDropdown.style.maxHeight = 'none';
  } else {
      tagDropdown.style.maxHeight = '264px';
  }
}

function positionTagDropdown(buttonElement, widthSize, anchor, vertical) {
  const pad = 8;
  const isV = !!vertical;
  tagDropdown.style.position = 'fixed';
  tagDropdown.style.right = 'auto';
  tagDropdown.style.transform = '';
  tagDropdown.classList.remove('is-centered');
  setDropdownOpenDisplay(isV);

  // Размер после display — иначе offsetWidth/Height на display:none = 0
  const menuW = isV
      ? (tagDropdown.offsetWidth || widthSize || 180)
      : (widthSize || tagDropdown.offsetWidth || 200);
  const menuH = tagDropdown.offsetHeight || 120;
  let left;
  let top;

  const anchorY = (anchor && Number.isFinite(anchor.y))
      ? anchor.y
      : (buttonElement
          ? (() => { const r = buttonElement.getBoundingClientRect(); return r.top + r.height / 2; })()
          : window.innerHeight / 2);
  const anchorX = (anchor && Number.isFinite(anchor.x))
      ? anchor.x
      : (buttonElement
          ? (() => { const r = buttonElement.getBoundingClientRect(); return r.left + r.width / 2; })()
          : window.innerWidth / 2);

  // Вертикальное меню — чуть выше точки нажатия, чтобы не перекрывать текст
  const VERTICAL_ABOVE_PX = 9;

  if (isV && window.innerWidth < 750) {
      // Узкий экран: X по центру viewport, Y — над пальцем/мышью
      tagDropdown.classList.add('is-centered');
      tagDropdown.style.left = '50%';
      top = anchorY - menuH - VERTICAL_ABOVE_PX;
      if (top < pad) {
          // Не хватает места сверху — ставим ниже точки
          top = Math.min(anchorY + VERTICAL_ABOVE_PX, window.innerHeight - menuH - pad);
      }
      if (top + menuH > window.innerHeight - pad) top = window.innerHeight - menuH - pad;
      if (top < pad) top = pad;
      tagDropdown.style.top = `${top}px`;
      tagDropdown.style.transformOrigin = 'center bottom';
      return;
  }

  if (isV) {
      // Широкий экран: по X центрируем, по Y — над точкой клика
      left = anchorX - menuW / 2;
      top = anchorY - menuH - VERTICAL_ABOVE_PX;
      if (top < pad) {
          top = Math.min(anchorY + VERTICAL_ABOVE_PX, window.innerHeight - menuH - pad);
      }
  } else if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
      left = anchor.x;
      top = anchor.y;
      if (top + menuH > window.innerHeight - pad) {
          top = Math.max(pad, anchor.y - menuH);
      }
  } else if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      left = rect.right - menuW;
      top = rect.top;
      if (top + menuH > window.innerHeight - pad) {
          top = Math.max(pad, rect.bottom - menuH);
      }
  } else {
      left = pad;
      top = pad;
  }

  if (left + menuW > window.innerWidth - pad) left = window.innerWidth - menuW - pad;
  if (left < pad) left = pad;
  if (top + menuH > window.innerHeight - pad) top = window.innerHeight - menuH - pad;
  if (top < pad) top = pad;

  tagDropdown.style.left = `${left}px`;
  tagDropdown.style.top = `${top}px`;
  tagDropdown.style.transformOrigin = isV ? 'center bottom' : 'top right';
}

function isDropdownVisible() {
  if (!tagDropdown) return false;
  const d = tagDropdown.style.display;
  return d === 'block' || d === 'flex';
}

function injectBackAt(items, index) {
  // Устарело: «Назад» задаётся в list_items_* как { isBack: true }. Оставлено для совместимости.
  const next = items.map((it) => (it && typeof it === 'object' ? { ...it } : it));
  const back = { label: DROPDOWN_BACK_LABEL, icon: 'back1', isBack: true };
  const at = Math.max(0, Math.min(Number(index) || 0, next.length));
  next.splice(at, 0, back);
  return next;
}

function pushDropdownHistory() {
  if (!dropdownCurrentItems) return;
  dropdownHistory.push({
      items: dropdownCurrentItems.map((it) => (it && typeof it === 'object' ? { ...it } : it)),
      type: dropdownCurrentType,
      vertical: dropdownIsVertical
  });
}

function goDropdownBack() {
  const prev = dropdownHistory.pop();
  if (!prev) {
      hideDropdown();
      return;
  }
  transformDropdown(prev.items, prev.type, {
      vertical: prev.vertical,
      skipHistory: true,
      // Возврат из обычного меню в compact — якорим правый низ (место ⋮)
      pinCorner: prev.vertical ? 'bottom-right' : null
  });
}

function buildRegularDropdownHtml(items, type, buttonElement, currentButtonText) {
  let width_size = 200;
  let html = '<div class="tag-dropdown-inner">';

  // Mark: какой пункт отмечен. Если в item стоит плейсхолдер («Выбор») — берём первый (Никакой / явный value)
  let markSelectedLabel = currentButtonText;
  if (type === 'mark') {
      const classicMark = items.length > 0 && items[0].value == null;
      const markLabels = items
          .filter((it) => !it.separator)
          .map((it, i) => (classicMark && i === 0 ? 'Никакой' : it.label));
      if (!markSelectedLabel || !markLabels.includes(markSelectedLabel)) {
          markSelectedLabel = markLabels[0] || (classicMark ? 'Никакой' : null);
      }
  }

  items.forEach((item, index) => {
      let itemHtml = '';

      if (item.separator === true) {
          html += '<div class="dropdown-separator"></div>';
          return;
      }
      if (type === 'mark') {
          let label = item.label;
          let value = item.value != null ? item.value : index;

          // Классический mark: первый пункт = «Никакой», если value не задан явно
          if (index === 0 && item.value == null) {
              label = 'Никакой';
              value = 'none';
          }

          const checked = markSelectedLabel === label ? 'checked' : '';

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
          const iconHtml = dropdownIconHtml(item.icon || (item.isBack ? 'back1' : ''));
          const hasTransform = item.transform != null && !item.isBack;
          const transformAttr = hasTransform ? ' data-dropdown-transform="1"' : '';
          const backAttr = item.isBack ? ' data-dropdown-back="1"' : '';

          if (item.isBack) {
              width_size = 200;
              itemHtml = `
                  <a href="javascript:void(0)" class="dropdown-item clicked" data-item-index="${index}"${backAttr}>
                      ${iconHtml}
                      <span class="item-text">${item.label || DROPDOWN_BACK_LABEL}</span>
                  </a>
              `;
          } else if (hasTransform) {
              width_size = item.icon ? 200 : 250;
              itemHtml = `
                  <a href="javascript:void(0)" class="dropdown-item clicked" data-item-index="${index}"${transformAttr}>
                      ${iconHtml}
                      <span class="item-text ${dangerClass}">${item.label}</span>
                  </a>
              `;
          } else if (item.link) {
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
                          ${iconHtml}
                          <span class="item-text ${dangerClass}">${item.label}</span>
                      </a>
                  `;
              }
          } else if (item.onclick) {
              if (!item.icon) {
                  width_size = 250;
                  itemHtml = `
                      <a href="javascript:void(0)" onclick="${item.onclick}; return false;" class="dropdown-item-label clicked">
                          <span class="item-text ${dangerClass}">${item.label}</span>
                      </a>
                  `;
              } else {
                  width_size = 200;
                  itemHtml = `
                      <a href="javascript:void(0)" onclick="${item.onclick}; return false;" class="dropdown-item clicked">
                          ${iconHtml}
                          <span class="item-text ${dangerClass}">${item.label}</span>
                      </a>
                  `;
              }
          }
      }
      html += itemHtml;
  });

  html += '</div>';
  return { html, width_size };
}

function buildVerticalDropdownHtml(items) {
  const visible = items.filter((it) => !it.separator).slice(0, 2);
  const moreItems = items.filter((it) => !it.separator).slice(2);
  let html = '<div class="tag-dropdown-inner">';

  visible.forEach((item, index) => {
      const dangerClass = item.danger ? ' is-danger' : '';
      const iconHtml = dropdownIconHtml(item.icon || 'menu');
      const hasTransform = item.transform != null;
      let attrs = `class="dropdown-item-v clicked${dangerClass}" data-item-index="${index}"`;
      if (hasTransform) attrs += ' data-dropdown-transform="1"';
      if (item.link && !hasTransform) {
          html += `<a href="${item.link}" ${attrs}>${iconHtml}<span class="item-text">${item.label}</span></a>`;
      } else if (item.onclick && !hasTransform) {
          html += `<a href="javascript:void(0)" onclick="${item.onclick}; return false;" ${attrs}>${iconHtml}<span class="item-text">${item.label}</span></a>`;
      } else {
          html += `<a href="javascript:void(0)" ${attrs}>${iconHtml}<span class="item-text">${item.label}</span></a>`;
      }
  });

  if (moreItems.length > 0) {
      html += `<button type="button" class="dropdown-more clicked" aria-label="Ещё" data-dropdown-more="1">${DROPDOWN_MORE_SVG}</button>`;
  }

  html += '</div>';
  return { html, width_size: 180, moreItems };
}

function bindDropdownHandlers(items, type, buttonElement, moreItems) {
  if (type === 'mark') {
      tagDropdown.querySelectorAll(`input[name="tagSelection_${buttonElement.id}"]`).forEach((radioInput) => {
          radioInput.addEventListener('change', function () {
              if (this.checked) {
                  const selectedLabel = this.closest('.dropdown-item').querySelector('.item-text').textContent;
                  const targetDivToUpdate = getTargetTextDiv(currentOpenButton);
                  if (targetDivToUpdate) {
                      targetDivToUpdate.textContent = selectedLabel;
                      buttonSelections.set(currentOpenButton.id, selectedLabel);
                  }
                  if (typeof window.__onMarkMenuSelect === 'function') {
                      window.__onMarkMenuSelect(buttonElement.id, this.value, selectedLabel);
                  }
                  hideDropdown();
              }
          });
      });
  }

  tagDropdown.querySelectorAll('[data-dropdown-back="1"]').forEach((el) => {
      el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          goDropdownBack();
      });
  });

  tagDropdown.querySelectorAll('[data-dropdown-transform="1"]').forEach((el) => {
      el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = Number(el.getAttribute('data-item-index'));
          const item = items[idx];
          if (!item) return;
          const next = resolveMenuItems(item.transform);
          if (!next || !next.length) {
              console.warn('transform: список не найден или пуст', item.transform);
              return;
          }
          const nextType = item.transformType || 'icon';
          transformDropdown(next, nextType, {
              vertical: false
          });
      });
  });

  const moreBtn = tagDropdown.querySelector('[data-dropdown-more="1"]');
  if (moreBtn && moreItems && moreItems.length) {
      moreBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Обычное меню; «Назад» должен быть в list_items (isBack: true)
          const fromComposer = currentOpenButton && currentOpenButton.id === 'messages-textarea';
          Promise.resolve(transformDropdown(moreItems, 'icon', {
              vertical: false,
              pinCorner: 'bottom-right'
          })).then(() => {
              if (!fromComposer) return;
              if (typeof window.restoreComposerSelection === 'function') {
                  window.restoreComposerSelection();
              } else {
                  document.getElementById('messages-textarea')?.focus({ preventScroll: true });
              }
          });
      });
  }
}

function fillDropdownContent(buttonElement, items, type, options = {}) {
  const vertical = !!options.vertical;
  const targetDiv = getTargetTextDiv(buttonElement);
  const currentButtonText = targetDiv ? targetDiv.textContent : null;
  let width_size = 200;
  let moreItems = [];

  const actionable = items.filter((it) => !it.separator);

  if (vertical) {
      const built = buildVerticalDropdownHtml(items);
      tagDropdown.innerHTML = built.html;
      width_size = built.width_size;
      moreItems = built.moreItems;
      bindDropdownHandlers(actionable, type, buttonElement, moreItems);
  } else {
      const built = buildRegularDropdownHtml(items, type, buttonElement, currentButtonText);
      tagDropdown.innerHTML = built.html;
      width_size = built.width_size;
      bindDropdownHandlers(items, type, buttonElement, moreItems);
  }

  if (type === 'mark' && !currentButtonText && targetDiv) {
      const firstRadio = tagDropdown.querySelector(`input[name="tagSelection_${buttonElement.id}"][value="none"]`);
      if (firstRadio && !firstRadio.checked) {
          firstRadio.checked = true;
          targetDiv.textContent = 'Никакой';
          buttonSelections.set(buttonElement.id, 'Никакой');
      }
  }

  dropdownCurrentType = type;
  dropdownCurrentItems = items.map((it) => (it && typeof it === 'object' ? { ...it } : it));
  dropdownIsVertical = vertical;
  tagDropdown.classList.toggle('is-vertical', vertical);
  tagDropdown.classList.remove('is-vertical-expanded');
  return width_size;
}

/**
* Функция для отображения и заполнения выпадающего меню.
* @param {HTMLElement} buttonElement - Кнопка, вызвавшая меню.
* @param {Array<Object>} items - Список элементов для меню.
* @param {'mark'|'icon'} type - Тип элементов ('mark' для radio-кнопок, 'icon' для ссылок с иконками).
* @param {{x:number, y:number}|null} [anchor] - Точка показа (ПКМ / долгое нажатие).
* @param {{vertical?:boolean}} [options] - Доп. опции (vertical).
*/
async function showDropdown(buttonElement, items, type, anchor, options = {}) {
  if (!tagDropdown || !buttonElement) return;

  // Если уже открыто другое меню — сначала закрываем его с анимацией
  if (isDropdownVisible() || tagDropdown.classList.contains('closing') || tagDropdown.classList.contains('morphing')) {
      await hideDropdown();
  }

  const vertical = options.vertical != null
      ? !!options.vertical
      : isVerticalMenuButton(buttonElement);

  tagDropdown.classList.remove('closing', 'morphing', 'is-fading', 'no-entrance', 'is-vertical-expanded');
  resetDropdownInlineBox();
  dropdownLastAnchor = anchor || null;
  dropdownHistory = [];

  const width_size = fillDropdownContent(buttonElement, items, type, { vertical });

  currentOpenButton = buttonElement;
  positionTagDropdown(buttonElement, width_size, anchor, vertical);

  // Перезапуск анимации открытия (только при свежем открытии)
  tagDropdown.style.animation = 'none';
  void tagDropdown.offsetWidth;
  tagDropdown.style.animation = '';
}

/**
* Плавная трансформация открытого меню в другой набор пунктов.
* @param {Array<Object>|string} itemsOrRef - Новый список или имя глобальной переменной.
* @param {'mark'|'icon'} [type='icon']
* @param {{vertical?:boolean, anchor?:{x:number,y:number}, skipHistory?:boolean, pinCorner?:'bottom-right'|null}} [options]
*/
async function transformDropdown(itemsOrRef, type = 'icon', options = {}) {
  let items = resolveMenuItems(itemsOrRef);
  if (!items || !items.length) {
      console.warn('transformDropdown: пустой список', itemsOrRef);
      return;
  }
  if (!tagDropdown) return;

  const willMorph = isDropdownVisible() && !tagDropdown.classList.contains('closing');

  // Вложенный переход: сохраняем историю («Назад» уже в целевом списке)
  if (willMorph && !options.skipHistory) {
      pushDropdownHistory();
  }
  // Совместимость: если кто-то ещё передаёт fromIndex + не skipBackInject — вставим Back
  if (!options.skipBackInject && options.fromIndex != null) {
      items = injectBackAt(items, options.fromIndex);
  }

  if (!willMorph) {
      const btn = currentOpenButton || document.body;
      return showDropdown(btn, items, type, options.anchor || dropdownLastAnchor, {
          vertical: !!options.vertical
      });
  }

  if (dropdownMorphPromise) await dropdownMorphPromise;

  dropdownMorphPromise = (async () => {
      const vertical = !!options.vertical;
      const pinCorner = options.pinCorner || (dropdownIsVertical && !vertical ? 'bottom-right' : null);
      const fromRect = tagDropdown.getBoundingClientRect();
      const left = fromRect.left;
      const top = fromRect.top;
      const fromRight = fromRect.right;
      const fromBottom = fromRect.bottom;

      // Снимаем центрирование (50%/translate) → пиксели для морфа
      tagDropdown.classList.remove('is-centered');
      tagDropdown.style.left = `${left}px`;
      tagDropdown.style.top = `${top}px`;
      tagDropdown.style.transform = '';

      tagDropdown.classList.remove('closing');
      tagDropdown.classList.add('morphing', 'no-entrance');
      tagDropdown.style.animation = 'none';
      tagDropdown.style.width = `${fromRect.width}px`;
      tagDropdown.style.height = `${fromRect.height}px`;
      tagDropdown.style.overflow = 'hidden';
      tagDropdown.style.transition = 'none';

      // Плавно скрываем старые элементы
      tagDropdown.classList.add('is-fading');
      await waitMs(160);

      const btn = currentOpenButton || document.body;
      fillDropdownContent(btn, items, type, { vertical });

      // Измеряем новый размер
      tagDropdown.classList.toggle('is-vertical', vertical);
      tagDropdown.classList.remove('is-vertical-expanded');
      tagDropdown.style.animation = 'none';
      tagDropdown.style.width = 'auto';
      tagDropdown.style.height = 'auto';
      tagDropdown.style.minWidth = '';
      if (vertical) {
          tagDropdown.style.display = 'flex';
          tagDropdown.style.maxHeight = 'none';
      } else {
          tagDropdown.style.display = 'block';
          tagDropdown.style.maxHeight = '264px';
      }
      const toW = tagDropdown.offsetWidth;
      const toH = tagDropdown.offsetHeight;

      // Возвращаем старый бокс и анимируем к новому
      tagDropdown.style.width = `${fromRect.width}px`;
      tagDropdown.style.height = `${fromRect.height}px`;
      void tagDropdown.offsetWidth;

      tagDropdown.classList.remove('is-fading');
      tagDropdown.style.transition = 'width 0.28s cubic-bezier(0.32, 0.72, 0, 1), height 0.28s cubic-bezier(0.32, 0.72, 0, 1), left 0.28s cubic-bezier(0.32, 0.72, 0, 1), top 0.28s cubic-bezier(0.32, 0.72, 0, 1)';
      tagDropdown.style.width = `${toW}px`;
      tagDropdown.style.height = `${toH}px`;

      // Из vertical compact → обычное: якорим правый низ (место ⋮ → «Назад»)
      const pad = 8;
      let nextLeft;
      let nextTop;
      if (pinCorner === 'bottom-right') {
          nextLeft = fromRight - toW;
          nextTop = fromBottom - toH;
      } else {
          nextLeft = left;
          nextTop = top;
      }
      if (nextLeft + toW > window.innerWidth - pad) nextLeft = window.innerWidth - toW - pad;
      if (nextLeft < pad) nextLeft = pad;
      if (nextTop + toH > window.innerHeight - pad) nextTop = Math.max(pad, window.innerHeight - toH - pad);
      if (nextTop < pad) nextTop = pad;
      tagDropdown.style.left = `${nextLeft}px`;
      tagDropdown.style.top = `${nextTop}px`;

      await waitMs(290);

      resetDropdownInlineBox();
      setDropdownOpenDisplay(vertical);
      // Не снимаем no-entrance — иначе снова сработает bounceShow
      tagDropdown.classList.remove('morphing', 'is-fading');
      tagDropdown.style.animation = 'none';
  })();

  try {
      await dropdownMorphPromise;
  } finally {
      dropdownMorphPromise = null;
  }
}

/**
* Функция для скрытия выпадающего меню.
* @returns {Promise<void>}
*/
function hideDropdown() {
  if (!tagDropdown) return Promise.resolve();

  if (!isDropdownVisible()) {
      currentOpenButton = null;
      dropdownHistory = [];
      dropdownCurrentItems = null;
      return Promise.resolve();
  }

  // Уже закрывается — ждём тот же Promise
  if (tagDropdown.classList.contains('closing') && dropdownClosePromise) {
      return dropdownClosePromise;
  }

  const finishNow = () => {
      tagDropdown.style.display = 'none';
      tagDropdown.classList.remove(
          'closing', 'is-open', 'is-vertical', 'is-vertical-expanded',
          'morphing', 'is-fading', 'no-entrance', 'is-centered'
      );
      tagDropdown.style.animation = '';
      resetDropdownInlineBox();
      currentOpenButton = null;
      dropdownIsVertical = false;
      dropdownHistory = [];
      dropdownCurrentItems = null;
      dropdownClosePromise = null;
  };

  // Минимальный режим: без анимации закрытия
  if (document.documentElement.getAttribute('data-opt-mode') === 'minimal') {
      tagDropdown.classList.remove('morphing', 'is-fading', 'no-entrance');
      resetDropdownInlineBox();
      finishNow();
      return Promise.resolve();
  }

  const wasVertical = dropdownIsVertical || tagDropdown.classList.contains('is-vertical');
  const keepMaxH = wasVertical ? '' : (tagDropdown.style.maxHeight || '264px');

  tagDropdown.classList.remove('morphing', 'is-fading', 'no-entrance');
  resetDropdownInlineBox();
  // Сохраняем предел высоты при закрытии, иначе меню вспыхивает на полную высоту
  if (!wasVertical) {
      tagDropdown.style.maxHeight = keepMaxH;
      tagDropdown.style.overflow = 'hidden';
  }
  // Сбрасываем inline animation:none после морфа, иначе bounceHide не играет
  tagDropdown.style.animation = 'none';
  void tagDropdown.offsetWidth;
  tagDropdown.style.animation = '';
  tagDropdown.classList.add('closing');

  dropdownClosePromise = new Promise((resolve) => {
      let finished = false;
      const finish = () => {
          if (finished) return;
          finished = true;
          finishNow();
          resolve();
      };
      tagDropdown.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 280);
  });

  return dropdownClosePromise;
}

/** Закрывает контекстное меню чата (profile 02/12, favorites 22). */
function closeChatContextMenu() {
  if (!tagDropdown || !isDropdownVisible()) return;
  const id = currentOpenButton?.id;
  if (id !== 'cntxt_menu_btn_02' && id !== 'cntxt_menu_btn_12' && id !== 'cntxt_menu_btn_22') return;
  hideDropdown();
}

window.hideDropdown = hideDropdown;
window.closeChatContextMenu = closeChatContextMenu;
window.showDropdown = showDropdown;
window.transformDropdown = transformDropdown;


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
      if (!tagDropdown) return;

      const buttonIdSuffix = this.id.split('_').pop(); // Извлекаем суффикс ID (например, '01')

      // Если меню уже открыто этой же кнопкой, скрываем его
      if (currentOpenButton === this && isDropdownVisible() && !tagDropdown.classList.contains('closing')) {
          hideDropdown();
          return;
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
      // (если другое меню открыто — showDropdown сам закроет его с анимацией)
      if (itemsList && itemsList.length > 0) {
          const vertical = isVerticalMenuButton(this);
          const anchor = vertical
              ? { x: event.clientX, y: event.clientY }
              : null;
          showDropdown(this, itemsList, listType, anchor, { vertical });
      } else {
          console.warn(`Список данных для кнопки ${this.id} не найден или пуст.`);
          hideDropdown();
      }
  });
});


function isEventInsideOpenDropdown(target) {
  if (!target || !target.closest) return false;
  if (tagDropdown && tagDropdown.contains(target)) return true;
  if (currentOpenButton && currentOpenButton.contains(target)) return true;
  // Кнопка-триггер (шапка и т.п.)
  if (target.closest('[id^="cntxt_menu_btn_"]')) return true;
  return false;
}

function closeDropdownIfOutside(event) {
  if (!tagDropdown || !isDropdownVisible()) return;
  if (tagDropdown.classList.contains('closing') || tagDropdown.classList.contains('morphing')) return;
  if (isEventInsideOpenDropdown(event.target)) return;
  hideDropdown();
}

// pointerdown в capture — надёжнее click на таче для вертикального/обычного меню
document.addEventListener('pointerdown', closeDropdownIfOutside, true);
document.addEventListener('click', closeDropdownIfOutside, true);

// Дополнительно: закрываем меню по нажатию клавиши Escape
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && tagDropdown && isDropdownVisible()) {
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
  const swipeThreshold = 50;
  const expandSnapRatio = 0.35;
  const MARGIN_CARD = 6;
  const MARGIN_FULL_TOP = 12; // fullscreen sheet: всегда 10–15px сверху (сайт и APK)
  const CAP_RATIO = 0.6; // sheet: rest при прокручиваемом контенте

  function getModalType(modal) {
      const t = modal?.getAttribute('data-modal');
      return t === 'card' ? 'card' : 'sheet';
  }

  function isNarrowViewport() {
      return window.innerWidth < 750;
  }

  function readSafeAreaInset(side) {
      const probe = document.createElement('div');
      probe.style.cssText =
          'position:fixed;visibility:hidden;pointer-events:none;' +
          `padding-${side}:env(safe-area-inset-${side},0px);`;
      document.documentElement.appendChild(probe);
      const pad = parseFloat(getComputedStyle(probe).getPropertyValue(`padding-${side}`)) || 0;
      probe.remove();
      return pad;
  }

  function getSafeAreaBottom() {
      return readSafeAreaInset('bottom');
  }

  function getOverlaySize(profileModal) {
      const overlay = profileModal.closest('.overlay-container');
      return {
          width: overlay ? overlay.clientWidth : window.innerWidth,
          height: overlay ? overlay.clientHeight : window.innerHeight
      };
  }

  function getOverlayHeight(profileModal) {
      return getOverlaySize(profileModal).height;
  }

  /** Скролл внутри .profile-modal-scroll — оболочка всегда overflow:hidden (клип radius) */
  function ensureModalScrollBody(profileModal) {
      let scroll = profileModal.querySelector(':scope > .profile-modal-scroll');
      if (scroll) return scroll;
      scroll = document.createElement('div');
      scroll.className = 'profile-modal-scroll';
      while (profileModal.firstChild) {
          scroll.appendChild(profileModal.firstChild);
      }
      profileModal.appendChild(scroll);
      return scroll;
  }

  function resetModalExpandStyles(profileModal) {
      profileModal.classList.remove(
          'profile-modal--fullscreen',
          'profile-modal--dragging'
      );
      profileModal.style.height = '';
      profileModal.style.maxHeight = '';
      profileModal.style.margin = '';
      profileModal.style.maxWidth = '';
      profileModal.style.width = '';
      profileModal.style.overflow = '';
      profileModal.style.overflowX = '';
      profileModal.style.overflowY = '';
      profileModal.style.borderRadius = '';
      profileModal.style.transition = '';
      profileModal.style.position = '';
      profileModal.style.left = '';
      profileModal.style.right = '';
      profileModal.style.top = '';
      profileModal.style.bottom = '';
      profileModal.style.transform = '';
      profileModal._expandPx = 0;
      profileModal._baseHeight = 0;
      profileModal._fullHeight = 0;
      profileModal._maxExpand = 0;
      profileModal._insetTop = 0;
      const scroll = profileModal.querySelector(':scope > .profile-modal-scroll');
      if (scroll) {
          scroll.style.overflowY = '';
          scroll.scrollTop = 0;
      }
  }

  function openOverlay(overlayId) {
      const overlayContainer = document.querySelector(`[data-overlay="${overlayId}"]`);
      if (!overlayContainer) return;

      const profileModal = overlayContainer.querySelector('.profile-modal');

      document.body.style.overflow = 'hidden';
      overlayContainer.classList.add('active');

      if (profileModal) {
          ensureModalScrollBody(profileModal);
          resetModalExpandStyles(profileModal);
          profileModal.style.transition = 'none';
          measureModalAtRest(profileModal);
          const startFull = profileModal.hasAttribute('data-start-fullscreen')
              && (profileModal._maxExpand || 0) > 0;
          applyModalExpand(
              profileModal,
              startFull ? profileModal._maxExpand : 0,
              false
          );
          profileModal.classList.remove('profile-modal--dragging');
          profileModal.style.transform = 'translateY(110%)';

          requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                  if (!overlayContainer.classList.contains('active')) return;
                  profileModal.style.transition = 'transform 0.3s ease-out';
                  profileModal.style.transform = 'translateY(0)';
              });
          });

          initOverlaySwipeListeners(overlayContainer, profileModal, overlayId);
      }
  }

  function closeOverlay(overlayId) {
      const overlayContainer = document.querySelector(`[data-overlay="${overlayId}"]`);
      if (!overlayContainer) return;

      const profileModal = overlayContainer.querySelector('.profile-modal');

      overlayContainer.classList.remove('active');

      if (profileModal) {
          profileModal.style.transition = 'transform 0.25s ease-out';
          profileModal.style.transform = 'translateY(100%)';
          setTimeout(() => {
              if (!overlayContainer.classList.contains('active')) {
                  resetModalExpandStyles(profileModal);
              }
          }, 280);
      }

      setTimeout(() => {
          const anyActive = document.querySelector('[data-overlay].active');
          if (!anyActive) {
              document.body.style.overflow = '';
          }
      }, 280);
  }

  window.openOverlay = openOverlay;
  window.closeOverlay = closeOverlay;

  document.addEventListener('click', (event) => {
      const openTarget = event.target.closest('[data-open-overlay]');
      if (openTarget) {
          openOverlay(openTarget.getAttribute('data-open-overlay'));
          return;
      }

      const closeTarget = event.target.closest('[data-close-overlay]');
      if (closeTarget) {
          closeOverlay(closeTarget.getAttribute('data-close-overlay'));
          return;
      }

      if (event.target.hasAttribute('data-overlay')) {
          closeOverlay(event.target.getAttribute('data-overlay'));
      }
  });

  /**
   * sheet — без отступов, rest ≤60% если контент большой, можно stretch.
   * card — с отступами, высота по контенту (без 60%), stretch нельзя.
   */
  function measureModalAtRest(profileModal) {
      const type = getModalType(profileModal);
      const narrow = isNarrowViewport();
      const overlayH = getOverlayHeight(profileModal);
      const prevExpand = profileModal._expandPx || 0;
      const maxExpandPrev = profileModal._maxExpand || 0;
      const wasFull = maxExpandPrev > 0 && prevExpand >= maxExpandPrev * 0.99;
      const progressPrev = maxExpandPrev > 0 ? prevExpand / maxExpandPrev : 0;
      // На широких у всех модалок есть поля; на узких — только у card
      const margin = (!narrow || type === 'card') ? MARGIN_CARD : 0;
      const marginBottom = margin > 0 ? margin + getSafeAreaBottom() : 0;

      profileModal.classList.remove('profile-modal--fullscreen', 'profile-modal--dragging');
      profileModal.style.position = '';
      profileModal.style.left = '';
      profileModal.style.right = '';
      profileModal.style.top = '';
      profileModal.style.bottom = '';
      profileModal.style.height = 'auto';
      profileModal.style.maxHeight = 'none';
      profileModal.style.margin = margin > 0
          ? `${margin}px ${margin}px ${marginBottom}px ${margin}px`
          : '0';
      /* С отступами — радиус везде; без отступов — снизу 0 */
      profileModal.style.borderRadius = margin > 0 ? '27px' : '27px 27px 0 0';
      profileModal.style.maxWidth = '';
      profileModal.style.width = (type === 'sheet' && narrow) ? '100%' : '';
      // Оболочка никогда не скроллится — иначе WebView роняет border-radius
      profileModal.style.overflow = 'hidden';
      profileModal.style.overflowX = 'hidden';
      profileModal.style.overflowY = 'hidden';
      profileModal.style.transition = 'none';
      const scrollBody = ensureModalScrollBody(profileModal);
      scrollBody.style.overflowY = 'hidden';

      void profileModal.offsetHeight;
      const natural = scrollBody.scrollHeight;
      const verticalMargins = margin + marginBottom;
      const capMax = Math.round(overlayH * CAP_RATIO) - (margin > 0 ? verticalMargins : 0);

      let baseHeight;
      if (type === 'card') {
          baseHeight = Math.max(120, Math.min(natural, overlayH - verticalMargins));
          profileModal._baseHeight = baseHeight;
          profileModal._fullHeight = overlayH;
          profileModal._maxExpand = 0;
          profileModal._insetTop = 0;
      } else {
          baseHeight = natural > capMax ? Math.max(120, capMax) : Math.max(120, natural);
          profileModal._baseHeight = baseHeight;
          profileModal._fullHeight = overlayH;
          // Full: сверху всегда фиксированный gap — тёмный оверлей как у d_alert
          const insetTop = narrow ? MARGIN_FULL_TOP : MARGIN_CARD;
          profileModal._insetTop = insetTop;
          const fullTarget = narrow
              ? Math.max(baseHeight, overlayH - insetTop)
              : Math.max(baseHeight, overlayH - verticalMargins);
          profileModal._maxExpand = Math.max(0, fullTarget - baseHeight);
      }

      if (type === 'sheet' && wasFull) {
          applyModalExpand(profileModal, profileModal._maxExpand, false);
      } else if (type === 'sheet' && progressPrev > 0) {
          applyModalExpand(profileModal, progressPrev * profileModal._maxExpand, false);
      } else {
          applyModalExpand(profileModal, 0, false);
      }
  }

  function applyModalExpand(profileModal, expandPx, withTransition) {
      const type = getModalType(profileModal);
      const baseHeight = profileModal._baseHeight || profileModal.offsetHeight;
      const fullHeight = profileModal._fullHeight || getOverlayHeight(profileModal);
      const maxExpand = type === 'card' ? 0 : (profileModal._maxExpand || 0);
      const clamped = Math.max(0, Math.min(expandPx, maxExpand));
      profileModal._expandPx = clamped;

      const progress = maxExpand > 0 ? clamped / maxExpand : 0;
      const atFull = type === 'sheet' && progress >= 0.995;
      const overlayW = getOverlaySize(profileModal).width;
      const narrow = isNarrowViewport();

      if (withTransition) {
          profileModal.classList.remove('profile-modal--dragging');
          profileModal.style.transition = 'top 0.28s ease-out, transform 0.28s ease-out';
      } else {
          profileModal.classList.add('profile-modal--dragging');
          profileModal.style.transition = 'none';
      }

      profileModal.style.transform = 'translateY(0)';
      profileModal.style.position = 'absolute';
      profileModal.style.height = 'auto';
      profileModal.style.maxHeight = 'none';
      profileModal.style.margin = '0';
      const hasInsets = type === 'card' || !narrow;
      profileModal.style.borderRadius = hasInsets ? '27px' : '27px 27px 0 0';
      profileModal.style.overflow = 'hidden';
      profileModal.style.overflowX = 'hidden';
      profileModal.style.overflowY = 'hidden';

      const scrollBody = ensureModalScrollBody(profileModal);
      const canScroll = type === 'sheet' && atFull;
      scrollBody.style.overflowY = canScroll ? 'auto' : 'hidden';

      if (hasInsets) {
          // card везде + любой modal на широком: поля; снизу + safe-area под nav bar
          const inset = MARGIN_CARD;
          const insetBottom = MARGIN_CARD + getSafeAreaBottom();
          const modalW = Math.min(450, Math.max(0, overlayW - inset * 2));
          const left = Math.max(inset, (overlayW - modalW) / 2);
          const top = inset + (fullHeight - baseHeight - inset - insetBottom) * (1 - progress);

          profileModal.style.left = left + 'px';
          profileModal.style.right = 'auto';
          profileModal.style.width = modalW + 'px';
          profileModal.style.maxWidth = modalW + 'px';
          profileModal.style.bottom = insetBottom + 'px';
          profileModal.style.top = Math.max(inset, top) + 'px';

          if (type === 'sheet' && atFull) {
              profileModal.classList.add('profile-modal--fullscreen');
          } else {
              profileModal.classList.remove('profile-modal--fullscreen');
          }
          return;
      }

      // Узкий sheet: сверху фиксированный gap — тёмный оверлей как у d_alert
      const insetTop = profileModal._insetTop != null ? profileModal._insetTop : MARGIN_FULL_TOP;
      const top = insetTop + Math.max(0, (fullHeight - insetTop - baseHeight) * (1 - progress));

      profileModal.style.left = '0';
      profileModal.style.right = '0';
      profileModal.style.width = 'auto';
      profileModal.style.maxWidth = 'none';
      profileModal.style.bottom = '0';
      profileModal.style.top = top + 'px';

      if (atFull) {
          profileModal.classList.add('profile-modal--fullscreen');
      } else {
          profileModal.classList.remove('profile-modal--fullscreen');
      }
  }

  function initOverlaySwipeListeners(overlayContainer, profileModal, overlayId) {
      if (profileModal.dataset.swipeInitialized) return;
      profileModal.dataset.swipeInitialized = 'true';
      profileModal._expandPx = 0;

      let startY = 0;
      let dist = 0;
      let isDragging = false;
      let dragMode = null;
      let startExpand = 0;
      let closeOffset = 0;

      const headerEl = () =>
          profileModal.querySelector('.header-wrapper') ||
          profileModal.querySelector('.header');

      const isFromHeader = (target) => {
          const header = headerEl();
          return header && header.contains(target);
      };

      const isInteractive = (target) =>
          !!target.closest(
              'a, button, input, textarea, label, [data-close-overlay], [data-open-overlay], .element-header'
          );

      const onPointerDown = (clientY, target) => {
          if (isInteractive(target) && isFromHeader(target)) {
              dragMode = null;
              isDragging = false;
              return;
          }

          if (!profileModal._baseHeight || !profileModal._fullHeight) {
              measureModalAtRest(profileModal);
          }

          startY = clientY;
          dist = 0;
          closeOffset = 0;
          startExpand = profileModal._expandPx || 0;
          isDragging = true;

          const type = getModalType(profileModal);

          if (isFromHeader(target)) {
              // card: только закрытие с шапки; sheet: expand
              dragMode = type === 'card' ? 'close' : 'expand';
              profileModal.classList.add('profile-modal--dragging');
              profileModal.style.transition = 'none';
              return;
          }

          if ((profileModal._expandPx || 0) <= 0) {
              dragMode = 'close';
              profileModal.style.transition = 'none';
              return;
          }

          dragMode = null;
          isDragging = false;
      };

      const onPointerMove = (clientY, e) => {
          if (!isDragging || !dragMode) return;

          dist = clientY - startY;

          if (dragMode === 'expand') {
              const nextExpand = startExpand - dist;
              if (e && e.cancelable && Math.abs(dist) > 2) e.preventDefault();

              if (nextExpand >= 0) {
                  closeOffset = 0;
                  profileModal.style.transform = 'translateY(0)';
                  applyModalExpand(
                      profileModal,
                      Math.min(nextExpand, profileModal._maxExpand || 0),
                      false
                  );
              } else {
                  closeOffset = -nextExpand;
                  applyModalExpand(profileModal, 0, false);
                  profileModal.style.transition = 'none';
                  profileModal.style.transform = `translateY(${closeOffset}px)`;
              }
              return;
          }

          if (dragMode === 'close' && dist > 0) {
              if (e && e.cancelable) e.preventDefault();
              closeOffset = dist;
              profileModal.style.transform = `translateY(${dist}px)`;
          }
      };

      const onPointerUp = () => {
          if (!isDragging) return;
          isDragging = false;
          profileModal.classList.remove('profile-modal--dragging');

          if (dragMode === 'expand') {
              if (closeOffset > swipeThreshold) {
                  closeOverlay(overlayId);
                  dragMode = null;
                  dist = 0;
                  closeOffset = 0;
                  return;
              }

              if (closeOffset > 0) {
                  profileModal.style.transition = 'transform 0.25s ease-out';
                  profileModal.style.transform = 'translateY(0)';
                  applyModalExpand(profileModal, 0, true);
                  dragMode = null;
                  dist = 0;
                  closeOffset = 0;
                  return;
              }

              const maxExpand = profileModal._maxExpand || 0;
              let target = profileModal._expandPx || 0;
              if (maxExpand > 0) {
                  if (dist < -24) {
                      target = maxExpand;
                  } else if (dist > 24) {
                      target = 0;
                  } else {
                      target = target / maxExpand >= expandSnapRatio ? maxExpand : 0;
                  }
              } else {
                  target = 0;
              }
              applyModalExpand(profileModal, target, true);
              dragMode = null;
              dist = 0;
              closeOffset = 0;
              return;
          }

          if (dragMode === 'close') {
              if (dist > swipeThreshold) {
                  closeOverlay(overlayId);
              } else {
                  profileModal.style.transition = 'transform 0.25s ease-out';
                  profileModal.style.transform = 'translateY(0)';
              }
          }

          dragMode = null;
          dist = 0;
          closeOffset = 0;
      };

      profileModal.addEventListener('touchstart', (e) => {
          if (!e.touches[0]) return;
          onPointerDown(e.touches[0].clientY, e.target);
      }, { passive: true });

      profileModal.addEventListener('touchmove', (e) => {
          if (!e.touches[0]) return;
          onPointerMove(e.touches[0].clientY, e);
      }, { passive: false });

      profileModal.addEventListener('touchend', onPointerUp);
      profileModal.addEventListener('touchcancel', onPointerUp);

      profileModal.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          onPointerDown(e.clientY, e.target);
      });

      window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          onPointerMove(e.clientY, null);
      });

      window.addEventListener('mouseup', () => {
          if (!isDragging) return;
          onPointerUp();
      });
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

function normalizeScreenId(screenId) {
return screenId == null || screenId === '' ? '' : String(screenId);
}

const DOVERY_DESKTOP_BREAKPOINT = 751;

function isDoveryChatListLayout() {
// Список чатов Dovery на планшете/ноуте всегда виден рядом с перепиской
return window.innerWidth >= DOVERY_DESKTOP_BREAKPOINT
  && !!document.getElementById('chats-list');
}

function isDoveryMessagesScreen(screen) {
return !!(screen && (screen.id === 'message-chats' || screen.classList.contains('messages')));
}

function isDoveryProfileScreen(screen) {
return !!(screen && (screen.id === 'profile-screen' || screen.getAttribute('data-screen') === '3'));
}

function isDoveryDevicesScreen(screen) {
return !!(screen && (screen.id === 'devices-screen' || screen.getAttribute('data-screen') === '5'));
}

function isDoveryAccountScreen(screen) {
return !!(screen && (screen.id === 'account-screen' || screen.getAttribute('data-screen') === '6'));
}

function shouldPreserveChatsScroll(screen) {
// Чат, профиль, устройства и аккаунт на desktop не должны блокировать скролл списка чатов
return isDoveryChatListLayout()
  && (isDoveryMessagesScreen(screen)
    || isDoveryProfileScreen(screen)
    || isDoveryDevicesScreen(screen)
    || isDoveryAccountScreen(screen));
}

function isInsetMarginScreen(screen) {
return !!(screen && screen.hasAttribute('data-inset-margin'));
}

function getRevealBehindTargets(screen) {
if (!screen || !screen.hasAttribute('data-reveal-behind')) return [];
const sel = screen.getAttribute('data-reveal-behind');
if (!sel) return [];
return Array.from(document.querySelectorAll(sel));
}

function setRevealBehindProgress(screen, progress, options = {}) {
const targets = getRevealBehindTargets(screen);
if (!targets.length) return;

const p = Math.max(0, Math.min(1, progress));
const animate = options.animate === true;
// Чат может быть «под» профилем даже если профиль вынесен из #message-chats
const host = document.getElementById('message-chats');
if (host) {
  if (p >= 1) host.classList.remove('profile-covering');
  else host.classList.add('profile-covering');
}

targets.forEach((el) => {
  if (!el || el.classList.contains('hidden')) return;
  el.style.transition = animate ? 'opacity 0.18s ease' : 'none';
  el.style.opacity = String(p);
  el.style.pointerEvents = p > 0.95 ? '' : 'none';
});
}

function clearRevealBehind(screen) {
const targets = getRevealBehindTargets(screen);
const host = document.getElementById('message-chats');
if (host) host.classList.remove('profile-covering');
targets.forEach((el) => {
  if (!el) return;
  el.style.opacity = '';
  el.style.pointerEvents = '';
  el.style.transition = '';
});
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
  if (e.target.closest('.tab-container-slider') || e.target.closest('.navbar-slider') || e.target.closest('.navbar-wrapper') || e.target.closest('.tab-header') || e.target.closest('input[type="range"]')) {
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
    const w = topScreen.offsetWidth || window.innerWidth;
    setRevealBehindProgress(topScreen, dist / w);
  }
}, { passive: false });

topScreen.addEventListener('touchend', (e) => {
  if (startX === 0) return;
  e.stopPropagation();
  topScreen.style.transition = 'transform 0.2s ease-out';

  if (isMoving && dist > swipeThreshold) {
    topScreen.style.transform = 'translateX(100%)';
    setRevealBehindProgress(topScreen, 1);
    setTimeout(() => {
      closeActiveScreen(screenId, true);
      resetTouchCoordinates();
    }, 200);
  } else {
    topScreen.style.transform = 'translateX(0)';
    setRevealBehindProgress(topScreen, 0);
    setTimeout(() => {
      topScreen.style.transition = '';
      topScreen.style.overflowY = 'auto'; 
      resetTouchCoordinates();
    }, 200);
  }
});

topScreen.addEventListener('touchcancel', (e) => {
  e.stopPropagation();
  topScreen.style.transition = 'transform 0.2s ease-out';
  topScreen.style.transform = 'translateX(0)';
  setRevealBehindProgress(topScreen, 0);
  setTimeout(() => {
    topScreen.style.transition = '';
    topScreen.style.overflowY = 'auto';
    resetTouchCoordinates();
  }, 200);
});

// --- МЫШИНЫЕ СОБЫТИЯ ДЛЯ ПК (ЗАКРЫТИЕ ЭКРАНА) ---
let isDragging = false;

topScreen.addEventListener('mousedown', (e) => {
  if (e.target.closest('.tab-container-slider') || e.target.closest('.navbar-slider') || e.target.closest('.navbar-wrapper') || e.target.closest('.tab-header') || e.target.closest('input[type="range"]')) {
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
  const w = topScreen.offsetWidth || window.innerWidth;
  setRevealBehindProgress(topScreen, dist / w);
});

const handleMouseUp = () => {
  if (!isDragging) return;
  isDragging = false;
  topScreen.style.transition = 'transform 0.2s ease-out';

  if (dist > swipeThreshold) {
    topScreen.style.transform = 'translateX(100%)';
    setRevealBehindProgress(topScreen, 1);
    setTimeout(() => {
      closeActiveScreen(screenId, true);
      resetTouchCoordinates();
    }, 200);
  } else {
    topScreen.style.transform = 'translateX(0)';
    setRevealBehindProgress(topScreen, 0);
    setTimeout(() => {
      topScreen.style.transition = '';
      resetTouchCoordinates();
    }, 200);
  }
};

topScreen.addEventListener('mouseup', handleMouseUp);
topScreen.addEventListener('mouseleave', handleMouseUp);
}

// Открытие экрана
function openScreen(screenId) {
screenId = normalizeScreenId(screenId);
const screen = document.querySelector(`[data-screen="${screenId}"]`);
if (!screen || !screenId) return;

// Отменяем незавершённое закрытие (иначе finalizeClose снова спрячет экран)
delete screen.dataset.closing;

// Залипшая запись в стеке при скрытом экране — убираем и открываем заново
if (openedScreens[openedScreens.length - 1] === screenId) {
  if (!screen.classList.contains('hidden') && screen.classList.contains('active')) {
    return;
  }
  openedScreens.pop();
}
for (let i = openedScreens.length - 1; i >= 0; i--) {
  if (openedScreens[i] === screenId) openedScreens.splice(i, 1);
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

if (isInsetMarginScreen(screen)) {
  // Отступы задаются CSS (top/left: var(--margin))
  screen.style.top = '';
} else if (parentContainer && window.innerWidth > 600 && !keepChatsScroll) {
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

const revealBehind = screen.hasAttribute('data-reveal-behind');
// Сначала интерфейс виден, затем плавно гаснет вместе со слайдом профиля
if (revealBehind) {
  setRevealBehindProgress(screen, 1);
}

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (screen.dataset.closing === '1') return;
    screen.style.transition = 'transform 0.2s ease-out';
    screen.classList.add('active');
    screen.style.transform = '';
    if (revealBehind) {
      setRevealBehindProgress(screen, 0, { animate: true });
    }
  });
});

initSwipeListeners(screenId);

// Профиль / чат на desktop: явно оставить скролл списка чатов
if (keepChatsScroll && isDoveryChatListLayout()) {
  document.querySelectorAll('.chats').forEach((el) => {
    el.style.overflowY = 'auto';
  });
}
}

// Закрытие экрана
function closeActiveScreen(screenId, isSwiped = false) {
screenId = normalizeScreenId(screenId);
if (!screenId || openedScreens.length === 0) return;

const screen = document.querySelector(`[data-screen="${screenId}"]`);

if (screen) {
  const index = openedScreens.indexOf(screenId);
  if (index !== -1) {
    openedScreens.splice(index, 1);
  }

  screen.dataset.closing = '1';
  const finalizeClose = () => {
    if (screen.dataset.closing !== '1') return;
    delete screen.dataset.closing;
    clearRevealBehind(screen);
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
    // При закрытии кнопкой плавно проявляем интерфейс за профилем
    setRevealBehindProgress(screen, 1, { animate: true });
    screen.style.transition = 'transform 0.2s ease-out';
    screen.style.transform = 'translateX(100%)';
    setTimeout(finalizeClose, 200); 
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

// После профиля на desktop список чатов снова должен скроллиться
if (isDoveryChatListLayout()) {
  document.querySelectorAll('.chats').forEach((el) => {
    el.style.overflowY = 'auto';
  });
}
}

// --- ЗАЩИТА ОТ СДВИГА ЭКРАНОВ ПРИ РЕСАЙЗЕ ---
window.addEventListener('resize', () => {
openedScreens.forEach(screenId => {
  const screen = document.querySelector(`[data-screen="${screenId}"]`);
  if (!screen) return;

  if (isInsetMarginScreen(screen)) {
    screen.style.top = '';
  } else if (window.innerWidth <= 600) {
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
      return s && !isDoveryMessagesScreen(s) && !isDoveryProfileScreen(s);
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

      let sliderContainer = null;
      if (header.parentElement) {
          // слайдер сразу после header-wrapper
          const wrap = header.closest('.header-wrapper') || header.parentElement;
          sliderContainer = wrap.parentElement
              ? wrap.parentElement.querySelector(':scope > .tab-container-slider')
              : null;
      }
      if (!sliderContainer) {
          sliderContainer = mainContainer.querySelector(':scope > .tab-container-slider, :scope > .navbar-slider > .tab-slide > .tab-container-slider');
      }

      // Только прямые слайды этого контейнера (не вложенные navbar .tab-slide)
      const allSlides = sliderContainer
          ? sliderContainer.querySelectorAll(':scope > .tab-slide')
          : [];
      
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

      const setActiveSlide = (activeIndex) => {
          allSlides.forEach((slide, i) => {
              slide.classList.toggle('is-active', i === activeIndex);
          });
      };

      const SLIDE_TRANSITION_MS = 280;
      let slideCollapseTimer = null;

      const setSliderTransform = (offsetStyle, useTransition = true) => {
          allSlides.forEach(slide => {
              slide.style.transition = useTransition ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
              slide.style.transform = offsetStyle;
          });
      };

      const updateTabsState = (targetTabId) => {
          const activeTab = header.querySelector(`[data-tab="${targetTabId}"]`);
          if (!activeTab) return;

          const prevIndex = tabs.findIndex(t => t.classList.contains('actives'));
          const activeIndex = tabs.indexOf(activeTab);

          tabs.forEach(t => t.classList.remove('actives'));
          activeTab.classList.add('actives');

          if (header.classList.contains('adaptive')) {
              // Только внутри tab-header — scrollIntoView двигает navbar-slider и показывает соседний раздел
              const tabLeft = activeTab.offsetLeft;
              const tabWidth = activeTab.offsetWidth;
              const target = tabLeft - (header.clientWidth - tabWidth) / 2;
              const maxScroll = Math.max(0, header.scrollWidth - header.clientWidth);
              header.scrollTo({
                  left: Math.max(0, Math.min(target, maxScroll)),
                  behavior: 'smooth'
              });
          }

          forceRenderCapsule();

          if (allSlides.length === 0 || activeIndex === -1) return;

          // Та же вкладка — без анимации высоты
          if (prevIndex === activeIndex) {
              setActiveSlide(activeIndex);
              setSliderTransform(`translateX(-${activeIndex * 100}%)`, true);
              return;
          }

          // Держим уходящую и новую вкладки видимыми, пока слайд не уедет с экрана
          if (prevIndex >= 0 && allSlides[prevIndex]) {
              allSlides[prevIndex].classList.add('is-active');
          }
          allSlides[activeIndex].classList.add('is-active');
          if (sliderContainer) sliderContainer.classList.add('is-sliding');

          setSliderTransform(`translateX(-${activeIndex * 100}%)`, true);

          clearTimeout(slideCollapseTimer);
          slideCollapseTimer = setTimeout(() => {
              setActiveSlide(activeIndex);
              if (sliderContainer) sliderContainer.classList.remove('is-sliding');
          }, SLIDE_TRANSITION_MS);
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

      // Стартовая активная вкладка — только она задаёт высоту скролла
      {
          const startTab = header.querySelector('.tab.actives') || tabs[0];
          const startIndex = tabs.indexOf(startTab);
          if (startIndex >= 0) {
              setActiveSlide(startIndex);
              if (startIndex > 0) {
                  setSliderTransform(`translateX(-${startIndex * 100}%)`, false);
              }
          }
      }

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
                  // На время свайпа открываем высоту всех слайдов
                  allSlides.forEach((slide) => slide.classList.add('is-active'));
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

              if (isClickIntent) {
                  sliderContainer.classList.remove('is-swiping');
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
              sliderContainer.classList.remove('is-swiping');

              setTimeout(() => {
                  sliderContainer.removeEventListener('click', preventNativeClick, { capture: true });
              }, 10);
          }, { passive: true });

          sliderContainer.addEventListener('pointerleave', () => {
              if (isDragging) {
                  isDragging = false;
                  const activeTab = header.querySelector('.tab.actives') || tabs[0];
                  if (activeTab) updateTabsState(activeTab.getAttribute('data-tab'));
                  sliderContainer.classList.remove('is-swiping');
                  sliderContainer.removeEventListener('click', preventNativeClick, { capture: true });
              }
          }, { passive: true });
      }

      new ResizeObserver(adjustLayout).observe(header.parentElement);
      window.addEventListener('load', adjustLayout);
  });
}

document.addEventListener('DOMContentLoaded', initTabsLogic);

/**
 * Убирает rubber-band / растяжение в конце скролла на iOS/Android
 * для экранов, fullscreen-модалок и вкладок navbar.
 * CSS overscroll-behavior на части WebKit недостаточен.
 */
(function initScrollOverscrollLock() {
  // Чат (.messages-area, column-reverse) НЕ трогаем: scrollTop/atTop на WebKit
  // ломаются и preventDefault глушит пальцевый скролл (колёсико при этом работает).
  const SCROLLER_SELECTOR = [
    '.screen.has-navbar > .navbar-slider > .tab-slide',
    '.page.has-navbar > .navbar-slider > .tab-slide',
    '.screen:not(.messages)',
    '.profile-modal-scroll',
    '.profile-modal'
  ].join(', ');

  let startX = 0;
  let startY = 0;

  function findScrollParent(node) {
    let el = node;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.nodeType === 1 && el.matches?.(SCROLLER_SELECTOR)) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function hasNestedTouchScroller(scroller) {
    if (!scroller || !scroller.querySelector) return false;
    const nested = scroller.querySelector('.messages-area, .tab-slide, .profile-modal-scroll');
    if (!nested || nested === scroller) return false;
    const oy = getComputedStyle(nested).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') return false;
    return nested.scrollHeight > nested.clientHeight + 1;
  }

  document.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      // Не мешаем жестам шапки модалки (растягивание fullscreen)
      if (e.target.closest?.('.profile-modal .header-wrapper')) return;
      // Нативный скролл ленты сообщений / экрана чата
      if (e.target.closest?.('.messages-area, .messages.screen, #message-chats, #chat-content')) return;

      const scroller = findScrollParent(e.target);
      if (!scroller) return;
      // card-модалки без прокрутки — не трогаем
      const modalShell = scroller.closest?.('.profile-modal') ||
          (scroller.classList.contains('profile-modal') ? scroller : null);
      if (modalShell?.matches?.('.profile-modal[data-modal="card"]')) return;

      // Модалка не в режиме прокрутки (не fullscreen / overflow hidden)
      const oy = getComputedStyle(scroller).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') return;

      const y = e.touches[0].clientY;
      const x = e.touches[0].clientX;
      const dy = y - startY;
      const dx = x - startX;

      // Горизонтальный жест (свайп экрана) не трогаем
      if (Math.abs(dx) > Math.abs(dy)) return;

      const scrollTop = scroller.scrollTop;
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop >= maxScroll - 1;

      // У модалки в rest свайп вниз закрывает — не блокируем верхний overscroll
      const isModal = !!modalShell;
      const modalExpanded =
        isModal &&
        (modalShell.classList.contains('profile-modal--fullscreen') ||
          (modalShell._expandPx || 0) > 0);

      if (maxScroll <= 0) {
        if (isModal && !modalExpanded) return;
        // Экран-оболочка без своего скролла, но с вложенным скроллером — не блокируем
        if (hasNestedTouchScroller(scroller)) return;
        if (Math.abs(dy) > 2 && e.cancelable) e.preventDefault();
        return;
      }

      if (atBottom && dy < 0) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      if (atTop && dy > 0) {
        if (isModal && !modalExpanded) return;
        if (e.cancelable) e.preventDefault();
      }
    },
    { passive: false, capture: true }
  );
})();

document.addEventListener('contextmenu', function(event) {
  event.preventDefault();
}, { capture: true });

/** Нижняя кнопка: надёжный press на таче (уменьшение border-radius) */
(function initBottomActionButtons() {
  function setPressed(btn, on) {
    btn.classList.toggle('is-pressed', !!on);
  }

  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.bottom-action-btn');
    if (!btn) return;
    setPressed(btn, true);
  }, { passive: true });

  const clear = (e) => {
    const btn = e.target.closest?.('.bottom-action-btn') || document.querySelector('.bottom-action-btn.is-pressed');
    if (btn) setPressed(btn, false);
  };
  document.addEventListener('pointerup', clear, { passive: true });
  document.addEventListener('pointercancel', clear, { passive: true });
  document.addEventListener('pointerleave', (e) => {
    if (e.target.classList?.contains('bottom-action-btn')) setPressed(e.target, false);
  }, { passive: true });
})();

/** Режимы оптимизации: full / medium / minimal */
(function initOptMode() {
  const STORAGE_KEY = 'tma-opt-mode';
  const MODES = ['full', 'medium', 'minimal'];
  const LABELS = {
    full: 'Полный',
    medium: 'Средний',
    minimal: 'Минимальный'
  };

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function getAndroidVersion() {
    const ua = navigator.userAgent || '';
    // "Android 9", "Android 9.0.0", "Android/9", "Android_9"
    let m = ua.match(/Android[\/\s_-]+(\d+)/i);
    if (m) return parseInt(m[1], 10);
    // запасной разбор: первое число после Android
    m = ua.match(/Android[^\d]*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  /** Политика устройства (игнорирует localStorage) */
  function deviceForcedMode() {
    const android = getAndroidVersion();
    // Android <10 — всегда minimal
    if (android != null && android < 10) return 'minimal';
    // Android без версии в UA (старые WebView) — тоже minimal
    if (isAndroid() && android == null) return 'minimal';
    // Узкие экраны — всегда medium
    if (window.innerWidth < 750) return 'medium';
    return null;
  }

  function defaultOptMode() {
    return deviceForcedMode() || 'full';
  }

  function normalizeMode(mode) {
    return MODES.includes(mode) ? mode : defaultOptMode();
  }

  function applyOptMode(mode) {
    const next = normalizeMode(mode);
    document.documentElement.setAttribute('data-opt-mode', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) { /* ignore */ }

    const btn = document.getElementById('cntxt_menu_btn_10');
    const labelEl = btn && getTargetTextDiv(btn);
    if (labelEl) {
      labelEl.textContent = LABELS[next];
      buttonSelections.set(btn.id, LABELS[next]);
    }
    return next;
  }

  function readStoredMode() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  // Старт: политика устройства важнее сохранённого выбора
  // (из‑за этого на старом Android оставался medium из localStorage)
  function initialMode() {
    const forced = deviceForcedMode();
    if (forced) return forced;
    return normalizeMode(readStoredMode() || 'full');
  }

  applyOptMode(initialMode());

  window.__onMarkMenuSelect = function (buttonId, value) {
    if (buttonId !== 'cntxt_menu_btn_10') return;
    // Ручной выбор разрешён, но на Android <10 / узком снова форсируем при перезагрузке
    applyOptMode(value);
  };

  window.setOptMode = applyOptMode;
  window.getOptMode = () => document.documentElement.getAttribute('data-opt-mode') || 'full';
})();
