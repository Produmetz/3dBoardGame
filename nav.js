/**
 * Persistent top navigation bar for 3D Chess & Go — identical on every
 * page (including during play), mirroring lichess's flat top bar with
 * a few section links, one of which (Игра) opens a dropdown on hover
 * instead of every game/mode getting its own top-level link.
 *
 * Usage: include <script src="nav.js"></script>, then call
 *        Nav.init(pageKey) where pageKey is one of the keys in Nav.pages.
 */
const Nav = {
    // pageKey -> { section, sub } — which top-bar item (and, for 'play',
    // which item inside its dropdown) should be highlighted as active.
    // To add a new game: add an entry here.
    pages: {
        'index': {},
        'chess': { section: 'play', sub: 'chess' },
        'go': { section: 'play', sub: 'go' },
        'lobby': { section: 'play', sub: 'online' },
        'servers': { section: 'play', sub: 'online' },
        'replay': { section: 'play', sub: 'online' },
        'position-editor': { section: 'tools' },
        'figures-tutorial': { section: 'learn' }
        // 'checkers': { section: 'play', sub: 'checkers' },
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
        const active = this.pages[pageKey] || {};
        const prefix = this._subdirPages.includes(pageKey) ? '../' : '';

        this._renderBar(prefix, active);
        this._wireDropdown();

        document.body.classList.add('nav-has-topbar');
        if (this._fullscreenPages.includes(pageKey)) {
            document.body.classList.add('nav-game-page');
        }
    },

    _renderBar(prefix, active) {
        const bar = document.createElement('nav');
        bar.className = 'nav-topbar';
        bar.setAttribute('aria-label', 'Основная навигация');

        const playActive = active.section === 'play';
        const playItems = [
            { key: 'chess', label: '♞ Шахматы', href: `${prefix}chess/chess.html` },
            { key: 'go', label: '⚫ Го', href: `${prefix}go/go.html` },
            { key: 'online', label: '🌐 Играть онлайн', href: `${prefix}servers.html` }
        ];

        let html = `<a class="nav-logo" href="${prefix}index.html">3D Chess &amp; Go</a><div class="nav-links">`;

        html += `<div class="nav-item nav-has-dropdown${playActive ? ' active' : ''}">`;
        html += `<a class="nav-link" href="${prefix}index.html">Игра <span class="nav-caret" aria-label="Развернуть меню Игра">▾</span></a>`;
        html += '<div class="nav-dropdown">';
        playItems.forEach(item => {
            const itemActive = playActive && active.sub === item.key ? ' active' : '';
            html += `<a class="nav-dropdown-link${itemActive}" href="${item.href}">${item.label}</a>`;
        });
        html += '</div></div>';

        html += `<a class="nav-link${active.section === 'learn' ? ' active' : ''}" href="${prefix}chess/figures-tutorial.html">Обучение</a>`;
        html += `<a class="nav-link${active.section === 'tools' ? ' active' : ''}" href="${prefix}chess/position-editor.html">Инструменты</a>`;

        html += '</div>';

        bar.innerHTML = html;
        document.body.insertBefore(bar, document.body.firstChild);
    },

    // Hover opens the dropdown on desktop (plain CSS, see nav.css). This
    // adds a click-to-toggle fallback for touch devices, where hover
    // doesn't fire: tapping the caret toggles the menu, tapping elsewhere
    // closes it. Tapping "Игра" itself still navigates to the homepage.
    _wireDropdown() {
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
    }
};
