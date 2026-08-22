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
        'save-game-action': () => window.goGame?.saveGame(),
        'load-game-action': () => document.getElementById('file-input').click(),
        'new-game': () => window.goGame?.resetGame(),
        'evaluate-position': () => window.goGame?.evaluatePosition(),
        'pass-btn': () => window.goGame?.pass(),
        'undo-move': () => window.goGame?.handleUndoClick(),
        'apply-go-size': () => window.goGame?.resetGame(),
        'leave-room-btn': () => window.goGame?.leaveRoom(),
        'cancel-undo': () => window.goGame?.cancelUndoRequest(),
        'offer-undo': () => window.goGame?.offerUndo(),
        'send-chat-btn': () => window.goGame?.sendChatMessage(),
        'offer-draw': () => {
            if (window.goGame?.isNetworkGame) {
                window.goGame?.networkManager?.sendDrawOffer();
            }
        },
        'resign-btn': async () => {
            if (window.goGame?.isNetworkGame) {
                if (await UI.confirm('Вы уверены, что хотите сдаться?')) {
                    window.goGame?.networkManager?.sendResign();
                    window.goGame?.hideNetworkPanel();
                }
            } else {
                window.goGame?.resign();
            }
        },
        'local-resign-btn': async () => {
            if (await UI.confirm('Вы уверены, что хотите сдаться?')) {
                window.goGame?.resign();
            }
        },
        'go-scoring-confirm-btn': () => window.goGame?.confirmScoring(),
        'go-scoring-resume-btn': () => window.goGame?.resumeFromScoring(),
        'rematch-btn': () => {
            if (window.goGame?.isNetworkGame) {
                document.getElementById('rematch-status').style.display = 'block';
                document.getElementById('rematch-status').textContent = 'Ожидание ответа...';
                window.goGame?.networkManager?.sendRematchOffer();
            }
        },
        'back-to-lobby-btn': () => {
            if (window.goGame?.isNetworkGame && window.goGame?.networkManager) {
                window.goGame.networkManager.goBack();
            } else {
                window.location.href = '../index.html';
            }
        },
        // Same destination as back-to-lobby-btn — this one lives inside the
        // game-over modal, which needs its own id (both can't share one).
        'result-back-to-lobby-btn': () => {
            if (window.goGame?.isNetworkGame && window.goGame?.networkManager) {
                window.goGame.networkManager.goBack();
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

    document.getElementById('settings-file-input')?.addEventListener('change', function (e) {
        window.goGame?.loadSettings(e.target.files[0]);
    });

    document.getElementById('file-input')?.addEventListener('change', function (e) {
        window.goGame?.loadGame(e.target.files[0]);
    });

    // Отображение/текстуры/освещение — общая логика для всех 8 страниц
    // (шахматы и Го × игра/задачи/редактор/обучение), см. ../appearance-ui.js.
    wireAppearanceSettingsUI();

    document.getElementById('chat-input')?.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            window.goGame?.sendChatMessage();
            this.value = '';
        }
    });

    const goBotEnabled = document.getElementById('go-bot-enabled');
    const goBotColor = document.getElementById('go-bot-color');
    const goBotAlgorithm = document.getElementById('go-bot-algorithm');
    const goBotStrength = document.getElementById('go-bot-strength');
    const goBotStrengthValue = document.getElementById('go-bot-strength-value');

    goBotEnabled?.addEventListener('change', function () {
        window.goGame?.setBotEnabled(this.checked);
    });
    goBotColor?.addEventListener('change', function () {
        window.goGame?.setBotColor(this.value);
    });
    goBotAlgorithm?.addEventListener('change', function () {
        window.goGame?.setBotAlgorithm(this.value);
    });
    goBotStrength?.addEventListener('input', function () {
        if (goBotStrengthValue) goBotStrengthValue.textContent = this.value;
        window.goGame?.setBotStrength(this.value);
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