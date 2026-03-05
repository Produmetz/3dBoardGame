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

        this.init();
    }

    init() {
        // Инициализация шахматного движка
        ChessEngine.InitGame();

        // Создаем доску с фигурами
        createAndFillBoardOnPole(ChessEngine.Pole);

        // Добавляем обработчики событий
        this.setupEventListeners();
        
        // Запускаем анимацию
        animate();

        console.log('Игра началась! Ходят ' + this.currentPlayer);
        this.updateUI();
    }

    resetToStandart() {
        ChessEngine.InitGame();
        this.currentPlayer = 'White';
        this.moveHistory = [];
        this.isDragging = false;
        this.isStandardPosition = true; // Устанавливаем флаг в true

        createAndFillBoardOnPole(ChessEngine.Pole);
        this.updateUI();
        console.log('Новая игра началась! Ходят ' + this.currentPlayer);
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
    }

    handleCanvasClick(event) {
        const cellCoords = GraphicsEngine.cellFromClick(event.clientX, event.clientY);

        if (!cellCoords) return;

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

    isPossibleMove(i, j, k) {
        return GraphicsEngine.highlightedPossibleMoves.some(move =>
            move[0] == i && move[1] == j && move[2] == k
        );
    }

    makeMove(fromX, fromY, fromZ, toX, toY, toZ) {
        // Сохраняем информацию о ходе для возможной отмены
        const capturedFigure = ChessEngine.Pole[toX][toY][toZ];
        const moveInfo = {
            from: { x: fromX, y: fromY, z: fromZ },
            to: { x: toX, y: toY, z: toZ },
            movedFigure: ChessEngine.Pole[fromX][fromY][fromZ],
            capturedFigure: capturedFigure
        };

        // Выполняем ход в шахматном движке
        const moveResult = ChessEngine.Move(
            fromX, fromY, fromZ,
            toX, toY, toZ,
            ChessEngine.Pole,
            this.currentPlayer == 'White'
        );

        if (moveResult.success) {
            // Сохраняем ход в историю
            this.moveHistory.push(moveInfo);
            // Отправляем ход противнику, если это сетевая игра
            if (this.isNetworkGame && !this.isNetworkMove) {
                this.setMyTurn(false);
                this.networkManager.sendMove({
                    from: { x: fromX, y: fromY, z: fromZ },
                    to: { x: toX, y: toY, z: toZ }
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
    }

    undoMove() {
        if (this.moveHistory.length == 0) return;

        const lastMove = this.moveHistory.pop();
        const { from, to, movedFigure, capturedFigure } = lastMove;

        // Восстанавливаем фигуру на исходной позиции
        ChessEngine.Pole[from.x][from.y][from.z] = movedFigure;

        // Восстанавливаем взятие фигуры, если было
        if (capturedFigure) {
            ChessEngine.Pole[to.x][to.y][to.z] = capturedFigure;
        } else {
            ChessEngine.Pole[to.x][to.y][to.z] = null;
        }

        // Меняем текущего игрока
        this.currentPlayer = this.currentPlayer === 'White' ? 'Black' : 'White';

        createAndFillBoardOnPole(ChessEngine.Pole);
        // Проверяем состояние игры
        this.checkGameState();

        // Обновляем UI
        this.updateUI();

        console.log('Ход отменен. Теперь ходят: ' + this.currentPlayer);
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
                break;
            case 'CheckBlack':
                document.getElementById('game-status').textContent = 'Шах черным!';
                break;
            case 'CheckMateBlack':
                document.getElementById('game-status').textContent = 'Мат черным! Игра окончена.';
                break;
            default:
                document.getElementById('game-status').textContent = '';
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
    }

    updateMoveHistory() {
        const historyList = document.getElementById('history-list');
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

                alert('Настройки успешно загружены!');
            } catch (error) {
                alert('Ошибка при загрузке настроек: ' + error.message);
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
                                move.to.x, move.to.y, move.to.z
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
                    alert('Неизвестный формат файла');
                    return;
                }

                GraphicsEngine.createAndFillBoardOnPole(ChessEngine.Pole);
                this.checkGameState();
                this.updateUI();

                alert('Игра успешно загружена!');
            } catch (error) {
                alert('Ошибка при загрузке игры: ' + error.message);
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

    // Методы для обновления UI
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
        this.makeMove(move.from.x, move.from.y, move.from.z, move.to.x, move.to.y, move.to.z);
        this.isNetworkMove = false;
        this.setMyTurn(true);
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