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

    const buttonHandlers = {
        'save-settings': () => window.chessGame?.saveSettings(),
        'load-settings': () => document.getElementById('settings-file-input').click(),
        'save-game': () => window.chessGame?.saveGame(),
        'load-game': () => document.getElementById('file-input').click(),
        'undo-move': () => {
            if (!window.chessGame?.isNetworkGame) {
                window.chessGame?.undoMove();
            } else {
                UI.toast('В сетевом режиме используйте "Отмена хода"', 'info');
            }
        },
        'cancel-undo': () => window.chessGame?.cancelUndoRequest(),
        'new-game': () => window.chessGame?.resetToStandart(),
        'evaluate-position': () => window.chessGame?.evaluatePosition(),
        'position-editor': () => {
            window.location.href = 'position-editor.html';
        },
        'leave-room-btn': () => window.chessGame?.leaveRoom(),
        'offer-undo': () => window.chessGame?.offerUndo(),
        'send-chat-btn': () => window.chessGame?.sendChatMessage(),
        'resign-btn': async () => {
            if (window.chessGame?.isNetworkGame) {
                if (await UI.confirm('Вы уверены, что хотите сдаться?')) {
                    window.chessGame?.networkManager?.sendResign();
                }
            }
        },
        'offer-draw': () => {
            if (window.chessGame?.isNetworkGame) {
                window.chessGame?.networkManager?.sendDrawOffer();
            }
        },
        'rematch-btn': () => {
            if (window.chessGame?.isNetworkGame) {
                document.getElementById('rematch-status').style.display = 'block';
                document.getElementById('rematch-status').textContent = 'Ожидание ответа...';
                window.chessGame?.networkManager?.sendRematchOffer();
            }
        },
        'back-to-lobby-btn': () => {
            if (window.chessGame?.isNetworkGame && window.chessGame?.networkManager) {
                window.chessGame.networkManager.goBack();
            } else {
                window.location.href = '../index.html';
            }
        },
        // Same destination as back-to-lobby-btn — this one lives inside the
        // game-over modal, which needed its own id (both can't share one).
        'result-back-to-lobby-btn': () => {
            if (window.chessGame?.isNetworkGame && window.chessGame?.networkManager) {
                window.chessGame.networkManager.goBack();
            } else {
                window.location.href = '../index.html';
            }
        }
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

    // Отображение/текстуры/освещение — общая логика для всех 8 страниц
    // (шахматы и Го × игра/задачи/редактор/обучение), см. appearance-ui.js.
    wireAppearanceSettingsUI();

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

    // Управление локальным ботом
    const botEnabled = document.getElementById('bot-enabled');
    const botColor = document.getElementById('bot-color');
    const botDepth = document.getElementById('bot-depth');
    const botDepthValue = document.getElementById('bot-depth-value');

    botEnabled?.addEventListener('change', function () {
        window.chessGame?.setBotEnabled(this.checked);
    });

    botColor?.addEventListener('change', function () {
        window.chessGame?.setBotColor(this.value);
    });

    botDepth?.addEventListener('input', function () {
        if (botDepthValue) botDepthValue.textContent = this.value;
        window.chessGame?.setBotDepth(this.value);
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

document.getElementById('toggle-panels').addEventListener('click', () => {
    document.getElementById('game-panel')?.classList.toggle('hidden');
});

document.getElementById('close-settings')?.addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('active');
});
document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') e.target.classList.remove('active');
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('settings-modal')?.classList.remove('active');
});

document.getElementById('select-chess')?.addEventListener('click', () => {
    window.chessGame.gameType = 'chess';
    window.chessGame.resetGame();
});

document.getElementById('select-go')?.addEventListener('click', () => {
    window.chessGame.gameType = 'go';
    window.chessGame.resetGame();
});