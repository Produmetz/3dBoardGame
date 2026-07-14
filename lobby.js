class LobbyManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.authToken = null;
        this.nickname = null;
        this.serverUrl = null;
        this.serverIndex = -1;
        this.selectedRoomId = null;
        this.selectedRoomHasPassword = false;

        this.parseParams();
        this.connectToServer();
        this.setupEvents();
    }

    parseParams() {
        const params = new URLSearchParams(window.location.search);
        this.serverIndex = parseInt(params.get('server')) || -1;
        this.authToken = params.get('token');
        this.nickname = params.get('nickname');

        const servers = JSON.parse(localStorage.getItem('lobby_servers') || '[]');
        if (this.serverIndex >= 0 && servers[this.serverIndex]) {
            this.serverUrl = servers[this.serverIndex].url;
            document.getElementById('server-name').textContent = servers[this.serverIndex].name;
        }
    }

    setupEvents() {
        document.getElementById('refresh-btn').addEventListener('click', () => this.requestRoomList());
        document.getElementById('create-room-btn').addEventListener('click', () => {
            document.getElementById('create-modal').classList.add('active');
        });
        document.getElementById('cancel-create').addEventListener('click', () => {
            document.getElementById('create-modal').classList.remove('active');
        });
        document.getElementById('confirm-create').addEventListener('click', () => this.createRoom());
        document.getElementById('cancel-join').addEventListener('click', () => {
            document.getElementById('join-modal').classList.remove('active');
        });
        document.getElementById('confirm-join').addEventListener('click', () => this.joinRoom());
        document.getElementById('room-game-type').addEventListener('change', (e) => {
            document.getElementById('go-options').style.display = e.target.value === 'go' ? 'block' : 'none';
        });
        document.getElementById('leaderboard-game')?.addEventListener('change', () => this.loadLeaderboard());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    }

    connectToServer() {
        if (!this.serverUrl || !this.authToken) {
            window.location.href = 'servers.html';
            return;
        }

        try {
            this.socket = new WebSocket(this.serverUrl.replace('0.0.0.0', 'localhost'));

            this.socket.onopen = () => {
                this.connected = true;
                this.send({ type: 'auth_join', token: this.authToken, playerName: this.nickname });
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.socket.onclose = () => {
                this.connected = false;
            };

            this.socket.onerror = () => {
                alert('Ошибка подключения к серверу');
            };
        } catch(e) {
            alert('Ошибка подключения');
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'joined':
                this.requestRoomList();
                this.requestStats();
                this.requestGameHistory();
                this.loadLeaderboard();
                break;

            case 'joined_room':
                this.onJoinedRoom(data);
                break;

            case 'room_list':
                this.showRoomList(data.rooms);
                break;

            case 'stats':
                this.showStats(data);
                break;

            case 'leaderboard':
                this.showLeaderboard(data);
                break;

            case 'game_history':
                this.showGameHistory(data.games);
                break;

            case 'room_created':
                this.onRoomCreated(data);
                break;

            case 'error':
                alert(data.message);
                break;
        }
    }

    onJoinedRoom(data) {
        let gameUrl = data.gameType === 'chess' ? 'chess/chess.html' : 'go/go.html';
        const params = new URLSearchParams({
            network: 'true',
            roomId: data.roomId,
            color: data.color,
            role: data.role || 'player',
            gameType: data.gameType,
            boardX: data.boardX || '',
            boardY: data.boardY || '',
            boardZ: data.boardZ || '',
            komi: data.komi || '',
            isMyTurn: data.isMyTurn || false,
            opponentName: data.opponentName || '',
            serverIndex: this.serverIndex,
            token: this.authToken,
            playerName: this.nickname
        });
        if (data.roomName) params.set('roomName', data.roomName);

        window.location.href = gameUrl + '?' + params.toString();
    }

    onRoomCreated(data) {
        let gameUrl = data.gameType === 'chess' ? 'chess/chess.html' : 'go/go.html';
        const params = new URLSearchParams({
            network: 'true',
            roomId: data.roomId,
            color: data.color,
            role: 'player',
            gameType: data.gameType,
            boardX: data.boardX || '',
            boardY: data.boardY || '',
            boardZ: data.boardZ || '',
            komi: data.komi || '',
            isMyTurn: data.isMyTurn || false,
            serverIndex: this.serverIndex,
            token: this.authToken,
            playerName: this.nickname
        });
        if (data.roomName) params.set('roomName', data.roomName);

        window.location.href = gameUrl + '?' + params.toString();
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    requestRoomList() {
        this.send({ type: 'list_rooms' });
    }

    requestStats() {
        this.send({ type: 'get_stats', nickname: this.nickname });
    }

    requestGameHistory() {
        this.send({ type: 'get_game_history', nickname: this.nickname, limit: 20 });
    }

    loadLeaderboard() {
        const game = document.getElementById('leaderboard-game')?.value || 'chess';
        this.send({ type: 'get_leaderboard', game: game });
    }

    showRoomList(rooms) {
        const listDiv = document.getElementById('room-list');
        if (!rooms || rooms.length === 0) {
            listDiv.innerHTML = '<div class="no-rooms">Нет доступных комнат</div>';
            return;
        }
        listDiv.innerHTML = '';
        rooms.forEach(room => {
            const div = document.createElement('div');
            div.className = 'room-item';
            div.innerHTML = `
                <div class="room-item-header">
                    <span class="room-name">${this.escapeHtml(room.name)} ${room.hasPassword ? '🔒' : ''}</span>
                    <span class="room-game-type">${room.gameType === 'chess' ? 'Шахматы' : 'Го'}</span>
                </div>
                <div class="room-info">
                    <span>${room.playersCount}/2 игроков</span>
                    ${room.spectatorCount ? `<span>👁 ${room.spectatorCount}</span>` : ''}
                </div>
            `;
            div.addEventListener('click', () => this.selectRoom(room));
            listDiv.appendChild(div);
        });
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    selectRoom(room) {
        this.selectedRoomId = room.id;
        this.selectedRoomHasPassword = room.hasPassword;
        this.selectedRoomGameType = room.gameType;
        document.getElementById('join-room-name').textContent = room.name;
        document.getElementById('join-password-group').style.display = room.hasPassword ? 'block' : 'none';
        document.getElementById('join-modal').classList.add('active');
    }

    joinRoom() {
        const password = document.getElementById('join-password').value;
        const role = document.getElementById('join-role')?.value || 'player';
        if (this.selectedRoomHasPassword && !password) {
            alert('Введите пароль');
            return;
        }
        this.send({ type: 'join_room', roomId: this.selectedRoomId, password: password || null, role: role });
        document.getElementById('join-modal').classList.remove('active');
    }

    createRoom() {
        const name = document.getElementById('room-name').value.trim();
        if (!name) {
            alert('Введите название комнаты');
            return;
        }
        const gameType = document.getElementById('room-game-type').value;

        this.send({
            type: 'create_room',
            roomName: name,
            password: document.getElementById('room-password').value || null,
            isPublic: document.getElementById('room-public').checked,
            gameType: gameType,
            allowSpectators: document.getElementById('room-allow-spectators')?.checked ?? true,
            colorMode: document.getElementById('room-color-mode')?.value || 'creator_pick',
            gameMode: document.getElementById('room-game-mode')?.value || 'rated',
            creatorColor: document.getElementById('room-creator-color')?.value || 'white',
            boardX: gameType === 'chess' ? 6 : parseInt(document.getElementById('room-board-x').value),
            boardY: gameType === 'chess' ? 6 : parseInt(document.getElementById('room-board-y').value),
            boardZ: gameType === 'chess' ? 8 : parseInt(document.getElementById('room-board-z').value),
            komi: parseFloat(document.getElementById('room-komi').value)
        });
        document.getElementById('create-modal').classList.remove('active');
    }

    showStats(data) {
        document.getElementById('stats-nickname').textContent = data.nickname;
        const skillNames = {'beginner': 'Новичок', 'amateur': 'Любитель', 'professional': 'Профессионал'};
        document.getElementById('stats-skill').textContent = `Уровень: ${skillNames[data.skillLevel] || data.skillLevel}`;

        const publicToggle = document.getElementById('public-rating-toggle');
        publicToggle.checked = data.publicRating !== 0;
        publicToggle.onchange = () => {
            this.send({ type: 'set_public_rating', public: publicToggle.checked ? 1 : 0 });
        };

        document.getElementById('chess-rating').textContent = data.rating_chess;
        document.getElementById('go-rating').textContent = data.rating_go;
        document.getElementById('chess-record').textContent =
            `${data.games_played_chess} игр · ${data.wins_chess}В ${data.losses_chess}П ${data.draws_chess}Н`;
        document.getElementById('go-record').textContent =
            `${data.games_played_go} игр · ${data.wins_go}В ${data.losses_go}П ${data.draws_go}Н`;
    }

    showLeaderboard(data) {
        const list = document.getElementById('leaderboard-list');
        if (!data.leaderboard || data.leaderboard.length === 0) {
            list.innerHTML = '<div style="color:#7a8eaa; text-align:center;">Нет данных</div>';
            return;
        }
        const skillIcons = {'beginner': '🟢', 'amateur': '🔵', 'professional': '🟣'};
        list.innerHTML = '';
        data.leaderboard.forEach((user, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid #1e2a36; font-size:0.85rem;';
            div.innerHTML = `
                <span>${medal} ${skillIcons[user.skillLevel] || ''} ${user.nickname}</span>
                <span style="color:#4cc9f0;">${user.rating}</span>
            `;
            list.appendChild(div);
        });
    }

    showGameHistory(games) {
        const listDiv = document.getElementById('history-list');
        if (!games || games.length === 0) {
            listDiv.innerHTML = '<div class="no-rooms">Нет сохранённых игр</div>';
            return;
        }
        listDiv.innerHTML = '';
        games.forEach(game => {
            const isWinner = game.winner_name === this.nickname;
            const resultClass = game.winner_name ? (isWinner ? 'win' : 'loss') : 'draw';
            const resultText = game.winner_name ? (isWinner ? 'Победа' : 'Поражение') : 'Ничья';
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div>
                    <span class="history-result ${resultClass}">${resultText}</span>
                    <span style="color:#4cc9f0; margin-left:0.5rem;">${game.game_type === 'chess' ? 'Шахматы' : 'Го'}</span>
                </div>
                <div style="color:#9bb4d0; font-size:0.8rem;">${game.player1_name} vs ${game.player2_name}</div>
            `;
            div.addEventListener('click', () => {
                this.send({ type: 'get_replay', gameId: game.id });
            });
            listDiv.appendChild(div);
        });
    }

    logout() {
        localStorage.removeItem('lobby_auth');
        window.location.href = 'servers.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.lobby = new LobbyManager();
});
