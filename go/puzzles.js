// Режим решения задач по Го — тот же подход, что и chess/puzzles.js:
// переиспользует всю кликовую механику GoGame, перехватывая только
// makeMove() для сверки с решением задачи.
class GoPuzzleGame extends GoGame {
    constructor() {
        super();

        this.mode = 'unrated';
        this.seenIds = [];
        this.currentPuzzle = null;
        this.solutionIndex = 0;
        this.mistakeMade = false;
        this.awaitingReply = false;
        this.solved = false;

        this.updateRatingUI();
        this.loadPuzzle();
    }

    makeMove(x, y, z) {
        if (!this.currentPuzzle || this.awaitingReply || this.solved) return;

        const expected = this.currentPuzzle.solution[this.solutionIndex];
        const matches = expected && expected.to.x === x && expected.to.y === y && expected.to.z === z;

        if (!matches) {
            this.mistakeMade = true;
            UI.toast('Неверно, попробуйте снова', 'error');
            GraphicsEngine.unselectCell();
            return;
        }

        super.makeMove(x, y, z);
        this.solutionIndex++;
        this.afterSolverMove();
    }

    afterSolverMove() {
        if (this.solutionIndex >= this.currentPuzzle.solution.length) {
            this.onSolved();
            return;
        }
        this.awaitingReply = true;
        const reply = this.currentPuzzle.solution[this.solutionIndex];
        setTimeout(() => {
            super.makeMove(reply.to.x, reply.to.y, reply.to.z);
            this.solutionIndex++;
            this.awaitingReply = false;
            if (this.solutionIndex >= this.currentPuzzle.solution.length) {
                this.onSolved();
            }
        }, 500);
    }

    onSolved() {
        this.solved = true;
        UI.toast('Задача решена!', 'success');
        PuzzlePool.recordResult('go', this.mode, this.currentPuzzle.rating, !this.mistakeMade);
        this.updateRatingUI();
        this.updatePuzzleStatusUI(this.mistakeMade ? 'Решено (была ошибка в процессе).' : 'Решено без ошибок!');
    }

    async loadPuzzle() {
        this.currentPuzzle = null;
        this.solutionIndex = 0;
        this.mistakeMade = false;
        this.awaitingReply = false;
        this.solved = false;
        this.cancelBotSearch();

        const puzzle = await PuzzlePool.getPuzzle('go', this.seenIds);
        if (!puzzle) {
            this.updatePuzzleStatusUI('Пул задач пуст.');
            return;
        }
        this.seenIds.push(puzzle.id);
        if (this.seenIds.length > 20) this.seenIds.shift();

        this.currentPuzzle = puzzle;
        this.moveHistory = [];

        const S = GoEngine.Stone;
        this.board = new GoEngine.Board(puzzle.dims, puzzle.komi, puzzle.ruleSet);
        puzzle.stones.forEach(({ x, y, z, color }) => {
            this.board.grid[this.board.coordToIndex([x, y, z])] = color === 'Black' ? S.BLACK : S.WHITE;
        });
        this.board.currentPlayer = puzzle.sideToMove === 'Black' ? S.BLACK : S.WHITE;

        GraphicsEngine.createAndFillBoardForGo(this.board);
        GraphicsEngine.unselectCell();
        this.updateUI();
        this.updatePuzzleStatusUI(
            `Рейтинг задачи: ${puzzle.rating}. Ход ${puzzle.sideToMove === 'White' ? 'белых' : 'чёрных'}.` +
            (puzzle.description ? ` ${puzzle.description}.` : '')
        );
    }

    setMode(mode) {
        this.mode = mode;
        document.getElementById('mode-rated')?.classList.toggle('active', mode === 'rated');
        document.getElementById('mode-unrated')?.classList.toggle('active', mode === 'unrated');
        this.updateRatingUI();
    }

    updateRatingUI() {
        const el = document.getElementById('puzzle-rating');
        if (!el) return;
        el.textContent = this.mode === 'rated'
            ? `Ваш рейтинг задач: ${Math.round(PuzzlePool.getRating('go'))}`
            : 'Режим без рейтинга — тренировка, рейтинг не меняется';
    }

    updatePuzzleStatusUI(text) {
        const el = document.getElementById('puzzle-status');
        if (el) el.textContent = text;
    }
}

window.addEventListener('load', () => {
    window.goGame = new GoPuzzleGame();
});
