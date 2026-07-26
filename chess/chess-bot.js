// chess-bot.js — фасад: Web Worker + fallback на основной поток

(function () {
    let defaultDepth = 2;
    let worker = null;
    let workerReady = false;
    let nextReqId = 1;
    const pending = new Map();

    function getCore() {
        return typeof ChessBotCore !== 'undefined' ? ChessBotCore : null;
    }

    function clampDepth(n) {
        const core = getCore();
        if (core) return core.clampDepth(n);
        const d = parseInt(n, 10);
        if (isNaN(d)) return 2;
        return Math.max(1, Math.min(5, d));
    }

    function workerUrl() {
        try {
            return new URL('chess-bot-worker.js', window.location.href).href;
        } catch (e) {
            return 'chess-bot-worker.js';
        }
    }

    function ensureWorker() {
        if (worker) return worker;
        if (typeof Worker === 'undefined') return null;

        try {
            worker = new Worker(workerUrl());
            worker.onmessage = function (e) {
                const msg = e.data || {};
                const entry = pending.get(msg.id);
                if (!entry) return;
                pending.delete(msg.id);
                if (msg.ok) entry.resolve(msg.result);
                else entry.reject(new Error(msg.error || 'Worker error'));
            };
            worker.onerror = function (err) {
                console.warn('ChessBot worker error, fallback to main thread:', err);
                destroyWorker();
            };
            workerReady = true;
            return worker;
        } catch (err) {
            console.warn('ChessBot worker unavailable:', err);
            worker = null;
            workerReady = false;
            return null;
        }
    }

    function destroyWorker() {
        if (worker) {
            try { worker.terminate(); } catch (e) { /* ignore */ }
        }
        worker = null;
        workerReady = false;
        pending.forEach((entry) => {
            entry.reject(new Error('Worker cancelled'));
        });
        pending.clear();
    }

    function setDepth(n) {
        defaultDepth = clampDepth(n);
        const core = getCore();
        if (core) core.setDepth(defaultDepth);
        return defaultDepth;
    }

    function getDepth() {
        return defaultDepth;
    }

    function evaluate(pole, sideToMove) {
        const core = getCore();
        if (!core) throw new Error('ChessBotCore not loaded');
        return core.evaluate(pole, sideToMove);
    }

    function findBestMove(pole, color, depth) {
        const core = getCore();
        if (!core) throw new Error('ChessBotCore not loaded');
        return core.findBestMove(pole, color, depth !== undefined ? depth : defaultDepth);
    }

    /**
     * Асинхронный поиск (Worker). При отмене/ошибке — fallback на sync.
     * @returns {Promise<{from,to,score}|null>}
     */
    function findBestMoveAsync(pole, color, depth) {
        const d = clampDepth(depth !== undefined ? depth : defaultDepth);
        const core = getCore();
        if (!core) {
            return Promise.reject(new Error('ChessBotCore not loaded'));
        }

        const w = ensureWorker();
        if (!w || !workerReady) {
            return Promise.resolve(findBestMove(pole, color, d));
        }

        const id = nextReqId++;
        const board = core.serializeBoard(pole);

        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            try {
                w.postMessage({
                    type: 'findBestMove',
                    id: id,
                    board: board,
                    color: color,
                    depth: d
                });
            } catch (err) {
                pending.delete(id);
                // Fallback sync
                try {
                    resolve(findBestMove(pole, color, d));
                } catch (e2) {
                    reject(e2);
                }
            }
        });
    }

    /** Прервать текущий поиск в worker (например, undo / смена настроек). */
    function cancelSearch() {
        const hadPending = pending.size > 0;
        destroyWorker();
        if (hadPending) {
            // Пересоздадим worker при следующем ходе
            ensureWorker();
        }
    }

    // Прогрев worker при загрузке
    if (typeof window !== 'undefined') {
        setTimeout(function () {
            ensureWorker();
        }, 0);
    }

    window.ChessBot = {
        evaluate,
        findBestMove,
        findBestMoveAsync,
        cancelSearch,
        setDepth,
        getDepth,
        MIN_DEPTH: 1,
        MAX_DEPTH: 5,
        get PIECE_VALUES() {
            const core = getCore();
            return core ? core.PIECE_VALUES : {};
        }
    };
})();
