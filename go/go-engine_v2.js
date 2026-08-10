/**
 * 3D движок Го (n-мерный, по умолчанию 3D)
 * Поддерживает переменную размерность, подсчёт очков по трём наборам правил
 * (китайские — по площади; японские/корейские — по территории + пленные),
 * этап согласования мёртвых камней перед подсчётом, простое ко и основные
 * правила Го.
 * API соответствует указанной спецификации.
 */

// Константы камней
const Stone = {
    EMPTY: 0,
    BLACK: 1,
    WHITE: 2
};

/**
 * Класс доски, представляющий состояние доски Го в n измерениях.
 * @param {number[]} dims - Массив размеров по каждому измерению (например, [19,19,19] для 3D).
 * @param {number} komi - Значение коми (по умолчанию 7.5).
 */
class Board {
    /**
     * @param {number[]} dims
     * @param {number} komi
     * @param {'chinese'|'japanese'|'korean'} ruleSet - влияет только на формулу
     *   подсчёта очков (computeScore) — 'chinese' считает камни+территорию,
     *   'japanese'/'korean' — территорию+пленные (механически идентичны).
     */
    constructor(dims, komi = 7.5, ruleSet = 'chinese') {
        this.dims = dims.slice();                 // копия размерностей
        this.totalSize = dims.reduce((a, b) => a * b, 1);
        this.grid = new Array(this.totalSize).fill(Stone.EMPTY);
        this.komi = komi;
        this.ruleSet = (ruleSet === 'japanese' || ruleSet === 'korean') ? ruleSet : 'chinese';
        this.currentPlayer = Stone.BLACK;
        this.captures = { [Stone.BLACK]: 0, [Stone.WHITE]: 0 };
        this.moveHistory = [];                    // хранит хэши Цобриста после каждого хода
        this.stateHistory = [];
        this.saveState(); // сохраняем начальное состояние
        this.passCount = 0;
        this.gameOver = false;
        this.resigned = false;
        // Между вторым пасом подряд и подтверждением подсчёта (согласованием
        // мёртвых камней) — партия ещё не закончена, но обычные ходы уже
        // недоступны. См. pass()/finalizeScoring()/resumeFromScoring().
        this.awaitingScoring = false;

        // Инициализация хэширования Цобриста
        this.initZobrist();
        this.hash = this.computeHash();
        this.moveHistory.push(this.hash);          // начальное состояние
    }

    // ---------- Вспомогательные методы ----------
    /**
     * Преобразует массив координат в линейный индекс.
     * @param {number[]} coord - Массив координат.
     * @returns {number} Линейный индекс.
     */
    coordToIndex(coord) {
        let idx = 0;
        let mul = 1;
        for (let i = this.dims.length - 1; i >= 0; i--) {
            idx += coord[i] * mul;
            mul *= this.dims[i];
        }
        return idx;
    }

    /**
     * Преобразует линейный индекс в массив координат.
     * @param {number} idx - Линейный индекс.
     * @returns {number[]} Массив координат.
     */
    indexToCoord(idx) {
        const coord = new Array(this.dims.length);
        let remainder = idx;
        for (let i = this.dims.length - 1; i >= 0; i--) {
            const dim = this.dims[i];
            coord[i] = remainder % dim;
            remainder = Math.floor(remainder / dim);
        }
        return coord;
    }

    /**
     * Получает все соседние координаты заданной координаты.
     * @param {number[]} coord - Массив координат.
     * @returns {number[][]} Массив соседних координат.
     */
    getNeighbors(coord) {
        const neighbors = [];
        for (let i = 0; i < coord.length; i++) {
            for (const delta of [-1, 1]) {
                const newCoord = [...coord];
                newCoord[i] += delta;
                if (newCoord[i] >= 0 && newCoord[i] < this.dims[i]) {
                    neighbors.push(newCoord);
                }
            }
        }
        return neighbors;
    }

    // ---------- Хэширование Цобриста ----------
    initZobrist() {
        this.zobristTable = new Array(this.totalSize);
        for (let i = 0; i < this.totalSize; i++) {
            this.zobristTable[i] = {
                [Stone.EMPTY]: 0n,
                [Stone.BLACK]: this.randomBigInt(),
                [Stone.WHITE]: this.randomBigInt()
            };
        }
    }

