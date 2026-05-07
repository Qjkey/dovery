document.addEventListener('DOMContentLoaded', () => {
    const inputContainers = document.querySelectorAll('.input-container');

    inputContainers.forEach(container => {
        const input = container.querySelector('.input-field');
        const clearBtn = container.querySelector('.clear-button');
        const prefix = input.dataset.prefilled || ""; // Получаем префикс, если он есть
        const limit = parseInt(input.dataset.limit) || Infinity; // Лимит символов

        // 1. Инициализация: если есть префикс, устанавливаем его сразу
        if (prefix && !input.value.startsWith(prefix)) {
            input.value = prefix;
        }

        // --- ФУНКЦИИ ПОМОЩНИКИ ---

        // Функция для фиксации курсора (чтобы нельзя было писать внутри префикса)
        const fixCursorPosition = () => {
            if (prefix && input.selectionStart < prefix.length) {
                input.setSelectionRange(prefix.length, prefix.length);
            }
        };

        // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

        // Контроль ввода
        input.addEventListener('input', (e) => {
            // Если попытались удалить префикс - возвращаем его
            if (prefix && !input.value.startsWith(prefix)) {
                input.value = prefix;
            }

            // Проверка лимита символов
            if (input.value.length > limit) {
                input.value = input.value.substring(0, limit);
            }
        });

        // Запрет перемещения курсора в область префикса (мышкой)
        input.addEventListener('click', fixCursorPosition);
        input.addEventListener('focus', fixCursorPosition);
        
        // Запрет перемещения курсора кнопками и попыток удаления префикса
        input.addEventListener('keydown', (e) => {
            // Даем время браузеру обработать нажатие, потом проверяем позицию
            setTimeout(fixCursorPosition, 0);

            // Если курсор стоит сразу после префикса и нажат Backspace - блокируем
            if (prefix && 
                e.key === 'Backspace' && 
                input.selectionStart === prefix.length && 
                input.selectionEnd === prefix.length) {
                e.preventDefault();
            }
        });

        // Кнопка очистки
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                // Если есть префикс, оставляем его, если нет - пустая строка
                input.value = prefix;
                input.focus();
                // Если префикс есть, ставим курсор в конец
                if (prefix) {
                    input.setSelectionRange(prefix.length, prefix.length);
                }
            });
        }
    });
});
