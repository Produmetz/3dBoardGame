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

        this.init();
    }

    init() {
        this.resetGame();
        this.setupEventListeners();
        console.log('Игра Го началась! Ходят чёрные');
        this.updateUI();
    }

    resetGame() {
        // Получаем размеры из UI
        const sizeX = parseInt(document.getElementById('go-size-x').value) || 5;
        const sizeY = parseInt(document.getElementById('go-size-y').value) || 5;
        const sizeZ = parseInt(document.getElementById('go-size-z').value) || 5;
        const komi = parseFloat(document.getElementById('go-komi').value) || 6.5;

        // Создаём новую доску
        this.board = new GoEngine.Board([sizeX, sizeY, sizeZ], komi);

        this.moveHistory = [];
        this.isNetworkGame = false;
        this.setMyTurn(true);

        // Перерисовываем доску
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.updateUI();
        console.log('Новая игра Го началась! Ходят чёрные');
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
        if (!cellCoords) {
            console.log('Клик мимо доски');
            return;
        }

        const { i, j, k } = cellCoords;
        const idx = this.board.coordToIndex([i, j, k]);
        const stone = this.board.grid[idx];
        console.log(`Клик по клетке [${i},${j},${k}], камень: ${stone === GoEngine.Stone.EMPTY ? 'пусто' : (stone === GoEngine.Stone.BLACK ? 'чёрный' : 'белый')}`);

        // Снимаем предыдущее выделение
        GraphicsEngine.unselectCell();

        if (stone === GoEngine.Stone.EMPTY && this.isMyTurn) {
            // Пустая клетка – проверяем возможность хода
            const currentPlayer = this.board.getCurrentPlayer();
            if (this.board.isLegalMove([i, j, k], currentPlayer)) {
                GraphicsEngine.selectCell(i, j, k);
                this.makeMove(i, j, k);
            } else {
                GraphicsEngine.flashCellInvalid(i, j, k);
                setTimeout(() => GraphicsEngine.unselectCell(), 300);
                console.log('Недопустимый ход');
            }
        } else if (!this.isMyTurn) {
            console.log('Сейчас не ваш ход');
            GraphicsEngine.selectCell(i, j, k);
            setTimeout(() => GraphicsEngine.unselectCell(), 200);
        }
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
        } else {
            console.log('Ошибка выполнения хода');
        }
    }

    pass() {
        if (!this.isMyTurn) return;
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

            if (this.board.isGameOver()) {
                const score = this.board.computeScore();
                alert(`Игра окончена. Счёт: чёрные ${score.black}, белые ${score.white}`);
            }
        }
    }

    resign() {
        if (!this.isMyTurn) return;
        const currentPlayer = this.board.getCurrentPlayer();
        const success = this.board.resign();
        if (success) {
            const winner = currentPlayer === GoEngine.Stone.BLACK ? 'Белые' : 'Чёрные';
            alert(`Игра окончена. Победитель: ${winner} (сдача)`);
            if (this.isNetworkGame && !this.isNetworkMove) {
                this.networkManager.sendResign();
            }
            this.updateUI();
        }
    }

    checkGameState() {
        if (this.board.isGameOver()) {
            const score = this.board.computeScore();
            document.getElementById('game-status').textContent =
                `Игра окончена. Счёт: чёрные ${score.black}, белые ${score.white}`;
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
    }

    updateMoveHistory() {
        const historyList = document.getElementById('history-list');
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
            alert('Заполните адрес сервера и ваше имя');
            return;
        }
        this.networkManager.connect(address, playerName);
        this.isNetworkGame = true;
    }

    disconnect() {
        this.networkManager.disconnect();
        this.isNetworkGame = false;
        this.setMyTurn(true);
        this.updateNetworkStatus('Не подключено');
        this.showNetworkConnect();
    }

    setMyTurn(isMyTurn) {
        this.isMyTurn = isMyTurn;
    }

    refreshRooms() {
        this.networkManager.requestRoomList();
    }

    confirmCreateRoom() {
        const name = document.getElementById('new-room-name').value.trim();
        if (!name) return alert('Введите название комнаты');
        const pwd = document.getElementById('new-room-password').value;
        const isPublic = document.getElementById('new-room-public').checked;
        this.networkManager.createRoom(name, pwd || null, isPublic);
    }

    cancelCreateRoom() {
        document.getElementById('create-room-panel').style.display = 'none';
    }

    confirmJoinRoom() {
        const pwd = document.getElementById('join-room-password').value;
        this.networkManager.joinRoom(this.selectedRoomId, pwd || null);
        document.getElementById('join-room-panel').style.display = 'none';
    }

    cancelJoinRoom() {
        document.getElementById('join-room-panel').style.display = 'none';
    }

    leaveRoom() {
        this.networkManager.leaveRoom();
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
        this.setMyTurn(true);
    }

    handleNetworkResign() {
        alert('Противник сдался. Вы победили!');
        this.updateUI();
    }

    handleUndoRequest() {
        this.pendingUndoRequest = true;
        const agree = confirm('Противник предлагает отменить ход. Вы согласны?');
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
            alert('Противник отклонил предложение отменить ход.');
        }
    }

    processUndo() {
        alert('Отмена хода в Го пока не поддерживается');
    }

    cancelUndoRequest() {
        if (this.pendingUndoRequest) {
            this.networkManager.sendUndoResponse(false);
            this.pendingUndoRequest = null;
            document.getElementById('undo-status').style.display = 'none';
        }
    }

    showNetworkConnect() {
        document.getElementById('network-connect').style.display = 'block';
        document.getElementById('network-rooms').style.display = 'none';
        document.getElementById('network-inroom').style.display = 'none';
    }

    showRoomList() {
        document.getElementById('network-connect').style.display = 'none';
        document.getElementById('network-rooms').style.display = 'block';
        document.getElementById('network-inroom').style.display = 'none';
        this.networkManager.requestRoomList();
    }

    switchToInRoom() {
        document.getElementById('network-connect').style.display = 'none';
        document.getElementById('network-rooms').style.display = 'none';
        document.getElementById('network-inroom').style.display = 'block';
    }

    displayRooms(rooms) {
        const listDiv = document.getElementById('rooms-list');
        listDiv.innerHTML = '';
        if (!rooms.length) {
            listDiv.innerHTML = '<p>Нет доступных комнат</p>';
            return;
        }
        rooms.forEach(room => {
            const roomDiv = document.createElement('div');
            roomDiv.style.cursor = 'pointer';
            roomDiv.style.padding = '5px';
            roomDiv.style.borderBottom = '1px solid #4cc9f0';
            roomDiv.innerHTML = `${room.name} (${room.playersCount}/2) ${room.hasPassword ? '🔒' : ''} ${room.isPublic ? '🌍' : '🔐'}`;
            roomDiv.onclick = () => this.selectRoom(room);
            listDiv.appendChild(roomDiv);
        });
    }

    selectRoom(room) {
        document.getElementById('selected-room-name').textContent = room.name;
        document.getElementById('join-room-panel').style.display = 'block';
        document.getElementById('join-room-password').value = '';
        this.selectedRoomId = room.id;
        this.selectedRoomHasPassword = room.hasPassword;
    }

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
            blackFiguresColor: document.getElementById('black-figures-color').value
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

                alert('Настройки успешно загружены!');
            } catch (error) {
                alert('Ошибка при загрузке настроек: ' + error.message);
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
        alert('Сохранение игры в Го пока не поддерживается');
    }

    loadGame(file) {
        alert('Загрузка игры в Го пока не поддерживается');
    }
}

window.addEventListener('load', () => {
    window.goGame = new GoGame();
});

// Обработчики для кнопок управления
document.getElementById('white-figures-color').addEventListener('input', (e) => {
    if (window.goGame) window.goGame.changeColor('whiteFigure', e.target.value);
});

document.getElementById('black-figures-color').addEventListener('input', (e) => {
    if (window.goGame) window.goGame.changeColor('blackFigure', e.target.value);
});

// При изменении размеров доски через UI
document.getElementById('apply-go-size').addEventListener('click', () => {
    if (window.goGame) window.goGame.resetGame();
});

// Обработчики кнопок
document.getElementById('new-game').addEventListener('click', () => {
    if (window.goGame) window.goGame.resetGame();
});
/*document.getElementById('pass-btn').addEventListener('click', () => {
    if (window.goGame) window.goGame.pass();
});*/
document.getElementById('resign-btn').addEventListener('click', () => {
    if (window.goGame) window.goGame.resign();
});
// Остальные кнопки (сохранить/загрузить) можно добавить аналогично