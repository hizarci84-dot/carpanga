(function (root) {
    'use strict';

    const STORAGE_KEYS = {
        CONFIG: 'carpanga_firebase_config',
        LOCAL_MATCHES: 'carpanga_local_matches',
        PENDING_SYNC: 'carpanga_pending_sync',
        TEACHER_PIN: 'carpanga_teacher_pin',
        RECENT_PLAYERS: 'carpanga_recent_players',
        LAST_CLASSROOM: 'carpanga_last_classroom'
    };

    const COLLECTION_NAME = 'carpanga_matches';
    const DEFAULT_PIN = '1234';

    function generateId() {
        const rand = Math.random().toString(36).slice(2, 8);
        return `m_${Date.now()}_${rand}`;
    }

    function readJsonStorage(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function writeJsonStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (_) {
            return false;
        }
    }

    function isValidFirebaseConfig(cfg) {
        return Boolean(
            cfg &&
            typeof cfg === 'object' &&
            typeof cfg.apiKey === 'string' && cfg.apiKey.trim().length > 5 &&
            typeof cfg.projectId === 'string' && cfg.projectId.trim().length > 1
        );
    }

    /**
     * Parses either strict JSON or a pasted `const firebaseConfig = { ... };` snippet.
     */
    function parseFirebaseConfigInput(rawText) {
        if (!rawText || typeof rawText !== 'string') return null;
        let text = rawText.trim();
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            return null;
        }
        text = text.slice(firstBrace, lastBrace + 1);

        try {
            const direct = JSON.parse(text);
            return isValidFirebaseConfig(direct) ? direct : null;
        } catch (_) {
            // Convert JS object literal syntax to JSON
            try {
                const normalized = text
                    .replace(/\/\/.*$/gm, '')
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
                    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
                    .replace(/,\s*([}\]])/g, '$1');
                const parsed = JSON.parse(normalized);
                return isValidFirebaseConfig(parsed) ? parsed : null;
            } catch (_) {
                return null;
            }
        }
    }

    function ingestConfigFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const fbParam = params.get('fb');
            if (!fbParam) return;
            const decoded = decodeURIComponent(escape(atob(fbParam)));
            const parsed = JSON.parse(decoded);
            if (isValidFirebaseConfig(parsed)) {
                writeJsonStorage(STORAGE_KEYS.CONFIG, parsed);
            }
            params.delete('fb');
            const newQuery = params.toString();
            const cleanUrl = window.location.pathname + (newQuery ? '?' + newQuery : '') + window.location.hash;
            window.history.replaceState({}, document.title, cleanUrl);
        } catch (_) {
            // Ignore malformed URL parameter
        }
    }

    class DatabaseService {
        constructor() {
            ingestConfigFromUrl();
            this.firebaseApp = null;
            this.firestore = null;
            this.fsModule = null;
            this.cloudConnected = false;
            this.lastError = null;
            this.initPromise = null;
        }

        getActiveConfig() {
            const saved = readJsonStorage(STORAGE_KEYS.CONFIG, null);
            if (isValidFirebaseConfig(saved)) return saved;
            const def = root.CARPANGA_DEFAULT_FIREBASE_CONFIG;
            if (isValidFirebaseConfig(def)) return def;
            return null;
        }

        saveConfig(configObj) {
            if (!isValidFirebaseConfig(configObj)) return false;
            writeJsonStorage(STORAGE_KEYS.CONFIG, configObj);
            this.resetConnection();
            return true;
        }

        resetConfig() {
            localStorage.removeItem(STORAGE_KEYS.CONFIG);
            this.resetConnection();
        }

        resetConnection() {
            this.firebaseApp = null;
            this.firestore = null;
            this.cloudConnected = false;
            this.initPromise = null;
            this.lastError = null;
        }

        buildShareableSetupUrl() {
            const cfg = this.getActiveConfig();
            if (!cfg) return null;
            const jsonStr = JSON.stringify(cfg);
            const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
            const base = window.location.origin + window.location.pathname;
            return `${base}?fb=${encodeURIComponent(b64)}`;
        }

        getTeacherPin() {
            return localStorage.getItem(STORAGE_KEYS.TEACHER_PIN) || DEFAULT_PIN;
        }

        setTeacherPin(newPin) {
            if (typeof newPin === 'string' && newPin.trim().length >= 4) {
                localStorage.setItem(STORAGE_KEYS.TEACHER_PIN, newPin.trim());
                return true;
            }
            return false;
        }

        verifyTeacherPin(pin) {
            return String(pin || '').trim() === this.getTeacherPin();
        }

        async initCloud(force = false) {
            if (this.cloudConnected && !force) return true;
            if (this.initPromise && !force) return this.initPromise;

            const cfg = this.getActiveConfig();
            if (!cfg) {
                this.cloudConnected = false;
                return false;
            }

            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                this.cloudConnected = false;
                this.lastError = 'Offline';
                return false;
            }

            this.initPromise = (async () => {
                try {
                    const appMod = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
                    const fsMod = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
                    const appName = `carpanga_${cfg.projectId}`;
                    const existing = appMod.getApps().find(a => a.name === appName);
                    this.firebaseApp = existing || appMod.initializeApp(cfg, appName);
                    this.firestore = fsMod.getFirestore(this.firebaseApp);
                    this.fsModule = fsMod;
                    this.cloudConnected = true;
                    this.lastError = null;
                    return true;
                } catch (err) {
                    this.cloudConnected = false;
                    this.lastError = err && err.message ? err.message : String(err);
                    return false;
                }
            })();

            return this.initPromise;
        }

        async testConnection() {
            this.resetConnection();
            const ok = await this.initCloud(true);
            if (!ok) {
                return { ok: false, error: this.lastError || 'Firebase başlatılamadı.' };
            }
            try {
                const { collection, getDocs, query, limit } = this.fsModule;
                const q = query(collection(this.firestore, COLLECTION_NAME), limit(1));
                await getDocs(q);
                return { ok: true };
            } catch (err) {
                this.cloudConnected = false;
                this.lastError = err && err.message ? err.message : String(err);
                return { ok: false, error: this.lastError };
            }
        }

        getLocalMatches() {
            return readJsonStorage(STORAGE_KEYS.LOCAL_MATCHES, []);
        }

        getPendingSync() {
            return readJsonStorage(STORAGE_KEYS.PENDING_SYNC, []);
        }

        saveRecentPlayerInfo(classroom, names) {
            if (classroom) {
                localStorage.setItem(STORAGE_KEYS.LAST_CLASSROOM, classroom);
            }
            const existing = readJsonStorage(STORAGE_KEYS.RECENT_PLAYERS, []);
            const set = new Set(existing);
            for (const n of names) {
                const trimmed = String(n || '').trim();
                if (trimmed && !trimmed.toLowerCase().includes('bot')) {
                    set.delete(trimmed);
                    set.add(trimmed);
                }
            }
            const updated = Array.from(set).slice(-14).reverse();
            writeJsonStorage(STORAGE_KEYS.RECENT_PLAYERS, updated);
        }

        getRecentPlayers() {
            return readJsonStorage(STORAGE_KEYS.RECENT_PLAYERS, []);
        }

        getLastClassroom() {
            return localStorage.getItem(STORAGE_KEYS.LAST_CLASSROOM) || '';
        }

        async recordMatch(matchInput) {
            const nowMs = Date.now();
            const record = {
                id: matchInput.id || generateId(),
                createdAtMs: nowMs,
                createdAtIso: new Date(nowMs).toISOString(),
                classroom: (matchInput.classroom || '').trim() || 'Genel',
                mode: matchInput.mode || 'duel',
                difficulty: matchInput.difficulty || null,
                player1Name: (matchInput.player1Name || '').trim(),
                player1IsBot: Boolean(matchInput.player1IsBot),
                player2Name: (matchInput.player2Name || '').trim(),
                player2IsBot: Boolean(matchInput.player2IsBot),
                winnerSide: matchInput.winnerSide, // 0, 1, 2
                winnerName: matchInput.winnerName,
                loserName: matchInput.loserName,
                totalTurns: Number(matchInput.totalTurns || 0),
                durationSeconds: Number(matchInput.durationSeconds || 0),
                winningCells: Array.isArray(matchInput.winningCells) ? matchInput.winningCells : [],
                synced: false
            };

            const local = this.getLocalMatches();
            local.unshift(record);
            if (local.length > 1000) local.length = 1000;
            writeJsonStorage(STORAGE_KEYS.LOCAL_MATCHES, local);

            const ready = await this.initCloud();
            if (ready) {
                try {
                    const { doc, setDoc, serverTimestamp } = this.fsModule;
                    await setDoc(doc(this.firestore, COLLECTION_NAME, record.id), {
                        ...record,
                        synced: true,
                        serverCreatedAt: serverTimestamp()
                    });
                    record.synced = true;
                    // Update synced flag locally
                    const refreshed = this.getLocalMatches().map(m => m.id === record.id ? { ...m, synced: true } : m);
                    writeJsonStorage(STORAGE_KEYS.LOCAL_MATCHES, refreshed);
                    return { record, cloudSaved: true };
                } catch (err) {
                    this.lastError = err && err.message ? err.message : String(err);
                }
            }

            // Queue for later sync if cloud wasn't reachable
            if (this.getActiveConfig()) {
                const pending = this.getPendingSync();
                if (!pending.some(p => p.id === record.id)) {
                    pending.push(record);
                    writeJsonStorage(STORAGE_KEYS.PENDING_SYNC, pending);
                }
            }
            return { record, cloudSaved: false };
        }

        async syncPending() {
            const pending = this.getPendingSync();
            if (pending.length === 0) return { syncedCount: 0, remainingCount: 0 };

            const ready = await this.initCloud();
            if (!ready) return { syncedCount: 0, remainingCount: pending.length };

            const { doc, setDoc, serverTimestamp } = this.fsModule;
            const stillPending = [];
            let syncedCount = 0;

            for (const rec of pending) {
                try {
                    await setDoc(doc(this.firestore, COLLECTION_NAME, rec.id), {
                        ...rec,
                        synced: true,
                        serverCreatedAt: serverTimestamp()
                    });
                    syncedCount++;
                } catch (_) {
                    stillPending.push(rec);
                }
            }

            writeJsonStorage(STORAGE_KEYS.PENDING_SYNC, stillPending);

            const syncedIds = new Set(pending.filter(p => !stillPending.some(s => s.id === p.id)).map(p => p.id));
            if (syncedIds.size > 0) {
                const local = this.getLocalMatches().map(m => syncedIds.has(m.id) ? { ...m, synced: true } : m);
                writeJsonStorage(STORAGE_KEYS.LOCAL_MATCHES, local);
            }

            return { syncedCount, remainingCount: stillPending.length };
        }

        async fetchAllMatches() {
            const local = this.getLocalMatches();
            const map = new Map();
            for (const item of local) {
                map.set(item.id, item);
            }

            let fromCloud = false;
            const ready = await this.initCloud();
            if (ready) {
                try {
                    // Best-effort sync pending first
                    await this.syncPending();
                    const { collection, getDocs, query, orderBy, limit } = this.fsModule;
                    const q = query(collection(this.firestore, COLLECTION_NAME), orderBy('createdAtMs', 'desc'), limit(500));
                    const snap = await getDocs(q);
                    snap.forEach(d => {
                        const data = d.data();
                        if (data && data.id) {
                            map.set(data.id, { ...data, synced: true });
                        }
                    });
                    fromCloud = true;
                } catch (err) {
                    this.lastError = err && err.message ? err.message : String(err);
                }
            }

            const merged = Array.from(map.values()).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
            return { matches: merged, fromCloud };
        }

        clearLocalRecords() {
            localStorage.removeItem(STORAGE_KEYS.LOCAL_MATCHES);
            localStorage.removeItem(STORAGE_KEYS.PENDING_SYNC);
        }

        async clearCloudAndLocalRecords() {
            this.clearLocalRecords();
            const ready = await this.initCloud();
            if (!ready) return { cloudCleared: false };
            try {
                const { collection, getDocs, deleteDoc, doc } = this.fsModule;
                const snap = await getDocs(collection(this.firestore, COLLECTION_NAME));
                const deletions = [];
                snap.forEach(d => deletions.push(deleteDoc(doc(this.firestore, COLLECTION_NAME, d.id))));
                await Promise.all(deletions);
                return { cloudCleared: true, deletedCount: deletions.length };
            } catch (err) {
                this.lastError = err && err.message ? err.message : String(err);
                return { cloudCleared: false, error: this.lastError };
            }
        }

        computeLeaderboard(matches, filters = {}) {
            const classroomFilter = filters.classroom && filters.classroom !== 'ALL' ? filters.classroom : null;
            const modeFilter = filters.mode && filters.mode !== 'ALL' ? filters.mode : null;
            const search = (filters.search || '').trim().toLowerCase();

            const filteredMatches = matches.filter(m => {
                if (classroomFilter && (m.classroom || 'Genel') !== classroomFilter) return false;
                if (modeFilter && m.mode !== modeFilter) return false;
                if (search) {
                    const p1 = (m.player1Name || '').toLowerCase();
                    const p2 = (m.player2Name || '').toLowerCase();
                    if (!p1.includes(search) && !p2.includes(search)) return false;
                }
                return true;
            });

            const studentsMap = new Map();

            const ensureStudent = (name, classroom) => {
                const cleanName = (name || '').trim();
                const key = `${cleanName.toLocaleLowerCase('tr-TR')}__${(classroom || 'Genel').toLocaleLowerCase('tr-TR')}`;
                if (!studentsMap.has(key)) {
                    studentsMap.set(key, {
                        name: cleanName,
                        classroom: classroom || 'Genel',
                        played: 0,
                        wins: 0,
                        losses: 0,
                        draws: 0,
                        points: 0,
                        lastPlayedMs: 0
                    });
                }
                return studentsMap.get(key);
            };

            for (const m of filteredMatches) {
                const cls = m.classroom || 'Genel';
                const p1Human = !m.player1IsBot && m.player1Name;
                const p2Human = !m.player2IsBot && m.player2Name;

                if (p1Human) {
                    const s1 = ensureStudent(m.player1Name, cls);
                    s1.played += 1;
                    s1.lastPlayedMs = Math.max(s1.lastPlayedMs, m.createdAtMs || 0);
                    if (m.winnerSide === 1) {
                        s1.wins += 1;
                        s1.points += 3;
                    } else if (m.winnerSide === 2) {
                        s1.losses += 1;
                    } else {
                        s1.draws += 1;
                        s1.points += 1;
                    }
                }

                if (p2Human) {
                    const s2 = ensureStudent(m.player2Name, cls);
                    s2.played += 1;
                    s2.lastPlayedMs = Math.max(s2.lastPlayedMs, m.createdAtMs || 0);
                    if (m.winnerSide === 2) {
                        s2.wins += 1;
                        s2.points += 3;
                    } else if (m.winnerSide === 1) {
                        s2.losses += 1;
                    } else {
                        s2.draws += 1;
                        s2.points += 1;
                    }
                }
            }

            let students = Array.from(studentsMap.values()).map(s => ({
                ...s,
                winRate: s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0
            }));

            if (search) {
                students = students.filter(s => s.name.toLowerCase().includes(search));
            }

            students.sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                if (b.wins !== a.wins) return b.wins - a.wins;
                if (b.winRate !== a.winRate) return b.winRate - a.winRate;
                return b.played - a.played;
            });

            const classrooms = Array.from(new Set(matches.map(m => m.classroom || 'Genel'))).sort((a, b) => a.localeCompare(b, 'tr'));

            return {
                filteredMatches,
                students,
                classrooms
            };
        }

        exportCsv(filename, headers, rows) {
            const esc = (val) => {
                const s = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
                return `"${s}"`;
            };
            const csvLines = [
                headers.map(esc).join(';'),
                ...rows.map(r => r.map(esc).join(';'))
            ];
            const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    root.CarpangaDB = new DatabaseService();
    root.CarpangaDBUtils = {
        parseFirebaseConfigInput,
        isValidFirebaseConfig
    };
}(typeof self !== 'undefined' ? self : this));
