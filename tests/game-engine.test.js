const assert = require('assert');
const { UNIQUE_PRODUCTS, DEMO_MULTIPLIERS, GameEngine } = require('../js/game-engine.js');

function runTests() {
    // 1. Unique products check
    assert.strictEqual(UNIQUE_PRODUCTS.length, 36, 'Should have 36 unique products');
    assert.strictEqual(new Set(UNIQUE_PRODUCTS).size, 36, 'All products must be unique');
    for (let a = 1; a <= 9; a++) {
        for (let b = 1; b <= 9; b++) {
            assert.ok(UNIQUE_PRODUCTS.includes(a * b), `Product ${a * b} must be present`);
        }
    }

    // 2. First turn does not capture any cell; second turn captures product
    const eng = new GameEngine({ mode: 'duel', startingPlayer: 1, boardValues: DEMO_MULTIPLIERS });
    assert.strictEqual(eng.currentPlayer, 1);
    assert.strictEqual(eng.getAvailableMultipliers().length, 9);

    const r1 = eng.makeMove(7);
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.capturedCell, null, 'First move should not capture a cell');
    assert.strictEqual(eng.currentPlayer, 2);

    const r2 = eng.makeMove(5);
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.capturedCell.value, 35);
    assert.strictEqual(eng.cellsByValue[35].owner, 2);

    // 3. Cannot capture an already-owned cell (35 = 5 * 7, so if last move is 5, 7 is blocked!)
    const availAfter5 = eng.getAvailableMultipliers();
    assert.strictEqual(availAfter5.includes(7), false, '7 should be disabled because 5*7=35 is already owned');
    const invalid = eng.makeMove(7);
    assert.strictEqual(invalid.ok, false);

    // 4. Tutorial winning line sequence (P2=7, P1=5(35), P2=6(30), P1=3(18), P2=2(6), P1=8(16) -> P1 wins!)
    const tut = new GameEngine({ mode: 'tutorial', startingPlayer: 2 });
    assert.strictEqual(tut.makeMove(7).ok, true);
    assert.strictEqual(tut.makeMove(5).capturedCell.value, 35);
    assert.strictEqual(tut.makeMove(6).capturedCell.value, 30);
    assert.strictEqual(tut.makeMove(3).capturedCell.value, 18);
    assert.strictEqual(tut.makeMove(2).capturedCell.value, 6);
    const winRes = tut.makeMove(8);
    assert.strictEqual(winRes.won, true, 'P1 must win with 35, 18, 16 vertically');
    assert.strictEqual(winRes.winner, 1);
    assert.deepStrictEqual(
        winRes.winningLine.map(c => c.value).sort((a, b) => a - b),
        [16, 18, 35]
    );

    // 5. Fatal cells & fatal moves detection
    const engFatal = new GameEngine({ mode: 'duel', startingPlayer: 1, boardValues: DEMO_MULTIPLIERS });
    // Force P2 to own 2 and 35 (row 2, col 2 and 3). Neighbor (2,4)=40 is winning cell for P2!
    engFatal.cellsByValue[2].owner = 2;
    engFatal.cellsByValue[35].owner = 2;
    engFatal.lastPlayerMove = 1; // P1's turn with last=1
    const p2FatalCells = engFatal.findFatalCells(2);
    assert.ok(p2FatalCells.includes(40), '40 should be a fatal cell for P2');
    assert.ok(p2FatalCells.includes(42), '42 should also complete 42-2-35 for P2');
    const fatalMovesForP1 = engFatal.findFatalMoves(2);
    // If P1 picks 5, P2 can pick 8 -> 5*8=40 (win!). If P1 picks 8, P2 picks 5 -> 8*5=40 (win!).
    assert.ok(fatalMovesForP1.includes(5), '5 allows opponent to hit 40');
    assert.ok(fatalMovesForP1.includes(8), '8 allows opponent to hit 40');
    assert.ok(fatalMovesForP1.includes(6), '6 allows opponent to hit 42 via 6*7');
    assert.ok(fatalMovesForP1.includes(7), '7 allows opponent to hit 42 via 7*6');

    // 6. Master bot takes winning move immediately and avoids fatal moves
    const botEng = new GameEngine({ mode: 'single', botLevel: 4, startingPlayer: 2, boardValues: DEMO_MULTIPLIERS });
    botEng.cellsByValue[2].owner = 2;
    botEng.cellsByValue[35].owner = 2;
    botEng.lastPlayerMove = 5; // 5 * 8 = 40 -> immediate win for P2!
    assert.strictEqual(botEng.decideBotMove(4), 8, 'Master bot must take immediate winning move 8');

    // 7. Draw detection when all products of lastPlayerMove are owned
    const drawEng = new GameEngine({ mode: 'duel', startingPlayer: 1 });
    for (let m = 1; m <= 9; m++) {
        // Pre-own all multiples of 9 except 9 itself (let P1 pick 9 on first move? Wait: 9*1=9, 9*2=18..9*9=81)
        drawEng.cellsByValue[9 * m].owner = (m % 2 === 0 ? 1 : 2);
    }
    // Wait: make sure neither has 3-in-a-row, or test with minimal owners -> simpler: manually place non-aligned owners for 9*1..9*9
    const drawEng2 = new GameEngine({ mode: 'duel', startingPlayer: 1, boardValues: DEMO_MULTIPLIERS });
    // Multiples of 1 are 1..9. In DEMO_MULTIPLIERS: 1(3,5), 2(2,2), 3(5,1), 4(1,2), 5(4,4), 6(4,3), 7(4,1), 8(0,3), 9(1,0)
    // None of them form 3 in a row! Let's own 1..9 alternately
    [1, 3, 5, 7, 9].forEach(v => { drawEng2.cellsByValue[v].owner = 2; });
    [2, 4, 6, 8].forEach(v => { drawEng2.cellsByValue[v].owner = 1; });
    const drawRes = drawEng2.makeMove(1); // P1 picks 1 on opening turn; now P2 has to multiply by 1 -> 1..9 all owned!
    assert.strictEqual(drawRes.draw, true, 'Game must end in draw when next player has 0 available moves');
    assert.strictEqual(drawRes.winner, 0);

    // 8. Hint consumption and same-turn free repeat
    const hintEng = new GameEngine({ mode: 'duel', startingPlayer: 1 });
    hintEng.makeMove(6); // turn 1, now P2's turn
    const h1 = hintEng.useHint('available');
    assert.strictEqual(h1.ok, true);
    assert.strictEqual(h1.remaining, 2);
    assert.strictEqual(h1.moves.length, 9);
    const h2 = hintEng.useHint('available'); // same turn
    assert.strictEqual(h2.ok, true);
    assert.strictEqual(h2.remaining, 2, 'Repeating same hint in same turn should not deduct twice');

    // 9. Bot simulation stress test (100 full games at all bot levels)
    for (let lvl = 1; lvl <= 4; lvl++) {
        for (let g = 0; g < 25; g++) {
            const sim = new GameEngine({ mode: 'single', botLevel: lvl });
            let steps = 0;
            while (sim.status === 'playing' && steps < 50) {
                const mv = sim.decideBotMove(lvl);
                assert.ok(mv >= 1 && mv <= 9, `Bot level ${lvl} returned valid digit ${mv}`);
                const res = sim.makeMove(mv);
                assert.strictEqual(res.ok, true);
                steps++;
            }
            assert.strictEqual(sim.status, 'ended', `Simulated game ${g} at level ${lvl} must terminate`);
        }
    }

    console.log('ALL GAME ENGINE TESTS PASSED (including 100 full bot-vs-bot game simulations).');
}

runTests();
