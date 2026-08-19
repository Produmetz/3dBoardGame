// go-replay.js
// Проигрыватель партии Го: читает список ходов с сервера и воспроизводит его
// настоящим GoEngine + тем же 3D-рендерером, что и живая игра — в отличие
// от старой replay.html (плоская 2D-сетка без учёта Z-слоёв).

class GoReplay {
    constructor() {
        this.board = null;
        this.moves = [];
        this.plyLabels = [];
        this.currentPly = 0;
        this.playing = false;
        this.playTimer = null;
        this.speedMs = 800;

        const params = new URLSearchParams(window.location.search);
        this.gameId = params.get('gameId');
        this.serverUrl = params.get('serverUrl');

        this.init();
    }

    init() {
        // graphics-go.js уже сам запускает animate() и слушает resize —
        // здесь их дублировать не нужно (в отличие от chess/graphics.js).
        document.getElementById('toggle-panels').addEventListener('click', () => {
            document.getElementById('game-panel')?.classList.toggle('hidden');
        });
        document.getElementById('replay-back').addEventListener('click', () => history.back());
        document.getElementById('replay-first').addEventListener('click', () => this.goToPly(0));
        document.getElementById('replay-prev').addEventListener('click', () => { this.pause(); this.goToPly(this.currentPly - 1); });
        document.getElementById('replay-next').addEventListener('click', () => { this.pause(); this.stepForward(); });
        document.getElementById('replay-last').addEventListener('click', () => { this.pause(); this.goToPly(this.moves.length); });
        document.getElementById('replay-play').addEventListener('click', () => this.togglePlay());
        document.getElementById('replay-speed').addEventListener('change', (e) => { this.speedMs = Number(e.target.value); });

        this.connectAndLoad();
    }

    connectAndLoad() {
        if (!this.gameId || !this.serverUrl) {
            this.showError('Не указана партия для просмотра.');
            return;
        }
        let socket;
        try {
            socket = new WebSocket(this.serverUrl.replace('0.0.0.0', 'localhost'));
        } catch (e) {
            this.showError('Не удалось подключиться к серверу.');
            return;
        }
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'get_replay', gameId: Number(this.gameId) }));
        };
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'replay') {
                socket.close();
                this.loadReplay(data);
            } else if (data.type === 'error') {
                socket.close();
                this.showError(data.message || 'Не удалось загрузить партию.');
            }
        };
        socket.onerror = () => this.showError('Ошибка подключения к серверу.');
    }

    showError(message) {
        const el = document.getElementById('replay-loading');
        if (el) el.textContent = message;
    }

    newBoard() {
        const p = this.boardParams || {};
        return new GoEngine.Board(
            [p.boardX || 5, p.boardY || 5, p.boardZ || 5],
            p.komi || 6.5,
            p.ruleSet || 'chinese'
        );
    }

    loadReplay(data) {
        document.getElementById('replay-loading').style.display = 'none';
        this.moves = data.moves || [];
        this.boardParams = data.boardParams || {};

        document.getElementById('replay-players').textContent =
            `${data.player1Name || '?'} vs ${data.player2Name || '?'}`;
        const meta = [];
        if (data.winnerName) meta.push(`Победитель: ${data.winnerName}`);
        else meta.push('Ничья');
        if (data.createdAt) meta.push(new Date(String(data.createdAt).replace(' ', 'T') + 'Z').toLocaleString('ru-RU'));
        document.getElementById('replay-meta').textContent = meta.join(' · ');

        this.buildMoveList();
        this.renderMoveListUI();
        this.goToPly(0);
    }

    // Один проход от начальной позиции до конца — только для подписей в
    // панели истории. goToPly()/stepForward() ниже ведут собственное,
    // независимое состояние доски.
    buildMoveList() {
        const board = this.newBoard();
        this.plyLabels = [];
        for (const mv of this.moves) {
            const mover = board.getCurrentPlayer();
            const colorLabel = mover === GoEngine.Stone.BLACK ? 'Чёрные' : 'Белые';
            if (!mv || mv.type === 'pass') {
                this.plyLabels.push(`${colorLabel}: пас`);
                board.pass();
                continue;
            }
            this.plyLabels.push(`${colorLabel}: (${mv.to.x},${mv.to.y},${mv.to.z})`);
            board.makeMove([mv.to.x, mv.to.y, mv.to.z], mover);
        }
    }

    renderMoveListUI() {
        const list = document.getElementById('replay-move-list');
        list.innerHTML = '';
        this.plyLabels.forEach((label, index) => {
            const div = document.createElement('div');
            div.className = 'replay-move';
            div.dataset.ply = String(index + 1);
            div.textContent = `${index + 1}. ${label}`;
            div.addEventListener('click', () => { this.pause(); this.goToPly(index + 1); });
            list.appendChild(div);
        });
    }

    highlightActiveMove() {
        document.querySelectorAll('#replay-move-list .replay-move').forEach((el) => {
            el.classList.toggle('active', Number(el.dataset.ply) === this.currentPly);
        });
        const active = document.querySelector('#replay-move-list .replay-move.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
        document.getElementById('replay-progress').textContent = `${this.currentPly} / ${this.moves.length}`;
    }

    goToPly(n) {
        n = Math.max(0, Math.min(n, this.moves.length));
        this.board = this.newBoard();
        for (let i = 0; i < n; i++) {
            const mv = this.moves[i];
            const mover = this.board.getCurrentPlayer();
            if (!mv || mv.type === 'pass') {
                this.board.pass();
            } else {
                this.board.makeMove([mv.to.x, mv.to.y, mv.to.z], mover);
            }
        }
        this.currentPly = n;
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.highlightActiveMove();
    }

    stepForward() {
        if (this.currentPly >= this.moves.length) return;
        const mv = this.moves[this.currentPly];
        const mover = this.board.getCurrentPlayer();
        if (!mv || mv.type === 'pass') {
            this.board.pass();
        } else {
            this.board.makeMove([mv.to.x, mv.to.y, mv.to.z], mover);
        }
        this.currentPly++;
        // У Го нет отдельной анимации перемещения (камень просто появляется,
        // как и в живой игре — см. makeMove() в game-go.js) — перестраиваем сразу.
        GraphicsEngine.createAndFillBoardForGo(this.board);
        this.highlightActiveMove();
    }

    togglePlay() {
        if (this.playing) this.pause();
        else this.play();
    }

    play() {
        if (this.playing) return;
        if (this.currentPly >= this.moves.length) this.goToPly(0);
        this.playing = true;
        document.getElementById('replay-play').textContent = '⏸';
        this.scheduleNext();
    }

    pause() {
        this.playing = false;
        document.getElementById('replay-play').textContent = '▶';
        if (this.playTimer) clearTimeout(this.playTimer);
        this.playTimer = null;
    }

    scheduleNext() {
        this.playTimer = setTimeout(() => {
            if (!this.playing) return;
            if (this.currentPly >= this.moves.length) {
                this.pause();
                return;
            }
            this.stepForward();
            this.scheduleNext();
        }, this.speedMs);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.goReplay = new GoReplay();
});