    randomBigInt() {
        // Используем BigInt для очень низкой вероятности коллизий
        return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    }

    computeHash() {
        let hash = 0n;
        for (let i = 0; i < this.totalSize; i++) {
            const stone = this.grid[i];
            if (stone !== Stone.EMPTY) {
                hash ^= this.zobristTable[i][stone];
            }
        }
        return hash;
    }

    updateHash(index, oldStone, newStone) {
        if (oldStone !== Stone.EMPTY) {
            this.hash ^= this.zobristTable[index][oldStone];
        }
        if (newStone !== Stone.EMPTY) {
            this.hash ^= this.zobristTable[index][newStone];
        }
    }

    // ---------- Утилиты для групп и дамэ (либерти) ----------
    /**
     * Получает количество дамэ (либерти) группы, содержащей заданную координату.
     * @param {number[]} coord - Начальная координата.
     * @returns {number} Количество дамэ.
     */
    getLiberties(coord) {
        const color = this.grid[this.coordToIndex(coord)];
        if (color === Stone.EMPTY) return 0;

        const visited = new Set();
        const queue = [coord];
        const key = (c) => c.join(',');
        visited.add(key(coord));
        const liberties = new Set();

        while (queue.length) {
            const current = queue.shift();
            const neighbors = this.getNeighbors(current);
            for (const n of neighbors) {
                const nKey = key(n);
                const idx = this.coordToIndex(n);
                const stone = this.grid[idx];
                if (stone === Stone.EMPTY) {
                    liberties.add(nKey);
                } else if (stone === color && !visited.has(nKey)) {
                    visited.add(nKey);
                    queue.push(n);
                }
            }
        }
        return liberties.size;
    }

    /**
     * Получает все камни в группе, содержащей заданную координату.
     * @param {number[]} coord - Начальная координата.
     * @returns {number[][]} Массив координат в группе.
     */
    getGroup(coord) {
        const color = this.grid[this.coordToIndex(coord)];
        if (color === Stone.EMPTY) return [];

        const visited = new Set();
        const queue = [coord];
        const key = (c) => c.join(',');
        visited.add(key(coord));
        const group = [coord];

        while (queue.length) {
            const current = queue.shift();
            const neighbors = this.getNeighbors(current);
            for (const n of neighbors) {
                const nKey = key(n);
                const idx = this.coordToIndex(n);
                if (this.grid[idx] === color && !visited.has(nKey)) {
                    visited.add(nKey);
                    queue.push(n);
                    group.push(n);
                }
            }
        }
        return group;
    }

    /**
     * Удаляет группу камней с доски и обновляет захваченные камни.
     * @param {number[][]} group - Массив координат для удаления.
     */
    removeGroup(group) {
        const color = this.grid[this.coordToIndex(group[0])];
        for (const coord of group) {
            const idx = this.coordToIndex(coord);
            const oldStone = this.grid[idx];
            this.grid[idx] = Stone.EMPTY;
            this.updateHash(idx, oldStone, Stone.EMPTY);
        }
        this.captures[color] += group.length;
    }

    // ---------- Проверка легальности и выполнение хода ----------
    /**
     * Проверяет, является ли ход легальным.
     * @param {number[]} coord - Координата для размещения камня.
     * @param {number} player - Цвет камня (BLACK или WHITE).
     * @returns {boolean} True, если ход легален.
     */
    isLegalMove(coord, player) {
        const idx = this.coordToIndex(coord);
        if (this.grid[idx] !== Stone.EMPTY) return false;

        // Сохраняем текущее состояние
        const oldGrid = [...this.grid];
        const oldHash = this.hash;

        // Временно ставим камень
        this.grid[idx] = player;
        this.updateHash(idx, Stone.EMPTY, player);

        const opponent = player === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
        const capturedGroups = [];

        // Находим соседние группы противника с нулевым количеством дамэ после размещения
        const neighbors = this.getNeighbors(coord);
        for (const n of neighbors) {
            const nIdx = this.coordToIndex(n);
            if (this.grid[nIdx] === opponent) {
                if (this.getLiberties(n) === 0) {
                    capturedGroups.push(this.getGroup(n));
                }
            }
        }

        // Временно удаляем захваченные группы для проверки самоубийства
        for (const group of capturedGroups) {
            for (const c of group) {
                const cIdx = this.coordToIndex(c);
                this.grid[cIdx] = Stone.EMPTY;
                this.updateHash(cIdx, opponent, Stone.EMPTY);
            }
        }

        // Проверяем, есть ли у поставленного камня дамэ после захватов
        const hasLiberties = this.getLiberties(coord) > 0;

        // Простое ко: нельзя вернуться к предыдущему состоянию доски
        const currentHash = this.hash;
        const lastHash = this.moveHistory[this.moveHistory.length - 2];
        const isKo = (currentHash === lastHash);

        // Восстанавливаем состояние
        this.grid = oldGrid;
        this.hash = oldHash;

        return hasLiberties && !isKo;
    }

