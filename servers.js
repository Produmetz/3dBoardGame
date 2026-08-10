class ServerBrowser {
    constructor() {
        this.servers = [];
        this.connections = {};

        this.loadServers();
        this.render();
        this.setupEvents();
    }

    loadServers() {
        const saved = localStorage.getItem('lobby_servers');
        if (saved) {
            try { this.servers = JSON.parse(saved); } catch(e) { this.servers = []; }
        }
        if (this.servers.length === 0) {
            this.servers = [
                { name: 'Official Server', url: 'wss://threedboardgames.onrender.com' }
            ];
            this.saveServers();
        }

        const savedAuth = localStorage.getItem('lobby_auth');
        if (savedAuth) {
            try {
                const auth = JSON.parse(savedAuth);
                if (auth.serverIndex >= 0 && auth.token) {
                    this.connections[auth.serverIndex] = {
                        token: auth.token,
                        nickname: auth.nickname
                    };
                }
            } catch(e) {}
        }
    }

    saveServers() {
        localStorage.setItem('lobby_servers', JSON.stringify(this.servers));
    }

    setupEvents() {
        document.getElementById('add-server-btn').addEventListener('click', () => {
            document.getElementById('add-server-form').classList.add('active');
            document.getElementById('add-server-btn').style.display = 'none';
        });

        document.getElementById('confirm-add-server').addEventListener('click', () => this.addServer());
        document.getElementById('cancel-add-server').addEventListener('click', () => {
            document.getElementById('add-server-form').classList.remove('active');
            document.getElementById('add-server-btn').style.display = 'inline-flex';
        });
    }

    render() {
        const grid = document.getElementById('servers-grid');
        grid.innerHTML = '';

        this.servers.forEach((server, index) => {
            const card = document.createElement('div');
            card.className = 'server-card';
            card.innerHTML = `
                <div class="server-header">
                    <span class="server-name">
                        <span class="status-dot" id="dot-${index}" role="status" aria-label="Не в сети"></span>
                        ${this.escapeHtml(server.name)}
                    </span>
                    <button class="btn btn-danger btn-sm" onclick="browser.removeServer(${index})">✕</button>
                </div>
                <div class="server-url">${this.escapeHtml(server.url)}</div>
                <div class="server-stats">
                    <span class="server-stat">👥 <span id="players-${index}">—</span></span>
                    <span class="server-stat">🚪 <span id="rooms-${index}">—</span></span>
                </div>
                <div class="server-actions" id="actions-${index}">
                    ${this.connections[index] ? `
                        <button class="btn btn-primary btn-sm" onclick="browser.enterLobby(${index})">Войти в лобби</button>
                        <button class="btn btn-secondary btn-sm" onclick="browser.disconnect(${index})">Выйти</button>
                    ` : `
                        <button class="btn btn-primary btn-sm" onclick="browser.showAuth(${index}, 'login')">Войти</button>
                        <button class="btn btn-secondary btn-sm" onclick="browser.showAuth(${index}, 'register')">Регистрация</button>
                        <button class="btn btn-secondary btn-sm" onclick="browser.connectAsGuest(${index})">Как гость</button>
                    `}
                </div>
                <div class="auth-panel" id="auth-${index}">
                    <div class="auth-tabs">
                        <button class="auth-tab active" onclick="browser.switchTab(${index}, 'login')">Вход</button>
                        <button class="auth-tab" onclick="browser.switchTab(${index}, 'register')">Регистрация</button>
                    </div>
                    <form onsubmit="event.preventDefault(); browser.submitAuth(${index});">
                        <div class="input-group">
                            <label>Ник</label>
                            <input type="text" id="nick-${index}" placeholder="Ваш ник" autocomplete="username">
                        </div>
                        <div class="input-group" id="email-group-${index}" style="display:none;">
                            <label>Email (необязательно)</label>
                            <input type="email" id="email-${index}" placeholder="Email" autocomplete="email">
                        </div>
                        <div class="input-group" id="skill-group-${index}" style="display:none;">
                            <label>Уровень</label>
                            <select id="skill-${index}">
                                <option value="beginner">Новичок</option>
                                <option value="amateur" selected>Любитель</option>
                                <option value="professional">Профессионал</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label>Пароль</label>
                            <input type="password" id="pass-${index}" placeholder="Пароль" autocomplete="current-password">
                        </div>
                        <button type="submit" class="btn btn-primary" id="submit-${index}">Войти</button>
                    </form>
                    <div class="auth-status" id="status-${index}"></div>
                </div>
            `;
            grid.appendChild(card);

            if (this.connections[index]) {
                this.checkServerStatus(index);
            }
        });
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    showAuth(index, mode) {
        const panel = document.getElementById(`auth-${index}`);
        panel.classList.add('active');

        const tabs = panel.querySelectorAll('.auth-tab');
        tabs[0].classList.toggle('active', mode === 'login');
        tabs[1].classList.toggle('active', mode === 'register');

        document.getElementById(`email-group-${index}`).style.display = mode === 'register' ? 'block' : 'none';
        document.getElementById(`skill-group-${index}`).style.display = mode === 'register' ? 'block' : 'none';
        document.getElementById(`submit-${index}`).textContent = mode === 'register' ? 'Зарегистрироваться' : 'Войти';

        panel.dataset.mode = mode;
    }

    switchTab(index, mode) {
        this.showAuth(index, mode);
    }

    submitAuth(index) {
        const panel = document.getElementById(`auth-${index}`);
        const mode = panel.dataset.mode || 'login';
        const nickname = document.getElementById(`nick-${index}`).value.trim();
        const password = document.getElementById(`pass-${index}`).value;
        const status = document.getElementById(`status-${index}`);

        if (!nickname || nickname.length < 2) {
            status.className = 'auth-status error';
            status.textContent = 'Ник должен быть от 2 символов';
            return;
        }
        if (!password || password.length < 4) {
            status.className = 'auth-status error';
            status.textContent = 'Пароль должен быть от 4 символов';
            return;
        }

        status.className = 'auth-status';
        status.innerHTML = '<span class="spinner"></span> Подключение...';

        this.connectAndAuth(index, mode, nickname, password);
    }

    async connectAsGuest(index) {
        const nickname = await UI.prompt('Введите ваш ник:');
        if (!nickname) return;
        this.connectAndAuth(index, 'guest', nickname, null);
    }

    connectAndAuth(index, mode, nickname, password) {
        const server = this.servers[index];
        const status = document.getElementById(`status-${index}`);

        try {
            const ws = new WebSocket(server.url.replace('0.0.0.0', 'localhost'));

            ws.onopen = () => {
                if (mode === 'guest') {
                    ws.send(JSON.stringify({ type: 'guest_join', playerName: nickname }));
                } else if (mode === 'register') {
                    const email = document.getElementById(`email-${index}`)?.value.trim();
                    const skill = document.getElementById(`skill-${index}`)?.value || 'amateur';
                    ws.send(JSON.stringify({ type: 'register', nickname, password, email: email || undefined, skillLevel: skill }));
                } else {
                    ws.send(JSON.stringify({ type: 'login', nickname, password }));
                }
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'registered' || data.type === 'logged_in' || data.type === 'guest_joined') {
                    this.connections[index] = { token: data.token, nickname: data.nickname };
                    localStorage.setItem('lobby_auth', JSON.stringify({
                        token: data.token,
                        nickname: data.nickname,
                        serverIndex: index
                    }));

                    status.className = 'auth-status success';
                    status.textContent = 'Успешно!';

                    setTimeout(() => this.enterLobby(index), 500);
                } else if (data.type === 'error') {
                    status.className = 'auth-status error';
                    status.textContent = data.message;
                }
                ws.close();
            };

            ws.onerror = () => {
                status.className = 'auth-status error';
                status.textContent = 'Ошибка подключения';
            };
        } catch(e) {
            status.className = 'auth-status error';
            status.textContent = 'Ошибка подключения';
        }
    }

    enterLobby(index) {
        const conn = this.connections[index];
        if (!conn) return;
        window.location.href = `lobby.html?server=${index}&token=${conn.token}&nickname=${conn.nickname}`;
    }

    disconnect(index) {
        delete this.connections[index];
        localStorage.removeItem('lobby_auth');
        this.render();
    }

    async removeServer(index) {
        if (await UI.confirm('Удалить сервер?')) {
            this.servers.splice(index, 1);
            delete this.connections[index];
            this.saveServers();
            this.render();
        }
    }

    async addServer() {
        const name = document.getElementById('new-server-name').value.trim();
        const url = document.getElementById('new-server-url').value.trim();
        if (!name || !url) {
            UI.toast('Заполните название и адрес', 'error');
            return;
        }
        this.servers.push({ name, url });
        this.saveServers();
        this.render();
        document.getElementById('add-server-form').classList.remove('active');
        document.getElementById('add-server-btn').style.display = 'inline-flex';
    }

    checkServerStatus(index) {
        const server = this.servers[index];
        try {
            const ws = new WebSocket(server.url.replace('0.0.0.0', 'localhost'));
            ws.onopen = () => {
                const dot = document.getElementById(`dot-${index}`);
                dot?.classList.add('connected');
                dot?.setAttribute('aria-label', 'В сети');
                ws.close();
            };
            ws.onerror = () => {
                const dot = document.getElementById(`dot-${index}`);
                dot?.classList.remove('connected');
                dot?.setAttribute('aria-label', 'Не в сети');
            };
        } catch(e) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.browser = new ServerBrowser();
});
