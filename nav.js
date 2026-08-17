/**
 * Persistent top navigation bar for 3D Chess & Go — identical on every
 * page (including during play), mirroring lichess's flat top bar instead
 * of a per-page breadcrumb trail + back button + mode badge.
 *
 * Usage: include <script src="nav.js"></script>, then call
 *        Nav.init(pageKey) where pageKey is one of the keys in Nav.pages.
 */
const Nav = {
    // pageKey -> which top-bar link should be highlighted as active.
    // To add a new game: add an entry here.
    pages: {
        'index': null,
        'chess': 'chess',
        'go': 'go',
        'position-editor': 'chess',
        'figures-tutorial': 'chess',
        'lobby': 'online',
        'servers': 'online',
        'replay': 'online'
        // 'checkers': 'checkers',
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
        const activeLink = this.pages.hasOwnProperty(pageKey) ? this.pages[pageKey] : null;
        const prefix = this._subdirPages.includes(pageKey) ? '../' : '';

        this._renderBar(prefix, activeLink);

        document.body.classList.add('nav-has-topbar');
        if (this._fullscreenPages.includes(pageKey)) {
            document.body.classList.add('nav-game-page');
        }
    },

    _renderBar(prefix, activeLink) {
        const bar = document.createElement('nav');
        bar.className = 'nav-topbar';
        bar.setAttribute('aria-label', 'Основная навигация');

        const links = [
            { key: 'chess', label: 'Шахматы', href: `${prefix}chess/chess.html` },
            { key: 'go', label: 'Го', href: `${prefix}go/go.html` },
            { key: 'online', label: 'Онлайн', href: `${prefix}servers.html` }
        ];

        let html = `<a class="nav-logo" href="${prefix}index.html">3D Chess &amp; Go</a><div class="nav-links">`;
        links.forEach(link => {
            const active = link.key === activeLink ? ' active' : '';
            html += `<a class="nav-link${active}" href="${link.href}">${link.label}</a>`;
        });
        html += '</div>';

        bar.innerHTML = html;
        document.body.insertBefore(bar, document.body.firstChild);
    }
};
