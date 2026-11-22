(function (root) {
    'use strict';

    /**
     * Exact 18-step interactive tutorial faithful to original TutorialController.
     */
    const TUTORIAL_STEPS = [
        { key: 'tutorial_welcome_message', action: 'welcome' },
        { key: 'tutorial_opponent_buttons', action: 'showOpponentButtons' },
        { key: 'tutorial_user_buttons', action: 'showUserButtons' },
        { key: 'tutorial_grid_definition', action: 'showGameGrid' },
        { key: 'tutorial_game_rule_1', action: 'showHorizontalWin' },
        { key: 'tutorial_game_rule_2', action: 'showVerticalWin' },
        { key: 'tutorial_game_rule_3', action: 'showDiagonalWin' },
        { key: 'tutorial_game_rule_4', action: 'clearAndShowRule4' },
        { key: 'tutorial_opponent_turn_1', action: 'waitClick' },
        { key: 'tutorial_opponent_result', action: 'botFirstMove7' },
        { key: 'tutorial_opponent_result_2', action: 'userFirstMove5', requireDigit: 5, highlightCell: 35 },
        { key: 'tutorial_opponent_turn_2', action: 'waitClick' },
        { key: 'tutorial_opponent_turn_3', action: 'botSecondMove6' },
        { key: 'tutorial_user_will_make_second_move', action: 'userSecondMove3', requireDigit: 3, highlightCell: 18 },
        { key: 'tutorial_opponent_turn_4', action: 'waitClick' },
        { key: 'tutorial_opponent_turn_5', action: 'botThirdMove2' },
        { key: 'tutorial_final_move', action: 'userFinalMove8', requireDigit: 8, highlightCell: 16 },
        { key: 'tutorial_final_move_failed', action: 'retryFinalMove8', requireDigit: 8, highlightCell: 16 }
    ];

    root.CarpangaTutorialSteps = TUTORIAL_STEPS;
}(typeof self !== 'undefined' ? self : this));
