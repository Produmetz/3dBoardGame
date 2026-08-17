// game.js
// Основной файл игры, связывающий шахматный движок и графику

class Game {
    constructor() {
        this.currentPlayer = 'White'; // Начинают белые
        this.moveHistory = [];
        this.isDragging = false; // Флаг для отслеживания перетаскивания
        this.dragThreshold = 5; // Порог движения мыши в пикселях

        this.isStandardPosition = true;
        this.networkManager = new NetworkManager(this);
        this.isNetworkGame = false;
        this.isNetworkMove = false;
        this.isMyTurn = true;
        this.selectedRoomId = null;

        // Локальный бот
        this.botEnabled = false;
        this.botColor = 'Black';
        this.botDepth = 2;
        this.botThinking = false;
        this._botMoveToken = 0;

        this.init();
    }

    init() {
        // Инициализация шахматного движка
        ChessEngine.InitGame();

        // Создаем доску с фигурами
        createAndFillBoardOnPole(ChessEngine.Pole);

        // Добавляем обработчики событий
        this.setupEventListeners();

        // Настройка бота из query-параметров (?bot=1&color=White|Black&depth=1-5),
        // проставленных модалкой "Против компьютера" на главной странице.
        this.applyBotConfigFromUrl();

        // Запускаем анимацию
        animate();

        console.log('Игра началась! Ходят ' + this.currentPlayer);
        this.updateUI();
    }

    applyBotConfigFromUrl() {
        if (this.isNetworkGame) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('bot') !== '1') return;

        const color = params.get('color');
        const depth = params.get('depth');

        const enabledInput = document.getElementById('bot-enabled');
        if (enabledInput) enabledInput.checked = true;

        if (color === 'White' || color === 'Black') {
            const colorInput = document.getElementById('bot-color');
            if (colorInput) colorInput.value = color;
        }

