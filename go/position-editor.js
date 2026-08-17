// Редактор позиций Го — в отличие от шахматного редактора, у камней нет
// типов, только цвет, поэтому палитра сильно проще (чёрный/белый/ластик).
class GoPositionEditor {
    constructor() {
        this.selectedColor = 'Black';
        this.isEraserMode = false;
        this.currentTurn = 'Black';

        this.isDragging = false;
        this.dragThreshold = 5;
        this.mouseDownX = 0;
        this.mouseDownY = 0;

        this.board = null;

        this.init();
    }

    init() {
        this.rebuildBoard();
        this.setupEventListeners();
        animate();
        console.log('Редактор позиций Го загружен!');
    }

    rebuildBoard() {
        const sizeX = parseInt(document.getElementById('go-size-x').value, 10) || 4;
        const sizeY = parseInt(document.getElementById('go-size-y').value, 10) || 4;
        const sizeZ = parseInt(document.getElementById('go-size-z').value, 10) || 4;
        const komi = parseFloat(document.getElementById('go-komi').value) || 6.5;
        const ruleSet = document.getElementById('go-rule-set')?.value || 'chinese';

        this.board = new GoEngine.Board([sizeX, sizeY, sizeZ], komi, ruleSet);
        // ColorManager.updateColors() (graphics-go.js) redraws through
        // window.goGame.board — this page has no real GoGame instance, so
        // give it a minimal stand-in instead of duplicating that redraw logic.
        window.goGame = { board: this.board };
        GraphicsEngine.createAndFillBoardForGo(this.board);
    }

    setupEventListeners() {
        const stoneItems = document.querySelectorAll('.stone-item');
        stoneItems.forEach(item => {
            item.addEventListener('click', () => {
                stoneItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                const stone = item.dataset.stone;
                if (stone === 'Eraser') {
                    this.isEraserMode = true;
                    this.selectedColor = null;
                    document.getElementById('stone-description').textContent = 'Кликните на камень, чтобы удалить его.';
                } else {
                    this.isEraserMode = false;
                    this.selectedColor = stone;
                    const label = stone === 'White' ? 'белый' : 'чёрный';
                    document.getElementById('stone-description').textContent = `Кликните на клетку, чтобы поставить ${label} камень.`;
                }
            });
        });

        window.addEventListener('resize', () => GraphicsEngine.onWindowResize(), false);

        document.getElementById('apply-go-size').addEventListener('click', () => this.rebuildBoard());

        document.getElementById('turn-black').addEventListener('click', () => {
            this.currentTurn = 'Black';
            document.getElementById('turn-black').classList.add('active');
            document.getElementById('turn-white').classList.remove('active');
        });
        document.getElementById('turn-white').addEventListener('click', () => {
            this.currentTurn = 'White';
            document.getElementById('turn-white').classList.add('active');
            document.getElementById('turn-black').classList.remove('active');
        });

        document.getElementById('clear-all').addEventListener('click', () => this.rebuildBoard());

        document.getElementById('axis-x').addEventListener('click', () => this.handleAxisChange('axis-x'));
        document.getElementById('axis-y').addEventListener('click', () => this.handleAxisChange('axis-y'));
        document.getElementById('axis-z').addEventListener('click', () => this.handleAxisChange('axis-z'));
        document.getElementById('axis-none').addEventListener('click', () => this.handleAxisChange('axis-none'));

        document.getElementById('save-position').addEventListener('click', () => this.savePosition());
        document.getElementById('load-position').addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.loadPosition(e.target.files[0]);
        });

        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                this.mouseDownX = event.clientX;
                this.mouseDownY = event.clientY;
                this.isDragging = false;
            }
        });

        canvas.addEventListener('mousemove', (event) => {
            if (event.buttons === 1) {
                const dx = Math.abs(event.clientX - this.mouseDownX);
                const dy = Math.abs(event.clientY - this.mouseDownY);
                if (dx > this.dragThreshold || dy > this.dragThreshold) this.isDragging = true;
            }
        });

        canvas.addEventListener('click', (event) => {
            if (event.button === 0 && !this.isDragging) this.handleCanvasClick(event);
        });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.mouseDownX = touch.clientX;
            this.mouseDownY = touch.clientY;
            this.isDragging = false;
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.mouseDownX === undefined) return;
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - this.mouseDownX);
            const dy = Math.abs(touch.clientY - this.mouseDownY);
            if (dx > this.dragThreshold || dy > this.dragThreshold) this.isDragging = true;
        });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.isDragging) return;
            const touch = e.changedTouches[0];
            if (touch) this.handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
        });
    }

    handleCanvasClick(event) {
        const cellCoords = GraphicsEngine.cellFromClick(event.clientX, event.clientY);
        if (!cellCoords) return;

        const { i, j, k } = cellCoords;
        const idx = this.board.coordToIndex([i, j, k]);

        if (this.isEraserMode) {
            this.board.grid[idx] = GoEngine.Stone.EMPTY;
        } else {
            this.board.grid[idx] = this.selectedColor === 'White' ? GoEngine.Stone.WHITE : GoEngine.Stone.BLACK;
        }
        GraphicsEngine.createAndFillBoardForGo(this.board);
    }

    handleAxisChange(axisId) {
        let axis = null;
        if (axisId === 'axis-x') axis = 'x';
        else if (axisId === 'axis-y') axis = 'y';
        else if (axisId === 'axis-z') axis = 'z';

        document.querySelectorAll('.axis-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(axisId).classList.add('active');

        GraphicsEngine.setExpandedAxis(axis);
        GraphicsEngine.createAndFillBoardForGo(this.board);
    }

    // Same save format as go/game-go.js's saveGame(), so files this editor
    // produces load straight into a real game and vice versa.
    savePosition() {
        const saveData = {
            version: 2,
            gameType: 'go',
            dims: this.board.dims,
            komi: this.board.komi,
            ruleSet: this.board.ruleSet,
            grid: this.board.grid.slice(),
            currentPlayer: this.currentTurn,
            captures: { black: 0, white: 0 },
            passCount: 0,
            gameOver: false,
            resigned: false,
            awaitingScoring: false,
            moveHistory: []
        };
        const blob = new Blob([JSON.stringify(saveData)], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `go_position_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    loadPosition(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.gameType !== 'go') {
                    UI.toast('Это не позиция Го', 'error');
                    return;
                }

                document.getElementById('go-size-x').value = data.dims[0];
                document.getElementById('go-size-y').value = data.dims[1];
                document.getElementById('go-size-z').value = data.dims[2];
                document.getElementById('go-komi').value = data.komi;
                if (data.ruleSet) document.getElementById('go-rule-set').value = data.ruleSet;

                this.board = new GoEngine.Board(data.dims, data.komi, data.ruleSet || 'chinese');
                this.board.grid = data.grid.slice();
                window.goGame = { board: this.board };

                this.currentTurn = data.currentPlayer === 'White' ? 'White' : 'Black';
                document.getElementById(`turn-${this.currentTurn.toLowerCase()}`).click();

                GraphicsEngine.createAndFillBoardForGo(this.board);
                UI.toast('Позиция загружена', 'success');
            } catch (error) {
                UI.toast('Ошибка при загрузке позиции: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }
}

window.addEventListener('load', () => {
    window.goPositionEditor = new GoPositionEditor();
    document.querySelector('.stone-item').click();
});
