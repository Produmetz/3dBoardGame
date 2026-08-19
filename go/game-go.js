// game.js - специальная версия для игры Го (адаптировано под go-engine_v2.js)
class GoGame {
    constructor() {
        this.board = null;            // экземпляр Board из GoEngine
        this.moveHistory = [];
        this.isDragging = false;
        this.dragThreshold = 5;

        this.networkManager = new NetworkManager(this);
        this.isNetworkGame = false;
        this.isNetworkMove = false;
        this.isMyTurn = true;
        this.selectedRoomId = null;

        // Network clocks — see updateClocks()/renderClocks() (mirrors chess/game.js).
        this.clockWhiteMs = null;
        this.clockBlackMs = null;
        this.clockLastSyncAt = null;
        this.clockTickInterval = null;

        // Этап согласования мёртвых камней перед подсчётом очков.
        this.deadStones = new Set();
        this.scoringSubmitted = false;
        this.opponentSubmittedScoring = false;

        // Локальный бот
        this.botEnabled = false;
        this.botColor = 'White'; // белые по умолчанию (чёрные ходят первые)
        this.botAlgorithm = 'search';
        this.botStrength = 3;
        this.botThinking = false;
        this._botMoveToken = 0;

        this.init();
    }

    init() {
        this.resetGame();
        this.setupEventListeners();
        // Настройка бота из query-параметров (?bot=1&color=Black|White&strength=1-5),
        // проставленных модалкой "Против компьютера" на главной странице.
        this.applyBotConfigFromUrl();
        console.log('Игра Го началась! Ходят чёрные');
        this.updateUI();
    }

    applyBotConfigFromUrl() {
        if (this.isNetworkGame) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('bot') !== '1') return;

        const color = params.get('color');
        const strength = params.get('strength');

        const enabledInput = document.getElementById('go-bot-enabled');
        if (enabledInput) enabledInput.checked = true;

        if (color === 'White' || color === 'Black') {
            const colorInput = document.getElementById('go-bot-color');
            if (colorInput) colorInput.value = color;
        }