        this.setBotEnabled(true);
        if (color === 'White' || color === 'Black') this.setBotColor(color);
        if (depth) this.setBotDepth(depth);
    }

    resetToStandart() {
        this.cancelBotSearch();
        ChessEngine.InitGame();
        this.currentPlayer = 'White';
        this.moveHistory = [];
        this.isDragging = false;
        this.isStandardPosition = true; // Устанавливаем флаг в true

        createAndFillBoardOnPole(ChessEngine.Pole);
        this.updateUI();
        console.log('Новая игра началась! Ходят ' + this.currentPlayer);
        this.maybeBotMove();
    }

    setupEventListeners() {
        let mouseDownX, mouseDownY;

        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Левая кнопка мыши
                mouseDownX = event.clientX;
                mouseDownY = event.clientY;
                this.isDragging = false;
            }
        });

        canvas.addEventListener('mousemove', (event) => {
            if (event.buttons === 1) { // Левая кнопка зажата
                const dx = Math.abs(event.clientX - mouseDownX);
                const dy = Math.abs(event.clientY - mouseDownY);

                if (dx > this.dragThreshold || dy > this.dragThreshold) {
                    this.isDragging = true;
                }
            }
        });

        canvas.addEventListener('click', (event) => {
            if (event.button === 0 && !this.isDragging) {
                this.handleCanvasClick(event);
            }
        });

        // Поддержка touch-событий для мобильных устройств
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            mouseDownX = touch.clientX;
            mouseDownY = touch.clientY;
            this.isDragging = false;
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (mouseDownX === undefined) return;
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - mouseDownX);
            const dy = Math.abs(touch.clientY - mouseDownY);
            if (dx > this.dragThreshold || dy > this.dragThreshold) {
                this.isDragging = true;
            }
        });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.isDragging) return;
            const touch = e.changedTouches[0];
            if (touch) {
                this.handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
            }
        });
    }

    handleCanvasClick(event) {
        const cellCoords = GraphicsEngine.cellFromClick(event.clientX, event.clientY);

        if (!cellCoords) return;

        if (this.networkManager && this.networkManager.isSpectator) return;

        // Не даём человеку ходить за сторону бота / пока бот думает
        if (this.isBotSideToMove() || this.botThinking) return;

        const { i, j, k } = cellCoords;
        const figure = ChessEngine.Pole[i][j][k];

        // Если клетка уже выбрана
        if (GraphicsEngine.highlightedCell &&
            GraphicsEngine.highlightedCell.i == i &&
            GraphicsEngine.highlightedCell.j == j &&
            GraphicsEngine.highlightedCell.k == k) {
            // Снимаем выделение
            GraphicsEngine.unselectCell();
            GraphicsEngine.unHighlightingPossibleMoves();
            return;
        }

        // Если есть выбранная клетка и клик на возможный ход
        if (GraphicsEngine.highlightedCell && this.isPossibleMove(i, j, k) && this.isMyTurn) {
            const from = GraphicsEngine.highlightedCell;
            const movingFigure = ChessEngine.Pole[from.i][from.j][from.k];
            if (movingFigure && movingFigure.Name === 'Pawn' && ChessEngine.IsPromotionSquare(k, movingFigure.Color === 'White')) {
                // Превращение пешки — спрашиваем игрока, во что превратить,
                // и завершаем ход только после выбора (см. completePromotion).
                this.pendingPromotionMove = { from: { i: from.i, j: from.j, k: from.k }, to: { i, j, k } };
                this.showPromotionModal();
                return;
            }
            // Выполняем ход
            this.makeMove(GraphicsEngine.highlightedCell.i, GraphicsEngine.highlightedCell.j, GraphicsEngine.highlightedCell.k, i, j, k);
            return;
        }

        // Если клик на фигуру текущего игрока
        if (figure && figure.Color === this.currentPlayer) {
            // Выбираем эту фигуру
            GraphicsEngine.selectCell(i, j, k);
            GraphicsEngine.highlightingPossibleMoves(ChessEngine.MaybeMovesWithCheck(i, j, k, ChessEngine.Pole));
        } else if (highlightedCell) {
            // Если есть выбранная клетка, но клик не на возможный ход - снимаем выделение
            GraphicsEngine.unHighlightingPossibleMoves();
            GraphicsEngine.unselectCell();
        }
    }

    isBotSideToMove() {
        return !this.isNetworkGame && this.botEnabled && this.botColor === this.currentPlayer;
    }

    isGameOverByMate() {
        const state = ChessEngine.FoundKing(ChessEngine.Pole);
        if (state === 'CheckMateWhite' || state === 'CheckMateBlack') return true;
        return ChessEngine.IsStalemate(ChessEngine.Pole, this.currentPlayer === 'White');
    }

    updateBotStatusUI() {
        const statusEl = document.getElementById('bot-status');
        if (!statusEl) return;
        if (this.isNetworkGame || !this.botEnabled) {
            statusEl.textContent = '';
            return;
        }
        if (this.botThinking) {
            statusEl.textContent = 'Бот думает…';
        } else {
            const side = this.botColor === 'White' ? 'белых' : 'чёрных';
            statusEl.textContent = `Бот играет за ${side}`;
        }
    }

    updateBotPanelVisibility() {
        const panel = document.getElementById('bot-controls');
        if (!panel) return;
        panel.style.display = this.isNetworkGame ? 'none' : 'block';
    }

    // Оценка позиции движком бота — только в локальном режиме: в сетевой
    // игре сервер — единственный источник истины по позиции, а показывать
    // клиентскую оценку одному игроку было бы нечестным преимуществом.
    updateEvaluationPanelVisibility() {
        const panel = document.getElementById('evaluation-panel');
        if (!panel) return;
        panel.style.display = this.isNetworkGame ? 'none' : 'block';
    }

    evaluatePosition() {
        if (this.isNetworkGame) return;
        const resultEl = document.getElementById('evaluation-result');
        if (!resultEl || typeof ChessBotCore === 'undefined') return;

        const score = ChessBotCore.evaluate(ChessEngine.Pole, this.currentPlayer);
        const rounded = Math.round(score * 100) / 100;
        const sign = rounded > 0 ? '+' : '';
        const verdict = rounded > 0.15 ? 'преимущество белых'
            : rounded < -0.15 ? 'преимущество чёрных'
            : 'примерное равенство';
        resultEl.textContent = `${sign}${rounded.toFixed(2)} — ${verdict}`;
        resultEl.style.color = rounded > 0.15 ? '#4cc9f0' : rounded < -0.15 ? '#ff5722' : '#9bb4d0';
    }

    cancelBotSearch() {
        this._botMoveToken++;
        this.botThinking = false;
        if (typeof ChessBot !== 'undefined' && ChessBot.cancelSearch) {
            ChessBot.cancelSearch();
        }
        this.updateBotStatusUI();
    }

    setBotEnabled(enabled) {
        this.cancelBotSearch();
        this.botEnabled = !!enabled;
        this.updateBotStatusUI();
        this.maybeBotMove();
    }

    setBotColor(color) {
        if (color !== 'White' && color !== 'Black') return;
        this.cancelBotSearch();
        this.botColor = color;
        this.updateBotStatusUI();
        this.maybeBotMove();
    }

    setBotDepth(depth) {
        this.botDepth = typeof ChessBot !== 'undefined'
            ? ChessBot.setDepth(depth)
            : Math.max(1, Math.min(5, parseInt(depth, 10) || 2));
        const depthInput = document.getElementById('bot-depth');
        if (depthInput) depthInput.value = String(this.botDepth);
        const depthLabel = document.getElementById('bot-depth-value');
        if (depthLabel) depthLabel.textContent = String(this.botDepth);
    }

    maybeBotMove() {
        if (this.isNetworkGame || !this.botEnabled || this.botThinking) return;
        if (!this.isBotSideToMove()) {
            this.updateBotStatusUI();
            return;
        }
        if (this.isGameOverByMate()) {
            this.updateBotStatusUI();
            return;
        }
        if (typeof ChessBot === 'undefined') return;

        const token = ++this._botMoveToken;
        this.botThinking = true;
        this.updateBotStatusUI();

        const color = this.botColor;
        const depth = this.botDepth;
        const poleSnapshot = ChessEngine.Pole;

        const finish = (best) => {
            if (token !== this._botMoveToken) return;
            this.botThinking = false;
            this.updateBotStatusUI();
            if (!best) return;
            if (!this.botEnabled || this.isNetworkGame || this.currentPlayer !== color) return;
            // Бот всегда превращает пешку в ферзя — сильнейший выбор почти
            // всегда, и бот не анализирует более редкие превращения в других фигур.
            const movingFigure = ChessEngine.Pole[best.from.x][best.from.y][best.from.z];
            const promotion = (movingFigure && movingFigure.Name === 'Pawn' &&
                ChessEngine.IsPromotionSquare(best.to.z, movingFigure.Color === 'White'))
                ? 'Queen' : undefined;
            this.makeMove(best.from.x, best.from.y, best.from.z, best.to.x, best.to.y, best.to.z, promotion);
        };

        // Дать UI отрисовать «Бот думает…», затем поиск в Worker
        setTimeout(() => {
            if (token !== this._botMoveToken) return;
            if (!this.botEnabled || this.isNetworkGame || !this.isBotSideToMove()) {
                this.botThinking = false;
                this.updateBotStatusUI();
                return;
            }

            const searchPromise = ChessBot.findBestMoveAsync
                ? ChessBot.findBestMoveAsync(poleSnapshot, color, depth)
                : Promise.resolve(ChessBot.findBestMove(poleSnapshot, color, depth));

            searchPromise.then(finish).catch((err) => {
                if (token !== this._botMoveToken) return;
                // Если worker отменён — молча выходим; иначе fallback sync
                if (err && /cancel/i.test(err.message || '')) {
                    this.botThinking = false;
                    this.updateBotStatusUI();
                    return;
                }
                console.warn('Worker search failed, sync fallback:', err);
                try {
                    finish(ChessBot.findBestMove(ChessEngine.Pole, color, depth));
                } catch (e2) {
                    console.error('Ошибка хода бота:', e2);
                    this.botThinking = false;
                    this.updateBotStatusUI();
                }
            });
        }, 20);
    }

    isPossibleMove(i, j, k) {
        return GraphicsEngine.highlightedPossibleMoves.some(move =>
            move[0] == i && move[1] == j && move[2] == k
        );
    }

    showPromotionModal() {
        document.getElementById('promotion-modal')?.classList.add('active');
    }

    // Вызывается кнопками модалки превращения (см. chess.html) после того,
    // как handleCanvasClick отложил ход в this.pendingPromotionMove.
    completePromotion(figureType) {
        document.getElementById('promotion-modal')?.classList.remove('active');
        if (!this.pendingPromotionMove) return;
        const { from, to } = this.pendingPromotionMove;
        this.pendingPromotionMove = null;
        this.makeMove(from.i, from.j, from.k, to.i, to.j, to.k, figureType);
    }

    makeMove(fromX, fromY, fromZ, toX, toY, toZ, promotionType) {
        // Сохраняем информацию о ходе для возможной отмены
        const capturedFigure = ChessEngine.Pole[toX][toY][toZ];
        const movedFigureRef = ChessEngine.Pole[fromX][fromY][fromZ];
        const moveInfo = {
            from: { x: fromX, y: fromY, z: fromZ },
            to: { x: toX, y: toY, z: toZ },
            movedFigure: movedFigureRef,
            capturedFigure: capturedFigure,
            movedFigureHadMoved: !!(movedFigureRef && movedFigureRef.hasMoved)
        };

        // Выполняем ход в шахматном движке
        const moveResult = ChessEngine.Move(
            fromX, fromY, fromZ,
            toX, toY, toZ,
            ChessEngine.Pole,
            this.currentPlayer == 'White',
            promotionType
        );

        if (moveResult.success) {
            // Рокировка/взятие на проходе — доп. данные для корректной отмены хода
            moveInfo.castling = moveResult.castling;
            moveInfo.enPassantCapture = moveResult.enPassantCapture;
            moveInfo.previousEnPassantTarget = moveResult.previousEnPassantTarget;
            moveInfo.promotion = moveResult.promotion;
            if (moveResult.castling) {
                const { rookTo } = moveResult.castling;
                moveInfo.rookFigure = ChessEngine.Pole[rookTo.x][rookTo.y][rookTo.z];
            }

            // Сохраняем ход в историю
            this.moveHistory.push(moveInfo);
            // Отправляем ход противнику, если это сетевая игра
            if (this.isNetworkGame && !this.isNetworkMove) {
                this.setMyTurn(false);
                this.networkManager.sendMove({
                    from: { x: fromX, y: fromY, z: fromZ },
                    to: { x: toX, y: toY, z: toZ },
                    promotion: moveResult.promotion ? moveResult.promotion.figureType : undefined
                });
            }
            // Обновляем графическое представление
            GraphicsEngine.createAndFillBoardOnPole(ChessEngine.Pole);
            GraphicsEngine.unHighlightingPossibleMoves();

            // Меняем текущего игрока
            this.currentPlayer = moveResult.nextMove;

            // Проверяем состояние игры
            this.checkGameState();

            // Обновляем UI
            this.updateUI();

            console.log(`Ход выполнен. Теперь ходят: ${this.currentPlayer}`);
            this.maybeBotMove();
        } else {
            console.log('Недопустимый ход:', moveResult.message);
        }

        // Снимаем выделение с клетки
        GraphicsEngine.unselectCell();
    }

    skipTurn() {
        // Меняем текущего игрока
        this.currentPlayer = this.currentPlayer === 'White' ? 'Black' : 'White';

        // Проверяем состояние игры
        this.checkGameState();

        // Обновляем UI
        this.updateUI();

        console.log(`Ход пропущен. Теперь ходят: ${this.currentPlayer}`);
        this.maybeBotMove();
    }

    undoMove() {
        if (this.moveHistory.length == 0) return;

        this.cancelBotSearch();

        const lastMove = this.moveHistory.pop();
        const {
            from, to, movedFigure, capturedFigure, movedFigureHadMoved,
            castling, enPassantCapture, previousEnPassantTarget, rookFigure
        } = lastMove;

        // Восстанавливаем фигуру на исходной позиции и её флаг "уже ходила"
        ChessEngine.Pole[from.x][from.y][from.z] = movedFigure;
        if (movedFigure) movedFigure.hasMoved = movedFigureHadMoved;

        // Восстанавливаем взятие фигуры, если было (обычное взятие на клетке назначения)
        if (capturedFigure) {
            ChessEngine.Pole[to.x][to.y][to.z] = capturedFigure;
        } else {
            ChessEngine.Pole[to.x][to.y][to.z] = null;
        }

        // Откатываем взятие на проходе — настоящая взятая пешка стояла не на
        // клетке назначения, а на исходном z-слое ходившей пешки
        if (enPassantCapture) {
            ChessEngine.Pole[enPassantCapture.x][enPassantCapture.y][enPassantCapture.z] = enPassantCapture.figure;
        }

        // Откатываем рокировку — возвращаем ладью на исходную клетку и её флаг
        if (castling) {
            ChessEngine.Pole[castling.rookTo.x][castling.rookTo.y][castling.rookTo.z] = null;
            ChessEngine.Pole[castling.rookFrom.x][castling.rookFrom.y][castling.rookFrom.z] = rookFigure;
            if (rookFigure) rookFigure.hasMoved = false;
        }

        // Восстанавливаем цель взятия на проходе, актуальную до этого хода
        if (typeof previousEnPassantTarget !== 'undefined') {
            ChessEngine.SetEnPassantTarget(previousEnPassantTarget);
        }

        // Меняем текущего игрока
        this.currentPlayer = this.currentPlayer === 'White' ? 'Black' : 'White';

        createAndFillBoardOnPole(ChessEngine.Pole);
        // Проверяем состояние игры
        this.checkGameState();

        // Обновляем UI
        this.updateUI();

        console.log('Ход отменен. Теперь ходят: ' + this.currentPlayer);
        this.maybeBotMove();
    }

    checkGameState() {
        // Проверяем наличие фигур
        if (!GraphicsEngine.isWhiteFigure && !GraphicsEngine.isBlackFigure) {
            document.getElementById('game-status').textContent = 'Нет фигур на доске! Игра не может продолжаться.';
            return;
        }

        // Проверяем, есть ли фигуры у текущего игрока
        if ((this.currentPlayer === 'White' && !GraphicsEngine.isWhiteFigure) ||
            (this.currentPlayer === 'Black' && !GraphicsEngine.isBlackFigure)) {
            document.getElementById('game-status').textContent =
                `У ${this.currentPlayer === 'White' ? 'белых' : 'черных'} нет фигур! Пропуск хода.`;
            this.skipTurn();
            return;
        }

        const gameState = ChessEngine.FoundKing(ChessEngine.Pole);
        highlightKingInCheck(gameState);
        switch (gameState) {
            case 'CheckWhite':
                document.getElementById('game-status').textContent = 'Шах белым!';
                break;
            case 'CheckMateWhite':
                document.getElementById('game-status').textContent = 'Мат белым! Игра окончена.';
                if (this.isNetworkGame) {
                    this.networkManager.sendGameOver('Black');
                }
                break;
            case 'CheckBlack':
                document.getElementById('game-status').textContent = 'Шах черным!';
                break;
            case 'CheckMateBlack':
                document.getElementById('game-status').textContent = 'Мат черным! Игра окончена.';
                if (this.isNetworkGame) {
                    this.networkManager.sendGameOver('White');
                }
                break;
            default:
                if (ChessEngine.IsStalemate(ChessEngine.Pole, this.currentPlayer === 'White')) {
                    document.getElementById('game-status').textContent =
                        `Пат! У ${this.currentPlayer === 'White' ? 'белых' : 'чёрных'} нет ходов. Ничья.`;
                    if (this.isNetworkGame) {
                        this.networkManager.sendGameOver();
                    }
                } else {
                    document.getElementById('game-status').textContent = '';
                }
                break;
        }
    }

    updateUI() {
        // Обновляем текущего игрока
        document.getElementById('current-player').textContent =
            this.currentPlayer === 'White' ? 'Белые' : 'Черные';

        // Добавляем информацию о наличии фигур
        const figuresInfo = document.createElement('div');
        figuresInfo.innerHTML = `Белые фигуры: ${GraphicsEngine.isWhiteFigure ? 'есть' : 'нет'}<br>
                            Черные фигуры: ${GraphicsEngine.isBlackFigure ? 'есть' : 'нет'}`;

        // Обновляем историю ходов
        this.updateMoveHistory();
        this.updateBotPanelVisibility();
        this.updateEvaluationPanelVisibility();
        this.updateBotStatusUI();
    }

    updateMoveHistory() {
        const historyList = document.getElementById('history-list');
        if (!historyList) return; // pages like figures-tutorial.html reuse Game without a move-history panel
        historyList.innerHTML = '';

        this.moveHistory.forEach((move, index) => {
            const moveElement = document.createElement('div');
            moveElement.textContent = `${index + 1}. ${move.movedFigure.Color} ${move.movedFigure.Name}: 
                (${move.from.x},${move.from.y},${move.from.z}) → 
                (${move.to.x},${move.to.y},${move.to.z})`;
            historyList.appendChild(moveElement);
        });

        // Прокручиваем к последнему ходу
        historyList.scrollTop = historyList.scrollHeight;
    }

    handleAxisChange(axisId) {
        let axis = null;
        if (axisId === 'axis-x') axis = 'x';
        else if (axisId === 'axis-y') axis = 'y';
        else if (axisId === 'axis-z') axis = 'z';
        else if (axisId === 'axis-none') axis = null;
        GraphicsEngine.setExpandedAxis(axis);
        GraphicsEngine.createAndFillBoardOnPole(ChessEngine.Pole);
    }

    saveSettings() {
        console.log('Сохранение настроек');
        const settings = {
            bgColor: document.getElementById('bg-color').value,
            boardColor1: document.getElementById('board-color-1').value,
            boardColor2: document.getElementById('board-color-2').value,
            whiteFiguresColor: document.getElementById('white-figures-color').value,
            blackFiguresColor: document.getElementById('black-figures-color').value
        };

        const dataStr = JSON.stringify(settings);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'chess_settings.json';
        link.click();
    }

    loadSettings(file) {
        console.log('Загрузка настроек из файла:', file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);

                document.getElementById('bg-color').value = settings.bgColor;
                document.getElementById('board-color-1').value = settings.boardColor1;
                document.getElementById('board-color-2').value = settings.boardColor2;
                document.getElementById('white-figures-color').value = settings.whiteFiguresColor;
                document.getElementById('black-figures-color').value = settings.blackFiguresColor;

                this.changeColor('background', settings.bgColor);
                this.changeColor('board1', settings.boardColor1);
                this.changeColor('board2', settings.boardColor2);
                this.changeColor('whiteFigure', settings.whiteFiguresColor);
                this.changeColor('blackFigure', settings.blackFiguresColor);

                UI.toast('Настройки успешно загружены!', 'success');
            } catch (error) {
                UI.toast('Ошибка при загрузке настроек: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    saveGame() {
        console.log('Сохранение игры');

        const setupType = this.isStandardPosition ? "standart" : "custom";
        let dataToSave = '';

        const serializeFigure = (figure) => {
            if (!figure) return 'null';
            return JSON.stringify({
                __type: figure.constructor.name,
                Color: figure.Color,
                Name: figure.Name
            });
        };

        if (setupType === 'standart') {
            dataToSave = setupType + "\n" + JSON.stringify(this.moveHistory);
        } else {
            dataToSave = "custom\n" + this.currentPlayer + "\n";

            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    let row = [];
                    for (let k = 0; k < 8; k++) {
                        const figure = ChessEngine.Pole[i][j][k];
                        row.push(serializeFigure(figure));
                    }
                    dataToSave += row.join('\t') + "\n";
                }
            }

            dataToSave += JSON.stringify(this.moveHistory);
        }

        const dataBlob = new Blob([dataToSave], { type: 'text/plain' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'chess_game_save.txt';
        link.click();
    }

    loadGame(file) {
        console.log('Загрузка игры из файла:', file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target.result;
                const lines = data.split('\n');
                const setupType = lines[0].trim();

                const createFigureFromData = (figureData) => {
                    if (!figureData || figureData === 'null') return null;

                    try {
                        const parsedData = typeof figureData === 'string' ?
                            JSON.parse(figureData) : figureData;

                        if (parsedData.__type) {
                            const figureClass = window.ChessEngine[parsedData.__type];
                            if (figureClass) {
                                return new figureClass();
                            }
                        }
                        else if (parsedData.Color && parsedData.Name) {
                            const className = parsedData.Color + parsedData.Name;
                            const figureClass = window.ChessEngine[className];
                            if (figureClass) {
                                return new figureClass();
                            }
                        }
                    } catch (error) {
                        console.warn('Ошибка создания фигуры:', error);
                    }
                    return null;
                };

                if (setupType === 'standart') {
                    ChessEngine.InitGame();
                    this.currentPlayer = 'White';
                    this.moveHistory = [];
                    this.isStandardPosition = true;

                    if (lines.length > 1 && lines[1].trim() !== '') {
                        const moves = JSON.parse(lines[1]);
                        for (const move of moves) {
                            move.movedFigure = createFigureFromData(move.movedFigure);
                            move.capturedFigure = createFigureFromData(move.capturedFigure);

                            this.makeMove(
                                move.from.x, move.from.y, move.from.z,
                                move.to.x, move.to.y, move.to.z,
                                move.promotion ? move.promotion.figureType : undefined
                            );
                        }
                    }
                } else if (setupType === 'custom' || setupType === 'Custom Position') {
                    this.isStandardPosition = false;
                    this.currentPlayer = lines[1].trim();
                    this.moveHistory = [];

                    ChessEngine.FillPole();

                    for (let i = 0; i < 6; i++) {
                        for (let j = 0; j < 6; j++) {
                            const lineIndex = 2 + i * 6 + j;
                            if (lineIndex < lines.length) {
                                const parts = lines[lineIndex].split('\t');
                                for (let k = 0; k < 8; k++) {
                                    if (k < parts.length) {
                                        ChessEngine.Pole[i][j][k] = createFigureFromData(parts[k].trim());
                                    }
                                }
                            }
                        }
                    }

                    const historyIndex = 2 + 36;
                    if (lines.length > historyIndex && lines[historyIndex].trim() !== '') {
                        const moves = JSON.parse(lines[historyIndex]);
                        for (const move of moves) {
                            move.movedFigure = createFigureFromData(move.movedFigure);
                            move.capturedFigure = createFigureFromData(move.capturedFigure);
                            this.moveHistory.push(move);
                        }
                    }
                } else {
                    UI.toast('Неизвестный формат файла', 'error');
                    return;
                }

                GraphicsEngine.createAndFillBoardOnPole(ChessEngine.Pole);
                this.checkGameState();
                this.updateUI();
                this.maybeBotMove();

                UI.toast('Игра успешно загружена!', 'success');
            } catch (error) {
                UI.toast('Ошибка при загрузке игры: ' + error.message, 'error');
                console.error(error);
            }
        };
        reader.readAsText(file);
    }

    // Сетевые методы
    connectToServer() {
        const address = document.getElementById('server-address').value;
        const playerName = document.getElementById('player-name').value;

        if (!address || !playerName) {
            UI.toast('Заполните адрес сервера и ваше имя', 'error');
            return;
        }

        this.networkManager.connect(address, playerName);
        this.isNetworkGame = true;
        this.cancelBotSearch();
        this.updateBotPanelVisibility();
        this.updateEvaluationPanelVisibility();
    }

    disconnect() {
        this.networkManager.disconnect();
        this.isNetworkGame = false;
        this.setMyTurn(true);
        this.updateNetworkStatus('Не подключено');
        this.showNetworkConnect();
        this.updateBotPanelVisibility();
        this.updateEvaluationPanelVisibility();
        this.maybeBotMove();
    }

    setMyTurn(isMyTurn) {
        this.isMyTurn = isMyTurn;
    }

    setBoardParams(x, y, z, komi) {
        // Chess uses fixed 6x6x8 board, params ignored
    }

    refreshRooms() {
        this.networkManager.requestRoomList();
    }

    confirmCreateRoom() {
        const name = document.getElementById('new-room-name').value.trim();
        if (!name) return UI.toast('Введите название комнаты', 'error');
        const pwd = document.getElementById('new-room-password').value;
        const isPublic = document.getElementById('new-room-public').checked;
        this.networkManager.createRoom(name, pwd || null, isPublic, 'chess'); // gameType = 'chess'
    }

    cancelCreateRoom() {}
    confirmJoinRoom() {}
    cancelJoinRoom() {}

    leaveRoom() {
        this.networkManager.leaveRoom();
    }

    goBack() {
        this.networkManager.goBack();
    }

    offerUndo() {
        this.networkManager.sendUndoRequest();
    }

    sendChatMessage() {
        const message = document.getElementById('chat-input').value;
        if (message.trim() === '') return;

        this.networkManager.sendChat(message);
        this.addChatMessage('Вы', message);
        document.getElementById('chat-input').value = '';
    }

    // Методы для обновления UI
    updateNetworkStatus(status) {
        const el = document.getElementById('network-status');
        if (el) el.textContent = status;
    }

    updateRoomId(roomId) {
        document.getElementById('room-id-display').textContent = roomId;
    }

    updatePlayerColor(color) {
        document.getElementById('player-color').textContent = color;
        // Синхронизируем текущего игрока с полученным цветом
        this.currentPlayer = color;
    }

    updateOpponentName(name) {
        document.getElementById('opponent-name').textContent = name || '-';
    }

    addChatMessage(sender, message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.textContent = `${sender}: ${message}`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    makeMoveFromNetwork(move) {
        this.isNetworkMove = true;
        this.makeMove(move.from.x, move.from.y, move.from.z, move.to.x, move.to.y, move.to.z, move.promotion);
        this.isNetworkMove = false;
        this.setMyTurn(true);
    }

    async handleUndoRequest() {
        this.pendingUndoRequest = true;

        const agree = await UI.confirm('Противник предлагает отменить ход. Вы согласны?');
        this.networkManager.sendUndoResponse(agree);

        if (agree) {
            this.processUndo();
        }

        this.pendingUndoRequest = null;
    }

    handleUndoResponse(accepted) {
        if (accepted) {
            this.processUndo();
        } else {
            UI.toast('Противник отклонил предложение отменить ход.', 'info');
        }
    }

    processUndo() {
        if (this.moveHistory.length === 0) return;

        const lastMove = this.moveHistory[this.moveHistory.length - 1];
        const lastMoveByMe = lastMove.movedFigure.Color === (this.playerColor === 'White' ? 'White' : 'Black');

        if (lastMoveByMe) {
            this.undoMove();
        } else if (this.moveHistory.length > 1) {
            this.undoMove();
            this.undoMove();
        }
    }

    cancelUndoRequest() {
        if (this.pendingUndoRequest) {
            this.networkManager.sendUndoResponse(false);
            this.pendingUndoRequest = null;
            document.getElementById('undo-status').style.display = 'none';
        }
    }

    handleGameOver(data) {
        const panel = document.getElementById('game-result-panel');
        const textEl = document.getElementById('game-result-text');
        const reasonEl = document.getElementById('game-result-reason');
        const modeEl = document.getElementById('game-result-mode');

        let resultText = '';
        if (data.result === 'draw') {
            resultText = 'Ничья';
        } else if (data.winner) {
            const myName = this.networkManager.playerName;
            resultText = data.winner === myName ? 'Победа!' : 'Поражение';
        } else {
            resultText = 'Игра окончена';
        }

        textEl.textContent = resultText;
        reasonEl.textContent = data.reason || '';

        let modeText = data.gameMode === 'rated' ? 'Рейтинговая игра' :
                       data.gameMode === 'unranked' ? 'Без рейтинга' : '';
        if (data.ratingChanges && Object.keys(data.ratingChanges).length > 0) {
            const myName = this.networkManager.playerName;
            const myDelta = data.ratingChanges[myName];
            if (myDelta !== undefined) {
                const sign = myDelta > 0 ? '+' : '';
                modeText += ` (${sign}${myDelta} рейтинга)`;
            }
        }
        modeEl.textContent = modeText;

        panel.style.display = 'block';
    }

    async handleDrawOffer(data) {
        const accepted = await UI.confirm(`${data.from} предлагает ничью. Принять?`);
        this.networkManager.sendDrawResponse(accepted);
    }

    handleDrawResponse(data) {
        if (!data.accepted) {
            UI.toast(`${data.from} отклонил предложение ничьей.`, 'info');
        }
    }

    async handleRematchOffer(data) {
        const accepted = await UI.confirm(`${data.from} предлагает реванш. Принять?`);
        this.networkManager.sendRematchResponse(accepted);
    }

    handleRematchResponse(data) {
        if (!data.accepted) {
            UI.toast(`${data.from} отклонил предложение реванша.`, 'info');
            document.getElementById('rematch-status').style.display = 'none';
        }
    }

    handleRematchStart(data) {
        document.getElementById('game-result-panel').style.display = 'none';
        this.networkManager.playerColor = data.color;
        this.currentPlayer = 'White';
        this.moveHistory = [];
        this.isNetworkMove = false;
        this.isMyTurn = data.isMyTurn;

        ChessEngine.InitGame();
        createAndFillBoardOnPole(ChessEngine.Pole);
        this.updateUI();
    }

    changeColor(type, value) {
        console.log('Изменение цвета:', type, value);
        const colors = GraphicsEngine.getColors();

        switch (type) {
            case 'cube':
                colors.cubeColor = GraphicsEngine.hexToColor(value);
                break;
            case 'background':
                colors.backgroundColor = GraphicsEngine.hexToColor(value);
                scene.background = new THREE.Color(colors.backgroundColor);
                break;
            case 'board1':
                colors.boardColor1 = GraphicsEngine.hexToColor(value);
                break;
            case 'board2':
                colors.boardColor2 = GraphicsEngine.hexToColor(value);
                break;
            case 'whiteFigure':
                colors.whiteFigureColor = GraphicsEngine.hexToColor(value);
                break;
            case 'blackFigure':
                colors.blackFigureColor = GraphicsEngine.hexToColor(value);
                break;
        }

        GraphicsEngine.updateColors(colors);
    }

    showRoomInfo(serverAddress, roomId, roomName, gameType, myName, myColor, myRating) {
        const panel = document.getElementById('network-panel');
        panel.style.display = 'block';
        this.isNetworkGame = true;
        this.cancelBotSearch();
        this.updateBotPanelVisibility();
        this.updateEvaluationPanelVisibility();
        document.getElementById('net-server-address').textContent = serverAddress;
        document.getElementById('net-room-id').textContent = roomId;
        document.getElementById('net-room-name').textContent = roomName || roomId;
        document.getElementById('net-game-type').textContent = gameType === 'chess' ? 'Шахматы' : 'Го';
        document.getElementById('net-my-name').textContent = myName;
        document.getElementById('net-my-color').textContent = myColor;
        document.getElementById('net-my-rating').textContent = myRating || '—';
        document.getElementById('net-opponent-name').textContent = 'Ожидание...';
        document.getElementById('net-opponent-info').style.display = 'none';
        document.getElementById('net-opponent-name').style.display = 'inline';
    }

    updateOpponentInfo(name, color, rating) {
        document.getElementById('net-opponent-name').style.display = 'none';
        document.getElementById('net-opponent-info').style.display = 'inline';
        document.getElementById('net-opponent-name').textContent = name;
        document.getElementById('net-opponent-color').textContent = color;
        document.getElementById('net-opponent-rating').textContent = rating || '—';
    }

    hideNetworkPanel() {
        document.getElementById('network-panel').style.display = 'none';
        this.isNetworkGame = false;
        this.updateBotPanelVisibility();
        this.updateEvaluationPanelVisibility();
    }

    switchToInRoom() {
        // Compatibility - show network panel
        document.getElementById('network-panel').style.display = 'block';
    }

    showRoomList() {}
    showNetworkConnect() {}
    displayRooms() {}
    selectRoom() {}
}

// Инициализация игры при загрузке страницы
window.addEventListener('load', () => {
    window.chessGame = new Game();
});

// Обработчики для изменения цветов фигур
document.getElementById('white-figures-color').addEventListener('input', (e) => {
    colors = GraphicsEngine.getColors();
    colors.whiteFigureColor = GraphicsEngine.hexToColor(e.target.value);
    GraphicsEngine.updateColors(colors);
});

document.getElementById('black-figures-color').addEventListener('input', (e) => {
    colors = GraphicsEngine.getColors();
    colors.blackFigureColor = GraphicsEngine.hexToColor(e.target.value);
    GraphicsEngine.updateColors(colors);
});