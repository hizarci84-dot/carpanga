(function (root) {
    'use strict';

    const STORAGE_KEYS = {
        CONFIG: 'carpanga_firebase_config',
        LOCAL_MATCHES: 'carpanga_local_matches',
        PENDING_SYNC: 'carpanga_pending_sync',
        TEACHER_PIN_HASH: 'carpanga_teacher_pin_hash_v2',
        RECENT_PLAYERS: 'carpanga_recent_players',
        LAST_CLASSROOM: 'carpanga_last_classroom'
    };

    const COLLECTION_NAME = 'carpanga_matches';
    const PIN_SALT = 'carpanga-pin-v1:';
    const DEFAULT_PIN_HASH = 'cecfc6e26627aeed9b714d71f7c5557359e9ea7366818effb6855756ad397fc7';

    function storageGet(key) {
        try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        } catch (_) {
            return null;
        }
    }

    function storageSet(key, val) {
        try {
            if (typeof localStorage === 'undefined') return false;
            localStorage.setItem(key, val);
            return true;
        } catch (_) {
            return false;
        }
    }

    function storageRemove(key) {
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        } catch (_) {
            // ignore
        }
    }

    function sha256Hex(input) {
        const msg = unescape(encodeURIComponent(String(input)));
        const words = [];
        const bitLen = msg.length * 8;
        for (let i = 0; i < msg.length; i++) {
            words[i >> 2] |= (msg.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
        }
        words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
        const paddedLen = (((bitLen + 64) >> 9) << 4) + 16;
        while (words.length < paddedLen) words.push(0);
        words[paddedLen - 1] = bitLen;

        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        const H = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];
        const rotr = (n, x) => (x >>> n) | (x << (32 - n));
        const W = new Array(64);
        for (let i = 0; i < words.length; i += 16) {
            let [a, b, c, d, e, f, g, h] = H;
            for (let t = 0; t < 64; t++) {
                if (t < 16) {
                    W[t] = words[i + t] | 0;
                } else {
                    const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
                    const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
                    W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
                }
                const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
                const ch = (e & f) ^ (~e & g);
                const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
                const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (S0 + maj) | 0;
                h = g; g = f; f = e; e = (d + temp1) | 0;
                d = c; c = b; b = a; a = (temp1 + temp2) | 0;
            }
            H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
        }
        return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
    }

    function hashTeacherPin(pin) {
        return sha256Hex(PIN_SALT + String(pin === null || pin === undefined ? '' : pin).trim());
    }

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
            storageRemove('carpanga_teacher_pin');
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

        getTeacherPinHash() {
            return storageGet(STORAGE_KEYS.TEACHER_PIN_HASH) || DEFAULT_PIN_HASH;
        }

        hasCustomTeacherPin() {
            return Boolean(storageGet(STORAGE_KEYS.TEACHER_PIN_HASH));
        }

        setTeacherPin(newPin) {
            if (typeof newPin !== 'string') return false;
            const trimmed = newPin.trim();
            if (trimmed.length < 4 || trimmed.length > 24) return false;
            return storageSet(STORAGE_KEYS.TEACHER_PIN_HASH, hashTeacherPin(trimmed));
        }

        resetTeacherPin() {
            storageRemove(STORAGE_KEYS.TEACHER_PIN_HASH);
        }

        verifyTeacherPin(pin) {
            const candidate = String(pin === null || pin === undefined ? '' : pin).trim();
            if (!candidate) return false;
            return hashTeacherPin(candidate) === this.getTeacherPinHash();
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
                    // Keep only unsynced pending records locally; do not resurrect deleted cloud records
                    for (const pend of this.getPendingSync()) {
                        if (pend && pend.id && !map.has(pend.id)) {
                            map.set(pend.id, pend);
                        }
                    }
                    fromCloud = true;
                } catch (err) {
                    this.lastError = err && err.message ? err.message : String(err);
                }
            }

            if (!fromCloud) {
                for (const item of local) {
                    if (item && item.id) map.set(item.id, item);
                }
            }

            const merged = Array.from(map.values()).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
            if (fromCloud) {
                writeJsonStorage(STORAGE_KEYS.LOCAL_MATCHES, merged.slice(0, 200));
            }
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

            const classrooms = Array.from(new Set(matches.map(m => m.classroom || 'Genel'))).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));

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
        isValidFirebaseConfig,
        sha256Hex,
        hashTeacherPin
    };
}(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this));
