class NetworkManager {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.connected = false;
        this.roomId = null;
        this.playerColor = null;
        this.opponentName = null;
        this.playerName = null;
        this.authToken = null;
        this.serverAddress = null;
        this.isSpectator = false;
        this.lobbyServerIndex = null;

        this.checkLobbyRedirect();
    }

    checkLobbyRedirect() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('network') === 'true') {
            let server = params.get('server') || '';
            this.lobbyServerIndex = server;

            // Если server — это число (индекс), получаем URL из localStorage
            if (server && !isNaN(parseInt(server))) {
                try {
                    const servers = JSON.parse(localStorage.getItem('lobby_servers') || '[]');
                    if (servers[parseInt(server)]) {
                        server = servers[parseInt(server)].url;
                    }
                } catch(e) {}
            }

            // Если server пустой или невалидный — используем дефолт
            if (!server || (!server.startsWith('ws://') && !server.startsWith('wss://'))) {
                server = 'wss://threedboardgames.onrender.com';
            }

            const token = params.get('token') || '';
            const playerName = params.get('playerName') || 'Anonymous';
            const role = params.get('role') || 'player';

            this.authToken = token;
            this.playerName = playerName;
            this.isSpectator = (role === 'spectator');
            this.pendingRoomId = params.get('roomId');
            this.pendingRoomCode = params.get('roomCode');
            this.pendingColor = params.get('color');
            this.pendingOpponent = params.get('opponentName');
            this.pendingRoomName = params.get('roomName');

            setTimeout(() => {
                if (this.pendingRoomCode) {
                    this.connectWithCode(server, playerName, token, this.pendingRoomCode);
                } else {
                    this.connectWithToken(server, playerName, token);
                }
            }, 500);

            window.history.replaceState({}, '', window.location.pathname);
        }
    }

    connectWithToken(address, playerName, token) {
        try {
            const wsUrl = address.replace('0.0.0.0', 'localhost');
            this.socket = new WebSocket(wsUrl);
            this.playerName = playerName;
            this.serverAddress = wsUrl;

            this.socket.onopen = () => {
                this.connected = true;
                if (token) {
                    this.send({ type: 'auth_join', token: token, playerName: playerName });
                } else {
                    this.send({ type: 'join', playerName: playerName });
                }
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.socket.onclose = () => {
                this.connected = false;
                // Если соединение закрылось и мы на странице игры — возвращаем в лобби
                if (window.location.search.includes('network=true') || this.lobbyServerIndex) {
                    const server = this.lobbyServerIndex || '0';
                    const token = this.authToken || '';
                    const playerName = this.playerName || '';
                    window.location.href = `../lobby.html?server=${server}&token=${token}&nickname=${playerName}`;
                } else {
                    this.game.updateNetworkStatus('Отключено');
                    this.game.showNetworkConnect();
                }
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.game.updateNetworkStatus('Ошибка подключения');
            };
        } catch (error) {
            console.error('Connection error:', error);
            UI.toast('Ошибка подключения к серверу', 'error');
        }
    }

    connectWithCode(address, playerName, token, roomCode) {
        try {
            const wsUrl = address.replace('0.0.0.0', 'localhost');
            this.socket = new WebSocket(wsUrl);
            this.playerName = playerName;
            this.serverAddress = wsUrl;

            this.socket.onopen = () => {
                this.connected = true;
                if (token) {
                    this.send({ type: 'auth_join', token: token, playerName: playerName });
                } else {
                    this.send({ type: 'join', playerName: playerName });
                }
            };

            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'joined') {
                    this.send({ type: 'join_by_code', code: roomCode });
                } else {
                    this.handleMessage(data);
                }
            };

            this.socket.onclose = () => {
                this.connected = false;
                if (window.location.search.includes('network=true') || this.lobbyServerIndex) {
                    const server = this.lobbyServerIndex || '0';
                    const token = this.authToken || '';
                    const playerName = this.playerName || '';
                    window.location.href = `../lobby.html?server=${server}&token=${token}&nickname=${playerName}`;
                } else {
                    this.game.updateNetworkStatus('Отключено');
                    this.game.showNetworkConnect();
                }
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.game.updateNetworkStatus('Ошибка подключения');
            };
        } catch (error) {
            console.error('Connection error:', error);
            UI.toast('Ошибка подключения к серверу', 'error');
        }
    }

    connect(address, playerName) {
        try {
            this.socket = new WebSocket(address);
            this.playerName = playerName;
            this.serverAddress = address;

            this.socket.onopen = () => {
                this.connected = true;
                const token = localStorage.getItem('lobby_token');
                if (token) {
                    this.authToken = token;
                    this.send({ type: 'auth_join', token: token, playerName: playerName });
                } else {
                    this.send({ type: 'join', playerName: playerName });
                }
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.socket.onclose = () => {
                this.connected = false;
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Connection error:', error);
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'joined':
                break;
            case 'room_list':
                this.game.displayRooms(data.rooms);
                break;
            case 'room_created':
                this.roomId = data.roomId;
                this.playerColor = data.color;
                this.game.isNetworkGame = true;
                if (data.boardX !== undefined) {
                    this.game.setBoardParams(data.boardX, data.boardY, data.boardZ, data.komi, data.ruleSet);
                }
                this.game.setMyTurn(data.isMyTurn);
                this.game.showRoomInfo(
                    this.serverAddress || '—',
                    data.roomId,
                    data.roomName || data.roomId,
                    data.gameType,
                    this.playerName,
                    data.color,
                    null
                );
                break;

            case 'joined_room':
                this.roomId = data.roomId;
                this.playerColor = data.color;
                this.game.isNetworkGame = true;
                this.opponentName = data.opponentName;
                if (data.role === 'spectator') {
                    this.isSpectator = true;
                }
                if (data.boardX !== undefined) {
                    this.game.setBoardParams(data.boardX, data.boardY, data.boardZ, data.komi, data.ruleSet);
                }
                this.game.setMyTurn(data.isMyTurn);
                this.game.showRoomInfo(
                    this.serverAddress || '—',
                    data.roomId,
                    data.roomName || data.roomId,
                    data.gameType,
                    this.playerName,
                    data.color,
                    null
                );
                if (data.opponentName) {
                    this.game.updateOpponentInfo(data.opponentName, null, null);
                }
                if (this.isSpectator) {
                    this.game.setMyTurn(false);
                }
                break;
            case 'opponent_joined':
                this.opponentName = data.playerName;
                this.game.updateOpponentInfo(data.playerName, null, null);
                break;
            case 'opponent_left':
                this.opponentName = null;
                this.game.showRoomInfo(
                    this.serverAddress || '—',
                    this.roomId,
                    null,
                    null,
                    this.playerName,
                    this.playerColor,
                    null
                );
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
            case 'game_over':
                this.game.handleGameOver(data);
                break;
            case 'draw_offer':
                this.game.handleDrawOffer(data);
                break;
            case 'draw_response':
                this.game.handleDrawResponse(data);
                break;
            case 'rematch_offer':
                this.game.handleRematchOffer(data);
                break;
            case 'rematch_response':
                this.game.handleRematchResponse(data);
                break;
            case 'rematch_start':
                this.game.handleRematchStart(data);
                break;
            case 'go_scoring_submitted':
                this.game.handleGoScoringSubmitted?.(data);
                break;
            case 'go_scoring_mismatch':
                this.game.handleGoScoringMismatch?.(data);
                break;
            case 'go_resumed':
                this.game.handleGoResumed?.(data);
                break;
            case 'error':
                UI.toast(data.message, 'error');
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

    createRoom(roomName, password, isPublic, gameType, boardX, boardY, boardZ, komi, ruleSet) {
        this.send({
            type: 'create_room',
            roomName: roomName,
            password: password || null,
            isPublic: isPublic,
            gameType: gameType,
            boardX: boardX,
            boardY: boardY,
            boardZ: boardZ,
            komi: komi,
            ruleSet: ruleSet
        });
    }

    joinRoom(roomId, password) {
        this.send({
            type: 'join_room',
            roomId: roomId,
            password: password || null
        });
    }

    goBack() {
        // Go back to lobby without leaving the room
        // Player stays in room, can reconnect later via "My Rooms"
        this.send({ type: 'go_back' });
        this.roomId = null;
        this.playerColor = null;
        this.opponentName = null;

        const server = this.lobbyServerIndex || '0';
        const token = this.authToken || '';
        const playerName = this.playerName || '';
        window.location.href = `../lobby.html?server=${server}&token=${token}&nickname=${playerName}&stay=1`;
    }

    leaveRoom() {
        this.send({ type: 'leave_room' });
        this.roomId = null;
        this.playerColor = null;
        this.opponentName = null;

        // Перенаправляем обратно в лобби (параметры сохранены в constructor)
        const server = this.lobbyServerIndex || '0';
        const token = this.authToken || '';
        const playerName = this.playerName || '';
        window.location.href = `../lobby.html?server=${server}&token=${token}&nickname=${playerName}`;
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

    sendDrawOffer() {
        this.send({ type: 'draw_offer' });
    }

    sendDrawResponse(accepted) {
        this.send({ type: 'draw_response', accepted: accepted });
    }

    sendRematchOffer() {
        this.send({ type: 'rematch_offer' });
    }

    sendRematchResponse(accepted) {
        this.send({ type: 'rematch_response', accepted: accepted });
    }

    sendGameOver(winner) {
        this.send({ type: 'game_over', winner: winner || null });
    }

    sendGoSubmitScoring(deadStones) {
        this.send({
            type: 'go_submit_scoring',
            deadStones: deadStones.map(([x, y, z]) => ({ x, y, z }))
        });
    }

    sendGoResumePlay() {
        this.send({ type: 'go_resume_play' });
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
        this.connected = false;

        // Перенаправляем обратно в лобби (параметры сохранены в constructor)
        const server = this.lobbyServerIndex || '0';
        const token = this.authToken || '';
        const playerName = this.playerName || '';
        window.location.href = `../lobby.html?server=${server}&token=${token}&nickname=${playerName}`;
    }
}
