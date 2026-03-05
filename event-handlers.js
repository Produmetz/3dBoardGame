document.addEventListener('DOMContentLoaded', function () {
    // Обработчики для сворачивания/разворачивания секций
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

    // Обработчики для кнопок осей
    document.querySelectorAll('.axis-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.axis-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            if (window.chessGame) {
                window.chessGame.handleAxisChange(this.id);
            }
        });
    });

    // Основные кнопки управления
    const buttonHandlers = {
        'save-settings': () => window.chessGame?.saveSettings(),
        'load-settings': () => document.getElementById('settings-file-input').click(),
        'save-game': () => window.chessGame?.saveGame(),
        'load-game': () => document.getElementById('file-input').click(),
        'undo-move': () => {
            if (!window.chessGame?.isNetworkGame) {
                window.chessGame?.undoMove();
            } else {
                alert('В сетевом режиме используйте "Предложить отмену хода"');
            }
        },
        'cancel-undo': () => window.chessGame?.cancelUndoRequest(),
        'new-game': () => window.chessGame?.resetToStandart(),
        'position-editor': () => {
            window.location.href = 'position-editor.html';
        },
        // Сетевые кнопки
        'connect-btn': () => window.chessGame?.connectToServer(),
        'refresh-rooms-btn': () => window.chessGame?.refreshRooms(),
        'create-room-btn': () => {
            document.getElementById('create-room-panel').style.display = 'block';
        },
        'confirm-create-room-btn': () => window.chessGame?.confirmCreateRoom(),
        'cancel-create-room-btn': () => window.chessGame?.cancelCreateRoom(),
        'confirm-join-room-btn': () => window.chessGame?.confirmJoinRoom(),
        'cancel-join-room-btn': () => window.chessGame?.cancelJoinRoom(),
        'disconnect-from-server-btn': () => window.chessGame?.disconnect(),
        'leave-room-btn': () => window.chessGame?.leaveRoom(),
        'offer-undo': () => window.chessGame?.offerUndo(),
        'send-chat-btn': () => window.chessGame?.sendChatMessage()
    };

    Object.keys(buttonHandlers).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', buttonHandlers[id]);
        }
    });

    // Обработчики для выбора файлов
    document.getElementById('settings-file-input')?.addEventListener('change', function (e) {
        window.chessGame?.loadSettings(e.target.files[0]);
    });

    document.getElementById('file-input')?.addEventListener('change', function (e) {
        window.chessGame?.loadGame(e.target.files[0]);
    });

    // Обработчики для цветовых пикеров
    const colorPickers = {
        'bg-color': (value) => window.chessGame?.changeColor('background', value),
        'board-color-1': (value) => window.chessGame?.changeColor('board1', value),
        'board-color-2': (value) => window.chessGame?.changeColor('board2', value),
        'white-figures-color': (value) => window.chessGame?.changeColor('whiteFigure', value),
        'black-figures-color': (value) => window.chessGame?.changeColor('blackFigure', value)
    };

    Object.keys(colorPickers).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', (e) => colorPickers[id](e.target.value));
        }
    });

    // Обработчик для чата (Enter)
    document.getElementById('chat-input')?.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            window.chessGame?.sendChatMessage();
            this.value = '';
        }
    });

    // Открытие страницы обучения
    document.getElementById('open-tutorial')?.addEventListener('click', function () {
        window.location.href = 'figures-tutorial.html';
    });
});

// Обработчик для контекстного меню (правой кнопки мыши)
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
});

// Обработчик изменения размера окна
window.addEventListener('resize', () => GraphicsEngine.onWindowResize(), false);

// Обработчик для отпускания правой кнопки мыши
canvas.addEventListener('mouseup', (e) => {
    if (e.button === 2 && window.chessGame) {
        window.chessGame.isDragging = false;
    }
});