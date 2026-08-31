(function () {
    const OUTPUT_SIZE = 512;
    const MIN_SCALE = 0.01;
    const MAX_SCALE = 6;

    let screenEl = null;
    let viewportEl = null;
    let imgEl = null;
    let backBtn = null;
    let acceptBtn = null;

    let imgNaturalW = 0;
    let imgNaturalH = 0;
    let cropRadius = 140;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let objectUrl = null;

    let activeResolve = null;
    let activeReject = null;

    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOriginX = 0;
    let dragOriginY = 0;

    let pinchStartDistance = 0;
    let pinchStartScale = 1;

    function ensureScreen() {
        if (screenEl) return;

        screenEl = document.createElement('div');
        screenEl.id = 'avatar-crop-screen';
        screenEl.className = 'avatar-crop-screen';
        screenEl.innerHTML = `
            <div class="avatar-crop-viewport" id="avatar-crop-viewport">
                <div class="avatar-crop-stage">
                    <img class="avatar-crop-image" id="avatar-crop-image" alt="" draggable="false">
                </div>
                <div class="avatar-crop-mask" id="avatar-crop-mask"></div>
            </div>
            <div class="header-wrapper">
                <div class="header">
                    <div class="header-left">
                        <div class="header-capsule one-btn" id="avatar-crop-back" title="Назад">
                            <div class="element-header">
                                <svg class="back"><use href="#back"></use></svg>
                            </div>
                        </div>
                    </div>
                    <div class="header-center"></div>
                    <div class="header-right">
                        <div class="header-capsule one-btn" id="avatar-crop-accept" title="Принять">
                            <div class="element-header">
                                <svg class="check"><use href="#check"></use></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(screenEl);

        viewportEl = screenEl.querySelector('#avatar-crop-viewport');
        imgEl = screenEl.querySelector('#avatar-crop-image');
        backBtn = screenEl.querySelector('#avatar-crop-back');
        acceptBtn = screenEl.querySelector('#avatar-crop-accept');

        backBtn.addEventListener('click', () => close(false));
        acceptBtn.addEventListener('click', () => {
            exportCroppedBlob()
                .then((blob) => close(true, blob))
                .catch((err) => {
                    console.error(err);
                    close(false);
                });
        });

        viewportEl.addEventListener('pointerdown', onPointerDown);
        viewportEl.addEventListener('pointermove', onPointerMove);
        viewportEl.addEventListener('pointerup', onPointerUp);
        viewportEl.addEventListener('pointercancel', onPointerUp);
        viewportEl.addEventListener('wheel', onWheel, { passive: false });

        window.addEventListener('resize', onResize);
    }

    function computeCropRadius() {
        if (!viewportEl) return 140;
        const rect = viewportEl.getBoundingClientRect();
        const minSide = Math.min(rect.width, rect.height);
        return Math.max(120, Math.floor(minSide * 0.42));
    }

    function fitScaleForCrop() {
        if (!imgNaturalW || !imgNaturalH) return 1;
        return Math.min(cropRadius * 2 / imgNaturalW, cropRadius * 2 / imgNaturalH);
    }

    function minScaleForCrop() {
        return Math.max(MIN_SCALE, fitScaleForCrop());
    }

    function clampOffsets() {
        const halfW = (imgNaturalW * scale) / 2;
        const halfH = (imgNaturalH * scale) / 2;

        if (halfW >= cropRadius) {
            offsetX = Math.min(halfW - cropRadius, Math.max(cropRadius - halfW, offsetX));
        } else {
            const limitX = cropRadius - halfW;
            offsetX = Math.min(limitX, Math.max(-limitX, offsetX));
        }

        if (halfH >= cropRadius) {
            offsetY = Math.min(halfH - cropRadius, Math.max(cropRadius - halfH, offsetY));
        } else {
            const limitY = cropRadius - halfH;
            offsetY = Math.min(limitY, Math.max(-limitY, offsetY));
        }
    }

    function clampScale(nextScale) {
        return Math.min(MAX_SCALE, Math.max(minScaleForCrop(), nextScale));
    }

    function applyTransform() {
        clampOffsets();
        imgEl.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
    }

    function resetTransform() {
        scale = minScaleForCrop();
        offsetX = 0;
        offsetY = 0;
        applyTransform();
    }

    function updateCropUi() {
        cropRadius = computeCropRadius();
        viewportEl.style.setProperty('--avatar-crop-radius', `${cropRadius}px`);
        scale = clampScale(scale);
        applyTransform();
    }

    function onResize() {
        if (!screenEl?.classList.contains('active')) return;
        updateCropUi();
    }

    function pointerDistance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.hypot(dx, dy);
    }

    function getTrackedPointers() {
        if (!viewportEl._pointers) viewportEl._pointers = new Map();
        return viewportEl._pointers;
    }

    function onPointerDown(event) {
        event.preventDefault();
        const pointers = getTrackedPointers();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        viewportEl.setPointerCapture(event.pointerId);

        if (pointers.size === 1) {
            dragPointerId = event.pointerId;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            dragOriginX = offsetX;
            dragOriginY = offsetY;
        } else if (pointers.size === 2) {
            const pts = [...pointers.values()];
            pinchStartDistance = pointerDistance(pts[0], pts[1]);
            pinchStartScale = scale;
            dragPointerId = null;
        }
    }

    function onPointerMove(event) {
        const pointers = getTrackedPointers();
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size >= 2) {
            const pts = [...pointers.values()];
            const dist = pointerDistance(pts[0], pts[1]);
            if (pinchStartDistance > 0) {
                const nextScale = clampScale(pinchStartScale * (dist / pinchStartDistance));
                scale = nextScale;
                applyTransform();
            }
            return;
        }

        if (dragPointerId !== event.pointerId) return;
        offsetX = dragOriginX + (event.clientX - dragStartX);
        offsetY = dragOriginY + (event.clientY - dragStartY);
        applyTransform();
    }

    function onPointerUp(event) {
        const pointers = getTrackedPointers();
        pointers.delete(event.pointerId);
        if (viewportEl.hasPointerCapture(event.pointerId)) {
            viewportEl.releasePointerCapture(event.pointerId);
        }
        if (dragPointerId === event.pointerId) dragPointerId = null;

        if (pointers.size === 1) {
            const remaining = [...pointers.entries()][0];
            dragPointerId = remaining[0];
            dragStartX = remaining[1].x;
            dragStartY = remaining[1].y;
            dragOriginX = offsetX;
            dragOriginY = offsetY;
        }

        if (pointers.size >= 2) {
            const pts = [...pointers.values()];
            pinchStartDistance = pointerDistance(pts[0], pts[1]);
            pinchStartScale = scale;
        } else {
            pinchStartDistance = 0;
        }
    }

    function onWheel(event) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        scale = clampScale(scale * (1 + delta));
        applyTransform();
    }

    function exportCroppedBlob() {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = OUTPUT_SIZE;
            canvas.height = OUTPUT_SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('canvas_unavailable'));
                return;
            }

            const exportScale = OUTPUT_SIZE / (cropRadius * 2);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
            ctx.save();
            ctx.beginPath();
            ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.translate(OUTPUT_SIZE / 2 + offsetX * exportScale, OUTPUT_SIZE / 2 + offsetY * exportScale);
            ctx.scale(scale * exportScale, scale * exportScale);
            ctx.drawImage(imgEl, -imgNaturalW / 2, -imgNaturalH / 2, imgNaturalW, imgNaturalH);
            ctx.restore();

            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('export_failed'));
                    return;
                }
                resolve(blob);
            }, 'image/jpeg', 0.92);
        });
    }

    function cleanup() {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
        imgEl.removeAttribute('src');
        imgEl.style.transform = '';
        getTrackedPointers().clear();
        dragPointerId = null;
        pinchStartDistance = 0;
        screenEl.classList.remove('active');
        document.body.style.overflow = '';
    }

    function close(accepted, blob) {
        const resolve = activeResolve;
        const reject = activeReject;
        activeResolve = null;
        activeReject = null;

        cleanup();

        if (accepted && blob && resolve) {
            const fileName = `avatar_${Date.now()}.jpg`;
            resolve(new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() }));
        } else if (reject) {
            reject(new Error('cancelled'));
        }
    }

    function openAvatarCrop(file) {
        if (!file) return Promise.reject(new Error('no_file'));
        ensureScreen();

        return new Promise((resolve, reject) => {
            if (activeResolve) {
                reject(new Error('crop_busy'));
                return;
            }

            activeResolve = resolve;
            activeReject = reject;

            objectUrl = URL.createObjectURL(file);
            imgEl.onload = () => {
                imgNaturalW = imgEl.naturalWidth;
                imgNaturalH = imgEl.naturalHeight;
                imgEl.style.width = `${imgNaturalW}px`;
                imgEl.style.height = `${imgNaturalH}px`;
                resetTransform();
                screenEl.classList.add('active');
                document.body.style.overflow = 'hidden';
                requestAnimationFrame(updateCropUi);
            };
            imgEl.onerror = () => close(false);
            imgEl.src = objectUrl;
        });
    }

    window.openAvatarCrop = openAvatarCrop;
})();
