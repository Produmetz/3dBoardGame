/**
 * Shared navigation component for 3D Chess & Go.
 * Provides: breadcrumbs, back button, mode indicator.
 *
 * Usage: include <script src="nav.js"></script> after the page body,
 *        then call Nav.init(config) where config = { page, title }.
 */
const Nav = {
    // Page hierarchy config: { page: { parent, parentTitle, title } }
    // To add a new game: add entry here AND add to _pageToPath map below
    pages: {
        'index':           { parent: null,                       title: 'Главная' },
        'servers':         { parent: 'index',                    title: 'Серверы' },
        'lobby':           { parent: 'servers',                  title: 'Лобби' },
        'chess':           { parent: 'index',                    title: 'Шахматы' },
        'go':              { parent: 'index',                    title: 'Го' },
        'position-editor': { parent: 'chess',                    title: 'Редактор' },
        'figures-tutorial':{ parent: 'chess',                    title: 'Обучение' },
        'replay':          { parent: 'lobby',                    title: 'Повтор' }
        // Add new games here, e.g.:
        // 'checkers':     { parent: 'index',                    title: 'Шашки' }
    },

    _isGamePage: false,
    _isNetworkGame: false,
    _backUrl: null,

    /**
     * Initialize navigation.
     * @param {string} pageKey - one of the keys in Nav.pages
     * @param {object} [opts] - { title: override title }
     */
    init(pageKey, opts) {
        const cfg = this.pages[pageKey];
        if (!cfg) return;

        this._isGamePage = (pageKey === 'chess' || pageKey === 'go');

        // Detect network mode from URL
        const params = new URLSearchParams(window.location.search);
        this._isNetworkGame = params.get('network') === 'true';

        // For game pages, override parent based on mode
        let parentKey = cfg.parent;
        let parentTitle = this.pages[parentKey]?.title || '';
        let currentTitle = opts?.title || cfg.title;

        if (this._isGamePage && this._isNetworkGame) {
            parentKey = 'lobby';
            parentTitle = 'Лобби';
            // Don't show nav back button - "В лобби" button is in network panel
            this._backUrl = null;
        } else if (this._isGamePage) {
            this._backUrl = '../index.html';
        } else if (pageKey === 'lobby') {
            this._backUrl = 'servers.html';
        } else if (pageKey === 'servers') {
            this._backUrl = 'index.html';
        } else if (pageKey === 'position-editor') {
            this._backUrl = 'chess.html';
        } else if (pageKey === 'figures-tutorial') {
            this._backUrl = 'chess.html';
        } else if (pageKey === 'replay') {
            this._backUrl = 'lobby.html';
        }

        this._renderBreadcrumb(parentKey, parentTitle, currentTitle);
        this._renderBackButton();
        this._renderModeBadge();

        document.body.classList.add('nav-has-breadcrumb');
        if (this._isGamePage) {
            document.body.classList.add('nav-game-page');
        }
    },

    _buildLobbyUrl(params) {
        const server = params.get('server') || '0';
        const token = params.get('token') || '';
        const playerName = params.get('playerName') || '';
        return `../lobby.html?server=${server}&token=${token}&nickname=${playerName}`;
    },

    _renderBreadcrumb(parentKey, parentTitle, currentTitle) {
        const nav = document.createElement('nav');
        nav.className = 'nav-breadcrumb';
        nav.setAttribute('aria-label', 'Breadcrumb');

        let html = '';
        if (parentKey && parentKey !== 'index') {
            // Two levels: Главная > Parent > Current
            const grandparent = this.pages[parentKey]?.parent;
            if (grandparent) {
                const gpUrl = this._isGamePage ? '../index.html' : 'index.html';
                html += `<a href="${gpUrl}">Главная</a><span class="nav-sep">›</span>`;
                const pUrl = this._isGamePage
                    ? `../${this._pageToPath(parentKey)}`
                    : this._pageToPath(parentKey);
                html += `<a href="${pUrl}">${parentTitle}</a><span class="nav-sep">›</span>`;
            } else {
                // One level: Главная > Current
                const gpUrl = this._isGamePage ? '../index.html' : 'index.html';
                html += `<a href="${gpUrl}">Главная</a><span class="nav-sep">›</span>`;
            }
        } else if (parentKey === 'index') {
            // One level: Главная > Current
            html += `<a href="${this._isGamePage ? '../' : ''}index.html">Главная</a><span class="nav-sep">›</span>`;
        }

        html += `<span class="nav-current">${currentTitle}</span>`;
        nav.innerHTML = html;

        // Insert at the very start of body
        document.body.insertBefore(nav, document.body.firstChild);
    },

    _renderBackButton() {
        if (!this._backUrl) return;

        const btn = document.createElement('a');
        btn.className = 'nav-back-btn';

        if (this._isNetworkGame && this._isGamePage) {
            btn.textContent = '← В лобби';
            btn.setAttribute('aria-label', 'В лобби');
            btn.href = '#';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.chessGame?.networkManager) {
                    window.chessGame.networkManager.goBack();
                } else if (window.goGame?.networkManager) {
                    window.goGame.networkManager.goBack();
                } else {
                    window.location.href = this._backUrl;
                }
            });
        } else {
            btn.textContent = '← Назад';
            btn.setAttribute('aria-label', 'Назад');
            btn.href = this._backUrl;
        }

        document.body.insertBefore(btn, document.body.firstChild);
    },

    _renderModeBadge() {
        if (!this._isGamePage) return;

        const badge = document.createElement('div');
        badge.className = 'nav-mode-badge';

        if (this._isNetworkGame) {
            const params = new URLSearchParams(window.location.search);
            const role = params.get('role') || 'player';
            if (role === 'spectator') {
                badge.classList.add('mode-spectator');
                badge.textContent = 'НАБЛЮДАТЕЛЬ';
            } else {
                badge.classList.add('mode-online');
                badge.textContent = 'ОНЛАЙН';
            }
        } else {
            badge.classList.add('mode-local');
            badge.textContent = 'ЛОКАЛЬНАЯ ИГРА';
        }

        document.body.insertBefore(badge, document.body.firstChild);
    },

    _pageToPath(key) {
        // To add a new game: add entry here AND add to pages map above
        const map = {
            'chess': 'chess/chess.html',
            'go': 'go/go.html',
            'servers': 'servers.html',
            'lobby': 'lobby.html',
            'position-editor': 'chess/position-editor.html',
            'figures-tutorial': 'chess/figures-tutorial.html',
            'replay': 'replay.html'
            // Add new games here, e.g.:
            // 'checkers': 'checkers/checkers.html'
        };
        return map[key] || 'index.html';
    }
};
