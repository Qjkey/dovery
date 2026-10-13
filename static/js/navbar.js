/**
 * Bottom Navbar:
 * клик по пункту + перетаскивание панели активной вкладки по X.
 * Свайп контента между разделами отключён.
 * Минимум 3, максимум 5 вкладок.
 */
(function () {
  const MIN_TABS = 3;
  const MAX_TABS = 5;

  function initNavbarLogic() {
    const wrappers = document.querySelectorAll('.navbar-wrapper');

    wrappers.forEach((wrapper) => {
      const capsule = wrapper.querySelector('.navbar-capsule');
      if (!capsule) return;

      const items = Array.from(capsule.querySelectorAll('.navbar-item'));
      if (items.length < MIN_TABS || items.length > MAX_TABS) {
        console.warn(
          `[navbar] Ожидается от ${MIN_TABS} до ${MAX_TABS} вкладок, сейчас: ${items.length}`
        );
      }
      if (items.length === 0) return;

      const page =
        wrapper.closest('.screen.has-navbar') ||
        wrapper.closest('.page') ||
        wrapper.parentElement;
      if (!page) return;

      // Только прямой слайдер контейнера — без поиска по всему .page
      const slider = page.querySelector(':scope > .navbar-slider');
      if (!slider) return;

      const slides = Array.from(
        slider.querySelectorAll(':scope > .tab-slide, :scope > .navbar-slide')
      );
      if (slides.length === 0) return;

      let underline = capsule.querySelector('.navbar-underline');
      if (!underline) {
        underline = document.createElement('div');
        underline.className = 'navbar-underline';
        capsule.insertBefore(underline, capsule.firstChild);
      }

      const forceRenderCapsule = () => {
        if (capsule.classList.contains('is-dragging-underline')) return;
        const active = capsule.querySelector('.navbar-item.actives') || items[0];
        if (!active) return;
        const width = active.offsetWidth;
        const left = active.offsetLeft;
        if (width > 0) {
          underline.style.width = width + 'px';
          underline.style.left = left + 'px';
        }
      };

      const setSliderTransform = (offsetStyle, useTransition = true) => {
        slides.forEach((slide) => {
          slide.style.transition = useTransition
            ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
            : 'none';
          slide.style.transform = offsetStyle;
        });
      };

      const updateTabsState = (targetId) => {
        const active = capsule.querySelector(`[data-nav-tab="${targetId}"]`);
        if (!active) return;

        items.forEach((t) => t.classList.remove('actives'));
        active.classList.add('actives');
        forceRenderCapsule();

        const activeIndex = items.indexOf(active);
        if (activeIndex !== -1 && slides.length > 0) {
          setSliderTransform(`translateX(-${activeIndex * 100}%)`, true);
        }
      };

      const findNearestItemByUnderline = () => {
        const center = (parseFloat(underline.style.left) || underline.offsetLeft)
          + (parseFloat(underline.style.width) || underline.offsetWidth) / 2;
        let nearest = items[0];
        let best = Infinity;
        items.forEach((item) => {
          const c = item.offsetLeft + item.offsetWidth / 2;
          const d = Math.abs(c - center);
          if (d < best) {
            best = d;
            nearest = item;
          }
        });
        return nearest;
      };

      const clampUnderlineLeft = (left, width) => {
        const padL = 4;
        const padR = 4;
        const maxLeft = Math.max(padL, capsule.clientWidth - padR - width);
        return Math.min(Math.max(left, padL), maxLeft);
      };

      // --- Клик по пункту ---
      items.forEach((item) => {
        item.addEventListener('click', function (e) {
          if (capsule.dataset.navDidDrag === '1') {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          e.preventDefault();
          const id = this.getAttribute('data-nav-tab');
          if (id) updateTabsState(id);
        });
      });

      // --- Перетаскивание панели активной вкладки по X ---
      let panelDrag = null;
      const panelDragThreshold = 6;

      const onPanelPointerMove = (e) => {
        if (!panelDrag) return;

        const dx = e.clientX - panelDrag.startX;
        const dy = Math.abs(e.clientY - panelDrag.startY);

        if (!panelDrag.active) {
          if (Math.abs(dx) < panelDragThreshold) return;
          // Вертикаль сильнее — отмена
          if (dy > Math.abs(dx)) {
            endPanelDrag(false);
            return;
          }
          panelDrag.active = true;
          capsule.dataset.navDidDrag = '1';
          capsule.classList.add('is-dragging-underline');
          underline.style.transition = 'none';
          try {
            capsule.setPointerCapture(panelDrag.pointerId);
          } catch (_) { /* ignore */ }
        }

        e.preventDefault();
        const nextLeft = clampUnderlineLeft(
          panelDrag.originLeft + dx,
          panelDrag.width
        );
        underline.style.left = nextLeft + 'px';
        underline.style.width = panelDrag.width + 'px';

        // Подсветка целевой вкладки по центру панели
        const nearest = findNearestItemByUnderline();
        items.forEach((t) => t.classList.toggle('nav-drag-over', t === nearest));
      };

      const endPanelDrag = (commit) => {
        if (!panelDrag) return;
        const wasActive = panelDrag.active;
        const pointerId = panelDrag.pointerId;
        panelDrag = null;

        window.removeEventListener('pointermove', onPanelPointerMove);
        window.removeEventListener('pointerup', onPanelPointerUp);
        window.removeEventListener('pointercancel', onPanelPointerUp);

        try {
          if (capsule.hasPointerCapture?.(pointerId)) {
            capsule.releasePointerCapture(pointerId);
          }
        } catch (_) { /* ignore */ }

        capsule.classList.remove('is-dragging-underline');
        items.forEach((t) => t.classList.remove('nav-drag-over'));
        underline.style.transition = '';

        if (wasActive && commit) {
          const nearest = findNearestItemByUnderline();
          const id = nearest.getAttribute('data-nav-tab');
          if (id) updateTabsState(id);
          else forceRenderCapsule();
        } else if (wasActive) {
          forceRenderCapsule();
        }

        setTimeout(() => {
          capsule.dataset.navDidDrag = '0';
        }, 0);
      };

      const onPanelPointerUp = () => {
        endPanelDrag(true);
      };

      capsule.addEventListener(
        'pointerdown',
        (e) => {
          // Не даём свайпу страницы/слайдера перехватывать
          e.stopPropagation();

          if (e.pointerType === 'mouse' && e.button !== 0) return;

          const active = capsule.querySelector('.navbar-item.actives');
          if (!active) return;

          // Тянем только с активной вкладки (панель под ней)
          const hitItem = e.target.closest('.navbar-item');
          if (!hitItem || hitItem !== active) return;

          const width = active.offsetWidth || underline.offsetWidth;
          const left = active.offsetLeft;

          panelDrag = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originLeft: left,
            width,
            active: false
          };
          capsule.dataset.navDidDrag = '0';

          window.addEventListener('pointermove', onPanelPointerMove, { passive: false });
          window.addEventListener('pointerup', onPanelPointerUp, { passive: true });
          window.addEventListener('pointercancel', onPanelPointerUp, { passive: true });
        },
        { capture: true }
      );

      // Стартовое состояние
      const initial =
        capsule.querySelector('.navbar-item.actives') || items[0];
      if (initial && !initial.classList.contains('actives')) {
        initial.classList.add('actives');
      }
      const startIndex = items.indexOf(initial);
      if (startIndex > 0) {
        setSliderTransform(`translateX(-${startIndex * 100}%)`, false);
      }
      forceRenderCapsule();
      requestAnimationFrame(forceRenderCapsule);
      window.addEventListener('load', forceRenderCapsule);
      new ResizeObserver(forceRenderCapsule).observe(capsule);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbarLogic);
  } else {
    initNavbarLogic();
  }
})();