    /**
     * Выполняет ход на доске.
     * @param {number[]} coord - Координата для размещения камня.
     * @param {number} player - Цвет камня (BLACK или WHITE).
     * @returns {boolean} True, если ход успешно выполнен.
     */
    makeMove(coord, player) {
        if (this.gameOver || this.awaitingScoring) return false;
        //if (player !== this.currentPlayer) return false;
        //if (!this.isLegalMove(coord, player)) return false;

        const idx = this.coordToIndex(coord);
        this.grid[idx] = player;
        this.updateHash(idx, Stone.EMPTY, player);

        const opponent = player === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
        const neighbors = this.getNeighbors(coord);

        // Захватываем группы противника без дамэ
        for (const n of neighbors) {
            const nIdx = this.coordToIndex(n);
            if (this.grid[nIdx] === opponent) {
                if (this.getLiberties(n) === 0) {
                    this.removeGroup(this.getGroup(n));
                }
            }
        }

        // Запись хода
        this.moveHistory.push(this.hash);
        this.passCount = 0;
        this.currentPlayer = opponent;
        this.saveState();
        return true;
    }

    /**
     * Пропускает ход.
     * @returns {boolean} True, если пропуск выполнен успешно.
     */
    pass() {
        if (this.gameOver || this.awaitingScoring) return false;
        this.passCount++;
        if (this.passCount >= 2) {
            // Партия ещё не окончена — сначала согласование мёртвых камней.
            // См. finalizeScoring()/resumeFromScoring().
            this.awaitingScoring = true;
        }
        this.currentPlayer = this.currentPlayer === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
        this.saveState();
        return true;
    }

    /**
     * Сдаётся в партии.
     * @returns {boolean} True, если сдача выполнена успешно.
     */
    resign() {
        if (this.gameOver) return false;
        this.gameOver = true;
        this.awaitingScoring = false;
        this.resigned = true;
        this.saveState();
        return true;
    }

    /**
     * Находит связную группу камней, содержащую координату `coord` (0 очков,
     * если клетка пуста) — публичная обёртка над getGroup для UI разметки.
     * @param {number[]} coord
     * @returns {number[][]} Координаты камней в группе (пусто, если клетка пуста).
     */
    groupAt(coord) {
        return this.getGroup(coord);
    }

    /**
     * Считает итоговый счёт, как если бы переданные группы камней были сняты
     * с доски как мёртвые — не меняет состояние (для живого превью в UI).
     * @param {number[][]} deadCoords - Координаты клеток с мёртвыми камнями
     *   (не обязательно по одной на группу — годится любой список клеток).
     * @returns {{black:number, white:number}}
     */
    previewScore(deadCoords) {
        const clone = this.clone();
        clone._removeDeadStones(deadCoords);
        return clone.computeScore();
    }

    /**
     * Физически снимает переданные клетки с доски как настоящее взятие
     * (идёт в captures — как и обычный захват при обычном ходе).
     * @param {number[][]} deadCoords
     */
    _removeDeadStones(deadCoords) {
        const seen = new Set();
        for (const coord of deadCoords) {
            const idx = this.coordToIndex(coord);
            if (seen.has(idx)) continue;
            if (this.grid[idx] === Stone.EMPTY) continue;
            const group = this.getGroup(coord);
            for (const c of group) seen.add(this.coordToIndex(c));
            this.removeGroup(group);
        }
    }

