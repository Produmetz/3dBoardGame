/**
 * Persistent top navigation bar for 3D Chess & Go — identical on every
 * page (including during play), mirroring lichess's flat top bar with
 * a few section links. Игра / Обучение / Инструменты each open a
 * dropdown on hover once there's more than one destination for that
 * section (Обучение/Инструменты: Шахматы vs Го).
 *
 * The "Игра" dropdown mirrors lichess's actual "Игра" menu: it holds
 * things that AREN'T already one click away from the homepage (on
 * lichess: create a custom seek, tournaments, simuls — none of which
 * duplicate their homepage buttons). Our homepage already covers vs-bot
 * and local pass-and-play, so the one thing worth surfacing here is
 * jumping straight to creating a networked game invite.
 *
 * Usage: include <script src="nav.js"></script>, then call
 *        Nav.init(pageKey) where pageKey is one of the keys in Nav.pages.
 */
const Nav = {
    // pageKey -> which top-bar item should be highlighted as active.
    // To add a new game: add entries for it here (both tool pages).
    pages: {
        'index': null,
        'chess': 'play',
        'go': 'play',
        'lobby': 'play',
        'servers': 'play',
        'replay': 'play',
        'position-editor': 'tools',
        'position-editor-go': 'tools',
        'figures-tutorial': 'learn',
        'figures-tutorial-go': 'learn'
        // 'checkers': 'play', 'position-editor-checkers': 'tools', ...
    },

    // Pages that live one directory down (chess/, go/) need a '../' prefix
    // on every link. To add a new game: add its pageKeys here too.
    _subdirPages: [
        'chess', 'go',
        'position-editor', 'position-editor-go',
        'figures-tutorial', 'figures-tutorial-go'
    ],

    // Pages whose canvas fills the exact viewport (sized to
    // window.innerWidth/innerHeight in graphics.js) and must not get body
    // padding pushing it down — the bar just overlays its top strip
    // instead, same as their own fixed panels/toolbar do.
    _fullscreenPages: [
        'chess', 'go',
        'position-editor', 'position-editor-go',
        'figures-tutorial', 'figures-tutorial-go'
    ],

    /**
     * @param {string} pageKey - one of the keys in Nav.pages
     */
    init(pageKey) {
        const activeSection = this.pages.hasOwnProperty(pageKey) ? this.pages[pageKey] : null;
        const prefix = this._subdirPages.includes(pageKey) ? '../' : '';

        this._renderBar(prefix, activeSection);
        this._wireDropdowns(prefix);

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

        html += this._dropdown(activeSection === 'play', 'Игра', `${prefix}index.html`, [
            { id: 'nav-create-game', label: '🌐 Создать запрос на игру', href: '#' }
        ]);

        html += this._dropdown(activeSection === 'learn', 'Обучение', `${prefix}chess/figures-tutorial.html`, [
            { label: '♞ Шахматы', href: `${prefix}chess/figures-tutorial.html` },
            { label: '⚫ Го', href: `${prefix}go/figures-tutorial.html` }
        ]);

        html += this._dropdown(activeSection === 'tools', 'Инструменты', `${prefix}chess/position-editor.html`, [
            { label: '♞ Шахматы', href: `${prefix}chess/position-editor.html` },
            { label: '⚫ Го', href: `${prefix}go/position-editor.html` }
        ]);

        html += '</div>';

        bar.innerHTML = html;
        document.body.insertBefore(bar, document.body.firstChild);
    },

    // Builds one "<label> ▾" nav item with a hover dropdown. `items` may
    // carry an `id` (for entries with custom JS behaviour, e.g. the Игра
    // shortcut) instead of a real `href`.
    _dropdown(isActive, label, labelHref, items) {
        let html = `<div class="nav-item nav-has-dropdown${isActive ? ' active' : ''}">`;
        html += `<a class="nav-link" href="${labelHref}">${label} <span class="nav-caret" aria-label="Развернуть меню ${label}">▾</span></a>`;
        html += '<div class="nav-dropdown">';
        items.forEach(item => {
            const idAttr = item.id ? ` id="${item.id}"` : '';
            html += `<a class="nav-dropdown-link"${idAttr} href="${item.href}">${item.label}</a>`;
        });
        html += '</div></div>';
        return html;
    },

    // Hover opens each dropdown on desktop (plain CSS, see nav.css). This
    // adds a click-to-toggle fallback for touch devices, where hover
    // doesn't fire: tapping a caret toggles that menu, tapping elsewhere
    // closes all of them. Tapping a label itself still navigates.
    _wireDropdowns(prefix) {
        const items = document.querySelectorAll('.nav-has-dropdown');

        items.forEach(item => {
            const caret = item.querySelector('.nav-caret');
            if (!caret) return;
            caret.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const wasOpen = item.classList.contains('open');
                items.forEach(i => i.classList.remove('open'));
                if (!wasOpen) item.classList.add('open');
            });
        });

        document.addEventListener('click', (e) => {
            items.forEach(item => {
                if (!item.contains(e.target)) item.classList.remove('open');
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') items.forEach(item => item.classList.remove('open'));
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
