// chess-replay.js
// Проигрыватель партии: читает список ходов с сервера и воспроизводит его
// настоящим ChessEngine + тем же 3D-рендерером, что и живая игра — в отличие
// от старой replay.html (плоская 2D-сетка, отдельная от реальных движков).

class ChessReplay {
    constructor() {
        this.moves = [];
        this.plyLabels = [];
        this.currentPly = 0;
        this.currentColorWhite = true;
        this.playing = false;
        this.playTimer = null;
        this.speedMs = 800;

        const params = new URLSearchParams(window.location.search);
        this.gameId = params.get('gameId');
        this.serverUrl = params.get('serverUrl');

        this.init();
    }

    init() {
        ChessEngine.InitGame();
        createAndFillBoardOnPole(ChessEngine.Pole);
        animate();
        window.addEventListener('resize', () => GraphicsEngine.onWindowResize(), false);

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

    loadReplay(data) {
        document.getElementById('replay-loading').style.display = 'none';
        this.moves = data.moves || [];

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

    // Один проход от начальной позиции до конца — только для сбора текстовых
    // подписей ходов в панели истории (какая фигура и откуда/куда пошла).
    // Результат прохода не используется как текущее состояние доски —
    // goToPly() ниже сам перестраивает состояние с нуля.
    buildMoveList() {
        ChessEngine.InitGame();
        let colorWhite = true;
        this.plyLabels = [];
        for (const mv of this.moves) {
            if (!mv || mv.type === 'pass') {
                this.plyLabels.push('Пас');
                continue;
            }
            const movedFigure = ChessEngine.Pole[mv.from.x][mv.from.y][mv.from.z];
            const label = movedFigure
                ? `${movedFigure.Color === 'White' ? 'Белые' : 'Чёрные'} ${movedFigure.Name}: (${mv.from.x},${mv.from.y},${mv.from.z}) → (${mv.to.x},${mv.to.y},${mv.to.z})`
                : `(${mv.from.x},${mv.from.y},${mv.from.z}) → (${mv.to.x},${mv.to.y},${mv.to.z})`;
            this.plyLabels.push(label);
            const res = ChessEngine.Move(mv.from.x, mv.from.y, mv.from.z, mv.to.x, mv.to.y, mv.to.z, ChessEngine.Pole, colorWhite, mv.promotion);
            colorWhite = res.success ? res.nextMove === 'White' : !colorWhite;
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

    // Пересобирает позицию с нуля до конкретного хода — надёжный способ
    // "прыгнуть" в любую точку партии (клик по списку, "в начало"/"в конец").
    goToPly(n) {
        n = Math.max(0, Math.min(n, this.moves.length));
        ChessEngine.InitGame();
        let colorWhite = true;
        for (let i = 0; i < n; i++) {
            const mv = this.moves[i];
            if (!mv || mv.type === 'pass') continue;
            const res = ChessEngine.Move(mv.from.x, mv.from.y, mv.from.z, mv.to.x, mv.to.y, mv.to.z, ChessEngine.Pole, colorWhite, mv.promotion);
            colorWhite = res.success ? res.nextMove === 'White' : !colorWhite;
        }
        this.currentPly = n;
        this.currentColorWhite = colorWhite;
        createAndFillBoardOnPole(ChessEngine.Pole);
        this.highlightActiveMove();
    }

    // Шаг вперёд с анимацией — так же, как обычный ход в живой игре
    // (GraphicsEngine.animateMoveThenRebuild), а не мгновенная перестройка.
    stepForward() {
        if (this.currentPly >= this.moves.length) return;
        const mv = this.moves[this.currentPly];
        if (!mv || mv.type === 'pass') {
            this.currentPly++;
            this.highlightActiveMove();
            return;
        }
        const res = ChessEngine.Move(mv.from.x, mv.from.y, mv.from.z, mv.to.x, mv.to.y, mv.to.z, ChessEngine.Pole, this.currentColorWhite, mv.promotion);
        if (!res.success) {
            this.currentPly++;
            this.highlightActiveMove();
            return;
        }
        const animatedMoves = [{ from: mv.from, to: mv.to }];
        if (res.castling) animatedMoves.push({ from: res.castling.rookFrom, to: res.castling.rookTo });
        this.currentColorWhite = res.nextMove === 'White';
        this.currentPly++;
        GraphicsEngine.animateMoveThenRebuild(ChessEngine.Pole, animatedMoves, () => this.highlightActiveMove());
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
    window.chessReplay = new ChessReplay();
});
