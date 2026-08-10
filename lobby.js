// Game type configuration - add new games here
const GAME_TYPES = {
    chess: { name: 'Шахматы', url: 'chess/chess.html', icon: '♟' },
    go: { name: 'Го', url: 'go/go.html', icon: '⚫' }
    // Add new games here, e.g.:
    // checkers: { name: 'Шашки', url: 'checkers/checkers.html', icon: '◆' }
};

function getGameName(type) {
    return GAME_TYPES[type]?.name || type;
}

function getGameUrl(type) {
    return GAME_TYPES[type]?.url || 'index.html';
}

function getGameIcon(type) {
    return GAME_TYPES[type]?.icon || '🎮';
}

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
        this.myRooms = [];
        this.stayInLobby = false; // Flag: player came back from game, don't redirect

        this.parseParams();
        this.connectToServer();
        this.setupEvents();
        this.setupTabs();
    }

    parseParams() {
        const params = new URLSearchParams(window.location.search);
        this.serverIndex = parseInt(params.get('server')) || -1;
        this.authToken = params.get('token');
        this.nickname = params.get('nickname');
        // If ?stay=1 is in URL, player came back from game - don't auto-redirect
        if (params.get('stay') === '1') {
            this.stayInLobby = true;
        }

        const servers = JSON.parse(localStorage.getItem('lobby_servers') || '[]');
        if (this.serverIndex >= 0 && servers[this.serverIndex]) {
            this.serverUrl = servers[this.serverIndex].url;
            document.getElementById('server-name').textContent = servers[this.serverIndex].name;
        }
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.lobby-tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));
                tab.classList.add('active');
                const target = document.getElementById('tab-' + tab.dataset.tab);
                if (target) target.classList.add('active');

                if (tab.dataset.tab === 'my-rooms') this.getMyRooms();
                if (tab.dataset.tab === 'all-rooms') this.requestRoomList();
            });
        });

        document.getElementById('refresh-my-rooms')?.addEventListener('click', () => this.getMyRooms());
    }

    setupEvents() {
        document.getElementById('refresh-btn').addEventListener('click', () => this.requestRoomList());
        document.getElementById('confirm-create').addEventListener('click', () => this.createRoom());
        document.getElementById('cancel-join').addEventListener('click', () => {
            document.getElementById('join-modal').classList.remove('active');
        });
        document.getElementById('confirm-join').addEventListener('click', () => this.joinRoom());
        document.getElementById('room-game-type').addEventListener('change', (e) => {
            document.getElementById('go-options').style.display = e.target.value === 'go' ? 'block' : 'none';
            document.getElementById('chess-options').style.display = e.target.value === 'chess' ? 'block' : 'none';
        });
        document.getElementById('leaderboard-game')?.addEventListener('change', () => this.loadLeaderboard());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('join-color-mode')?.addEventListener('change', (e) => {
            document.getElementById('join-color-select').style.display = e.target.value === 'pick' ? 'block' : 'none';
        });

        // Quick Play buttons
        document.getElementById('qp-chess').addEventListener('click', () => this.quickPlay('chess'));
        document.getElementById('qp-go').addEventListener('click', () => this.quickPlay('go'));

        // Join by Code
        document.getElementById('code-join-btn').addEventListener('click', () => this.joinByCode());
        document.getElementById('code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.joinByCode();
        });
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
                UI.toast('Ошибка подключения к серверу', 'error');
            };
        } catch(e) {
            UI.toast('Ошибка подключения', 'error');
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
                if (this.isReconnecting || this.stayInLobby) {
                    // Don't redirect to game - just refresh lists
                    this.isReconnecting = false;
                    this.stayInLobby = false;
                    this.requestRoomList();
                    this.getMyRooms();
                    this.requestStats();
                    this.requestGameHistory();
                    this.loadLeaderboard();
                } else {
                    this.onJoinedRoom(data);
                }
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

            case 'left_room':
                this.onLeftRoom();
                break;

            case 'went_back':
                // Player went back to lobby without leaving room
                this.requestRoomList();
                this.getMyRooms();
                break;

            case 'my_rooms':
                this.showMyRooms(data.rooms);
                break;

            case 'room_info':
                this.onRoomInfo(data);
                break;

            case 'room_deleted':
                this.onRoomDeleted(data.roomId);
                break;

            case 'replay':
                window.location.href = 'replay.html?data=' + encodeURIComponent(JSON.stringify(data));
                break;

            case 'error':
                UI.toast(data.message, 'error');
                break;
        }
    }

    onJoinedRoom(data) {
        let gameUrl = getGameUrl(data.gameType);
        const params = new URLSearchParams({
            network: 'true',
            roomId: data.roomId,
            color: data.color || '',
            role: data.role || 'player',
            gameType: data.gameType,
            boardX: data.boardX || '',
            boardY: data.boardY || '',
            boardZ: data.boardZ || '',
            komi: data.komi || '',
            ruleSet: data.ruleSet || '',
            isMyTurn: data.isMyTurn || false,
            opponentName: data.opponentName || '',
            server: this.serverIndex,
            token: this.authToken,
            playerName: this.nickname
        });
        if (data.roomName) params.set('roomName', data.roomName);

        window.location.href = gameUrl + '?' + params.toString();
    }

    onRoomCreated(data) {
        const code = data.code || '';
        // Show success message
        const status = document.getElementById('create-status');
        if (status) {
            status.innerHTML = `<div class="success-msg">Комната создана! Код: <strong>${code}</strong> <button class="copy-btn" onclick="navigator.clipboard.writeText('${code}').then(()=>this.textContent='✓')">Копировать</button></div>`;
            status.style.display = 'block';
        }
        // Switch to My Rooms tab
        document.querySelectorAll('.lobby-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.querySelector('[data-tab="my-rooms"]')?.classList.add('active');
        document.getElementById('tab-my-rooms')?.classList.add('active');
        // Refresh lists
        this.requestRoomList();
        this.getMyRooms();
    }

    // --- Quick Play ---
    quickPlay(gameType) {
        const status = document.getElementById('quick-play-status');
        status.innerHTML = '<span class="spinner"></span> Поиск соперника...';
        this.send({ type: 'quick_play', gameType });
    }

    // --- Join by Code ---
    joinByCode() {
        const input = document.getElementById('code-input');
        const status = document.getElementById('code-status');
        const code = input.value.trim().toUpperCase();

        if (!code || code.length !== 6) {
            status.textContent = 'Код должен содержать 6 символов';
            status.className = 'code-status error';
            return;
        }

        status.textContent = 'Поиск комнаты...';
        status.className = 'code-status';
        this.send({ type: 'get_room_by_code', code });
    }

    onRoomInfo(data) {
        const status = document.getElementById('code-status');
        if (!data || data.error) {
            status.textContent = data?.error || 'Комната не найдена';
            status.className = 'code-status error';
            return;
        }

        this.selectedRoomId = data.id;
        this.selectedRoomHasPassword = data.hasPassword;
        this.selectedRoomGameType = data.gameType;

        document.getElementById('join-room-name').textContent = `${data.name} (${getGameName(data.gameType)}) — ${data.playersCount}/2`;
        document.getElementById('join-password-group').style.display = data.hasPassword ? 'block' : 'none';

        const colorModeGroup = document.getElementById('join-color-mode-group');
        if (colorModeGroup) {
            colorModeGroup.style.display = data.gameType === 'chess' ? 'block' : 'none';
        }

        status.textContent = '';
        status.className = 'code-status';
        document.getElementById('join-modal').classList.add('active');
    }

    // --- My Rooms (server) ---
    getMyRooms() {
        this.send({ type: 'get_my_rooms' });
    }

    showMyRooms(rooms) {
        const container = document.getElementById('my-rooms-grid');
        if (!rooms || rooms.length === 0) {
            container.innerHTML = '<div class="no-rooms">Нет активных комнат</div>';
            return;
        }

        container.innerHTML = '';
        rooms.forEach(room => {
            const card = document.createElement('div');
            card.className = 'my-room-card';

            const gameUrl = getGameUrl(room.gameType);
            const gameParams = new URLSearchParams({
                network: 'true',
                roomId: room.id,
                gameType: room.gameType,
                server: this.serverIndex,
                token: this.authToken,
                playerName: this.nickname
            });

            const statusClass = room.status === 'playing' ? 'status-playing' : 'status-waiting';
            const statusText = room.status === 'playing' ? 'В игре' : 'Ожидание';

            card.innerHTML = `
                <div class="my-room-card-header">
                    <span class="my-room-card-name">${this.escapeHtml(room.name)}</span>
                    <span class="my-room-status ${statusClass}">${statusText}</span>
                </div>
                <div class="my-room-card-details">
                    <span>${getGameName(room.gameType)}</span>
                    <span>${room.opponentName ? 'vs ' + this.escapeHtml(room.opponentName) : 'Ожидание игрока'}</span>
                </div>
                <div class="share-code">
                    <span class="room-code">${room.code}</span>
                    <button class="copy-btn" data-code="${room.code}">Копировать</button>
                </div>
                <div class="my-room-card-actions">
                    <a href="${gameUrl}?${gameParams.toString()}" class="btn btn-primary btn-sm">Войти</a>
                    <button class="btn btn-secondary btn-sm" data-leave="${room.id}">Покинуть</button>
                    ${room.isOwner ? `<button class="btn btn-danger btn-sm" data-delete="${room.id}">Удалить</button>` : ''}
                </div>
            `;

            card.querySelector('.copy-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(room.code).then(() => {
                    e.target.textContent = 'Скопировано!';
                    setTimeout(() => e.target.textContent = 'Копировать', 1500);
                });
            });

            const leaveBtn = card.querySelector('[data-leave]');
            if (leaveBtn) {
                leaveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.leaveRoom(room.id);
                });
            }

            const deleteBtn = card.querySelector('[data-delete]');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteRoom(room.id);
                });
            }

            container.appendChild(card);
        });
    }

    // --- All Rooms ---
    showRoomList(rooms) {
        const listDiv = document.getElementById('room-list');
        if (!rooms || rooms.length === 0) {
            listDiv.innerHTML = '<div class="no-rooms">Нет доступных комнат</div>';
            return;
        }
        listDiv.innerHTML = '';
        rooms.forEach(room => {
            const div = document.createElement('button');
            div.type = 'button';
            div.className = 'room-item';
            div.innerHTML = `
                <div class="room-item-header">
                    <span class="room-name">${this.escapeHtml(room.name)} ${room.hasPassword ? '🔒' : ''}</span>
                    <span class="room-game-type">${getGameName(room.gameType)}</span>
                </div>
                <div class="room-info">
                    <span>${room.playersCount}/2 игроков</span>
                    ${room.spectatorCount ? `<span>👁 ${room.spectatorCount}</span>` : ''}
                    ${room.code ? `<span style="font-family:monospace; color:#4cc9f0;">${room.code}</span>` : ''}
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

        const colorModeGroup = document.getElementById('join-color-mode-group');
        if (colorModeGroup) {
            colorModeGroup.style.display = room.gameType === 'chess' ? 'block' : 'none';
        }

        document.getElementById('join-modal').classList.add('active');
    }

    joinRoom() {
        const password = document.getElementById('join-password').value;
        const role = document.getElementById('join-role')?.value || 'player';
        const colorMode = document.getElementById('join-color-mode')?.value || 'auto';
        const color = document.getElementById('join-color')?.value || 'white';

        if (this.selectedRoomHasPassword && !password) {
            UI.toast('Введите пароль', 'error');
            return;
        }

        const msg = {
            type: 'join_room',
            roomId: this.selectedRoomId,
            password: password || null,
            role: role
        };

        if (role === 'player' && colorMode === 'pick') {
            msg.color = color;
        }

        this.send(msg);
        document.getElementById('join-modal').classList.remove('active');
    }

    async leaveRoom(roomId) {
        if (await UI.confirm('Покинуть комнату?')) {
            this.send({ type: 'leave_room' });
            // Lists will refresh when 'left_room' response arrives
        }
    }

    createRoom() {
        const name = document.getElementById('room-name').value.trim();
        if (!name) {
            UI.toast('Введите название комнаты', 'error');
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
            komi: parseFloat(document.getElementById('room-komi').value),
            ruleSet: gameType === 'go' ? (document.getElementById('room-rule-set')?.value || 'chinese') : undefined
        });
    }

    onLeftRoom() {
        // Don't clear myRooms - the room persists in DB
        // Just refresh the lists
        this.requestRoomList();
        this.getMyRooms();
    }

    async deleteRoom(roomId) {
        if (await UI.confirm('Удалить комнату? Это действие необратимо.')) {
            this.send({ type: 'delete_room', roomId: roomId });
        }
    }

    onRoomDeleted(roomId) {
        this.getMyRooms();
        this.requestRoomList();
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
            const div = document.createElement('button');
            div.type = 'button';
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

    const params = new URLSearchParams(window.location.search);
    if (params.get('reconnect') === 'true') {
        window.lobby.isReconnecting = true;
    }
});