    /**
     * Подтверждает подсчёт: снимает мёртвые камни (как настоящее взятие) и
     * завершает партию. После этого computeScore() считает по уже «очищенной» доске.
     * @param {number[][]} deadCoords - Клетки с мёртвыми камнями.
     * @returns {boolean} True, если подтверждение выполнено (была фаза разметки).
     */
    finalizeScoring(deadCoords) {
        if (!this.awaitingScoring) return false;
        this._removeDeadStones(deadCoords || []);
        this.awaitingScoring = false;
        this.gameOver = true;
        this.saveState();
        return true;
    }

    /**
     * Отменяет фазу разметки и возвращает игру к обычному ходу (ничего не
     * снималось с доски, раз finalizeScoring не вызывался — просто продолжаем).
     * @returns {boolean} True, если отмена выполнена (была фаза разметки).
     */
    resumeFromScoring() {
        if (!this.awaitingScoring) return false;
        this.awaitingScoring = false;
        this.passCount = 0;
        this.saveState();
        return true;
    }

    // Метод сохранения состояния
    saveState() {
        const state = {
            grid: [...this.grid],
            captures: { ...this.captures },
            currentPlayer: this.currentPlayer,
            passCount: this.passCount,
            gameOver: this.gameOver,
            resigned: this.resigned,
            awaitingScoring: this.awaitingScoring,
            moveHistory: [...this.moveHistory],
            hash: this.hash
        };
        this.stateHistory.push(state);
    }
    // Метод отмены последнего хода
    undo() {
        if (this.stateHistory.length <= 1) return false; // нет предыдущего состояния
        this.stateHistory.pop(); // удаляем текущее состояние
        const prevState = this.stateHistory[this.stateHistory.length - 1];
        // Восстанавливаем
        this.grid = [...prevState.grid];
        this.captures = { ...prevState.captures };
        this.currentPlayer = prevState.currentPlayer;
        this.passCount = prevState.passCount;
        this.gameOver = prevState.gameOver;
        this.resigned = prevState.resigned;
        this.awaitingScoring = !!prevState.awaitingScoring;
        this.moveHistory = [...prevState.moveHistory];
        this.hash = prevState.hash;
        return true;
    }

    /**
     * Глубокая копия доски для поиска AI (общий Zobrist-таблицы).
     * @returns {Board}
     */
    clone() {
        const b = Object.create(Board.prototype);
        b.dims = this.dims.slice();
        b.totalSize = this.totalSize;
        b.komi = this.komi;
        b.ruleSet = this.ruleSet;
        b.grid = this.grid.slice();
        b.captures = {
            [Stone.BLACK]: this.captures[Stone.BLACK],
            [Stone.WHITE]: this.captures[Stone.WHITE]
        };
        b.currentPlayer = this.currentPlayer;
        b.passCount = this.passCount;
        b.gameOver = this.gameOver;
        b.resigned = this.resigned;
        b.awaitingScoring = this.awaitingScoring;
        b.moveHistory = this.moveHistory.slice();
        b.hash = this.hash;
        b.zobristTable = this.zobristTable;
        b.stateHistory = [];
        b.saveState();
        return b;
    }

