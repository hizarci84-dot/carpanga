(function (root) {
    'use strict';

    const ROWS_LOWER = [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
        ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'BACK'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', 'SPACE', 'DONE']
    ];

    const TR_UPPER_MAP = {
        'i': 'İ',
        'ı': 'I',
        'ğ': 'Ğ',
        'ü': 'Ü',
        'ş': 'Ş',
        'ö': 'Ö',
        'ç': 'Ç'
    };

    function toTrUpper(ch) {
        return TR_UPPER_MAP[ch] || ch.toUpperCase();
    }

    class TouchKeyboard {
        constructor(containerEl) {
            this.container = containerEl;
            this.activeInput = null;
            this.shift = true; // Start with uppercase for proper names
            this.visible = false;
            this.render();
        }

        attachTo(inputEl) {
            this.activeInput = inputEl;
        }

        show(inputEl) {
            if (inputEl) this.activeInput = inputEl;
            this.visible = true;
            this.container.classList.remove('hidden');
            this.render();
        }

        hide() {
            this.visible = false;
            this.container.classList.add('hidden');
        }

        toggle(inputEl) {
            if (this.visible) this.hide();
            else this.show(inputEl);
        }

        handleKey(key) {
            if (!this.activeInput) return;
            const el = this.activeInput;
            const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
            const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;

            if (key === 'SHIFT') {
                this.shift = !this.shift;
                this.render();
                return;
            }
            if (key === 'DONE') {
                this.hide();
                return;
            }
            if (key === 'BACK') {
                if (start > 0 || end > start) {
                    const delStart = start === end ? start - 1 : start;
                    el.value = el.value.slice(0, delStart) + el.value.slice(end);
                    el.setSelectionRange(delStart, delStart);
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            const charToInsert = key === 'SPACE'
                ? ' '
                : (this.shift ? toTrUpper(key) : key);

            el.value = el.value.slice(0, start) + charToInsert + el.value.slice(end);
            const nextPos = start + charToInsert.length;
            el.setSelectionRange(nextPos, nextPos);
            el.dispatchEvent(new Event('input', { bubbles: true }));

            // Auto-lower after first letter of a word
            if (key === 'SPACE') {
                this.shift = true;
                this.render();
            } else if (this.shift && /^[a-zçğıöşü]$/i.test(key)) {
                this.shift = false;
                this.render();
            }
        }

        render() {
            this.container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.className = 'tk-wrap';

            for (const row of ROWS_LOWER) {
                const rowEl = document.createElement('div');
                rowEl.className = 'tk-row';
                for (const key of row) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'tk-key';
                    if (key === 'SHIFT') {
                        btn.classList.add('tk-fn');
                        if (this.shift) btn.classList.add('active');
                        btn.textContent = '⇧';
                    } else if (key === 'BACK') {
                        btn.classList.add('tk-fn', 'tk-wide');
                        btn.textContent = '⌫';
                    } else if (key === 'SPACE') {
                        btn.classList.add('tk-space');
                        btn.textContent = 'Boşluk';
                    } else if (key === 'DONE') {
                        btn.classList.add('tk-done');
                        btn.textContent = 'Tamam';
                    } else {
                        btn.textContent = this.shift ? toTrUpper(key) : key;
                    }

                    btn.addEventListener('pointerdown', (e) => {
                        e.preventDefault(); // Prevent stealing focus from active input
                        this.handleKey(key);
                    });
                    rowEl.appendChild(btn);
                }
                wrap.appendChild(rowEl);
            }
            this.container.appendChild(wrap);
        }
    }

    root.CarpangaTouchKeyboard = TouchKeyboard;
}(typeof self !== 'undefined' ? self : this));