        this.setBotEnabled(true);
        if (color === 'White' || color === 'Black') this.setBotColor(color);
        if (strength) this.setBotStrength(strength);
    }

    resetGame() {
        this.cancelBotSearch();
        // Получаем размеры из UI
        const sizeX = parseInt(document.getElementById('go-size-x').value) || 5;
        const sizeY = parseInt(document.getElementById('go-size-y').value) || 5;
        const sizeZ = parseInt(document.getElementById('go-size-z').value) || 5;
        const komi = parseFloat(document.getElementById('go-komi').value) || 6.5;
        const ruleSetSelect = document.getElementById('go-rule-set');
        const ruleSet = ruleSetSelect ? ruleSetSelect.value : 'chinese';

        // Создаём новую доску
        this.board = new GoEngine.Board([sizeX, sizeY, sizeZ], komi, ruleSet);

        this.moveHistory = [];
        this.isNetworkGame = false;
        this.setMyTurn(true);
        this.resetScoringState();
        this.hideScoringPanel();

        // Перерисовываем доску
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.updateUI();
        console.log('Новая игра Го началась! Ходят чёрные');
        this.maybeBotMove();
    }

    setupEventListeners() {
        let mouseDownX, mouseDownY;

        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                mouseDownX = event.clientX;
                mouseDownY = event.clientY;
                this.isDragging = false;
            }
        });

        canvas.addEventListener('mousemove', (event) => {
            if (event.buttons === 1) {
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
            this.pointerDownX = touch.clientX;
            this.pointerDownY = touch.clientY;
            this.isDragging = false;
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.pointerDownX === undefined) return;
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - this.pointerDownX);
            const dy = Math.abs(touch.clientY - this.pointerDownY);
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

        const { i, j, k } = cellCoords;

        if (this.board.isAwaitingScoring()) {
            this.toggleDeadGroupAt(i, j, k);
            return;
        }

        if (this.isBotSideToMove() || this.botThinking) return;

        const idx = this.board.coordToIndex([i, j, k]);
        const stone = this.board.grid[idx];

        GraphicsEngine.unselectCell();

        if (stone === GoEngine.Stone.EMPTY && this.isMyTurn) {
            const currentPlayer = this.board.getCurrentPlayer();
            if (this.board.isLegalMove([i, j, k], currentPlayer)) {
                GraphicsEngine.selectCell(i, j, k);
                this.makeMove(i, j, k);
            } else {
                GraphicsEngine.flashCellInvalid(i, j, k);
                setTimeout(() => GraphicsEngine.unselectCell(), 300);
            }
        }
    }

    botStone() {
        return this.botColor === 'Black' ? GoEngine.Stone.BLACK : GoEngine.Stone.WHITE;
    }

    isBotSideToMove() {
        if (this.isNetworkGame || !this.botEnabled || !this.board) return false;
        return this.board.getCurrentPlayer() === this.botStone();
    }

    cancelBotSearch() {
        this._botMoveToken++;
        this.botThinking = false;
        if (typeof GoBot !== 'undefined' && GoBot.cancelSearch) {
            GoBot.cancelSearch();
        }
        this.updateBotStatusUI();
    }

    updateBotStatusUI() {
        const statusEl = document.getElementById('go-bot-status');
        if (!statusEl) return;
        if (this.isNetworkGame || !this.botEnabled) {
            statusEl.textContent = '';
            return;
        }
        if (this.botThinking) {
            const names = { greedy: 'жадный', search: 'поиск', mcts: 'MCTS' };
            statusEl.textContent = `Бот думает (${names[this.botAlgorithm] || this.botAlgorithm})…`;
        } else {
            const side = this.botColor === 'Black' ? 'чёрных' : 'белых';
            statusEl.textContent = `Бот за ${side}`;
        }
    }

    updateBotPanelVisibility() {
        const panel = document.getElementById('go-bot-controls');
        if (!panel) return;
        panel.style.display = this.isNetworkGame ? 'none' : 'block';
    }

    // Только локальный режим — см. комментарий у одноимённого метода в chess/game.js.
    updateEvaluationPanelVisibility() {
        const panel = document.getElementById('evaluation-panel');
        if (!panel) return;
        panel.style.display = this.isNetworkGame ? 'none' : 'block';
    }

    evaluatePosition() {
        if (this.isNetworkGame || !this.board) return;
        const resultEl = document.getElementById('evaluation-result');
        if (!resultEl || typeof GoBotCore === 'undefined') return;

        const score = GoBotCore.evaluateQuick(this.board);
        const rounded = Math.round(score * 100) / 100;
        const sign = rounded > 0 ? '+' : '';
        const verdict = rounded > 0.3 ? 'преимущество чёрных'
            : rounded < -0.3 ? 'преимущество белых'
            : 'примерное равенство';
        resultEl.textContent = `${sign}${rounded.toFixed(2)} — ${verdict}`;
        resultEl.style.color = rounded > 0.3 ? '#4cc9f0' : rounded < -0.3 ? '#ff5722' : '#9bb4d0';
    }

    setBotEnabled(enabled) {
        this.cancelBotSearch();
        this.botEnabled = !!enabled;
        this.updateBotStatusUI();
        this.maybeBotMove();
    }

    setBotColor(color) {
        if (color !== 'Black' && color !== 'White') return;
        this.cancelBotSearch();
        this.botColor = color;
        this.updateBotStatusUI();
        this.maybeBotMove();
    }

    setBotAlgorithm(algo) {
        if (!['greedy', 'search', 'mcts'].includes(algo)) return;
        this.cancelBotSearch();
        this.botAlgorithm = algo;
        this.updateBotStrengthHint();
        this.updateBotStatusUI();
        this.maybeBotMove();
    }

    setBotStrength(strength) {
        this.botStrength = typeof GoBot !== 'undefined'
            ? GoBot.clampStrength(strength)
            : Math.max(1, Math.min(5, parseInt(strength, 10) || 3));
        const input = document.getElementById('go-bot-strength');
        if (input) input.value = String(this.botStrength);
        const label = document.getElementById('go-bot-strength-value');
        if (label) label.textContent = String(this.botStrength);
        this.updateBotStrengthHint();
    }

    updateBotStrengthHint() {
        const hint = document.getElementById('go-bot-strength-hint');
        if (!hint) return;
        const s = this.botStrength;
        if (this.botAlgorithm === 'greedy') {
            hint.textContent = 'Сила: меньше шума в выборе хода';
        } else if (this.botAlgorithm === 'mcts') {
            hint.textContent = `Сила ≈ ${20 + this.botStrength * this.botStrength * 20} симуляций MCTS`;
        } else {
            hint.textContent = s <= 2 ? 'Сила: глубина 1' : 'Сила: глубина 2 + шире beam';
        }
    }

    maybeBotMove() {
        if (this.isNetworkGame || !this.botEnabled || this.botThinking) return;
        if (!this.board || this.board.isGameOver() || this.board.isAwaitingScoring()) {
            this.updateBotStatusUI();
            return;
        }
        if (!this.isBotSideToMove()) {
            this.updateBotStatusUI();
            return;
        }
        if (typeof GoBot === 'undefined') return;

        const token = ++this._botMoveToken;
        this.botThinking = true;
        this.updateBotStatusUI();

        const options = {
            algorithm: this.botAlgorithm,
            strength: this.botStrength
        };

        setTimeout(() => {
            if (token !== this._botMoveToken) return;
            if (!this.botEnabled || this.isNetworkGame || !this.isBotSideToMove()) {
                this.botThinking = false;
                this.updateBotStatusUI();
                return;
            }

            const searchPromise = GoBot.findBestMoveAsync
                ? GoBot.findBestMoveAsync(this.board, options)
                : Promise.resolve(GoBot.findBestMove(this.board, options));

            searchPromise.then((best) => {
                if (token !== this._botMoveToken) return;
                this.botThinking = false;
                this.updateBotStatusUI();
                if (!best || !this.botEnabled || this.isNetworkGame) return;
                if (!this.isBotSideToMove()) return;

                if (best.type === 'pass') {
                    this.pass(true);
                } else {
                    const x = best.x !== undefined ? best.x : best.coord[0];
                    const y = best.y !== undefined ? best.y : best.coord[1];
                    const z = best.z !== undefined ? best.z : best.coord[2];
                    this.makeMove(x, y, z);
                }
            }).catch((err) => {
                if (token !== this._botMoveToken) return;
                if (err && /cancel/i.test(err.message || '')) {
                    this.botThinking = false;
                    this.updateBotStatusUI();
                    return;
                }
                console.warn('Go bot worker failed, sync fallback:', err);
                try {
                    const best = GoBot.findBestMove(this.board, options);
                    this.botThinking = false;
                    this.updateBotStatusUI();
                    if (!best || !this.isBotSideToMove()) return;
                    if (best.type === 'pass') this.pass(true);
                    else this.makeMove(best.x ?? best.coord[0], best.y ?? best.coord[1], best.z ?? best.coord[2]);
                } catch (e2) {
                    console.error('Ошибка хода бота Го:', e2);
                    this.botThinking = false;
                    this.updateBotStatusUI();
                }
            });
        }, 20);
    }

    makeMove(x, y, z) {
        const currentPlayer = this.board.getCurrentPlayer();
        const success = this.board.makeMove([x, y, z], currentPlayer);
        if (success) {
            // Получаем захваченные камни после хода (можно вычислить разницу)
            const captures = this.board.getCapturedStones();
            this.moveHistory.push({
                to: { x, y, z },
                color: currentPlayer === GoEngine.Stone.BLACK ? 'Black' : 'White',
                captured: captures // в движке нет отдельного поля, но можно хранить
            });

            if (this.isNetworkGame && !this.isNetworkMove) {
                this.setMyTurn(false);
                this.networkManager.sendMove({ to: { x, y, z } });
            }
            GraphicsEngine.createAndFillBoardForGo(this.board);
            GraphicsEngine.unselectCell();

            this.checkGameState();
            this.updateUI();
            this.maybeBotMove();
        } else {
            console.log('Ошибка выполнения хода');
        }
    }

    undoMove() {
        if (this.isNetworkGame) {
            this.offerUndo(); // отправляем предложение об отмене
        } else {
            this.cancelBotSearch();
            if (this.board.undo()) {
                GraphicsEngine.createAndFillBoardForGo(this.board);
                this.updateUI();
                GraphicsEngine.unselectCell();
                this.maybeBotMove();
            } else {
                UI.toast('Невозможно отменить ход', 'error');
            }
        }
    }

    pass(fromBot = false) {
        if (!this.board || this.board.isGameOver() || this.board.isAwaitingScoring()) return;
        if (this.isNetworkGame && !this.isMyTurn) return;
        if (this.botThinking && !fromBot) return;
        if (!this.isNetworkGame && this.botEnabled && this.isBotSideToMove() && !fromBot) return;

        const currentPlayer = this.board.getCurrentPlayer();
        const success = this.board.pass();
        if (success) {
            this.moveHistory.push({ type: 'pass', color: currentPlayer === GoEngine.Stone.BLACK ? 'Black' : 'White' });
            if (this.isNetworkGame && !this.isNetworkMove) {
                this.setMyTurn(false);
                this.networkManager.sendPass();
            }
            GraphicsEngine.createAndFillBoardForGo(this.board);
            this.checkGameState();
            this.updateUI();

            if (this.board.isAwaitingScoring()) {
                this.enterScoringPhase();
            } else if (!this.board.isGameOver()) {
                this.maybeBotMove();
            }
        }
    }

    resign() {
        if (!this.isMyTurn) return;
        const currentPlayer = this.board.getCurrentPlayer();
        const success = this.board.resign();
        if (success) {
            const winner = currentPlayer === GoEngine.Stone.BLACK ? 'Белые' : 'Чёрные';
            if (this.isNetworkGame && !this.isNetworkMove) {
                this.networkManager.sendResign();
            }
            UI.toast(`Игра окончена. Победитель: ${winner} (сдача)`, 'info');
            this.updateUI();
        }
    }

    // ---------- Этап согласования мёртвых камней ----------

    resetScoringState() {
        this.deadStones = new Set();
        this.scoringSubmitted = false;
        this.opponentSubmittedScoring = false;
    }

    enterScoringPhase() {
        this.resetScoringState();
        GraphicsEngine.createAndFillBoardForGo(this.board, this.deadStones);
        this.showScoringPanel();
        this.updateScoringPanel();
    }

    exitScoringPhase() {
        this.resetScoringState();
        this.hideScoringPanel();
    }

    showScoringPanel() {
        const panel = document.getElementById('go-scoring-panel');
        if (panel) panel.style.display = 'block';
    }

    hideScoringPanel() {
        const panel = document.getElementById('go-scoring-panel');
        if (panel) panel.style.display = 'none';
    }

    deadCoordsArray() {
        return Array.from(this.deadStones).map(key => key.split(',').map(Number));
    }

    toggleDeadGroupAt(i, j, k) {
        if (!this.board || !this.board.isAwaitingScoring()) return;
        if (this.networkManager && this.networkManager.isSpectator) return;

        const idx = this.board.coordToIndex([i, j, k]);
        if (this.board.grid[idx] === GoEngine.Stone.EMPTY) return;

        const group = this.board.groupAt([i, j, k]);
        const key = `${i},${j},${k}`;
        const markDead = !this.deadStones.has(key);
        for (const coord of group) {
            const groupKey = coord.join(',');
            if (markDead) this.deadStones.add(groupKey);
            else this.deadStones.delete(groupKey);
        }

        // A new mark invalidates whatever was already sent to the opponent.
        if (this.isNetworkGame) this.scoringSubmitted = false;

        GraphicsEngine.createAndFillBoardForGo(this.board, this.deadStones);
        this.updateScoringPanel();
    }

    updateScoringPanel() {
        if (!this.board) return;
        const scoreEl = document.getElementById('go-scoring-score');
        if (scoreEl) {
            const preview = this.board.previewScore(this.deadCoordsArray());
            scoreEl.textContent = `Предварительный счёт: Чёрные ${preview.black} - ${preview.white} Белые`;
        }

        const statusEl = document.getElementById('go-scoring-network-status');
        if (statusEl) {
            if (this.isNetworkGame) {
                statusEl.style.display = 'block';
                if (this.scoringSubmitted && this.opponentSubmittedScoring) {
                    statusEl.textContent = 'Разметки отправлены, проверяем совпадение...';
                } else if (this.scoringSubmitted) {
                    statusEl.textContent = 'Ваша разметка отправлена. Ожидание соперника...';
                } else if (this.opponentSubmittedScoring) {
                    statusEl.textContent = 'Соперник отправил разметку. Отметьте мёртвые камни и подтвердите.';
                } else {
                    statusEl.textContent = '';
                }
            } else {
                statusEl.style.display = 'none';
            }
        }
    }

    confirmScoring() {
        if (!this.board || !this.board.isAwaitingScoring()) return;
        if (this.networkManager && this.networkManager.isSpectator) return;

        if (this.isNetworkGame) {
            this.scoringSubmitted = true;
            this.networkManager.sendGoSubmitScoring(this.deadCoordsArray());
            this.updateScoringPanel();
            return;
        }

        const success = this.board.finalizeScoring(this.deadCoordsArray());
        if (!success) return;
        this.exitScoringPhase();
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.checkGameState();
        this.updateUI();
    }

    resumeFromScoring() {
        if (!this.board || !this.board.isAwaitingScoring()) return;
        if (this.networkManager && this.networkManager.isSpectator) return;

        if (this.isNetworkGame) {
            this.networkManager.sendGoResumePlay();
            return;
        }

        const success = this.board.resumeFromScoring();
        if (!success) return;
        this.exitScoringPhase();
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.updateUI();
        this.maybeBotMove();
    }

    handleGoScoringSubmitted(data) {
        if (!this.board || !this.board.isAwaitingScoring()) return;
        if (data && data.by === this.networkManager.playerName) return;
        this.opponentSubmittedScoring = true;
        this.updateScoringPanel();
    }

    handleGoScoringMismatch(data) {
        if (!this.board || !this.board.isAwaitingScoring()) return;
        this.resetScoringState();
        const mine = (data && data.mine) || [];
        this.deadStones = new Set(mine.map(c => `${c.x},${c.y},${c.z}`));
        GraphicsEngine.createAndFillBoardForGo(this.board, this.deadStones);
        this.updateScoringPanel();
        UI.toast('Разметка мёртвых камней не совпала с соперником. Отметьте заново.', 'error');
    }

    handleGoResumed() {
        if (this.board) {
            this.board.resumeFromScoring();
        }
        this.exitScoringPhase();
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.checkGameState();
        this.updateUI();
        UI.toast('Партия продолжается.', 'info');
    }

    checkGameState() {
        if (this.board.isGameOver()) {
            const score = this.board.computeScore();
            document.getElementById('game-status').textContent =
                `Игра окончена. Счёт: чёрные ${score.black}, белые ${score.white}`;
            if (this.isNetworkGame && !this.isNetworkMove) {
                const winner = score.black > score.white ? 'Black' : (score.white > score.black ? 'White' : null);
                this.networkManager.sendGameOver(winner);
            }
        } else if (this.board.isAwaitingScoring()) {
            document.getElementById('game-status').textContent = 'Подсчёт очков: отметьте мёртвые камни';
        } else {
            document.getElementById('game-status').textContent = '';
        }
    }

    updateUI() {
        const captured = this.board.getCapturedStones();
        const current = this.board.getCurrentPlayer();
        document.getElementById('current-player').textContent = current === GoEngine.Stone.BLACK ? 'Чёрные' : 'Белые';

        const capturedBlackEl = document.getElementById('captured-black');
        const capturedWhiteEl = document.getElementById('captured-white');
        if (capturedBlackEl) capturedBlackEl.textContent = captured.black;
        if (capturedWhiteEl) capturedWhiteEl.textContent = captured.white;

        if (this.board.isGameOver()) {
            const score = this.board.computeScore();
            const scoreEl = document.getElementById('score-display');
            if (scoreEl) {
                scoreEl.textContent = `Счёт: Чёрные ${score.black} - ${score.white} Белые`;
            }
        } else {
            const scoreEl = document.getElementById('score-display');
            if (scoreEl) scoreEl.textContent = '';
        }

        this.updateMoveHistory();
        this.updateBotPanelVisibility();
        this.updateEvaluationPanelVisibility();
        this.updateBotStatusUI();
    }

    updateMoveHistory() {
        const historyList = document.getElementById('history-list');
        if (!historyList) return; // pages like puzzles.html reuse GoGame without a move-history panel
        historyList.innerHTML = '';

        this.moveHistory.forEach((move, index) => {
            const moveElement = document.createElement('div');
            if (move.type === 'pass') {
                moveElement.textContent = `${index + 1}. ${move.color === 'Black' ? 'Чёрные' : 'Белые'} пас`;
            } else {
                moveElement.textContent = `${index + 1}. ${move.color === 'Black' ? 'Чёрные' : 'Белые'}: (${move.to.x},${move.to.y},${move.to.z})`;
            }
            historyList.appendChild(moveElement);
        });

        historyList.scrollTop = historyList.scrollHeight;
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
        this.stopClockTicker();
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

    refreshRooms() {
        this.networkManager.requestRoomList();
    }

    setBoardParams(x, y, z, komi, ruleSet) {
        const wasNetworkGame = this.isNetworkGame;
        document.getElementById('go-size-x').value = x;
        document.getElementById('go-size-y').value = y;
        document.getElementById('go-size-z').value = z;
        document.getElementById('go-komi').value = komi;
        const ruleSetSelect = document.getElementById('go-rule-set');
        if (ruleSetSelect && ruleSet) ruleSetSelect.value = ruleSet;
        this.resetGame();
        this.isNetworkGame = wasNetworkGame;
    }

    confirmCreateRoom() {
        const name = document.getElementById('new-room-name').value.trim();
        if (!name) return UI.toast('Введите название комнаты', 'error');
        const pwd = document.getElementById('new-room-password').value;
        const isPublic = document.getElementById('new-room-public').checked;
        const boardX = parseInt(document.getElementById('go-size-x').value);
        const boardY = parseInt(document.getElementById('go-size-y').value);
        const boardZ = parseInt(document.getElementById('go-size-z').value);
        const komi = parseFloat(document.getElementById('go-komi').value);
        const ruleSetSelect = document.getElementById('go-rule-set');
        const ruleSet = ruleSetSelect ? ruleSetSelect.value : 'chinese';
        this.networkManager.createRoom(name, pwd || null, isPublic, 'go', boardX, boardY, boardZ, komi, ruleSet);
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
        if (!this.isNetworkGame) return;
        this.networkManager.sendUndoRequest();
        // Показываем индикатор ожидания
        document.getElementById('undo-status').style.display = 'block';
        this.pendingUndoRequest = true;
    }

    sendChatMessage() {
        const message = document.getElementById('chat-input').value;
        if (message.trim() === '') return;
        this.networkManager.sendChat(message);
        this.addChatMessage('Вы', message);
        document.getElementById('chat-input').value = '';
    }

    updateNetworkStatus(status) {
        document.getElementById('network-status').textContent = status;
    }

    updateRoomId(roomId) {
        document.getElementById('room-id-display').textContent = roomId;
    }

    updatePlayerColor(color) {
        document.getElementById('player-color').textContent = color;
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
        this.makeMove(move.to.x, move.to.y, move.to.z);
        this.isNetworkMove = false;
        this.setMyTurn(true);
    }

    handleNetworkPass() {
        this.isNetworkMove = true;
        this.pass();
        this.isNetworkMove = false;
        if (!this.board.isGameOver()) {
            this.setMyTurn(true);
        }
    }

    handleNetworkResign() {
        UI.toast('Противник сдался. Вы победили!', 'success');
        this.board.gameOver = true;
        this.board.resigned = true;
        this.setMyTurn(false);
        this.updateUI();
    }

    handleGameOver(data) {
        this.stopClockTicker();
        if (this.board.isAwaitingScoring()) {
            // The server only reaches game_over via a matched dead-stone
            // agreement, so our own last-submitted marking is by definition
            // the same set the server just used — mirror it locally.
            this.board.finalizeScoring(this.deadCoordsArray());
            this.exitScoringPhase();
        } else {
            this.board.gameOver = true;
        }
        this.setMyTurn(false);
        const result = data.result || 'win';
        const winner = data.winner;
        const reason = data.reason || '';

        let message = 'Игра окончена.';
        if (result === 'draw') {
            message += ' Ничья.';
        } else if (winner) {
            const isWinner = winner === this.playerColor;
            message += isWinner ? ' Вы победили!' : ' Вы проиграли.';
        }
        if (reason) message += ` (${reason})`;

        // Show game result panel
        const panel = document.getElementById('game-result-panel');
        if (panel) {
            document.getElementById('game-result-text').textContent = message;
            document.getElementById('game-result-reason').textContent = reason;
            document.getElementById('game-result-mode').textContent = data.gameMode === 'rated' ? 'Рейтинговая' : 'Без рейтинга';
            panel.style.display = 'block';
        } else {
            UI.toast(message, 'info');
        }
        this.updateUI();
    }

    async handleDrawOffer(data) {
        const accepted = await UI.confirm(`Игрок ${data.from} предлагает ничью. Принять?`);
        this.networkManager.sendDrawResponse(accepted);
    }

    handleDrawResponse(data) {
        if (data.accepted) {
            UI.toast('Ничья принята!', 'success');
            this.board.gameOver = true;
            this.setMyTurn(false);
            this.updateUI();
        } else {
            UI.toast('Предложение ничьей отклонено.', 'info');
        }
    }

    async handleRematchOffer(data) {
        const accepted = await UI.confirm(`Игрок ${data.from} предлагает реванш. Принять?`);
        this.networkManager.sendRematchResponse(accepted);
    }

    handleRematchResponse(data) {
        if (data.accepted) {
            document.getElementById('rematch-status').textContent = 'Реванш принят! Новая игра начинается...';
        } else {
            document.getElementById('rematch-status').textContent = 'Реванш отклонён.';
            setTimeout(() => {
                document.getElementById('rematch-status').style.display = 'none';
            }, 3000);
        }
    }

    handleRematchStart(data) {
        this.board = new GoEngine.Board(
            [data.boardX || 5, data.boardY || 5, data.boardZ || 5],
            data.komi || 6.5,
            data.ruleSet || 'chinese'
        );
        this.moveHistory = [];
        this.playerColor = data.color;
        this.setMyTurn(data.isMyTurn);
        this.resetScoringState();
        this.hideScoringPanel();
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.updateUI();
        document.getElementById('game-result-panel').style.display = 'none';
        document.getElementById('rematch-status').style.display = 'none';
    }

    // Новый метод для обработки нажатия на кнопку "Отменить ход"
    handleUndoClick() {
        if (this.isNetworkGame) {
            this.offerUndo();
        } else {
            this.undoMove();
        }
    }

    async handleUndoRequest() {
        this.pendingUndoRequest = true;
        const agree = await UI.confirm('Противник предлагает отменить ход. Вы согласны?');
        this.networkManager.sendUndoResponse(agree);
        if (agree) {
            this.processUndo();
        }
        this.pendingUndoRequest = null;
        // Скрываем индикатор, если он был показан (на случай, если мы сами запрашивали)
        document.getElementById('undo-status').style.display = 'none';
    }

    handleUndoResponse(accepted) {
        document.getElementById('undo-status').style.display = 'none';
        this.pendingUndoRequest = false;
        if (accepted) {
            this.processUndo();
        } else {
            UI.toast('Противник отклонил предложение отменить ход.', 'info');
        }
    }

    processUndo() {
        if (this.board.undo()) {
            // Удаляем последний ход из локальной истории
            this.moveHistory.pop();
            GraphicsEngine.createAndFillBoardForGo(this.board);
            // Обновляем очередь ходов: после отмены ход переходит к тому, кто его делал
            const currentStone = this.board.getCurrentPlayer();
            const myStone = (this.playerColor === 'Black') ? GoEngine.Stone.BLACK : GoEngine.Stone.WHITE;
            this.setMyTurn(currentStone === myStone);
            this.updateUI();
            GraphicsEngine.unselectCell();
        } else {
            UI.toast('Невозможно отменить ход', 'error');
        }
    }

    cancelUndoRequest() {
        if (this.pendingUndoRequest) {
            this.networkManager.sendUndoResponse(false);
            this.pendingUndoRequest = false;
            document.getElementById('undo-status').style.display = 'none';
        }
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
        // net-opponent-name holds the actual name and must stay visible —
        // net-opponent-info is just the trailing "(color) — рейтинг: X" bit,
        // shown alongside the name only when there's real color/rating data.
        document.getElementById('net-opponent-name').style.display = 'inline';
        document.getElementById('net-opponent-name').textContent = name;
        const hasExtra = color != null || rating != null;
        document.getElementById('net-opponent-info').style.display = hasExtra ? 'inline' : 'none';
        if (color != null) document.getElementById('net-opponent-color').textContent = color;
        if (rating != null) document.getElementById('net-opponent-rating').textContent = rating;
    }

    // --- Network clocks (mirrors chess/game.js) ---

    updateClocks(whiteMs, blackMs, initialSeconds, incrementSeconds) {
        if (whiteMs === undefined && blackMs === undefined) return;
        this.clockWhiteMs = whiteMs ?? this.clockWhiteMs;
        this.clockBlackMs = blackMs ?? this.clockBlackMs;
        this.clockLastSyncAt = Date.now();
        const el = document.getElementById('net-clocks');
        if (el) el.style.display = 'flex';
        this.renderClocks();
        if (!this.clockTickInterval) {
            this.clockTickInterval = setInterval(() => this.renderClocks(), 250);
        }
    }

    stopClockTicker() {
        if (this.clockTickInterval) {
            clearInterval(this.clockTickInterval);
            this.clockTickInterval = null;
        }
    }

    formatClockTime(ms) {
        if (ms == null) return '—:—';
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    renderClocks() {
        if (this.clockWhiteMs == null && this.clockBlackMs == null) return;
        // Paused server-side during the dead-stone scoring-agreement phase — don't
        // keep interpolating a countdown for a turn that isn't actually running.
        const paused = this.board && this.board.isAwaitingScoring && this.board.isAwaitingScoring();
        const elapsed = paused ? 0 : Date.now() - (this.clockLastSyncAt || Date.now());
        const currentColor = this.board && this.board.getCurrentPlayer() === GoEngine.Stone.BLACK ? 'Black' : 'White';
        let whiteMs = this.clockWhiteMs;
        let blackMs = this.clockBlackMs;
        if (currentColor === 'White' && whiteMs != null) whiteMs = Math.max(0, whiteMs - elapsed);
        if (currentColor === 'Black' && blackMs != null) blackMs = Math.max(0, blackMs - elapsed);

        const myColor = this.networkManager.playerColor;
        const meIsWhite = myColor === 'White';
        const meEl = document.getElementById('net-clock-me');
        const oppEl = document.getElementById('net-clock-opponent');
        const meTimeEl = document.getElementById('net-clock-me-time');
        const oppTimeEl = document.getElementById('net-clock-opponent-time');
        if (!meEl || !oppEl || !meTimeEl || !oppTimeEl) return;

        const meMs = meIsWhite ? whiteMs : blackMs;
        const oppMs = meIsWhite ? blackMs : whiteMs;
        meTimeEl.textContent = this.formatClockTime(meMs);
        oppTimeEl.textContent = this.formatClockTime(oppMs);

        const meActive = (currentColor === 'White') === meIsWhite;
        meEl.classList.toggle('active', meActive);
        oppEl.classList.toggle('active', !meActive);
        meEl.classList.toggle('low-time', meMs != null && meMs < 10000);
        oppEl.classList.toggle('low-time', oppMs != null && oppMs < 10000);
    }

    hideNetworkPanel() {
        document.getElementById('network-panel').style.display = 'none';
        this.isNetworkGame = false;
        this.stopClockTicker();
        this.updateBotPanelVisibility();
        this.updateEvaluationPanelVisibility();
    }

    switchToInRoom() {
        document.getElementById('network-panel').style.display = 'block';
    }

    showRoomList() {}
    showNetworkConnect() {}
    displayRooms() {}
    selectRoom() {}

    handleAxisChange(axisId) {
        let axis = null;
        if (axisId === 'axis-x') axis = 'x';
        else if (axisId === 'axis-y') axis = 'y';
        else if (axisId === 'axis-z') axis = 'z';
        else if (axisId === 'axis-none') axis = null;
        GraphicsEngine.setExpandedAxis(axis);
        GraphicsEngine.createAndFillBoardForGo(this.board);
    }

    saveSettings() {
        const settings = {
            bgColor: document.getElementById('bg-color').value,
            boardColor1: document.getElementById('board-color-1').value,
            boardColor2: document.getElementById('board-color-2').value,
            whiteFiguresColor: document.getElementById('white-figures-color').value,
            blackFiguresColor: document.getElementById('black-figures-color').value,
            // Только пресеты по имени — своя картинка не сериализуется, см. тот
            // же комментарий в chess/game.js.
            bgTexture: document.getElementById('bg-texture')?.value !== 'custom' ? (document.getElementById('bg-texture')?.value || '') : '',
            figureTexture: document.getElementById('figure-texture')?.value !== 'custom' ? (document.getElementById('figure-texture')?.value || '') : ''
        };
        const dataStr = JSON.stringify(settings);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'go_settings.json';
        link.click();
    }

    loadSettings(file) {
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

                if (settings.bgTexture !== undefined) {
                    document.getElementById('bg-texture').value = settings.bgTexture;
                    GraphicsEngine.setBackgroundTexturePreset(settings.bgTexture || null);
                }
                if (settings.figureTexture !== undefined) {
                    document.getElementById('figure-texture').value = settings.figureTexture;
                    GraphicsEngine.setFigureTexturePreset(settings.figureTexture || null);
                }

                UI.toast('Настройки успешно загружены!', 'success');
            } catch (error) {
                UI.toast('Ошибка при загрузке настроек: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    changeColor(type, value) {
        const colors = GraphicsEngine.getColors();
        switch (type) {
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
        // После обновления цветов перерисовываем доску
        GraphicsEngine.createAndFillBoardForGo(this.board);
    }

    saveGame() {
        const saveData = {
            version: 2,
            gameType: 'go',
            dims: this.board.dims,
            komi: this.board.komi,
            ruleSet: this.board.ruleSet,
            grid: this.board.grid.slice(),
            currentPlayer: this.board.currentPlayer,
            captures: this.board.captures,
            passCount: this.board.passCount,
            gameOver: this.board.gameOver,
            resigned: this.board.resigned,
            awaitingScoring: this.board.awaitingScoring,
            moveHistory: this.moveHistory
        };
        const json = JSON.stringify(saveData);
        const blob = new Blob([json], { type: 'text/plain' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = 'go_game_save.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    loadGame(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Проверяем, что это сохранение игры Го
                if (data.gameType !== 'go') {
                    UI.toast('Это не сохранение игры Го', 'error');
                    return;
                }

                // Создаём новую доску с теми же размерами, коми и правилами
                this.board = new GoEngine.Board(data.dims, data.komi, data.ruleSet || 'chinese');

                // Восстанавливаем состояние доски
                this.board.grid = data.grid.slice();
                this.board.currentPlayer = data.currentPlayer;
                this.board.captures = data.captures;
                this.board.passCount = data.passCount;
                this.board.gameOver = data.gameOver;
                this.board.resigned = data.resigned;
                this.board.awaitingScoring = !!data.awaitingScoring;

                // Пересчитываем хэш доски (необходимо для правильной работы ко)
                this.board.hash = this.board.computeHash();

                // Восстанавливаем историю ходов (для отображения)
                this.moveHistory = data.moveHistory;

                // Сбрасываем сетевой режим (загруженная игра – локальная)
                this.isNetworkGame = false;
                this.setMyTurn(true);
                const ruleSetSelect = document.getElementById('go-rule-set');
                if (ruleSetSelect) ruleSetSelect.value = this.board.ruleSet;

                // Обновляем отображение доски и UI
                this.resetScoringState();
                if (this.board.awaitingScoring) {
                    this.showScoringPanel();
                    this.updateScoringPanel();
                } else {
                    this.hideScoringPanel();
                }
                GraphicsEngine.createAndFillBoardForGo(this.board);
                this.updateUI();
                this.checkGameState();
                this.maybeBotMove();

                // Сообщаем о результате загрузки
                if (this.board.gameOver) {
                    const score = this.board.computeScore();
                    UI.toast(`Игра загружена. Счёт: чёрные ${score.black}, белые ${score.white}`, 'info');
                } else {
                    UI.toast('Игра успешно загружена', 'success');
                }
            } catch (err) {
                UI.toast('Ошибка при загрузке: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    }
}

window.addEventListener('load', () => {
    window.goGame = new GoGame();
});

