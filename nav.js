/**
 * Persistent top navigation bar for 3D Chess & Go — identical on every
 * page (including during play), mirroring lichess's flat top bar with
 * a few section links, one of which (Игра) opens a dropdown on hover.
 *
 * The dropdown mirrors lichess's actual "Игра" menu: it holds things that
 * AREN'T already one click away from the homepage (on lichess: create a
 * custom seek, tournaments, simuls — none of which duplicate their
 * homepage buttons). Our homepage already covers vs-bot and local
 * pass-and-play, so the one thing worth surfacing here is jumping
 * straight to creating a networked game invite.
 *
 * Usage: include <script src="nav.js"></script>, then call
 *        Nav.init(pageKey) where pageKey is one of the keys in Nav.pages.
 */
const Nav = {
    // pageKey -> which top-bar item should be highlighted as active.
    // To add a new game: add an entry here.
    pages: {
        'index': null,
        'chess': 'play',
        'go': 'play',
        'lobby': 'play',
        'servers': 'play',
        'replay': 'play',
        'position-editor': 'tools',
        'figures-tutorial': 'learn'
        // 'checkers': 'play',
    },

    // Pages that live one directory down (chess/, go/) need a '../' prefix
    // on every link. To add a new game: add its pageKey here too.
    _subdirPages: ['chess', 'go', 'position-editor', 'figures-tutorial'],

    // Pages whose canvas fills the exact viewport (sized to
    // window.innerWidth/innerHeight in graphics.js) and must not get body
    // padding pushing it down — the bar just overlays its top strip
    // instead, same as their own fixed panels/toolbar do. Everything else
    // (including position-editor/figures-tutorial, which have their own
    // in-flow page header) gets normal body padding.
    _fullscreenPages: ['chess', 'go'],

    /**
     * @param {string} pageKey - one of the keys in Nav.pages
     */
    init(pageKey) {
        const activeSection = this.pages.hasOwnProperty(pageKey) ? this.pages[pageKey] : null;
        const prefix = this._subdirPages.includes(pageKey) ? '../' : '';

        this._renderBar(prefix, activeSection);
        this._wireDropdown(prefix);

        document.body.classList.add('nav-has-topbar');
        if (this._fullscreenPages.includes(pageKey)) {
            document.body.classList.add('nav-game-page');
        }
    },

    _renderBar(prefix, activeSection) {
        const bar = document.createElement('nav');
        bar.className = 'nav-topbar';
        bar.setAttribute('aria-label', 'Основная навигация');

        let html = `<a class="nav-logo" href="${prefix}index.html">3D Chess &amp; Go</a><div class="nav-links">`;

        html += `<div class="nav-item nav-has-dropdown${activeSection === 'play' ? ' active' : ''}">`;
        html += `<a class="nav-link" href="${prefix}index.html">Игра <span class="nav-caret" aria-label="Развернуть меню Игра">▾</span></a>`;
        html += '<div class="nav-dropdown">';
        html += '<a class="nav-dropdown-link" href="#" id="nav-create-game">🌐 Создать запрос на игру</a>';
        html += '</div></div>';

        html += `<a class="nav-link${activeSection === 'learn' ? ' active' : ''}" href="${prefix}chess/figures-tutorial.html">Обучение</a>`;
        html += `<a class="nav-link${activeSection === 'tools' ? ' active' : ''}" href="${prefix}chess/position-editor.html">Инструменты</a>`;

        html += '</div>';

        bar.innerHTML = html;
        document.body.insertBefore(bar, document.body.firstChild);
    },

    // Hover opens the dropdown on desktop (plain CSS, see nav.css). This
    // adds a click-to-toggle fallback for touch devices, where hover
    // doesn't fire: tapping the caret toggles the menu, tapping elsewhere
    // closes it. Tapping "Игра" itself still navigates to the homepage.
    _wireDropdown(prefix) {
        const item = document.querySelector('.nav-has-dropdown');
        const caret = item?.querySelector('.nav-caret');
        if (!item || !caret) return;

        caret.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!item.contains(e.target)) item.classList.remove('open');
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') item.classList.remove('open');
        });

        // "Создать запрос на игру": if we already have a saved server
        // session (lobby_auth, set by servers.html on login), jump straight
        // to the lobby's Create Room tab. Otherwise there's nothing to
        // authenticate with yet, so fall back to picking a server first.
        document.getElementById('nav-create-game')?.addEventListener('click', (e) => {
            e.preventDefault();
            let target = `${prefix}servers.html`;
            try {
                const auth = JSON.parse(localStorage.getItem('lobby_auth') || 'null');
                if (auth && auth.serverIndex >= 0 && auth.token) {
                    const params = new URLSearchParams({
                        server: auth.serverIndex,
                        token: auth.token,
                        nickname: auth.nickname || '',
                        tab: 'create-room'
                    });
                    target = `${prefix}lobby.html?${params.toString()}`;
                }
            } catch (err) { /* malformed saved session — fall back to servers.html */ }
            window.location.href = target;
        });
    }
};
