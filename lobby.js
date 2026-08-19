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

function formatTimeControlLabel(initialSeconds, incrementSeconds) {
    if (initialSeconds == null) return '';
    const minutes = Math.round(initialSeconds / 60);
    return `⏱ ${minutes}+${incrementSeconds || 0}`;
}

// Time control presets shared by the create-room form — value is
// "initialSeconds|incrementSeconds", or "none"/"custom" for the two special cases.
const TIME_CONTROL_PRESETS = {
    none: null,
    bullet1: { initialSeconds: 60, incrementSeconds: 0 },
    bullet2: { initialSeconds: 120, incrementSeconds: 1 },
    blitz3: { initialSeconds: 180, incrementSeconds: 0 },
    blitz3_2: { initialSeconds: 180, incrementSeconds: 2 },
    blitz5: { initialSeconds: 300, incrementSeconds: 0 },
    rapid10: { initialSeconds: 600, incrementSeconds: 0 },
    rapid15: { initialSeconds: 900, incrementSeconds: 10 },
    classical30: { initialSeconds: 1800, incrementSeconds: 0 }
};

// Go board-size presets — the engine is genuinely n-dimensional, so these are
// real board variants (unlike chess, which only ever runs on one fixed 3D board).
const GO_BOARD_PRESETS = {
    small: { boardX: 4, boardY: 4, boardZ: 4, komi: 6.5 },
    standard: { boardX: 6, boardY: 6, boardZ: 6, komi: 7.5 },
    large: { boardX: 9, boardY: 9, boardZ: 9, komi: 7.5 }
};

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

        this.parseParams();
        this.connectToServer();
        this.setupEvents();
        this.setupTabs();
    }

    parseParams() {
        const params = new URLSearchParams(window.location.search);
        // NB: server index 0 (the first/default server) is falsy, so
        // `parseInt(...) || -1` would wrongly reset it to -1 - parse
        // explicitly instead.
        const rawServer = parseInt(params.get('server'), 10);
        this.serverIndex = Number.isNaN(rawServer) ? -1 : rawServer;
        this.authToken = params.get('token');
        this.nickname = params.get('nickname');
        // ?tab=create-room (etc.) - e.g. from the top-nav "Создать запрос
        // на игру" shortcut - opens straight to that tab instead of Quick Play.
        this.initialTab = params.get('tab');

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
                if (tab.dataset.tab === 'play') this.requestRoomList();
            });
        });

        document.getElementById('refresh-my-rooms')?.addEventListener('click', () => this.getMyRooms());

        if (this.initialTab) {
            document.querySelector(`.lobby-tab[data-tab="${this.initialTab}"]`)?.click();
        }
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
        document.getElementById('room-go-preset')?.addEventListener('change', (e) => {
            document.getElementById('go-board-custom').style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
        document.getElementById('room-time-control')?.addEventListener('change', (e) => {
            document.getElementById('room-time-custom').style.display = e.target.value === 'custom' ? 'flex' : 'none';
        });
        document.getElementById('leaderboard-game')?.addEventListener('change', () => this.loadLeaderboard());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('join-color-mode')?.addEventListener('change', (e) => {
            document.getElementById('join-color-select').style.display = e.target.value === 'pick' ? 'block' : 'none';
        });

        // Quick Play: game-type toggle (selects, doesn't start searching) + explicit "Найти игру" button
        this.selectedQuickPlayType = 'chess';
        document.querySelectorAll('#qp-type-grid .quick-play-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#qp-type-grid .quick-play-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedQuickPlayType = btn.dataset.type;
                document.querySelectorAll('.qp-go-only').forEach(el => {
                    el.style.display = this.selectedQuickPlayType === 'go' ? 'block' : 'none';
                });
            });
        });
        document.getElementById('qp-find-btn').addEventListener('click', () => this.quickPlay(this.selectedQuickPlayType));

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
                // A bare connect (auth_join with no roomId) never gets a
                // joined_room reply from the server — only an explicit
                // create/join/quick-play/code/"Мои комнаты" action does. So
                // reaching this case always means the player just asked to
                // enter a specific game, and it's safe to navigate there.
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

            case 'replay': {
                const page = data.gameType === 'go' ? 'go/replay.html' : 'chess/replay.html';
                window.location.href = `${page}?gameId=${data.gameId}&serverUrl=${encodeURIComponent(this.serverUrl)}`;
                break;
            }

            case 'error': {
                UI.toast(data.message, 'error');
                // Re-render "Мои комнаты" in case a disabled "Войти" button needs resetting.
                if (document.getElementById('tab-my-rooms')?.classList.contains('active')) this.getMyRooms();
                const qpStatus = document.getElementById('quick-play-status');
                if (qpStatus) qpStatus.innerHTML = '';
                // get_room_by_code failures also land here (as a plain error message,
                // not a room_info with an error field) — clear the "Поиск комнаты..." status.
                const codeStatus = document.getElementById('code-status');
                if (codeStatus && codeStatus.textContent === 'Поиск комнаты...') codeStatus.textContent = '';
                break;
            }
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

        const gameMode = document.getElementById('qp-game-mode')?.value || 'rated';
        const timeControlPreset = document.getElementById('qp-time-control')?.value || 'none';
        const msg = { type: 'quick_play', gameType, gameMode, timeControl: TIME_CONTROL_PRESETS[timeControlPreset] ?? null };

        if (gameType === 'go') {
            const board = GO_BOARD_PRESETS[document.getElementById('qp-go-board')?.value] ?? GO_BOARD_PRESETS.standard;
            Object.assign(msg, board);
            msg.ruleSet = document.getElementById('qp-go-rule-set')?.value || 'chinese';
        }

        this.send(msg);
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
        // Lookup failures arrive as a separate 'error' message (see the
        // generic case above), not as a room_info with an error field — this
        // handler only ever runs on a successful lookup.
        const status = document.getElementById('code-status');
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

            const statusClass = room.status === 'playing' ? 'status-playing' : 'status-waiting';
            const statusText = room.status === 'playing' ? 'В игре' : 'Ожидание';
            const timeLabel = formatTimeControlLabel(room.timeInitialSeconds, room.timeIncrementSeconds);

            card.innerHTML = `
                <div class="my-room-card-header">
                    <span class="my-room-card-name">${this.escapeHtml(room.name)}</span>
                    <span class="my-room-status ${statusClass}">${statusText}</span>
                </div>
                <div class="my-room-card-details">
                    <span>${getGameName(room.gameType)}</span>
                    <span>${room.opponentName ? 'vs ' + this.escapeHtml(room.opponentName) : 'Ожидание игрока'}</span>
                    ${timeLabel ? `<span>${timeLabel}</span>` : ''}
                </div>
                <div class="share-code">
                    <span class="room-code">${room.code}</span>
                    <button class="copy-btn" data-code="${room.code}">Копировать</button>
                </div>
                <div class="my-room-card-actions">
                    <button class="btn btn-primary btn-sm" data-enter="${room.id}">Войти</button>
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

            const enterBtn = card.querySelector('[data-enter]');
            enterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                enterBtn.disabled = true;
                enterBtn.textContent = 'Вход...';
                // Explicit join_room round-trip (not a raw link into the game
                // page) — this is what lets several concurrent games coexist
                // and reliably lands you in THIS room even if focus was on
                // another one; the joined_room reply navigates via onJoinedRoom.
                this.enterRoom(room.id);
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
                    ${formatTimeControlLabel(room.timeInitialSeconds, room.timeIncrementSeconds) ? `<span>${formatTimeControlLabel(room.timeInitialSeconds, room.timeIncrementSeconds)}</span>` : ''}
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
        const color = document.getElementById('join-color')?.value === 'black' ? 'Black' : 'White';

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

    enterRoom(roomId) {
        this.send({ type: 'join_room', roomId: roomId, password: null, role: 'player' });
    }

    async leaveRoom(roomId) {
        if (await UI.confirm('Покинуть комнату?')) {
            this.send({ type: 'leave_room' });
            // Lists will refresh when 'left_room' response arrives
        }
    }

    resolveTimeControl() {
        const preset = document.getElementById('room-time-control')?.value || 'none';
        if (preset === 'custom') {
            const minutes = parseFloat(document.getElementById('room-time-custom-minutes')?.value);
            const increment = parseInt(document.getElementById('room-time-custom-increment')?.value, 10);
            if (!minutes || minutes <= 0) return null;
            return { initialSeconds: Math.round(minutes * 60), incrementSeconds: Number.isFinite(increment) && increment >= 0 ? increment : 0 };
        }
        return TIME_CONTROL_PRESETS[preset] ?? null;
    }

    resolveGoBoard() {
        const preset = document.getElementById('room-go-preset')?.value || 'standard';
        if (preset === 'custom') {
            return {
                boardX: parseInt(document.getElementById('room-board-x').value, 10),
                boardY: parseInt(document.getElementById('room-board-y').value, 10),
                boardZ: parseInt(document.getElementById('room-board-z').value, 10),
                komi: parseFloat(document.getElementById('room-komi').value)
            };
        }
        return GO_BOARD_PRESETS[preset] ?? GO_BOARD_PRESETS.standard;
    }

    createRoom() {
        const name = document.getElementById('room-name').value.trim();
        if (!name) {
            UI.toast('Введите название комнаты', 'error');
            return;
        }
        const gameType = document.getElementById('room-game-type').value;
        const board = gameType === 'chess'
            ? { boardX: 6, boardY: 6, boardZ: 8, komi: null }
            : this.resolveGoBoard();

        this.send({
            type: 'create_room',
            roomName: name,
            password: document.getElementById('room-password').value || null,
            isPublic: document.getElementById('room-public').checked,
            gameType: gameType,
            allowSpectators: document.getElementById('room-allow-spectators')?.checked ?? true,
            colorMode: document.getElementById('room-color-mode')?.value || 'creator_pick',
            gameMode: document.getElementById('room-game-mode')?.value || 'rated',
            creatorColor: document.getElementById('room-creator-color')?.value === 'black' ? 'Black' : 'White',
            boardX: board.boardX,
            boardY: board.boardY,
            boardZ: board.boardZ,
            komi: board.komi,
            ruleSet: gameType === 'go' ? (document.getElementById('room-rule-set')?.value || 'chinese') : undefined,
            timeControl: this.resolveTimeControl()
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
});
