document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.panel-section h3').forEach(header => {
        header.addEventListener('click', function () {
            this.parentElement.classList.toggle('collapsed');
        });
    });

    document.querySelectorAll('.sub-section h4').forEach(subHeader => {
        subHeader.addEventListener('click', function () {
            this.parentElement.classList.toggle('collapsed');
        });
    });

    document.querySelectorAll('.axis-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.axis-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            if (window.goGame) {
                window.goGame.handleAxisChange(this.id);
            }
        });
    });

    const buttonHandlers = {
        'save-settings': () => window.goGame?.saveSettings(),
        'load-settings': () => document.getElementById('settings-file-input').click(),
        'save-game': () => window.goGame?.saveGame(),
        'load-game': () => document.getElementById('file-input').click(),
        'new-game': () => window.goGame?.resetGame(),
        'pass-btn': () => window.goGame?.pass(),
        'undo-move': () => window.goGame?.handleUndoClick(),
        'apply-go-size': () => window.goGame?.resetGame(),
        'leave-room-btn': () => window.goGame?.leaveRoom(),
        'cancel-undo': () => window.goGame?.cancelUndoRequest(),
        'offer-undo': () => window.goGame?.offerUndo(),
        'send-chat-btn': () => window.goGame?.sendChatMessage(),
        'offer-draw': () => {
            if (window.goGame?.isNetworkGame) {
                alert('Предложение ничьей пока не реализовано');
            }
        },
        'resign-btn': () => {
            if (window.goGame?.isNetworkGame) {
                if (confirm('Вы уверены, что хотите сдаться?')) {
                    window.goGame?.networkManager?.sendResign();
                    window.goGame?.hideNetworkPanel();
                }
            } else {
                window.goGame?.resign();
            }
        }
    };

    Object.keys(buttonHandlers).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', buttonHandlers[id]);
        }
    });

    document.getElementById('settings-file-input')?.addEventListener('change', function (e) {
        window.goGame?.loadSettings(e.target.files[0]);
    });

    document.getElementById('file-input')?.addEventListener('change', function (e) {
        window.goGame?.loadGame(e.target.files[0]);
    });

    const colorPickers = {
        'bg-color': (value) => window.goGame?.changeColor('background', value),
        'board-color-1': (value) => window.goGame?.changeColor('board1', value),
        'board-color-2': (value) => window.goGame?.changeColor('board2', value),
        'white-figures-color': (value) => window.goGame?.changeColor('whiteFigure', value),
        'black-figures-color': (value) => window.goGame?.changeColor('blackFigure', value)
    };

    Object.keys(colorPickers).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', (e) => colorPickers[id](e.target.value));
        }
    });

    document.getElementById('chat-input')?.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            window.goGame?.sendChatMessage();
            this.value = '';
        }
    });

    document.getElementById('open-tutorial')?.addEventListener('click', function () {
        window.location.href = 'go-tutorial.html';
    });
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
});

window.addEventListener('resize', () => GraphicsEngine.onWindowResize(), false);

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 2 && window.goGame) {
        window.goGame.isDragging = false;
    }
});

document.getElementById('toggle-panels').addEventListener('click', () => {
    const left = document.getElementById('left-panel');
    const right = document.getElementById('right-panel');
    left.classList.toggle('hidden');
    right.classList.toggle('hidden');
});