    // ---------- Подсчёт очков ----------
    /**
     * Вычисляет очки по выбранным правилам (this.ruleSet):
     * - 'chinese' — по площади: свои камни на доске + территория + коми.
     * - 'japanese'/'korean' — только территория + пленные камни + коми
     *   (механически идентичны в этом движке).
     * @returns {{black: number, white: number}} Очки для чёрных и белых.
     */
    computeScore() {
        const territory = new Array(this.totalSize).fill(null);
        const visited = new Set();
        const key = (c) => c.join(',');

        // Заливаем пустые области, чтобы определить владение территорией
        for (let i = 0; i < this.totalSize; i++) {
            if (this.grid[i] === Stone.EMPTY) {
                const coord = this.indexToCoord(i);
                const coordKey = key(coord);
                if (visited.has(coordKey)) continue;

                const queue = [coord];
                const region = [coord];
                visited.add(coordKey);
                const borderColors = new Set();

                while (queue.length) {
                    const current = queue.shift();
                    const neighbors = this.getNeighbors(current);
                    for (const n of neighbors) {
                        const nIdx = this.coordToIndex(n);
                        const nKey = key(n);
                        if (this.grid[nIdx] === Stone.EMPTY) {
                            if (!visited.has(nKey)) {
                                visited.add(nKey);
                                queue.push(n);
                                region.push(n);
                            }
                        } else {
                            borderColors.add(this.grid[nIdx]);
                        }
                    }
                }

                // Определяем владельца: если область граничит только с одним цветом,
                // это территория этого цвета
                let owner = null;
                if (borderColors.size === 1) {
                    owner = borderColors.values().next().value;
                }
                for (const c of region) {
                    territory[this.coordToIndex(c)] = owner;
                }
            }
        }

        let blackScore = 0;
        let whiteScore = 0;

        if (this.ruleSet === 'chinese') {
            // Площадь: свои камни на доске + территория.
            for (let i = 0; i < this.totalSize; i++) {
                if (this.grid[i] === Stone.BLACK) blackScore++;
                else if (this.grid[i] === Stone.WHITE) whiteScore++;
                else if (territory[i] === Stone.BLACK) blackScore++;
                else if (territory[i] === Stone.WHITE) whiteScore++;
            }
        } else {
            // Территория (японские/корейские): только территория + пленные.
            // captures[WHITE] — снятые белые камни, т.е. пленные у чёрных, и наоборот.
            for (let i = 0; i < this.totalSize; i++) {
                if (territory[i] === Stone.BLACK) blackScore++;
                else if (territory[i] === Stone.WHITE) whiteScore++;
            }
            blackScore += this.captures[Stone.WHITE];
            whiteScore += this.captures[Stone.BLACK];
        }

        whiteScore += this.komi;
        return { black: blackScore, white: whiteScore };
    }

    getScore() {
        return this.computeScore();
    }

    // ---------- Запросы состояния игры ----------
    getCurrentPlayer() {
        return this.currentPlayer;
    }

    isGameOver() {
        return this.gameOver;
    }

    isAwaitingScoring() {
        return this.awaitingScoring;
    }

    getCapturedStones() {
        return { black: this.captures[Stone.BLACK], white: this.captures[Stone.WHITE] };
    }

    /**
     * Получает все легальные ходы для текущего игрока.
     * @returns {number[][]} Массив координат.
     */
    getPossibleMoves() {
        const moves = [];
        for (let i = 0; i < this.totalSize; i++) {
            const coord = this.indexToCoord(i);
            if (this.isLegalMove(coord, this.currentPlayer)) {
                moves.push(coord);
            }
        }
        return moves;
    }

    hasMoves() {
        return this.getPossibleMoves().length > 0;
    }
}

// ---------- Экспорт API ----------
const GoEngine = {
    Board: Board,
    InitBoard: (dimensions, komi = 7.5, ruleSet = 'chinese') => new Board(dimensions, komi, ruleSet),
    SetKomi: (board, komi) => { board.komi = komi; },
    Pass: (board) => board.pass(),
    Resign: (board) => board.resign(),
    ComputeScore: (board) => board.computeScore(),
    GetScore: (board) => board.getScore(),
    IsGameOver: (board) => board.isGameOver(),
    IsAwaitingScoring: (board) => board.isAwaitingScoring(),
    GroupAt: (board, coord) => board.groupAt(coord),
    PreviewScore: (board, deadCoords) => board.previewScore(deadCoords),
    FinalizeScoring: (board, deadCoords) => board.finalizeScoring(deadCoords),
    ResumeFromScoring: (board) => board.resumeFromScoring(),
    GetCurrentPlayer: (board) => board.getCurrentPlayer(),
    GetCapturedStones: (board) => board.getCapturedStones(),
    GetPossibleMoves: (board) => board.getPossibleMoves(),
    HasMoves: (board) => board.hasMoves(),
    isLegalMove: (board, coord, player) => board.isLegalMove(coord, player),
    MakeMove: (board, coord, player) => board.makeMove(coord, player),
    Clone: (board) => board.clone(),
    Stone: Stone
};

// Экспорт для браузера или Node.js
if (typeof window !== 'undefined') {
    window.GoEngine = GoEngine;
} else if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoEngine;
}