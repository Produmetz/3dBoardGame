// network.js
class NetworkManager {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.connected = false;
        this.roomId = null;
        this.playerColor = null;
        this.opponentName = null;
        this.playerName = null;
    }

    connect(address, playerName) {
        try {
            this.socket = new WebSocket(address);
            this.playerName = playerName;

            this.socket.onopen = () => {
                this.connected = true;
                this.game.updateNetworkStatus('Подключено к серверу');
                this.send({ type: 'join', playerName: playerName });
                this.game.showRoomList(); // После подключения показываем список комнат
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.socket.onclose = () => {
                this.connected = false;
                this.game.updateNetworkStatus('Отключено');
                this.game.showNetworkConnect();
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.game.updateNetworkStatus('Ошибка подключения');
            };
        } catch (error) {
            console.error('Connection error:', error);
            alert('Ошибка подключения к серверу');
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'joined':
                // Подтверждение регистрации
                break;
            case 'room_list':
                this.game.displayRooms(data.rooms);
                break;
            case 'room_created':
                this.roomId = data.roomId;
                this.playerColor = data.color;   // 'Black' или 'White'
                this.game.updateRoomId(data.roomId);
                this.game.updatePlayerColor(data.color);
                this.game.updateOpponentName(null);
                this.game.setBoardParams(data.boardX, data.boardY, data.boardZ, data.komi);
                this.game.setMyTurn(data.color === 'Black');
                this.game.switchToInRoom();
                break;

            case 'joined_room':
                this.roomId = data.roomId;
                this.playerColor = data.color;   // 'White' для Го
                this.opponentName = data.opponentName;
                this.game.updateRoomId(data.roomId);
                this.game.updatePlayerColor(data.color);
                this.game.updateOpponentName(data.opponentName);
                this.game.setBoardParams(data.boardX, data.boardY, data.boardZ, data.komi);
                this.game.setMyTurn(data.color === 'White');   // для Го белые ходят вторыми
                this.game.switchToInRoom();
                break;
            case 'opponent_joined':
                this.opponentName = data.playerName;
                this.game.updateOpponentName(this.opponentName);
                break;
            case 'opponent_left':
                this.opponentName = null;
                this.game.updateOpponentName('-');
                break;
            case 'move':
                this.game.makeMoveFromNetwork(data.move);
                break;
            case 'chat':
                this.game.addChatMessage(data.sender, data.message);
                break;
            case 'undo_request':
                this.game.handleUndoRequest();
                break;
            case 'undo_response':
                this.game.handleUndoResponse(data.accepted);
                break;
            case 'pass':
                this.game.handleNetworkPass();
                break;
            case 'resign':
                this.game.handleNetworkResign();
                break;
            case 'error':
                alert(data.message);
                break;
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    requestRoomList() {
        this.send({ type: 'list_rooms' });
    }

    createRoom(roomName, password, isPublic, boardX, boardY, boardZ, komi) {
        this.send({
            type: 'create_room',
            roomName: roomName,
            password: password || null,
            isPublic: isPublic,
            gameType: 'go',
            boardX: boardX,
            boardY: boardY,
            boardZ: boardZ,
            komi: komi
        });
    }

    joinRoom(roomId, password) {
        this.send({
            type: 'join_room',
            roomId: roomId,
            password: password || null
        });
    }

    leaveRoom() {
        this.send({ type: 'leave_room' });
        this.roomId = null;
        this.playerColor = null;
        this.opponentName = null;
        this.game.showRoomList();
    }

    sendMove(move) {
        this.send({ type: 'move', move: move });
    }

    sendChat(message) {
        this.send({ type: 'chat', message: message });
    }

    sendUndoRequest() {
        this.send({ type: 'undo_request' });
    }

    sendUndoResponse(accepted) {
        this.send({ type: 'undo_response', accepted: accepted });
    }
    sendPass() {
        this.send({ type: 'pass' });
    }

    sendResign() {
        this.send({ type: 'resign' });
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
        this.connected = false;
        this.game.showNetworkConnect();
    }
}