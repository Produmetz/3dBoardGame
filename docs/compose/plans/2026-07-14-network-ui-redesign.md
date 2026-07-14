# Network UI Redesign Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/network-ui-redesign.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the network UI to provide a chess.com/lichess-like flow: main page → server selection → lobby → game, with proper navigation and server profiles.

**Architecture:** Multi-page HTML application with shared CSS. Each page handles one stage of the flow. Navigation via query params and localStorage for auth state.

**Tech Stack:** HTML, CSS, vanilla JavaScript, localStorage

## Global Constraints
- Keep existing dark theme (#0a0f1a background, #4cc9f0 accent)
- Maintain responsive design for mobile
- Preserve all existing game functionality
- Use existing API endpoints (no server changes needed)

---

## File Structure

| File | Purpose |
|------|---------|
| `styles.css` | Shared styles for all pages |
| `index.html` | Main page - choose Local or Online |
| `servers.html` | Server browser with profiles |
| `servers.js` | Server browser logic |
| `lobby.html` | Server lobby (rooms, stats, leaderboard) |
| `lobby.js` | Lobby logic (refactored) |
| `network.js` | Network manager (minor updates) |
| `chess/chess.html` | Chess game (add back button) |
| `go/go.html` | Go game (add back button) |

---

### Task 1: Create shared styles.css

**Covers:** [S6]

**Files:**
- Create: `styles.css`

**Interfaces:**
- Consumes: none
- Produces: shared CSS classes for all pages

- [ ] **Step 1: Create styles.css with base styles**

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', 'Tahoma', 'Geneva', 'Verdana', sans-serif;
    background: #0a0f1a;
    color: #eef4ff;
    min-height: 100vh;
}

body::before {
    content: "";
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: linear-gradient(rgba(76, 201, 240, 0.05) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(76, 201, 240, 0.05) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
}

.container {
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 1rem 1.5rem;
    position: relative;
    z-index: 2;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    border-bottom: 1px solid #2c3e4e;
    margin-bottom: 1.5rem;
}

.header h1 {
    font-size: 1.8rem;
    font-weight: 600;
    color: #c9e9ff;
}

.header-actions {
    display: flex;
    gap: 0.8rem;
    align-items: center;
}

.back-btn {
    background: #1e2a36;
    border: 1px solid #2c3e4e;
    color: #9bb4d0;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: 0.2s;
    text-decoration: none;
}

.back-btn:hover {
    background: #2c4c6c;
    color: white;
}

.panel {
    background: rgba(15, 25, 45, 0.85);
    backdrop-filter: blur(6px);
    border-radius: 1rem;
    border: 1px solid #2a3a4a;
    padding: 1.5rem;
    margin-bottom: 1rem;
}

.panel h2 {
    font-size: 1.1rem;
    color: #4cc9f0;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #2a3a4a;
}

.input-group {
    margin-bottom: 0.8rem;
}

.input-group label {
    display: block;
    font-size: 0.85rem;
    color: #9bb4d0;
    margin-bottom: 0.3rem;
}

.input-group input,
.input-group select {
    width: 100%;
    padding: 0.6rem 0.8rem;
    background: #0e1622;
    border: 1px solid #2c3e4e;
    border-radius: 6px;
    color: #eef4ff;
    font-size: 0.9rem;
}

.input-group input:focus,
.input-group select:focus {
    outline: none;
    border-color: #4cc9f0;
}

.btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    transition: 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

.btn-primary {
    background: #4cc9f0;
    color: #0a192f;
}

.btn-primary:hover {
    background: #7bdff9;
}

.btn-secondary {
    background: #2c4c6c;
    color: white;
}

.btn-secondary:hover {
    background: #3e6a8c;
}

.btn-danger {
    background: #f05454;
    color: white;
}

.btn-danger:hover {
    background: #ff7b54;
}

.btn-sm {
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
}

.btn-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.8rem;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f05454;
    display: inline-block;
}

.status-dot.connected {
    background: #4caf50;
}

.spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid #2c3e4e;
    border-top-color: #4cc9f0;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 0.5rem;
    vertical-align: middle;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.modal-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 100;
    justify-content: center;
    align-items: center;
}

