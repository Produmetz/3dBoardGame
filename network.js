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
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.intentionalClose = false;

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
                server = 'wss://176.32.33.76.nip.io';
            }

            const token = params.get('token') || '';
            const playerName = params.get('playerName') || 'Anonymous';
            const role = params.get('role') || 'player';

            this.authToken = token;
            this.playerName = playerName;
            this.isSpectator = (role === 'spectator');
            this.pendingRoomId = params.get('roomId');
            this.pendingColor = params.get('color');
            this.pendingOpponent = params.get('opponentName');
            this.pendingRoomName = params.get('roomName');

            setTimeout(() => {
                this.connectWithToken(server, playerName, token);
            }, 500);

            window.history.replaceState({}, '', window.location.pathname);
        }
    }

    /**
     * Wires onclose/onerror for a game-page socket. On an unintentional drop
     * (not one of leaveRoom/goBack/disconnect, which set intentionalClose
     * themselves) this reconnects the SAME page in place — re-sending
     * auth_join/join with the known roomId — instead of the old behavior of
     * bouncing through lobby.html and having the lobby auto-navigate back in,
     * which produced a jarring double page-reload on every transient drop.
     * Only after maxReconnectAttempts does it fall back to leaving for the lobby.
     */
    attachLifecycleHandlers(address, playerName, token) {
        this.socket.onclose = () => {
            this.connected = false;
            if (this.intentionalClose) {
                this.intentionalClose = false;
                return;
            }
            const targetRoomId = this.roomId || this.pendingRoomId;
            if (targetRoomId && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                this.game.updateNetworkStatus(`Переподключение... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                const delay = Math.min(1000 * this.reconnectAttempts, 5000);
                setTimeout(() => this.reconnectToRoom(address, playerName, token, targetRoomId), delay);
                return;
            }
            this.goToLobbyAfterDisconnect();
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.game.updateNetworkStatus('Ошибка подключения');
        };
    }

    goToLobbyAfterDisconnect() {
        if (window.location.search.includes('network=true') || this.lobbyServerIndex) {
            const server = this.lobbyServerIndex || '0';
            const token = this.authToken || '';
            const playerName = this.playerName || '';
            window.location.href = `../lobby.html?server=${server}&token=${token}&nickname=${playerName}`;
        } else {
            this.game.updateNetworkStatus('Отключено');
            this.game.showNetworkConnect();
        }
    }

    reconnectToRoom(address, playerName, token, roomId) {
        try {
            const wsUrl = address.replace('0.0.0.0', 'localhost');
            this.socket = new WebSocket(wsUrl);
            this.serverAddress = wsUrl;

            this.socket.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this.targetRoomId = roomId;
                if (token) {
                    this.send({ type: 'auth_join', token: token, playerName: playerName, roomId: roomId });
                } else {
                    this.send({ type: 'join', playerName: playerName, roomId: roomId });
                }
            };
            this.socket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
            this.attachLifecycleHandlers(address, playerName, token);
        } catch (error) {
            console.error('Reconnect error:', error);
            this.goToLobbyAfterDisconnect();
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
                // roomId pins this connection to the exact game this tab is showing —
                // without it the server would fall back to "whichever room this account
                // is currently focused on", which is ambiguous once several concurrent
                // games exist (see server-side room-focus fix).
                this.targetRoomId = this.pendingRoomId || undefined;
                if (token) {
                    this.send({ type: 'auth_join', token: token, playerName: playerName, roomId: this.targetRoomId });
                } else {
                    this.send({ type: 'join', playerName: playerName, roomId: this.targetRoomId });
                }
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.attachLifecycleHandlers(address, playerName, token);
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
                // We always ask for a specific room from a game page (see
                // targetRoomId above). Getting plain 'joined' back instead of
                // 'joined_room' means the server couldn't find/seat us there
                // (room gone, or a matching 'error' just arrived) — sitting on
                // the stale board is worse than just bouncing to the lobby.
                if (this.targetRoomId && !this.roomId) {
                    UI.toast('Эта игра больше недоступна', 'error');
                    this.goToLobbyAfterDisconnect();
                }
                break;
            case 'room_list':
                this.game.displayRooms(data.rooms);
                break;
            case 'room_created':
                this.targetRoomId = null;
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
                this.targetRoomId = null;
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

        // Any message can carry a fresh clock snapshot (room_created, joined_room,
        // move, pass, rematch_start, go_resumed) — resync whenever present. Done
        // AFTER the switch above so the active-side highlight reflects whoever's
        // turn it actually is post-move, not the turn that was just left behind.
        if (data.whiteTimeMs !== undefined || data.blackTimeMs !== undefined) {
            this.game.updateClocks?.(data.whiteTimeMs, data.blackTimeMs, data.timeInitialSeconds, data.timeIncrementSeconds);
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
        this.intentionalClose = true;
        this.send({ type: 'go_back' });
        this.roomId = null;
        this.playerColor = null;
        this.opponentName = null;

        const server = this.lobbyServerIndex || '0';
        const token = this.authToken || '';
        const playerName = this.playerName || '';
        window.location.href = `../lobby.html?server=${server}&token=${token}&nickname=${playerName}`;
    }

    leaveRoom() {
        this.intentionalClose = true;
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
        this.intentionalClose = true;
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
