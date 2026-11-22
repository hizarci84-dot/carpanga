(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CarpangaEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // All 36 unique products of 1..9 x 1..9
    const UNIQUE_PRODUCTS = Object.freeze([
        1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 12, 14, 15, 16, 18, 20, 21, 24,
        25, 27, 28, 30, 32, 35, 36, 40, 42,
        45, 48, 49, 54, 56, 63, 64, 72, 81
    ]);

    // Original fixed board layout used by the interactive tutorial
    const DEMO_MULTIPLIERS = Object.freeze([
        32, 63, 48, 8, 21, 56,
        9, 24, 4, 16, 81, 72,
        20, 42, 2, 35, 40, 14,
        27, 12, 30, 18, 36, 1,
        15, 7, 49, 6, 5, 28,
        10, 3, 25, 45, 54, 64
    ]);

    const DIRECTIONS = Object.freeze([
        [0, 1],   // horizontal
        [1, 0],   // vertical
        [1, 1],   // diagonal down-right
        [1, -1]   // diagonal down-left
    ]);

    const ALL_8_DIRS = Object.freeze([
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ]);

    function shuffleArray(arr, rng = Math.random) {
        const copy = arr.slice();
        for (let i = 0; i < copy.length; i++) {
            const j = i + Math.floor(rng() * (copy.length - i));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    function inBounds(r, c) {
        return r >= 0 && r <= 5 && c >= 0 && c <= 5;
    }

    function createPlayerHintState() {
        return {
            hintAvailable: 3,
            hintDangerous: 3,
            hintAuto: 1,
            usedAt: {
                available: -1,
                fatal: -1,
                auto: -1
            }
        };
    }

    class GameEngine {
        /**
         * @param {Object} options
         * @param {'single'|'duel'|'timed'|'tutorial'} [options.mode='duel']
         * @param {number} [options.botLevel=2] 1=Easy, 2=Medium, 3=Hard, 4=Master
         * @param {1|2|'random'} [options.startingPlayer='random']
         * @param {number[]} [options.boardValues] Optional fixed 36 values
         * @param {Function} [options.rng=Math.random]
         */
        constructor(options = {}) {
            this.rng = typeof options.rng === 'function' ? options.rng : Math.random;
            this.mode = options.mode || 'duel';
            this.botLevel = options.botLevel || 2;

            let initialPlayer = options.startingPlayer;
            if (initialPlayer !== 1 && initialPlayer !== 2) {
                initialPlayer = this.rng() < 0.5 ? 1 : 2;
            }
            this.startingPlayer = initialPlayer;
            this.currentPlayer = initialPlayer;
            this.lastPlayerMove = 0;
            this.turnNumber = 0;
            this.status = 'playing'; // 'playing' | 'ended'
            this.winner = null;      // null | 0 (draw) | 1 | 2
            this.winningLine = null; // null | [cell, cell, cell]
            this.moveHistory = [];

            this.players = {
                1: createPlayerHintState(),
                2: createPlayerHintState()
            };

            let values;
            if (Array.isArray(options.boardValues) && options.boardValues.length === 36) {
                values = options.boardValues.slice();
            } else if (this.mode === 'tutorial') {
                values = DEMO_MULTIPLIERS.slice();
            } else {
                values = shuffleArray(UNIQUE_PRODUCTS, this.rng);
            }

            this.boardValues = values;
            this.gridElements = new Array(36);
            this.gridMatrix = Array.from({ length: 6 }, () => new Array(6));
            this.cellsByValue = Object.create(null);

            for (let i = 0; i < 36; i++) {
                const row = Math.floor(i / 6);
                const col = i % 6;
                const cell = {
                    index: i,
                    value: values[i],
                    row,
                    col,
                    owner: 0
                };
                this.gridElements[i] = cell;
                this.gridMatrix[row][col] = cell;
                this.cellsByValue[cell.value] = cell;
            }
        }

        getOpponent(player = this.currentPlayer) {
            return player === 1 ? 2 : 1;
        }

        getAvailableMultipliers() {
            if (this.status !== 'playing') return [];
            const available = [];
            if (this.lastPlayerMove <= 0) {
                for (let i = 1; i <= 9; i++) available.push(i);
                return available;
            }
            for (let i = 1; i <= 9; i++) {
                const target = this.cellsByValue[this.lastPlayerMove * i];
                if (target && target.owner === 0) {
                    available.push(i);
                }
            }
            return available;
        }

        isMoveValid(num) {
            if (this.status !== 'playing') return false;
            if (!Number.isInteger(num) || num < 1 || num > 9) return false;
            if (this.lastPlayerMove <= 0) return true;
            const target = this.cellsByValue[this.lastPlayerMove * num];
            return Boolean(target && target.owner === 0);
        }

        makeMove(num) {
            if (!this.isMoveValid(num)) {
                return { ok: false, reason: 'invalid_move' };
            }

            const actingPlayer = this.currentPlayer;
            this.turnNumber += 1;

            let capturedCell = null;
            if (this.lastPlayerMove > 0) {
                const product = num * this.lastPlayerMove;
                capturedCell = this.cellsByValue[product];
                capturedCell.owner = actingPlayer;
            }

            this.moveHistory.push({
                turn: this.turnNumber,
                player: actingPlayer,
                number: num,
                previousNumber: this.lastPlayerMove,
                capturedValue: capturedCell ? capturedCell.value : null,
                row: capturedCell ? capturedCell.row : null,
                col: capturedCell ? capturedCell.col : null
            });

            this.lastPlayerMove = num;

            const winLine = this.checkWinForPlayer(actingPlayer);
            if (winLine) {
                this.status = 'ended';
                this.winner = actingPlayer;
                this.winningLine = winLine;
                return {
                    ok: true,
                    actingPlayer,
                    number: num,
                    capturedCell,
                    won: true,
                    draw: false,
                    winner: actingPlayer,
                    winningLine: winLine,
                    nextPlayer: null,
                    availableMoves: []
                };
            }

            this.currentPlayer = this.getOpponent(actingPlayer);
            const nextAvailable = this.getAvailableMultipliers();

            if (nextAvailable.length === 0) {
                this.status = 'ended';
                this.winner = 0;
                return {
                    ok: true,
                    actingPlayer,
                    number: num,
                    capturedCell,
                    won: false,
                    draw: true,
                    winner: 0,
                    winningLine: null,
                    nextPlayer: null,
                    availableMoves: []
                };
            }

            return {
                ok: true,
                actingPlayer,
                number: num,
                capturedCell,
                won: false,
                draw: false,
                winner: null,
                winningLine: null,
                nextPlayer: this.currentPlayer,
                availableMoves: nextAvailable
            };
        }

        checkWinForPlayer(player) {
            for (let r = 0; r < 6; r++) {
                for (let c = 0; c < 6; c++) {
                    const c1 = this.gridMatrix[r][c];
                    if (c1.owner !== player) continue;
                    for (const [dr, dc] of DIRECTIONS) {
                        const r2 = r + dr, c2col = c + dc;
                        const r3 = r + dr * 2, c3col = c + dc * 2;
                        if (!inBounds(r2, c2col) || !inBounds(r3, c3col)) continue;
                        const cell2 = this.gridMatrix[r2][c2col];
                        const cell3 = this.gridMatrix[r3][c3col];
                        if (cell2.owner === player && cell3.owner === player) {
                            return [c1, cell2, cell3];
                        }
                    }
                }
            }
            return null;
        }

        getCellsOwnedBy(player) {
            const owned = [];
            for (let i = 0; i < 36; i++) {
                if (this.gridElements[i].owner === player) {
                    owned.push(this.gridElements[i]);
                }
            }
            return owned;
        }

        /**
         * Returns cell values that would give `player` 3-in-a-row if captured next.
         */
        findFatalCells(player) {
            const fatalValues = [];
            const seen = new Set();

            for (let r = 0; r < 6; r++) {
                for (let c = 0; c < 6; c++) {
                    const cell = this.gridMatrix[r][c];
                    if (cell.owner !== player) continue;

                    // Case 1: [P, P, _]
                    for (const [dr, dc] of ALL_8_DIRS) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (!inBounds(nr, nc)) continue;
                        if (this.gridMatrix[nr][nc].owner !== player) continue;

                        const tr = nr + dr;
                        const tc = nc + dc;
                        if (!inBounds(tr, tc)) continue;
                        const target = this.gridMatrix[tr][tc];
                        if (target.owner === 0 && !seen.has(target.value)) {
                            seen.add(target.value);
                            fatalValues.push(target.value);
                        }
                    }

                    // Case 2: [P, _, P]
                    for (const [dr, dc] of ALL_8_DIRS) {
                        const nr = r + dr * 2;
                        const nc = c + dc * 2;
                        if (!inBounds(nr, nc)) continue;
                        if (this.gridMatrix[nr][nc].owner !== player) continue;

                        const mr = r + dr;
                        const mc = c + dc;
                        const mid = this.gridMatrix[mr][mc];
                        if (mid.owner === 0 && !seen.has(mid.value)) {
                            seen.add(mid.value);
                            fatalValues.push(mid.value);
                        }
                    }
                }
            }

            return fatalValues;
        }

        /**
         * Returns multipliers (1..9) that, if chosen now, allow `targetPlayer` (usually opponent)
         * to win on their immediately following move.
         */
        findFatalMoves(targetPlayer = this.getOpponent()) {
            const fatalCells = this.findFatalCells(targetPlayer);
            const fatalMoves = [];
            const seen = new Set();

            for (const val of fatalCells) {
                for (let m = 1; m <= 9; m++) {
                    if (val % m !== 0) continue;
                    if (val / m > 9) continue;
                    // If choosing `m` captures `val` right now, `val` won't remain free for opponent
                    if (this.lastPlayerMove > 0 && this.lastPlayerMove * m === val) continue;
                    if (!seen.has(m)) {
                        seen.add(m);
                        fatalMoves.push(m);
                    }
                }
            }
            return fatalMoves;
        }

        /**
         * Checks if currentPlayer can win immediately with any valid multiplier.
         */
        checkForFinalMove(player = this.currentPlayer) {
            if (this.lastPlayerMove <= 0) return 0;
            const winningTargets = this.findFatalCells(player);
            for (const val of winningTargets) {
                if (val % this.lastPlayerMove === 0) {
                    const m = val / this.lastPlayerMove;
                    if (m >= 1 && m <= 9 && this.isMoveValid(m)) {
                        return m;
                    }
                }
            }
            return 0;
        }

        /**
         * Spiral-inwards ordering (preferring center cells first) for Master bot's first captured cell.
         */
        captureCellAtCenter() {
            if (this.lastPlayerMove <= 0) return 0;
            // Spiral from outer ring to inner core, then iterate backwards (center -> outer)
            const spiral = [];
            let top = 0, bottom = 5, left = 0, right = 5;
            while (top <= bottom && left <= right) {
                for (let c = left; c <= right; c++) spiral.push(this.gridMatrix[top][c].value);
                top++;
                for (let r = top; r <= bottom; r++) spiral.push(this.gridMatrix[r][right].value);
                right--;
                if (top <= bottom) {
                    for (let c = right; c >= left; c--) spiral.push(this.gridMatrix[bottom][c].value);
                    bottom--;
                }
                if (left <= right) {
                    for (let r = bottom; r >= top; r--) spiral.push(this.gridMatrix[r][left].value);
                    left++;
                }
            }

            for (let i = spiral.length - 1; i >= 0; i--) {
                const val = spiral[i];
                const cell = this.cellsByValue[val];
                if (cell && cell.owner === 0 && val % this.lastPlayerMove === 0) {
                    const m = val / this.lastPlayerMove;
                    if (m >= 1 && m <= 9) return m;
                }
            }
            return 0;
        }

        /**
         * Evaluates safe multipliers by counting extendable neighbor alignments for currentPlayer.
         */
        checkCellsWithNeighbor(safeMoves, preferredMinNeighbors = 1) {
            if (this.lastPlayerMove <= 0 || safeMoves.length === 0) return 0;
            const bestMoves = [];
            const goodMoves = [];
            const player = this.currentPlayer;

            for (const m of safeMoves) {
                const cell = this.cellsByValue[m * this.lastPlayerMove];
                if (!cell) continue;
                const r = cell.row;
                const c = cell.col;
                let neighborScore = 0;

                // Adjacent 1-step neighbor with room to complete 3-in-a-row
                for (const [dr, dc] of ALL_8_DIRS) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (!inBounds(nr, nc)) continue;
                    if (this.gridMatrix[nr][nc].owner !== player) continue;

                    const fr = nr + dr;
                    const fc = nc + dc;
                    if (inBounds(fr, fc) && this.gridMatrix[fr][fc].owner === 0) {
                        neighborScore++;
                    }
                    const br = r - dr;
                    const bc = c - dc;
                    if (inBounds(br, bc) && this.gridMatrix[br][bc].owner === 0) {
                        neighborScore++;
                    }
                }

                // 2-step neighbor with empty middle cell [candidate, _, P]
                for (const [dr, dc] of ALL_8_DIRS) {
                    const nr = r + dr * 2;
                    const nc = c + dc * 2;
                    if (!inBounds(nr, nc)) continue;
                    if (this.gridMatrix[nr][nc].owner !== player) continue;

                    const mr = r + dr;
                    const mc = c + dc;
                    if (this.gridMatrix[mr][mc].owner === 0) {
                        neighborScore++;
                    }
                }

                if (neighborScore > 1) {
                    bestMoves.push(m);
                } else if (neighborScore > 0) {
                    goodMoves.push(m);
                }
            }

            if (preferredMinNeighbors === 2) {
                if (bestMoves.length > 0) return this._pickRandom(bestMoves);
                if (goodMoves.length > 0) return this._pickRandom(goodMoves);
            } else {
                if (goodMoves.length > 0) return this._pickRandom(goodMoves);
                if (bestMoves.length > 0) return this._pickRandom(bestMoves);
            }
            return 0;
        }

        _pickRandom(arr) {
            if (!arr || arr.length === 0) return 0;
            return arr[Math.floor(this.rng() * arr.length)];
        }

        decideBotMove(level = this.botLevel) {
            const available = this.getAvailableMultipliers();
            if (available.length === 0) return 0;

            if (this.lastPlayerMove <= 0) {
                return this._pickRandom(available);
            }

            // Level 1 (Easy): pure random available move
            if (level === 1) {
                return this._pickRandom(available);
            }

            const opponent = this.getOpponent(this.currentPlayer);

            // Level 4 (Master): if bot owns 0 cells, prefer center
            if (level >= 4 && this.getCellsOwnedBy(this.currentPlayer).length === 0) {
                const centerMove = this.captureCellAtCenter();
                if (centerMove > 0 && available.includes(centerMove)) {
                    // Check safety before blindly taking center if opponent already has a 2-in-a-row
                    const fatal = this.findFatalMoves(opponent);
                    if (!fatal.includes(centerMove)) {
                        return centerMove;
                    }
                }
            }

            // Check immediate winning move
            if (level === 2) {
                if (this.rng() >= 0.5) {
                    const finalMove = this.checkForFinalMove();
                    if (finalMove > 0) return finalMove;
                }
            } else {
                const finalMove = this.checkForFinalMove();
                if (finalMove > 0) return finalMove;
            }

            // Filter out moves that hand an immediate win to opponent
            const fatalMoves = this.findFatalMoves(opponent);
            const safeMoves = available.filter(m => !fatalMoves.includes(m));

            if (safeMoves.length > 0) {
                const neighborChoice = this.checkCellsWithNeighbor(safeMoves, level >= 4 ? 2 : 1);
                if (neighborChoice > 0) return neighborChoice;
                return this._pickRandom(safeMoves);
            }

            return this._pickRandom(available);
        }

        /**
         * Consumes/checks a hint for the current player.
         * @param {'available'|'fatal'|'auto'} type
         */
        useHint(type) {
            if (this.status !== 'playing') {
                return { ok: false, reason: 'game_ended' };
            }
            const pState = this.players[this.currentPlayer];
            const countKey = type === 'available'
                ? 'hintAvailable'
                : type === 'fatal'
                    ? 'hintDangerous'
                    : 'hintAuto';

            const alreadyUsedThisTurn = pState.usedAt[type] === this.turnNumber;
            if (!alreadyUsedThisTurn && pState[countKey] <= 0) {
                return { ok: false, reason: 'no_hints_left' };
            }

            if (!alreadyUsedThisTurn) {
                pState[countKey] -= 1;
                pState.usedAt[type] = this.turnNumber;
            }

            if (type === 'available') {
                const moves = this.getAvailableMultipliers();
                const cellValues = this.lastPlayerMove > 0
                    ? moves.map(m => m * this.lastPlayerMove)
                    : [];
                return {
                    ok: true,
                    type,
                    remaining: pState[countKey],
                    moves,
                    cellValues
                };
            }

            if (type === 'fatal') {
                const opponent = this.getOpponent(this.currentPlayer);
                const available = this.getAvailableMultipliers();
                const allFatal = this.findFatalMoves(opponent);
                const moves = allFatal.filter(m => available.includes(m));
                return {
                    ok: true,
                    type,
                    remaining: pState[countKey],
                    moves
                };
            }

            if (type === 'auto') {
                const suggested = this.decideBotMove(4);
                return {
                    ok: true,
                    type,
                    remaining: pState[countKey],
                    suggestedMove: suggested
                };
            }

            return { ok: false, reason: 'unknown_hint' };
        }
    }

    return {
        UNIQUE_PRODUCTS,
        DEMO_MULTIPLIERS,
        GameEngine,
        shuffleArray
    };
}));
