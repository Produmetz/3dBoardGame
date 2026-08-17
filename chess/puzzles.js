// Режим решения тактических задач — переиспользует всю кликовую/raycasting-
// механику класса Game (выделение фигуры, подсветка ходов, модалка
// превращения), а не пишет её заново: единственное, что меняется — makeMove()
// перехватывается и сверяется с решением задачи вместо свободного хода.
class ChessPuzzleGame extends Game {
    constructor() {
        super(); // сначала обычная инициализация (стандартная позиция, обработчики, анимация) —
        // сразу после неё стартовая позиция заменяется первой задачей в loadPuzzle().

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

    // Перехватываем каждую попытку хода (и обычную, и после выбора фигуры
    // превращения — completePromotion тоже зовёт makeMove) и сверяем её с
    // текущим полу-ходом решения вместо того, чтобы просто выполнить любой
    // легальный ход, как в обычной игре.
    makeMove(fromX, fromY, fromZ, toX, toY, toZ, promotionType) {
        if (!this.currentPuzzle || this.awaitingReply || this.solved) return;

        const expected = this.currentPuzzle.solution[this.solutionIndex];
        const matches = expected &&
            expected.from.x === fromX && expected.from.y === fromY && expected.from.z === fromZ &&
            expected.to.x === toX && expected.to.y === toY && expected.to.z === toZ &&
            (!expected.promotion || expected.promotion === promotionType);

        if (!matches) {
            this.mistakeMade = true;
            UI.toast('Неверно, попробуйте снова', 'error');
            return;
        }

        super.makeMove(fromX, fromY, fromZ, toX, toY, toZ, promotionType);
        this.solutionIndex++;
        this.afterSolverMove();
    }

    // Доигрывает форсированный ответ соперника (нечётные индексы решения)
    // сама, с небольшой задержкой, чтобы ход было видно.
    afterSolverMove() {
        if (this.solutionIndex >= this.currentPuzzle.solution.length) {
            this.onSolved();
            return;
        }
        this.awaitingReply = true;
        const reply = this.currentPuzzle.solution[this.solutionIndex];
        setTimeout(() => {
            super.makeMove(reply.from.x, reply.from.y, reply.from.z, reply.to.x, reply.to.y, reply.to.z, reply.promotion);
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
        PuzzlePool.recordResult('chess', this.mode, this.currentPuzzle.rating, !this.mistakeMade);
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

        const puzzle = await PuzzlePool.getPuzzle('chess', this.seenIds);
        if (!puzzle) {
            this.updatePuzzleStatusUI('Пул задач пуст.');
            return;
        }
        this.seenIds.push(puzzle.id);
        if (this.seenIds.length > 20) this.seenIds.shift();

        this.currentPuzzle = puzzle;
        this.currentPlayer = puzzle.sideToMove;
        this.moveHistory = [];

        ChessEngine.FillPole();
        puzzle.pieces.forEach(({ x, y, z, figureType, color }) => {
            const ctor = ChessEngine[`${color}${figureType}`];
            if (ctor) ChessEngine.Pole[x][y][z] = new ctor();
        });

        GraphicsEngine.createAndFillBoardOnPole(ChessEngine.Pole);
        GraphicsEngine.unselectCell();
        GraphicsEngine.unHighlightingPossibleMoves();
        this.checkGameState();
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
            ? `Ваш рейтинг задач: ${Math.round(PuzzlePool.getRating('chess'))}`
            : 'Режим без рейтинга — тренировка, рейтинг не меняется';
    }

    updatePuzzleStatusUI(text) {
        const el = document.getElementById('puzzle-status');
        if (el) el.textContent = text;
    }
}

window.addEventListener('load', () => {
    window.chessGame = new ChessPuzzleGame();
});
