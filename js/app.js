(function () {
    'use strict';

    const { GameEngine } = window.CarpangaEngine;
    const { t, setLanguage, getLanguage } = window.CarpangaI18n;
    const Sound = window.CarpangaSound;
    const DB = window.CarpangaDB;
    const { parseFirebaseConfigInput } = window.CarpangaDBUtils;
    const TutorialSteps = window.CarpangaTutorialSteps;
    const TouchKeyboard = window.CarpangaTouchKeyboard;

    const state = {
        view: 'menu',
        mode: 'duel', // 'duel' | 'single' | 'timed' | 'tutorial'
        pendingSetupMode: 'duel',
        botLevel: 2,
        classroom: '',
        player1Name: '',
        player2Name: '',
        engine: null,
        rotateTabletop: false,
        matchStartMs: 0,
        turnTimerId: null,
        turnRemainingSec: 30,
        botTimeoutId: null,
        tutorialStepIdx: 0,
        tutorialLock: false,
        tutorialTimeouts: [],
        lastFocusedInput: null,
        lastCapturedValue: null,
        activeHints: {
            availMoves: [],
            availCells: [],
            fatalMoves: []
        },
        cachedMatches: [],
        lbTab: 'students',
        touchKb: null
    };

    const dom = {};

    function $(id) {
        return document.getElementById(id);
    }

    function cacheDom() {
        const ids = [
            'viewMenu', 'viewGame', 'brandHomeBtn', 'gameStatusBanner',
            'turnBadge', 'turnBadgeText', 'lastPickBadge', 'lastPickValue',
            'timerBadge', 'timerValue', 'btnDbStatus', 'dbDot', 'dbStatusLabel',
            'btnRotateMode', 'btnRestartGame', 'btnBackToMenu', 'btnSoundToggle',
            'soundGlyph', 'btnLangToggle', 'langTag', 'btnFullscreen', 'fullscreenGlyph',
            'btnMenuDuel', 'btnMenuSingle', 'btnMenuTimed', 'btnMenuTutorial',
            'btnMenuLeaderboard', 'btnMenuTeacher', 'menuStatMatches', 'menuStatStudents',
            'menuMiniLeaders', 'menuPendingBadge',
            'arenaLayout', 'panelP1', 'panelP2', 'p1DisplayName', 'p1SubInfo',
            'p2DisplayName', 'p2SubInfo', 'padP1', 'padP2', 'boardWrapper', 'boardGrid',
            'tutorialFullOverlay', 'tutorialFullText', 'tutorialContinueHint',
            'helperBar', 'helperBarText', 'btnTutorialNext', 'hintsBar',
            'btnHintAvailable', 'btnHintFatal', 'btnHintAuto',
            'lblHintAvailable', 'lblHintFatal', 'lblHintAuto',
            'modalSetup', 'setupModalTitle', 'setupForm', 'inputClassroom',
            'groupDifficulty', 'diffPills', 'inputPlayer1', 'labelPlayer1',
            'groupPlayer2', 'inputPlayer2', 'recentPlayersBox', 'recentChips',
            'setupError', 'btnToggleTouchKeyboard', 'touchKeyboardContainer',
            'modalGamePopup', 'popupIcon', 'popupTitle', 'popupSummary',
            'popupDbBadge', 'popupActions',
            'modalLeaderboard', 'lbFilterClassroom', 'lbFilterMode', 'lbSearchInput',
            'lbStatMatches', 'lbStatStudents', 'lbStatPending', 'btnLbSync',
            'btnLbRefresh', 'btnLbExport', 'btnLbClear', 'lbTableWrap',
            'modalTeacher', 'cfgStatusDot', 'cfgStatusText', 'txtFirebaseConfig',
            'inputTeacherPin', 'cfgFeedback', 'btnCfgSaveTest', 'btnCfgCopyLink', 'btnCfgReset'
        ];
        for (const id of ids) {
            dom[id] = $(id);
        }
    }

    // ==================== LOCALIZATION & GLOBAL UI ====================
    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = t(key);
        });
        dom.langTag.textContent = getLanguage().toUpperCase();
        dom.soundGlyph.textContent = Sound.isMuted() ? '🔇' : '🔊';
        dom.btnSoundToggle.title = Sound.isMuted() ? t('menu_sound_off') : t('menu_sound_on');
        dom.btnRotateMode.title = t('hud_btn_rotate');
        dom.btnRestartGame.title = t('hud_btn_restart');
        dom.btnBackToMenu.title = t('hud_btn_menu');
        dom.inputClassroom.placeholder = t('setup_classroom_placeholder');
        dom.inputPlayer1.placeholder = t('setup_player1_placeholder');
        dom.inputPlayer2.placeholder = t('setup_player2_placeholder');
        dom.lbSearchInput.placeholder = t('lb_search_placeholder');
        updateDbStatusUI();
        if (state.view === 'game' && state.engine) {
            renderGameUI();
        }
    }

    function updateDbStatusUI() {
        const online = DB.cloudConnected;
        dom.dbDot.className = 'db-dot ' + (online ? 'online' : 'offline');
        dom.dbStatusLabel.textContent = online ? 'Firebase' : (getLanguage() === 'tr' ? 'Yerel Mod' : 'Local Mode');
        dom.cfgStatusDot.className = 'db-dot ' + (online ? 'online' : 'offline');
        dom.cfgStatusText.textContent = online ? t('cfg_status_connected') : t('cfg_status_offline');
    }

    function switchView(viewName) {
        state.view = viewName;
        dom.viewMenu.classList.toggle('active', viewName === 'menu');
        dom.viewGame.classList.toggle('active', viewName === 'game');

        const inGame = viewName === 'game';
        dom.gameStatusBanner.classList.toggle('hidden', !inGame);
        dom.btnBackToMenu.classList.toggle('hidden', !inGame);
        dom.btnRestartGame.classList.toggle('hidden', !inGame || state.mode === 'tutorial');
        dom.btnRotateMode.classList.toggle('hidden', !inGame || state.mode !== 'duel');

        if (!inGame) {
            clearTimers();
            refreshMenuStats();
        }
    }

    function openModal(id) {
        $(id).classList.remove('hidden');
    }

    function closeModal(id) {
        $(id).classList.add('hidden');
        if (id === 'modalSetup' && state.touchKb) {
            state.touchKb.hide();
        }
    }

    function clearTimers() {
        if (state.turnTimerId) {
            clearInterval(state.turnTimerId);
            state.turnTimerId = null;
        }
        if (state.botTimeoutId) {
            clearTimeout(state.botTimeoutId);
            state.botTimeoutId = null;
        }
        for (const tid of state.tutorialTimeouts) {
            clearTimeout(tid);
        }
        state.tutorialTimeouts = [];
    }

    // ==================== MENU STATS ====================
    async function refreshMenuStats() {
        const { matches } = await DB.fetchAllMatches();
        state.cachedMatches = matches;
        updateDbStatusUI();

        const { students } = DB.computeLeaderboard(matches);
        dom.menuStatMatches.textContent = String(matches.length);
        dom.menuStatStudents.textContent = String(students.length);

        const pending = DB.getPendingSync().length;
        if (pending > 0) {
            dom.menuPendingBadge.hidden = false;
            dom.menuPendingBadge.textContent = `${pending} bekliyor`;
        } else {
            dom.menuPendingBadge.hidden = true;
        }

        if (students.length === 0) {
            dom.menuMiniLeaders.innerHTML = `<p class="mini-empty">${t('lb_empty')}</p>`;
        } else {
            const top3 = students.slice(0, 3);
            dom.menuMiniLeaders.innerHTML = top3.map((s, idx) => `
                <div class="mini-leader-row">
                    <span class="ml-name">${idx + 1}. ${escapeHtml(s.name)} <small style="color:#64748b">(${escapeHtml(s.classroom)})</small></span>
                    <span class="ml-score">${s.wins}G / ${s.losses}M • ${s.points}p</span>
                </div>
            `).join('');
        }
    }

    // ==================== SETUP MODAL ====================
    function openSetupModal(mode) {
        state.pendingSetupMode = mode;
        dom.setupError.classList.add('hidden');
        dom.inputClassroom.value = DB.getLastClassroom() || '';
        dom.inputPlayer1.value = '';
        dom.inputPlayer2.value = '';

        const isDuel = mode === 'duel';
        dom.groupPlayer2.classList.toggle('hidden', !isDuel);
        dom.inputPlayer2.required = isDuel;
        dom.groupDifficulty.classList.toggle('hidden', isDuel);

        if (mode === 'duel') {
            dom.setupModalTitle.textContent = t('setup_title_duel');
            dom.labelPlayer1.textContent = t('setup_player1_label');
        } else if (mode === 'single') {
            dom.setupModalTitle.textContent = t('setup_title_single');
            dom.labelPlayer1.textContent = t('setup_student_label');
        } else {
            dom.setupModalTitle.textContent = t('setup_title_timed');
            dom.labelPlayer1.textContent = t('setup_student_label');
        }

        // Difficulty selection pills
        dom.diffPills.querySelectorAll('.diff-pill').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.level) === state.botLevel);
        });

        // Recent player chips
        const recent = DB.getRecentPlayers();
        if (recent.length > 0) {
            dom.recentPlayersBox.hidden = false;
            dom.recentChips.innerHTML = '';
            recent.forEach(name => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'recent-chip';
                chip.textContent = name;
                chip.addEventListener('click', () => {
                    let target = state.lastFocusedInput;
                    if (!target || (target !== dom.inputPlayer1 && target !== dom.inputPlayer2)) {
                        target = (!dom.inputPlayer1.value.trim() || !isDuel) ? dom.inputPlayer1 : dom.inputPlayer2;
                    }
                    target.value = name;
                    if (isDuel && target === dom.inputPlayer1 && !dom.inputPlayer2.value.trim()) {
                        state.lastFocusedInput = dom.inputPlayer2;
                    }
                });
                dom.recentChips.appendChild(chip);
            });
        } else {
            dom.recentPlayersBox.hidden = true;
        }

        state.lastFocusedInput = dom.inputPlayer1;
        state.touchKb.attachTo(dom.inputPlayer1);
        openModal('modalSetup');
        setTimeout(() => dom.inputPlayer1.focus(), 60);
    }

    function handleSetupSubmit(e) {
        e.preventDefault();
        const mode = state.pendingSetupMode;
        const classroom = dom.inputClassroom.value.trim() || 'Genel';
        const p1 = dom.inputPlayer1.value.trim();
        const p2 = mode === 'duel' ? dom.inputPlayer2.value.trim() : t('hud_player_bot');

        if (!p1 || (mode === 'duel' && !p2)) {
            dom.setupError.textContent = t('setup_name_required');
            dom.setupError.classList.remove('hidden');
            return;
        }

        if (mode === 'duel' && p1.toLocaleLowerCase('tr-TR') === p2.toLocaleLowerCase('tr-TR')) {
            dom.setupError.textContent = t('setup_same_name_warning');
            dom.setupError.classList.remove('hidden');
            return;
        }

        DB.saveRecentPlayerInfo(classroom, mode === 'duel' ? [p1, p2] : [p1]);
        closeModal('modalSetup');

        startMatch({
            mode,
            botLevel: state.botLevel,
            classroom,
            player1Name: p1,
            player2Name: mode === 'duel' ? p2 : `${t('hud_player_bot')} (${getDifficultyLabel(state.botLevel)})`
        });
    }

    function getDifficultyLabel(level) {
        const map = {
            1: 'maingame_level_easy',
            2: 'maingame_level_medium',
            3: 'maingame_level_hard',
            4: 'maingame_level_master'
        };
        return t(map[level] || 'maingame_level_medium');
    }

    // ==================== GAME START & RENDER ====================
    function startMatch({ mode, botLevel, classroom, player1Name, player2Name }) {
        clearTimers();
        Sound.preload();

        state.mode = mode;
        state.botLevel = botLevel || 2;
        state.classroom = classroom || 'Genel';
        state.player1Name = player1Name;
        state.player2Name = player2Name;
        state.rotateTabletop = false;
        state.lastCapturedValue = null;
        state.activeHints = { availMoves: [], availCells: [], fatalMoves: [] };
        state.matchStartMs = Date.now();

        state.engine = new GameEngine({
            mode,
            botLevel: state.botLevel,
            startingPlayer: mode === 'tutorial' ? 2 : 'random'
        });

        dom.btnRotateMode.classList.remove('active');
        dom.arenaLayout.classList.remove('rotated-p2');
        dom.tutorialFullOverlay.classList.add('hidden');
        dom.panelP1.classList.remove('hidden');
        dom.panelP2.classList.remove('hidden');
        dom.boardGrid.classList.remove('hidden');

        if (mode === 'tutorial') {
            dom.hintsBar.classList.add('hidden');
            dom.timerBadge.classList.add('hidden');
            dom.helperBar.classList.add('tutorial-active');
            dom.btnTutorialNext.classList.remove('hidden');
            switchView('game');
            buildBoardAndPads();
            initTutorialFlow();
            return;
        }

        dom.hintsBar.classList.remove('hidden');
        dom.helperBar.classList.remove('tutorial-active');
        dom.btnTutorialNext.classList.add('hidden');
        dom.timerBadge.classList.toggle('hidden', mode !== 'timed');

        switchView('game');
        buildBoardAndPads();
        renderGameUI();

        if (mode === 'timed') {
            resetTurnTimer();
        }

        if ((mode === 'single' || mode === 'timed') && state.engine.currentPlayer === 2) {
            scheduleBotMove();
        }
    }

    function buildBoardAndPads() {
        // Build 6x6 board
        dom.boardGrid.innerHTML = '';
        state.engine.gridElements.forEach(cell => {
            const div = document.createElement('div');
            div.className = 'grid-cell';
            div.dataset.value = String(cell.value);
            div.dataset.row = String(cell.row);
            div.dataset.col = String(cell.col);
            const span = document.createElement('span');
            span.className = 'cell-text';
            span.textContent = String(cell.value);
            div.appendChild(span);
            dom.boardGrid.appendChild(div);
        });

        // Build 1-9 pads for P1 and P2
        buildDigitPad(dom.padP1, 1);
        buildDigitPad(dom.padP2, 2);
    }

    function buildDigitPad(container, playerNum) {
        container.innerHTML = '';
        for (let d = 1; d <= 9; d++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'digit-btn';
            btn.dataset.digit = String(d);
            btn.dataset.player = String(playerNum);
            const span = document.createElement('span');
            span.textContent = String(d);
            btn.appendChild(span);
            btn.addEventListener('click', () => onDigitClicked(playerNum, d));
            container.appendChild(btn);
        }
    }

    function renderGameUI() {
        const eng = state.engine;
        if (!eng) return;

        // Player cards
        dom.p1DisplayName.textContent = state.player1Name;
        dom.p1SubInfo.textContent = state.classroom ? `${state.classroom} • Mavi` : 'Mavi';
        dom.p2DisplayName.textContent = state.player2Name;
        dom.p2SubInfo.textContent = state.mode === 'duel'
            ? (state.classroom ? `${state.classroom} • Kırmızı` : 'Kırmızı')
            : getDifficultyLabel(state.botLevel);

        const isP1Turn = eng.currentPlayer === 1;
        dom.panelP1.classList.toggle('active-turn', eng.status === 'playing' && isP1Turn);
        dom.panelP1.classList.toggle('inactive-turn', eng.status === 'playing' && !isP1Turn);
        dom.panelP2.classList.toggle('active-turn', eng.status === 'playing' && !isP1Turn);
        dom.panelP2.classList.toggle('inactive-turn', eng.status === 'playing' && isP1Turn);

        // Tabletop rotation in duel mode
        const shouldRotate = state.mode === 'duel' && state.rotateTabletop && eng.currentPlayer === 2;
        dom.arenaLayout.classList.toggle('rotated-p2', shouldRotate);

        // Top status pills
        const activeName = isP1Turn ? state.player1Name : state.player2Name;
        dom.turnBadgeText.textContent = `${t('hud_turn_label')}: ${activeName}`;
        dom.turnBadge.classList.toggle('p2-active', !isP1Turn);
        dom.lastPickValue.textContent = eng.lastPlayerMove > 0 ? String(eng.lastPlayerMove) : '—';

        // Helper bar (when not in tutorial)
        if (state.mode !== 'tutorial') {
            if (eng.status === 'playing' && (state.mode === 'single' || state.mode === 'timed') && eng.currentPlayer === 2) {
                dom.helperBarText.textContent = t('hud_bot_thinking');
            } else if (eng.lastPlayerMove === 0) {
                dom.helperBarText.textContent = t('hud_first_move_tip');
            } else {
                dom.helperBarText.textContent = t('hud_multiply_tip', { last: eng.lastPlayerMove });
            }
        }

        // Update 6x6 cells
        const cellEls = dom.boardGrid.children;
        for (let i = 0; i < 36; i++) {
            const cell = eng.gridElements[i];
            const el = cellEls[i];
            el.classList.remove('owned-p1', 'owned-p2', 'hint-available', 'last-captured', 'winner-cell');

            if (cell.owner === 1) el.classList.add('owned-p1');
            else if (cell.owner === 2) el.classList.add('owned-p2');
            else if (state.activeHints.availCells.includes(cell.value)) {
                el.classList.add('hint-available');
            }

            if (state.lastCapturedValue === cell.value && cell.owner > 0) {
                el.classList.add('last-captured');
            }
            if (eng.winningLine && eng.winningLine.some(w => w.value === cell.value)) {
                el.classList.add('winner-cell');
            }
        }

        // Update digit pads
        if (state.mode !== 'tutorial') {
            const avail = eng.getAvailableMultipliers();
            const isBotTurn = (state.mode === 'single' || state.mode === 'timed') && eng.currentPlayer === 2;
            const prevMover = eng.moveHistory.length > 0 ? eng.moveHistory[eng.moveHistory.length - 1] : null;

            updatePadButtons(dom.padP1, 1, eng.status === 'playing' && eng.currentPlayer === 1 && !isBotTurn, avail, prevMover);
            updatePadButtons(dom.padP2, 2, eng.status === 'playing' && eng.currentPlayer === 2 && !isBotTurn, avail, prevMover);

            // Hint buttons state
            const pHints = eng.players[eng.currentPlayer];
            const hintsDisabled = eng.status !== 'playing' || isBotTurn;
            dom.btnHintAvailable.disabled = hintsDisabled || (pHints.hintAvailable <= 0 && pHints.usedAt.available !== eng.turnNumber);
            dom.btnHintFatal.disabled = hintsDisabled || (pHints.hintDangerous <= 0 && pHints.usedAt.fatal !== eng.turnNumber);
            dom.btnHintAuto.disabled = hintsDisabled || (pHints.hintAuto <= 0 && pHints.usedAt.auto !== eng.turnNumber);

            dom.lblHintAvailable.textContent = `${t('maingame_hint_available')} x ${pHints.hintAvailable}`;
            dom.lblHintFatal.textContent = `${t('maingame_hint_fatal')} x ${pHints.hintDangerous}`;
            dom.lblHintAuto.textContent = `${t('maingame_hint_auto')} x ${pHints.hintAuto}`;
        }
    }

    function updatePadButtons(padEl, padPlayer, canClick, availList, prevMover) {
        const isCurrent = state.engine.currentPlayer === padPlayer;
        padEl.querySelectorAll('.digit-btn').forEach(btn => {
            const d = Number(btn.dataset.digit);
            btn.classList.remove('selected-p1', 'selected-p2', 'hint-available', 'hint-fatal');

            const isValid = availList.includes(d);
            btn.disabled = !(canClick && isValid);

            // Show the last picked number highlighted on the player who picked it (original behavior!)
            if (prevMover && prevMover.player === padPlayer && prevMover.number === d) {
                btn.classList.add(padPlayer === 1 ? 'selected-p1' : 'selected-p2');
            }

            if (isCurrent && canClick) {
                if (state.activeHints.fatalMoves.includes(d)) {
                    btn.classList.add('hint-fatal');
                } else if (state.activeHints.availMoves.includes(d)) {
                    btn.classList.add('hint-available');
                }
            }
        });
    }

    // ==================== GAME MOVES & BOT ====================
    function onDigitClicked(playerNum, digit) {
        if (!state.engine || state.engine.status !== 'playing') return;

        if (state.mode === 'tutorial') {
            handleTutorialDigitClick(playerNum, digit);
            return;
        }

        if (state.engine.currentPlayer !== playerNum) return;
        if ((state.mode === 'single' || state.mode === 'timed') && playerNum === 2) return;

        executeMove(digit);
    }

    function executeMove(digit) {
        const eng = state.engine;
        const result = eng.makeMove(digit);
        if (!result.ok) return;

        Sound.play('pop');
        state.activeHints = { availMoves: [], availCells: [], fatalMoves: [] };
        state.lastCapturedValue = result.capturedCell ? result.capturedCell.value : null;

        renderGameUI();

        // Trigger capture bounce animation on the captured cell
        if (result.capturedCell) {
            const cellEl = dom.boardGrid.querySelector(`[data-value="${result.capturedCell.value}"]`);
            if (cellEl) {
                cellEl.classList.remove('capture-anim');
                void cellEl.offsetWidth;
                cellEl.classList.add('capture-anim');
            }
        }

        if (result.won || result.draw) {
            handleGameEnded({
                winnerSide: result.winner,
                winningLine: result.winningLine,
                timeout: false
            });
            return;
        }

        if (state.mode === 'timed') {
            resetTurnTimer();
        }

        if ((state.mode === 'single' || state.mode === 'timed') && eng.currentPlayer === 2) {
            scheduleBotMove();
        }
    }

    function scheduleBotMove() {
        if (state.botTimeoutId) clearTimeout(state.botTimeoutId);
        const delay = state.mode === 'timed' ? (900 + Math.random() * 900) : 520;
        state.botTimeoutId = setTimeout(() => {
            if (!state.engine || state.engine.status !== 'playing' || state.engine.currentPlayer !== 2) return;
            const move = state.engine.decideBotMove();
            if (move > 0) {
                executeMove(move);
            }
        }, delay);
    }

    function resetTurnTimer() {
        if (state.turnTimerId) clearInterval(state.turnTimerId);
        state.turnRemainingSec = 30;
        updateTimerPill();

        state.turnTimerId = setInterval(() => {
            if (!state.engine || state.engine.status !== 'playing') {
                clearInterval(state.turnTimerId);
                state.turnTimerId = null;
                return;
            }
            state.turnRemainingSec -= 1;
            updateTimerPill();

            if (state.turnRemainingSec <= 0) {
                clearInterval(state.turnTimerId);
                state.turnTimerId = null;
                state.engine.status = 'ended';
                const timedOutPlayer = state.engine.currentPlayer;
                const winnerSide = timedOutPlayer === 1 ? 2 : 1;
                state.engine.winner = winnerSide;
                handleGameEnded({
                    winnerSide,
                    winningLine: null,
                    timeout: true
                });
            }
        }, 1000);
    }

    function updateTimerPill() {
        dom.timerValue.textContent = t('hud_timer_seconds', { sec: Math.max(0, state.turnRemainingSec) });
        dom.timerBadge.classList.toggle('urgent', state.turnRemainingSec <= 7);
    }

    // ==================== GAME END & RECORDING ====================
    async function handleGameEnded({ winnerSide, winningLine, timeout }) {
        clearTimers();

        if (winningLine && winningLine.length === 3) {
            winningLine.forEach((cell, idx) => {
                setTimeout(() => {
                    const el = dom.boardGrid.querySelector(`[data-value="${cell.value}"]`);
                    if (el) {
                        el.classList.remove('capture-anim');
                        void el.offsetWidth;
                        el.classList.add('capture-anim', 'winner-cell');
                    }
                }, idx * 70);
            });
        }

        if (state.mode === 'tutorial') {
            Sound.play('win');
            setTimeout(() => showEndPopup({
                icon: '🎓',
                title: t('tutorial_ended_you_won'),
                summary: '',
                dbMsg: null,
                isTutorial: true
            }), 750);
            return;
        }

        // Determine sound & text
        let titleText = '';
        let icon = '🏆';
        if (winnerSide === 0) {
            Sound.play('lose');
            icon = '🤝';
            titleText = t('game_ended_draw');
        } else if (state.mode === 'duel') {
            Sound.play('win');
            titleText = winnerSide === 1
                ? t('game_ended_blue_won', { name: state.player1Name })
                : t('game_ended_red_won', { name: state.player2Name });
        } else {
            if (winnerSide === 1) {
                Sound.play('win');
                titleText = timeout
                    ? t('online_game_won_by_time')
                    : t('game_ended_you_won', { name: state.player1Name });
            } else {
                Sound.play('lose');
                icon = '💡';
                titleText = timeout
                    ? t('online_game_lost_by_time')
                    : t('game_ended_you_lost', { name: state.player1Name });
            }
        }

        const durationSec = Math.max(1, Math.round((Date.now() - state.matchStartMs) / 1000));
        const turns = state.engine.turnNumber;

        const winnerName = winnerSide === 0
            ? 'Berabere'
            : (winnerSide === 1 ? state.player1Name : state.player2Name);
        const loserName = winnerSide === 0
            ? 'Berabere'
            : (winnerSide === 1 ? state.player2Name : state.player1Name);

        const saveRes = await DB.recordMatch({
            classroom: state.classroom,
            mode: state.mode,
            difficulty: state.mode === 'duel' ? null : state.botLevel,
            player1Name: state.player1Name,
            player1IsBot: false,
            player2Name: state.player2Name,
            player2IsBot: state.mode !== 'duel',
            winnerSide,
            winnerName,
            loserName,
            totalTurns: turns,
            durationSeconds: durationSec,
            winningCells: winningLine ? winningLine.map(c => c.value) : []
        });

        updateDbStatusUI();

        const summary = t('game_ended_summary', {
            p1: state.player1Name,
            p2: state.player2Name,
            turns,
            duration: durationSec
        });

        const dbMsg = saveRes.cloudSaved
            ? { text: `☁️ ${t('game_ended_saved_cloud')}`, local: false }
            : { text: `💾 ${t('game_ended_saved_local')}`, local: true };

        setTimeout(() => showEndPopup({
            icon,
            title: titleText,
            summary,
            dbMsg,
            isTutorial: false
        }), 850);
    }

    function showEndPopup({ icon, title, summary, dbMsg, isTutorial }) {
        dom.popupIcon.textContent = icon;
        dom.popupTitle.textContent = title;
        dom.popupSummary.textContent = summary;

        if (dbMsg) {
            dom.popupDbBadge.textContent = dbMsg.text;
            dom.popupDbBadge.classList.toggle('local', dbMsg.local);
            dom.popupDbBadge.classList.remove('hidden');
        } else {
            dom.popupDbBadge.classList.add('hidden');
        }

        dom.popupActions.innerHTML = '';

        if (!isTutorial) {
            const btnReplay = document.createElement('button');
            btnReplay.type = 'button';
            btnReplay.className = 'btn-primary';
            btnReplay.textContent = `↻ ${t('popup_restart_button')}`;
            btnReplay.addEventListener('click', () => {
                closeModal('modalGamePopup');
                startMatch({
                    mode: state.mode,
                    botLevel: state.botLevel,
                    classroom: state.classroom,
                    player1Name: state.player1Name,
                    player2Name: state.player2Name
                });
            });
            dom.popupActions.appendChild(btnReplay);

            const btnScores = document.createElement('button');
            btnScores.type = 'button';
            btnScores.className = 'btn-secondary';
            btnScores.textContent = `🏆 ${t('popup_view_scores_button')}`;
            btnScores.addEventListener('click', () => {
                closeModal('modalGamePopup');
                openLeaderboardModal();
            });
            dom.popupActions.appendChild(btnScores);
        }

        const btnMenu = document.createElement('button');
        btnMenu.type = 'button';
        btnMenu.className = isTutorial ? 'btn-primary' : 'btn-secondary';
        btnMenu.textContent = `🏠 ${t('popup_return_menu_button')}`;
        btnMenu.addEventListener('click', () => {
            closeModal('modalGamePopup');
            switchView('menu');
        });
        dom.popupActions.appendChild(btnMenu);

        openModal('modalGamePopup');
    }

    function showConfirmPopup(type) {
        dom.popupIcon.textContent = type === 'restart' ? '↻' : '🏠';
        dom.popupTitle.textContent = type === 'restart'
            ? t('popup_restart_confirmation')
            : t('popup_return_menu_confirmation');
        dom.popupSummary.textContent = '';
        dom.popupDbBadge.classList.add('hidden');
        dom.popupActions.innerHTML = '';

        const btnConfirm = document.createElement('button');
        btnConfirm.type = 'button';
        btnConfirm.className = 'btn-primary';
        btnConfirm.textContent = type === 'restart' ? t('popup_restart_button') : t('popup_return_menu_button');
        btnConfirm.addEventListener('click', () => {
            closeModal('modalGamePopup');
            if (type === 'restart') {
                startMatch({
                    mode: state.mode,
                    botLevel: state.botLevel,
                    classroom: state.classroom,
                    player1Name: state.player1Name,
                    player2Name: state.player2Name
                });
            } else {
                switchView('menu');
            }
        });

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn-secondary';
        btnCancel.textContent = t('popup_return_game_button');
        btnCancel.addEventListener('click', () => closeModal('modalGamePopup'));

        dom.popupActions.appendChild(btnConfirm);
        dom.popupActions.appendChild(btnCancel);
        openModal('modalGamePopup');
    }

    // ==================== HINTS ====================
    function handleHintClick(type) {
        if (!state.engine || state.engine.status !== 'playing' || state.mode === 'tutorial') return;
        const isBotTurn = (state.mode === 'single' || state.mode === 'timed') && state.engine.currentPlayer === 2;
        if (isBotTurn) return;

        const res = state.engine.useHint(type);
        if (!res.ok) return;

        if (type === 'available') {
            state.activeHints.availMoves = res.moves;
            state.activeHints.availCells = res.cellValues;
            renderGameUI();
        } else if (type === 'fatal') {
            state.activeHints.fatalMoves = res.moves;
            renderGameUI();
        } else if (type === 'auto' && res.suggestedMove > 0) {
            executeMove(res.suggestedMove);
        }
    }

    // ==================== INTERACTIVE 18-STEP TUTORIAL ====================
    function initTutorialFlow() {
        state.tutorialStepIdx = 0;
        state.tutorialLock = false;
        dom.panelP1.classList.add('hidden');
        dom.panelP2.classList.add('hidden');
        dom.boardGrid.classList.add('hidden');
        dom.padP1.querySelectorAll('.digit-btn').forEach(b => b.disabled = true);
        dom.padP2.querySelectorAll('.digit-btn').forEach(b => b.disabled = true);
        runTutorialStep();
    }

    function clearTutorialPulses() {
        dom.padP1.querySelectorAll('.digit-btn').forEach(b => b.classList.remove('pulse-highlight'));
        dom.padP2.querySelectorAll('.digit-btn').forEach(b => b.classList.remove('pulse-highlight'));
        dom.boardGrid.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('pulse-highlight', 'hint-available'));
    }

    function highlightTutorialLine(values) {
        state.tutorialLock = true;
        values.forEach((val, idx) => {
            const tid = setTimeout(() => {
                const el = dom.boardGrid.querySelector(`[data-value="${val}"]`);
                if (el) el.classList.add('hint-available');
                if (idx === values.length - 1) {
                    state.tutorialLock = false;
                }
            }, idx * 220);
            state.tutorialTimeouts.push(tid);
        });
    }

    function runTutorialStep() {
        if (state.tutorialLock) return;
        if (state.tutorialStepIdx >= TutorialSteps.length) return;

        const step = TutorialSteps[state.tutorialStepIdx];
        const msg = t(step.key);
        dom.helperBarText.textContent = msg;
        dom.tutorialContinueHint.textContent = t('tutorial_sub_helper_text');
        dom.btnTutorialNext.textContent = t('tutorial_sub_helper_text');

        clearTutorialPulses();
        dom.btnTutorialNext.classList.remove('hidden');

        switch (step.action) {
            case 'welcome':
                dom.tutorialFullOverlay.classList.remove('hidden');
                dom.tutorialFullText.textContent = msg;
                break;

            case 'showOpponentButtons':
                dom.tutorialFullOverlay.classList.remove('hidden');
                dom.tutorialFullText.textContent = msg;
                dom.panelP2.classList.remove('hidden');
                dom.padP2.querySelectorAll('.digit-btn').forEach(b => {
                    b.disabled = false;
                    b.classList.add('pulse-highlight');
                });
                break;

            case 'showUserButtons':
                dom.tutorialFullOverlay.classList.remove('hidden');
                dom.tutorialFullText.textContent = msg;
                dom.panelP1.classList.remove('hidden');
                dom.padP1.querySelectorAll('.digit-btn').forEach(b => {
                    b.disabled = false;
                    b.classList.add('pulse-highlight');
                });
                break;

            case 'showGameGrid':
                dom.tutorialFullOverlay.classList.add('hidden');
                dom.boardGrid.classList.remove('hidden');
                dom.padP1.querySelectorAll('.digit-btn').forEach(b => b.disabled = true);
                dom.padP2.querySelectorAll('.digit-btn').forEach(b => b.disabled = true);
                dom.boardGrid.querySelectorAll('.grid-cell').forEach(c => c.classList.add('pulse-highlight'));
                break;

            case 'showHorizontalWin':
                // Row 2, Cols 2,3,4 -> 2, 35, 40
                highlightTutorialLine([2, 35, 40]);
                break;

            case 'showVerticalWin':
                // Rows 2,3,4, Col 1 -> 42, 12, 7
                highlightTutorialLine([42, 12, 7]);
                break;

            case 'showDiagonalWin':
                // (1,2)=4, (2,3)=35, (3,4)=36
                highlightTutorialLine([4, 35, 36]);
                break;

            case 'clearAndShowRule4':
            case 'waitClick':
                break;

            case 'botFirstMove7':
                executeTutorialMove(7);
                break;

            case 'userFirstMove5':
                dom.btnTutorialNext.classList.add('hidden');
                enableTutorialUserButton(5, 35);
                break;

            case 'botSecondMove6':
                executeTutorialMove(6);
                break;

            case 'userSecondMove3':
                dom.btnTutorialNext.classList.add('hidden');
                enableTutorialUserButton(3, 18);
                break;

            case 'botThirdMove2':
                executeTutorialMove(2);
                dom.btnTutorialNext.classList.remove('hidden');
                break;

            case 'userFinalMove8':
                dom.btnTutorialNext.classList.add('hidden');
                // Allow all valid user buttons so wrong pick can trigger final step 17 hint
                dom.padP1.querySelectorAll('.digit-btn').forEach(b => {
                    const d = Number(b.dataset.digit);
                    b.disabled = !state.engine.isMoveValid(d);
                });
                const c16 = dom.boardGrid.querySelector('[data-value="16"]');
                if (c16) c16.classList.add('hint-available');
                break;

            case 'retryFinalMove8':
                dom.btnTutorialNext.classList.add('hidden');
                enableTutorialUserButton(8, 16);
                break;
        }
    }

    function enableTutorialUserButton(digit, targetCellVal) {
        dom.padP1.querySelectorAll('.digit-btn').forEach(b => {
            const d = Number(b.dataset.digit);
            b.disabled = d !== digit;
            if (d === digit) b.classList.add('pulse-highlight');
        });
        if (targetCellVal) {
            const cEl = dom.boardGrid.querySelector(`[data-value="${targetCellVal}"]`);
            if (cEl) cEl.classList.add('hint-available');
        }
    }

    function executeTutorialMove(digit) {
        const res = state.engine.makeMove(digit);
        if (!res.ok) return;
        Sound.play('pop');
        state.lastCapturedValue = res.capturedCell ? res.capturedCell.value : null;

        // Paint grid & last button
        const cellEls = dom.boardGrid.children;
        for (let i = 0; i < 36; i++) {
            const cell = state.engine.gridElements[i];
            const el = cellEls[i];
            el.classList.remove('owned-p1', 'owned-p2', 'hint-available', 'last-captured');
            if (cell.owner === 1) el.classList.add('owned-p1');
            else if (cell.owner === 2) el.classList.add('owned-p2');
        }
        if (res.capturedCell) {
            const cEl = dom.boardGrid.querySelector(`[data-value="${res.capturedCell.value}"]`);
            if (cEl) {
                cEl.classList.add('last-captured', 'capture-anim');
            }
        }

        const prev = state.engine.moveHistory[state.engine.moveHistory.length - 1];
        [dom.padP1, dom.padP2].forEach((pad, idx) => {
            const pNum = idx + 1;
            pad.querySelectorAll('.digit-btn').forEach(btn => {
                btn.classList.remove('selected-p1', 'selected-p2');
                if (prev && prev.player === pNum && Number(btn.dataset.digit) === prev.number) {
                    btn.classList.add(pNum === 1 ? 'selected-p1' : 'selected-p2');
                }
            });
        });

        dom.lastPickValue.textContent = String(digit);
        const activeName = state.engine.currentPlayer === 1 ? state.player1Name : state.player2Name;
        dom.turnBadgeText.textContent = `${t('hud_turn_label')}: ${activeName}`;
        dom.turnBadge.classList.toggle('p2-active', state.engine.currentPlayer === 2);

        if (res.won) {
            handleGameEnded({ winnerSide: res.winner, winningLine: res.winningLine, timeout: false });
        }
    }

    function handleTutorialDigitClick(playerNum, digit) {
        if (playerNum !== 1) return;
        const step = TutorialSteps[state.tutorialStepIdx];
        if (!step) return;

        if (step.action === 'userFinalMove8' && digit !== 8) {
            state.tutorialStepIdx += 1; // Advance to tutorial_final_move_failed
            runTutorialStep();
            return;
        }

        if (step.requireDigit && digit === step.requireDigit) {
            dom.padP1.querySelectorAll('.digit-btn').forEach(b => b.disabled = true);
            clearTutorialPulses();
            executeTutorialMove(digit);
            if (state.engine.status === 'playing') {
                state.tutorialStepIdx += 1;
                runTutorialStep();
            }
        }
    }

    function advanceTutorialStep() {
        if (state.mode !== 'tutorial' || state.tutorialLock) return;
        const step = TutorialSteps[state.tutorialStepIdx];
        if (step && step.requireDigit) return; // User must press the required digit
        if (state.tutorialStepIdx + 1 < TutorialSteps.length) {
            state.tutorialStepIdx += 1;
            runTutorialStep();
        }
    }

    // ==================== LEADERBOARD MODAL ====================
    async function openLeaderboardModal() {
        openModal('modalLeaderboard');
        dom.lbTableWrap.innerHTML = `<div class="lb-empty-box">Yükleniyor...</div>`;
        await reloadLeaderboardData();
    }

    async function reloadLeaderboardData() {
        const { matches } = await DB.fetchAllMatches();
        state.cachedMatches = matches;
        updateDbStatusUI();
        renderLeaderboardTable();
    }

    function renderLeaderboardTable() {
        const classroom = dom.lbFilterClassroom.value || 'ALL';
        const mode = dom.lbFilterMode.value || 'ALL';
        const search = dom.lbSearchInput.value || '';

        const { filteredMatches, students, classrooms } = DB.computeLeaderboard(state.cachedMatches, {
            classroom,
            mode,
            search
        });

        // Populate classroom filter dropdown while preserving selection
        const prevCls = dom.lbFilterClassroom.value || 'ALL';
        dom.lbFilterClassroom.innerHTML = `<option value="ALL">${t('lb_filter_all')}</option>` +
            classrooms.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (Array.from(dom.lbFilterClassroom.options).some(o => o.value === prevCls)) {
            dom.lbFilterClassroom.value = prevCls;
        }

        dom.lbStatMatches.textContent = String(filteredMatches.length);
        dom.lbStatStudents.textContent = String(students.length);
        dom.lbStatPending.textContent = String(DB.getPendingSync().length);

        if (state.lbTab === 'students') {
            if (students.length === 0) {
                dom.lbTableWrap.innerHTML = `<div class="lb-empty-box">${t('lb_empty')}</div>`;
                return;
            }
            const rowsHtml = students.map((s, idx) => `
                <tr>
                    <td><strong>${idx + 1}</strong></td>
                    <td><strong>${escapeHtml(s.name)}</strong></td>
                    <td>${escapeHtml(s.classroom)}</td>
                    <td>${s.played}</td>
                    <td><span class="badge-win">${s.wins}</span></td>
                    <td><span class="badge-loss">${s.losses}</span></td>
                    <td><span class="badge-draw">${s.draws}</span></td>
                    <td>%${s.winRate}</td>
                    <td><strong>${s.points}</strong></td>
                </tr>
            `).join('');

            dom.lbTableWrap.innerHTML = `
                <table class="lb-table">
                    <thead>
                        <tr>
                            <th>${t('lb_col_rank')}</th>
                            <th>${t('lb_col_student')}</th>
                            <th>${t('lb_col_classroom')}</th>
                            <th>${t('lb_col_played')}</th>
                            <th>${t('lb_col_wins')}</th>
                            <th>${t('lb_col_losses')}</th>
                            <th>${t('lb_col_draws')}</th>
                            <th>${t('lb_col_winrate')}</th>
                            <th>${t('lb_col_points')}</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
        } else {
            if (filteredMatches.length === 0) {
                dom.lbTableWrap.innerHTML = `<div class="lb-empty-box">${t('lb_empty')}</div>`;
                return;
            }
            const rowsHtml = filteredMatches.map(m => {
                const dateStr = formatDate(m.createdAtMs || m.createdAtIso);
                const modeLabel = formatModeLabel(m.mode, m.difficulty);
                const winBadge = m.winnerSide === 0
                    ? `<span class="badge-draw">Berabere</span>`
                    : `<span class="badge-win">${escapeHtml(m.winnerName)}</span>`;
                const loseBadge = m.winnerSide === 0
                    ? `<span class="badge-draw">Berabere</span>`
                    : `<span class="badge-loss">${escapeHtml(m.loserName)}</span>`;
                return `
                    <tr>
                        <td>${dateStr}</td>
                        <td>${escapeHtml(m.classroom || 'Genel')}</td>
                        <td>${escapeHtml(m.player1Name)} <small style="color:#64748b">vs</small> ${escapeHtml(m.player2Name)}</td>
                        <td>${winBadge}</td>
                        <td>${loseBadge}</td>
                        <td>${escapeHtml(modeLabel)}</td>
                        <td>${m.totalTurns || 0} ${m.synced ? '☁️' : '💾'}</td>
                    </tr>
                `;
            }).join('');

            dom.lbTableWrap.innerHTML = `
                <table class="lb-table">
                    <thead>
                        <tr>
                            <th>${t('lb_col_date')}</th>
                            <th>${t('lb_col_classroom')}</th>
                            <th>${t('lb_col_players')}</th>
                            <th>${t('lb_col_winner')}</th>
                            <th>${t('lb_col_loser')}</th>
                            <th>${t('lb_col_mode')}</th>
                            <th>${t('lb_col_turns')}</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
        }
    }

    function formatModeLabel(mode, difficulty) {
        if (mode === 'duel') return 'Düello';
        const diff = difficulty ? ` (${getDifficultyLabel(difficulty)})` : '';
        if (mode === 'timed') return `Süreli${diff}`;
        return `Bot${diff}`;
    }

    function formatDate(msOrIso) {
        try {
            const d = new Date(msOrIso);
            return d.toLocaleString('tr-TR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (_) {
            return '';
        }
    }

    function handleExportCsv() {
        const classroom = dom.lbFilterClassroom.value || 'ALL';
        const mode = dom.lbFilterMode.value || 'ALL';
        const search = dom.lbSearchInput.value || '';
        const { filteredMatches, students } = DB.computeLeaderboard(state.cachedMatches, { classroom, mode, search });
        const today = new Date().toISOString().slice(0, 10);

        if (state.lbTab === 'students') {
            DB.exportCsv(
                `carpanga-ogrenci-siralamasi-${today}.csv`,
                ['Sıra', 'Öğrenci', 'Sınıf', 'Maç', 'Kazandı', 'Kaybetti', 'Berabere', 'Başarı %', 'Puan'],
                students.map((s, i) => [i + 1, s.name, s.classroom, s.played, s.wins, s.losses, s.draws, `%${s.winRate}`, s.points])
            );
        } else {
            DB.exportCsv(
                `carpanga-mac-gecmisi-${today}.csv`,
                ['Tarih', 'Sınıf', '1. Oyuncu (Mavi)', '2. Oyuncu (Kırmızı)', 'Kazanan', 'Kaybeden', 'Mod', 'Hamle', 'Süre (sn)'],
                filteredMatches.map(m => [
                    formatDate(m.createdAtMs),
                    m.classroom || 'Genel',
                    m.player1Name,
                    m.player2Name,
                    m.winnerName,
                    m.loserName,
                    formatModeLabel(m.mode, m.difficulty),
                    m.totalTurns || 0,
                    m.durationSeconds || 0
                ])
            );
        }
    }

    async function handleClearRecords() {
        const pin = window.prompt(t('lb_clear_confirm_pin'));
        if (pin === null) return;
        if (!DB.verifyTeacherPin(pin)) {
            window.alert(t('lb_wrong_pin'));
            return;
        }
        DB.clearLocalRecords();
        await reloadLeaderboardData();
        refreshMenuStats();
        window.alert(t('lb_cleared_msg'));
    }

    // ==================== TEACHER / FIREBASE MODAL ====================
    function openTeacherModal() {
        const active = DB.getActiveConfig();
        dom.txtFirebaseConfig.value = active ? JSON.stringify(active, null, 2) : '';
        dom.inputTeacherPin.value = '';
        dom.cfgFeedback.classList.add('hidden');
        updateDbStatusUI();
        openModal('modalTeacher');
    }

    async function handleSaveAndTestConfig() {
        const raw = dom.txtFirebaseConfig.value.trim();
        const newPin = dom.inputTeacherPin.value.trim();
        if (newPin) {
            DB.setTeacherPin(newPin);
        }

        if (!raw) {
            showCfgFeedback(t('cfg_invalid_json'), false);
            return;
        }

        const parsed = parseFirebaseConfigInput(raw);
        if (!parsed) {
            showCfgFeedback(t('cfg_invalid_json'), false);
            return;
        }

        DB.saveConfig(parsed);
        dom.txtFirebaseConfig.value = JSON.stringify(parsed, null, 2);
        const res = await DB.testConnection();
        updateDbStatusUI();
        if (res.ok) {
            await DB.syncPending();
            refreshMenuStats();
            showCfgFeedback(t('cfg_test_ok'), true);
        } else {
            showCfgFeedback(t('cfg_test_err') + (res.error || ''), false);
        }
    }

    function showCfgFeedback(msg, isOk) {
        dom.cfgFeedback.textContent = msg;
        dom.cfgFeedback.className = 'cfg-feedback ' + (isOk ? 'ok' : 'err');
        dom.cfgFeedback.classList.remove('hidden');
    }

    // ==================== FULLSCREEN & UTILITIES ====================
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ==================== EVENT WIRING ====================
    function bindEvents() {
        // Close buttons on modals
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
        });

        // Topbar actions
        dom.brandHomeBtn.addEventListener('click', () => {
            if (state.view === 'game') {
                if (state.mode === 'tutorial') switchView('menu');
                else showConfirmPopup('menu');
            }
        });
        dom.btnBackToMenu.addEventListener('click', () => {
            if (state.mode === 'tutorial') switchView('menu');
            else showConfirmPopup('menu');
        });
        dom.btnRestartGame.addEventListener('click', () => showConfirmPopup('restart'));
        dom.btnRotateMode.addEventListener('click', () => {
            state.rotateTabletop = !state.rotateTabletop;
            dom.btnRotateMode.classList.toggle('active', state.rotateTabletop);
            renderGameUI();
        });
        dom.btnSoundToggle.addEventListener('click', () => {
            Sound.toggleMute();
            applyTranslations();
        });
        dom.btnLangToggle.addEventListener('click', () => {
            setLanguage(getLanguage() === 'tr' ? 'en' : 'tr');
            applyTranslations();
        });
        dom.btnFullscreen.addEventListener('click', toggleFullscreen);
        dom.btnDbStatus.addEventListener('click', openTeacherModal);

        // Main menu buttons
        dom.btnMenuDuel.addEventListener('click', () => openSetupModal('duel'));
        dom.btnMenuSingle.addEventListener('click', () => openSetupModal('single'));
        dom.btnMenuTimed.addEventListener('click', () => openSetupModal('timed'));
        dom.btnMenuTutorial.addEventListener('click', () => {
            startMatch({
                mode: 'tutorial',
                botLevel: 1,
                classroom: '',
                player1Name: getLanguage() === 'tr' ? 'Sen (Mavi)' : 'You (Blue)',
                player2Name: getLanguage() === 'tr' ? 'Rakip (Kırmızı)' : 'Opponent (Red)'
            });
        });
        dom.btnMenuLeaderboard.addEventListener('click', openLeaderboardModal);
        dom.btnMenuTeacher.addEventListener('click', openTeacherModal);

        // Setup modal
        dom.diffPills.querySelectorAll('.diff-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.botLevel = Number(btn.dataset.level);
                dom.diffPills.querySelectorAll('.diff-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        [dom.inputClassroom, dom.inputPlayer1, dom.inputPlayer2].forEach(inp => {
            inp.addEventListener('focus', () => {
                state.lastFocusedInput = inp;
                state.touchKb?.attachTo(inp);
            });
        });
        dom.btnToggleTouchKeyboard.addEventListener('click', () => {
            const target = state.lastFocusedInput || dom.inputPlayer1;
            state.touchKb.toggle(target);
        });
        dom.setupForm.addEventListener('submit', handleSetupSubmit);

        // Game hints
        dom.btnHintAvailable.addEventListener('click', () => handleHintClick('available'));
        dom.btnHintFatal.addEventListener('click', () => handleHintClick('fatal'));
        dom.btnHintAuto.addEventListener('click', () => handleHintClick('auto'));

        // Tutorial advancement
        dom.tutorialFullOverlay.addEventListener('click', advanceTutorialStep);
        dom.helperBar.addEventListener('click', () => {
            if (state.mode === 'tutorial') advanceTutorialStep();
        });

        // Leaderboard controls
        document.querySelectorAll('.lb-tab').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                state.lbTab = tabBtn.dataset.tab;
                document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
                tabBtn.classList.add('active');
                renderLeaderboardTable();
            });
        });
        dom.lbFilterClassroom.addEventListener('change', renderLeaderboardTable);
        dom.lbFilterMode.addEventListener('change', renderLeaderboardTable);
        dom.lbSearchInput.addEventListener('input', renderLeaderboardTable);
        dom.btnLbRefresh.addEventListener('click', reloadLeaderboardData);
        dom.btnLbSync.addEventListener('click', async () => {
            await DB.syncPending();
            await reloadLeaderboardData();
            refreshMenuStats();
        });
        dom.btnLbExport.addEventListener('click', handleExportCsv);
        dom.btnLbClear.addEventListener('click', handleClearRecords);

        // Teacher / Firebase controls
        dom.btnCfgSaveTest.addEventListener('click', handleSaveAndTestConfig);
        dom.btnCfgReset.addEventListener('click', () => {
            DB.resetConfig();
            dom.txtFirebaseConfig.value = '';
            updateDbStatusUI();
            showCfgFeedback(t('cfg_status_offline'), true);
        });
        dom.btnCfgCopyLink.addEventListener('click', async () => {
            const url = DB.buildShareableSetupUrl();
            if (!url) {
                showCfgFeedback(t('cfg_invalid_json'), false);
                return;
            }
            try {
                await navigator.clipboard.writeText(url);
                showCfgFeedback(t('cfg_share_link_copied'), true);
            } catch (_) {
                window.prompt('Kurulum Linki:', url);
            }
        });

        // Physical keyboard shortcut: digits 1..9 during active turn
        document.addEventListener('keydown', (e) => {
            if (state.view !== 'game' || !state.engine || state.engine.status !== 'playing') return;
            if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
            if (e.key >= '1' && e.key <= '9') {
                onDigitClicked(state.engine.currentPlayer, Number(e.key));
            }
        });

        // Auto-sync when browser comes back online
        window.addEventListener('online', () => {
            DB.syncPending().then(() => {
                updateDbStatusUI();
                refreshMenuStats();
            });
        });
    }

    async function init() {
        cacheDom();
        state.touchKb = new TouchKeyboard(dom.touchKeyboardContainer);
        bindEvents();
        applyTranslations();
        switchView('menu');
        await DB.initCloud();
        await refreshMenuStats();
    }

    document.addEventListener('DOMContentLoaded', init);
}());