.modal-overlay.active {
    display: flex;
}

.modal {
    background: #0e1622;
    border: 1px solid #2a3a4a;
    border-radius: 1rem;
    padding: 1.5rem;
    width: 90%;
    max-width: 400px;
}

.modal h3 {
    color: #4cc9f0;
    margin-bottom: 1rem;
}

@media (max-width: 600px) {
    .container {
        padding: 0.8rem;
    }

    .header {
        flex-direction: column;
        gap: 0.8rem;
    }

    .btn-group {
        flex-direction: column;
    }

    .btn-group .btn {
        width: 100%;
        justify-content: center;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add shared styles.css for all pages"
```

---

### Task 2: Update index.html (Main page)

**Covers:** [S3]

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: styles.css
- Produces: main page with Local/Online choice

- [ ] **Step 1: Rewrite index.html with mode selection**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Chess & Go</title>
    <link rel="stylesheet" href="styles.css">
    <style>
        .mode-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 2rem;
            justify-content: center;
            margin: 3rem 0;
        }

        .mode-card {
            background: rgba(15, 25, 45, 0.85);
            backdrop-filter: blur(6px);
            border-radius: 1.5rem;
            overflow: hidden;
            width: 340px;
            transition: transform 0.2s ease, box-shadow 0.2s;
            border: 1px solid #2a3a4a;
            text-decoration: none;
            color: inherit;
            display: flex;
            flex-direction: column;
            cursor: pointer;
        }

        .mode-card:hover {
            transform: translateY(-6px);
            border-color: #4a6a8a;
            box-shadow: 0 12px 20px -8px rgba(0,0,0,0.4);
        }

        .mode-icon {
            background: #0e1622;
            text-align: center;
            padding: 2rem 0 1rem;
            font-size: 4rem;
            border-bottom: 1px solid #2a3a4a;
        }

        .mode-content {
            padding: 1.5rem;
            text-align: center;
            flex: 1;
        }

        .mode-card h2 {
            font-size: 1.8rem;
            font-weight: 500;
            margin-bottom: 0.5rem;
            color: #cce6ff;
        }

        .mode-card p {
            color: #b0c4de;
            font-size: 0.9rem;
            margin: 0.75rem 0;
            line-height: 1.4;
        }

        .play-btn {
            background: #2c4c6c;
            border: none;
            color: white;
            font-weight: normal;
            padding: 0.6rem 1.5rem;
            border-radius: 30px;
            margin-top: 1rem;
            display: inline-block;
            transition: 0.2s;
            font-size: 0.95rem;
            cursor: pointer;
            text-decoration: none;
        }

        .mode-card:hover .play-btn {
            background: #3e6a8c;
        }

        .lang-switch {
            position: absolute;
            top: 0;
            right: 0;
            background: #1e2a36;
            border-radius: 30px;
            padding: 0.2rem;
            display: flex;
            gap: 0.2rem;
            font-size: 0.8rem;
        }

        .lang-btn {
            background: transparent;
            border: none;
            color: #9bb4d0;
            cursor: pointer;
            padding: 0.3rem 0.8rem;
            border-radius: 20px;
            transition: 0.2s;
        }

        .lang-btn.active {
            background: #2c4c6c;
            color: white;
        }

        .lang-btn:hover:not(.active) {
            background: #2a3a4a;
            color: #eef4ff;
        }

        @media (max-width: 750px) {
            .mode-grid {
                gap: 1.2rem;
            }
            .mode-card {
                width: 280px;
            }
        }

        @media (max-width: 480px) {
            .mode-card {
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header" style="justify-content: center; position: relative;">
            <div class="lang-switch">
                <button class="lang-btn" data-lang="en">EN</button>
                <button class="lang-btn" data-lang="ru">РУС</button>
            </div>
            <h1 id="title-main">3D Chess & Go</h1>
        </div>

        <div class="mode-grid">
            <a href="chess/chess.html" class="mode-card" id="local-card">
                <div class="mode-icon">♜ ⚫</div>
                <div class="mode-content">
                    <h2 id="local-title">Локальная игра</h2>
                    <p id="local-desc">Играйте на одном компьютере с другом. Без регистрации, без серверов.</p>
                    <div class="play-btn" id="local-play">▶ Начать игру</div>
                </div>
            </a>

            <a href="servers.html" class="mode-card" id="online-card">
                <div class="mode-icon">🌐</div>
                <div class="mode-content">
                    <h2 id="online-title">Онлайн игра</h2>
                    <p id="online-desc">Подключитесь к серверу, найдите соперника, играйте по рейтингу.</p>
                    <div class="play-btn" id="online-play">▶ Выбрать сервер</div>
                </div>
            </a>
        </div>

        <footer style="text-align: center; font-size: 0.75rem; color: #7a8eaa; margin-top: 2rem;">
            Built with Three.js • 3D Board Games
        </footer>
    </div>

    <script>
        const translations = {
            en: {
                title_main: "3D Chess & Go",
                local_title: "Local Game",
                local_desc: "Play on one computer with a friend. No registration, no servers.",
                local_play: "▶ Start Game",
                online_title: "Online Game",
                online_desc: "Connect to a server, find an opponent, play ranked games.",
                online_play: "▶ Choose Server"
            },
            ru: {
                title_main: "3D Шахматы и Го",
                local_title: "Локальная игра",
                local_desc: "Играйте на одном компьютере с другом. Без регистрации, без серверов.",
                local_play: "▶ Начать игру",
                online_title: "Онлайн игра",
                online_desc: "Подключитесь к серверу, найдите соперника, играйте по рейтингу.",
                online_play: "▶ Выбрать сервер"
            }
        };

        function setLanguage(lang) {
            if (!translations[lang]) return;
            const t = translations[lang];
            document.getElementById('title-main').innerText = t.title_main;
            document.getElementById('local-title').innerText = t.local_title;
            document.getElementById('local-desc').innerText = t.local_desc;
            document.getElementById('local-play').innerText = t.local_play;
            document.getElementById('online-title').innerText = t.online_title;
            document.getElementById('online-desc').innerText = t.online_desc;
            document.getElementById('online-play').innerText = t.online_play;
            document.querySelectorAll('.lang-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.lang === lang);
            });
        }

        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setLanguage(btn.dataset.lang);
                localStorage.setItem('preferredLang', btn.dataset.lang);
            });
        });

        const savedLang = localStorage.getItem('preferredLang');
        if (savedLang && translations[savedLang]) {
            setLanguage(savedLang);
        } else {
            setLanguage(navigator.language.startsWith('ru') ? 'ru' : 'en');
        }
    </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: redesign index.html with Local/Online mode selection"
```

---

### Task 3: Create servers.html (Server browser)

**Covers:** [S3, S4]

**Files:**
- Create: `servers.html`
- Create: `servers.js`

**Interfaces:**
- Consumes: styles.css
- Produces: server browser with auth forms

- [ ] **Step 1: Create servers.html**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Chess & Go – Выбор сервера</title>
    <link rel="stylesheet" href="styles.css">
    <style>
        .servers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 1.5rem;
            margin-top: 1.5rem;
        }

        .server-card {
            background: rgba(15, 25, 45, 0.85);
            backdrop-filter: blur(6px);
            border-radius: 1rem;
            border: 1px solid #2a3a4a;
            padding: 1.5rem;
            transition: border-color 0.2s;
        }

        .server-card:hover {
            border-color: #4a6a8a;
        }

        .server-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 1rem;
        }

        .server-name {
            font-size: 1.2rem;
            font-weight: 600;
            color: #c9e9ff;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .server-url {
            font-size: 0.8rem;
            color: #7a8eaa;
            word-break: break-all;
            margin-bottom: 1rem;
        }

        .server-stats {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
            font-size: 0.85rem;
            color: #9bb4d0;
        }

        .server-stat {
            display: flex;
            align-items: center;
            gap: 0.3rem;
        }

        .server-actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .auth-panel {
            background: #0e1622;
            border-radius: 8px;
            padding: 1rem;
            margin-top: 1rem;
            display: none;
        }

        .auth-panel.active {
            display: block;
        }

        .auth-tabs {
            display: flex;
            gap: 0;
            margin-bottom: 1rem;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid #2c3e4e;
        }

        .auth-tab {
            flex: 1;
            padding: 0.5rem;
            background: #1e2a36;
            border: none;
            color: #9bb4d0;
            cursor: pointer;
            font-size: 0.85rem;
            transition: 0.2s;
        }

        .auth-tab.active {
            background: #4cc9f0;
            color: #0a192f;
        }

        .auth-status {
            margin-top: 0.8rem;
            padding: 0.5rem;
            border-radius: 6px;
            font-size: 0.85rem;
            display: none;
        }

        .auth-status.success {
            display: block;
            background: rgba(76, 201, 240, 0.15);
            border: 1px solid #4cc9f0;
            color: #4cc9f0;
        }

        .auth-status.error {
            display: block;
            background: rgba(240, 84, 84, 0.15);
            border: 1px solid #f05454;
            color: #f05454;
        }

        .add-server-panel {
            background: rgba(15, 25, 45, 0.85);
            backdrop-filter: blur(6px);
            border-radius: 1rem;
            border: 1px dashed #2a3a4a;
            padding: 1.5rem;
            text-align: center;
        }

        .add-server-panel.active {
            border-style: solid;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.8rem;
        }

        .checkbox-group label {
            font-size: 0.85rem;
            color: #9bb4d0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Выбор сервера</h1>
            <div class="header-actions">
                <a href="index.html" class="back-btn">← На главную</a>
            </div>
        </div>

        <div class="servers-grid" id="servers-grid">
            <!-- Server cards rendered by JS -->
        </div>

        <div class="add-server-panel" id="add-server-panel">
            <button id="add-server-btn" class="btn btn-secondary">+ Добавить сервер</button>
            <div id="add-server-form" style="display: none; margin-top: 1rem; text-align: left;">
                <div class="input-group">
                    <label for="new-server-name">Название</label>
                    <input type="text" id="new-server-name" placeholder="Мой сервер">
                </div>
                <div class="input-group">
                    <label for="new-server-url">Адрес (ws:// или wss://)</label>
                    <input type="text" id="new-server-url" placeholder="ws://localhost:10000">
                </div>
                <div class="btn-group">
                    <button id="confirm-add-server" class="btn btn-primary btn-sm">Добавить</button>
                    <button id="cancel-add-server" class="btn btn-secondary btn-sm">Отмена</button>
                </div>
            </div>
        </div>
    </div>

    <script src="servers.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create servers.js**

```javascript
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
            document.getElementById('add-server-form').style.display = 'block';
            document.getElementById('add-server-btn').style.display = 'none';
        });

        document.getElementById('confirm-add-server').addEventListener('click', () => this.addServer());
        document.getElementById('cancel-add-server').addEventListener('click', () => {
            document.getElementById('add-server-form').style.display = 'none';
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
                        <span class="status-dot" id="dot-${index}"></span>
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

    connectAsGuest(index) {
        const nickname = prompt('Введите ваш ник:');
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

    removeServer(index) {
        if (confirm('Удалить сервер?')) {
            this.servers.splice(index, 1);
            delete this.connections[index];
            this.saveServers();
            this.render();
        }
    }

    addServer() {
        const name = document.getElementById('new-server-name').value.trim();
        const url = document.getElementById('new-server-url').value.trim();
        if (!name || !url) {
            alert('Заполните название и адрес');
            return;
        }
        this.servers.push({ name, url });
        this.saveServers();
        this.render();
        document.getElementById('add-server-form').style.display = 'none';
        document.getElementById('add-server-btn').style.display = 'inline-flex';
    }

    checkServerStatus(index) {
        const server = this.servers[index];
        try {
            const ws = new WebSocket(server.url.replace('0.0.0.0', 'localhost'));
            ws.onopen = () => {
                document.getElementById(`dot-${index}`)?.classList.add('connected');
                ws.close();
            };
            ws.onerror = () => {
                document.getElementById(`dot-${index}`)?.classList.remove('connected');
            };
        } catch(e) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.browser = new ServerBrowser();
});
```

- [ ] **Step 3: Commit**

```bash
git add servers.html servers.js
git commit -m "feat: create server browser page with auth forms"
```

---

### Task 4: Update lobby.html (Server lobby)

**Covers:** [S3, S4, S5]

**Files:**
- Modify: `lobby.html`
- Modify: `lobby.js`

**Interfaces:**
- Consumes: styles.css, server info from query params
- Produces: server lobby with rooms, stats, leaderboard

- [ ] **Step 1: Update lobby.html**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Chess & Go – Лобби</title>
    <link rel="stylesheet" href="styles.css">
    <style>
        .main-grid {
            display: grid;
            grid-template-columns: 1fr 340px;
            gap: 1.5rem;
            align-items: start;
        }

        .room-list {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #2a3a4a;
            border-radius: 8px;
        }

        .room-item {
            padding: 0.8rem;
            border-bottom: 1px solid #2a3a4a;
            cursor: pointer;
            transition: 0.2s;
        }

        .room-item:last-child {
            border-bottom: none;
        }

        .room-item:hover {
            background: rgba(76, 201, 240, 0.1);
        }

        .room-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.3rem;
        }

        .room-name {
            font-weight: 500;
            color: #c9e9ff;
        }

        .room-game-type {
            font-size: 0.75rem;
            padding: 0.15rem 0.5rem;
            border-radius: 10px;
            background: #1e2a36;
            color: #4cc9f0;
        }

        .room-info {
            font-size: 0.8rem;
            color: #9bb4d0;
            display: flex;
            gap: 1rem;
        }

        .no-rooms {
            padding: 1.5rem;
            text-align: center;
            color: #7a8eaa;
            font-size: 0.85rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .stat-card {
            background: #0e1622;
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
        }

        .stat-card .stat-game {
            font-size: 0.8rem;
            color: #9bb4d0;
            margin-bottom: 0.5rem;
        }

        .stat-card .stat-rating {
            font-size: 1.5rem;
            font-weight: 600;
            color: #4cc9f0;
        }

        .stat-card .stat-record {
            font-size: 0.8rem;
            color: #7a8eaa;
            margin-top: 0.3rem;
        }

        .history-list {
            max-height: 250px;
            overflow-y: auto;
        }

        .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.6rem;
            border-bottom: 1px solid #2a3a4a;
            font-size: 0.85rem;
            cursor: pointer;
        }

        .history-item:hover {
            background: rgba(76, 201, 240, 0.05);
        }

        .history-result.win { color: #4caf50; }
        .history-result.loss { color: #f05454; }
        .history-result.draw { color: #9bb4d0; }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.8rem;
        }

        .checkbox-group label {
            font-size: 0.85rem;
            color: #9bb4d0;
        }

        @media (max-width: 900px) {
            .main-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 id="server-name">Лобби</h1>
            <div class="header-actions">
                <a href="servers.html" class="back-btn">← Сменить сервер</a>
                <button id="logout-btn" class="btn btn-secondary btn-sm">Выйти</button>
            </div>
        </div>

        <div class="main-grid">
            <div class="left-column">
                <div class="panel">
                    <h2>Доступные комнаты</h2>
                    <div class="btn-group" style="margin-top:0; margin-bottom:0.8rem;">
                        <button id="refresh-btn" class="btn btn-secondary btn-sm">Обновить</button>
                        <button id="create-room-btn" class="btn btn-primary btn-sm">Создать комнату</button>
                    </div>
                    <div id="room-list" class="room-list">
                        <div class="no-rooms">Нет доступных комнат</div>
                    </div>
                </div>

                <div class="panel">
                    <h2>История игр</h2>
                    <div id="history-list" class="history-list">
                        <div class="no-rooms">Нет сохранённых игр</div>
                    </div>
                </div>
            </div>

            <div class="right-column">
                <div class="panel">
                    <h2>Мой профиль</h2>
                    <div id="stats-nickname" style="color:#4cc9f0; margin-bottom:0.5rem;"></div>
                    <div id="stats-skill" style="font-size:0.85rem; color:#9bb4d0; margin-bottom:0.8rem;"></div>
                    <div style="margin-bottom:0.8rem;">
                        <label style="font-size:0.8rem; color:#7a8eaa;">
                            <input type="checkbox" id="public-rating-toggle" checked> Показать в рейтинге
                        </label>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-game">Шахматы</div>
                            <div class="stat-rating" id="chess-rating">—</div>
                            <div class="stat-record" id="chess-record">0 игр</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-game">Го</div>
                            <div class="stat-rating" id="go-rating">—</div>
                            <div class="stat-record" id="go-record">0 игр</div>
                        </div>
                    </div>
                </div>

                <div class="panel">
                    <h2>Таблица лидеров</h2>
                    <div style="margin-bottom:0.8rem;">
                        <select id="leaderboard-game" style="padding:0.3rem; border-radius:5px; background:#1e2a36; color:#eef4ff; border:1px solid #2c3e4e;">
                            <option value="chess">Шахматы</option>
                            <option value="go">Го</option>
                        </select>
                    </div>
                    <div id="leaderboard-list" style="max-height:300px; overflow-y:auto;">
                        <div style="color:#7a8eaa; text-align:center;">Нет данных</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Create Room Modal -->
    <div class="modal-overlay" id="create-modal">
        <div class="modal">
            <h3>Создать комнату</h3>
            <div class="input-group">
                <label for="room-name">Название</label>
                <input type="text" id="room-name" placeholder="Моя комната">
            </div>
            <div class="input-group">
                <label for="room-password">Пароль (необязательно)</label>
                <input type="password" id="room-password" placeholder="Оставьте пустым для открытой">
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="room-public" checked>
                <label for="room-public">Публичная комната</label>
            </div>
            <div class="input-group">
                <label for="room-game-type">Тип игры</label>
                <select id="room-game-type">
                    <option value="chess">Шахматы</option>
                    <option value="go">Го</option>
                </select>
            </div>
            <div id="go-options" style="display:none;">
                <div class="input-group">
                    <label for="room-board-x">Размер X</label>
                    <input type="number" id="room-board-x" value="4" min="3" max="10">
                </div>
                <div class="input-group">
                    <label for="room-board-y">Размер Y</label>
                    <input type="number" id="room-board-y" value="4" min="3" max="10">
                </div>
                <div class="input-group">
                    <label for="room-board-z">Размер Z</label>
                    <input type="number" id="room-board-z" value="4" min="3" max="10">
                </div>
                <div class="input-group">
                    <label for="room-komi">Коми</label>
                    <input type="number" id="room-komi" value="6.5" step="0.5" min="0" max="100">
                </div>
            </div>
            <div id="chess-options">
                <div class="checkbox-group">
                    <input type="checkbox" id="room-allow-spectators" checked>
                    <label for="room-allow-spectators">Разрешить зрителей</label>
                </div>
                <div class="input-group">
                    <label for="room-creator-color">Ваш цвет</label>
                    <select id="room-creator-color">
                        <option value="white">Белые</option>
                        <option value="black">Чёрные</option>
                    </select>
                </div>
                <div class="input-group">
                    <label for="room-color-mode">Цвет второго игрока</label>
                    <select id="room-color-mode">
                        <option value="creator_pick">Создатель выбирает</option>
                        <option value="free_choice">Свободный выбор</option>
                    </select>
                </div>
            </div>
            <div class="input-group">
                <label for="room-game-mode">Режим игры</label>
                <select id="room-game-mode">
                    <option value="rated">Рейтинговая</option>
                    <option value="unranked">Без рейтинга</option>
                    <option value="casual">Свободная</option>
                </select>
            </div>
            <div class="btn-group">
                <button id="confirm-create" class="btn btn-primary">Создать</button>
                <button id="cancel-create" class="btn btn-secondary">Отмена</button>
            </div>
        </div>
    </div>

    <!-- Join Room Modal -->
    <div class="modal-overlay" id="join-modal">
        <div class="modal">
            <h3>Войти в комнату</h3>
            <p id="join-room-name" style="margin-bottom:1rem; color:#9bb4d0;"></p>
            <div class="input-group" id="join-password-group" style="display:none;">
                <label for="join-password">Пароль</label>
                <input type="password" id="join-password" placeholder="Введите пароль">
            </div>
            <div class="input-group">
                <label for="join-role">Роль</label>
                <select id="join-role">
                    <option value="player">Игрок</option>
                    <option value="spectator">Зритель</option>
                </select>
            </div>
            <div class="btn-group">
                <button id="confirm-join" class="btn btn-primary">Присоединиться</button>
                <button id="cancel-join" class="btn btn-secondary">Отмена</button>
            </div>
        </div>
    </div>

    <script src="lobby.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update lobby.js**

```javascript
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
            case 'joined_room':
                this.requestRoomList();
                this.requestStats();
                this.requestGameHistory();
                this.loadLeaderboard();
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
                this.requestRoomList();
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
```

- [ ] **Step 3: Commit**

```bash
git add lobby.html lobby.js
git commit -m "feat: update lobby with server navigation and improved layout"
```

---

### Task 5: Update game pages with back button

**Covers:** [S4]

**Files:**
- Modify: `chess/chess.html`
- Modify: `go/go.html`

**Interfaces:**
- Consumes: lobby URL from params
- Produces: game pages with "Back to lobby" button

- [ ] **Step 1: Add back button to chess.html**

Add this to the header section of chess.html (after the opening `<div class="header">` or equivalent):

```html
<div style="position: fixed; top: 1rem; left: 1rem; z-index: 50;">
    <a id="back-to-lobby" href="index.html" class="back-btn" style="display: none;">← Назад в лобби</a>
</div>
```

Add this script at the end of chess.html:

```javascript
// Network lobby back button
(function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('network') === 'true') {
        const btn = document.getElementById('back-to-lobby');
        if (btn) {
            btn.style.display = 'inline-block';
            btn.href = `../lobby.html?server=${params.get('serverIndex') || 0}&token=${params.get('token') || ''}&nickname=${params.get('playerName') || ''}`;
        }
    }
})();
```

- [ ] **Step 2: Add back button to go.html**

Same changes as chess.html but adjust paths for the go/ subfolder:

```html
<div style="position: fixed; top: 1rem; left: 1rem; z-index: 50;">
    <a id="back-to-lobby" href="../index.html" class="back-btn" style="display: none;">← Назад в лобби</a>
</div>
```

```javascript
(function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('network') === 'true') {
        const btn = document.getElementById('back-to-lobby');
        if (btn) {
            btn.style.display = 'inline-block';
            btn.href = `../lobby.html?server=${params.get('serverIndex') || 0}&token=${params.get('token') || ''}&nickname=${params.get('playerName') || ''}`;
        }
    }
})();
```

- [ ] **Step 3: Commit**

```bash
git add chess/chess.html go/go.html
git commit -m "feat: add back-to-lobby button on game pages"
```

---

### Task 6: Update network.js for new flow

**Covers:** [S4, S5]

**Files:**
- Modify: `network.js`

**Interfaces:**
- Consumes: query params from game pages
- Produces: network connection with proper auth

- [ ] **Step 1: Update checkLobbyRedirect in network.js**

```javascript
checkLobbyRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('network') === 'true') {
        const server = params.get('server') || params.get('serverUrl') || 'wss://threedboardgames.onrender.com';
        const token = params.get('token') || '';
        const playerName = params.get('playerName') || 'Anonymous';
        const role = params.get('role') || 'player';

        this.authToken = token;
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
```

- [ ] **Step 2: Commit**

```bash
git add network.js
git commit -m "feat: update network.js for new lobby flow"
```

---

## Summary

After completing all tasks:
1. `styles.css` - shared styles
2. `index.html` - main page with Local/Online choice
3. `servers.html` + `servers.js` - server browser with auth
4. `lobby.html` + `lobby.js` - server lobby with rooms, stats, leaderboard
5. `chess.html` + `go.html` - back button to lobby
6. `network.js` - updated auth flow

The navigation flow will be:
```
index.html → [Локальная] → chess.html / go.html
           → [Онлайн] → servers.html → lobby.html → chess.html / go.html
```
