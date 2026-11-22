(function (root) {
    'use strict';

    class SoundManager {
        constructor() {
            this.muted = localStorage.getItem('carpanga_muted') === '1';
            this.sounds = {};
            this.loading = false;
            this.ready = false;
        }

        preload() {
            if (this.ready || this.loading) return;
            this.loading = true;
            const paths = {
                pop: 'assets/sounds/popsound.wav',
                win: 'assets/sounds/win_sound.wav',
                lose: 'assets/sounds/lose_sound.wav'
            };

            const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http');
            if (isHttp && typeof fetch === 'function') {
                Promise.all(
                    Object.entries(paths).map(async ([key, src]) => {
                        try {
                            const res = await fetch(src);
                            if (!res.ok) return;
                            const blob = await res.blob();
                            const objUrl = URL.createObjectURL(blob);
                            this.sounds[key] = new Audio(objUrl);
                        } catch (_) {
                            // Ignore audio fetch issues
                        }
                    })
                ).finally(() => {
                    this.ready = true;
                    this.loading = false;
                });
            } else {
                for (const [key, src] of Object.entries(paths)) {
                    try {
                        const audio = new Audio(src);
                        audio.preload = 'none';
                        this.sounds[key] = audio;
                    } catch (_) {}
                }
                this.ready = true;
                this.loading = false;
            }
        }

        play(name) {
            if (this.muted) return;
            this.preload();
            const audio = this.sounds[name];
            if (!audio) return;
            try {
                audio.currentTime = 0;
                const promise = audio.play();
                if (promise && typeof promise.catch === 'function') {
                    promise.catch(() => {});
                }
            } catch (_) {
                // Ignore browser autoplay rejection
            }
        }

        isMuted() {
            return this.muted;
        }

        toggleMute() {
            this.muted = !this.muted;
            localStorage.setItem('carpanga_muted', this.muted ? '1' : '0');
            return this.muted;
        }
    }

    root.CarpangaSound = new SoundManager();
}(typeof self !== 'undefined' ? self : this));
