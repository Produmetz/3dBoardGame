// go-bot.js — фасад: Worker + fallback

(function () {
    let worker = null;
    let nextReqId = 1;
    const pending = new Map();

    function getCore() {
        return typeof GoBotCore !== 'undefined' ? GoBotCore : null;
    }

    function workerUrl() {
        try {
            return new URL('go-bot-worker.js', window.location.href).href;
        } catch (e) {
            return 'go-bot-worker.js';
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
                console.warn('GoBot worker error:', err);
                destroyWorker();
            };
            return worker;
        } catch (err) {
            console.warn('GoBot worker unavailable:', err);
            worker = null;
            return null;
        }
    }

    function destroyWorker() {
        if (worker) {
            try { worker.terminate(); } catch (e) { /* ignore */ }
        }
        worker = null;
        pending.forEach((entry) => entry.reject(new Error('Worker cancelled')));
        pending.clear();
    }

    function findBestMove(board, options) {
        const core = getCore();
        if (!core) throw new Error('GoBotCore not loaded');
        return core.findBestMove(board, options);
    }

    function findBestMoveAsync(board, options) {
        const core = getCore();
        if (!core) return Promise.reject(new Error('GoBotCore not loaded'));

        const algo = (options && options.algorithm) || 'search';
        // greedy достаточно быстрый — на главном потоке
        if (algo === 'greedy') {
            return Promise.resolve(findBestMove(board, options));
        }

        const w = ensureWorker();
        if (!w) {
            return Promise.resolve(findBestMove(board, options));
        }

        const id = nextReqId++;
        const payload = core.serializeBoard(board);
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            try {
                w.postMessage({
                    type: 'findBestMove',
                    id: id,
                    board: payload,
                    algorithm: algo,
                    strength: options && options.strength
                });
            } catch (err) {
                pending.delete(id);
                try {
                    resolve(findBestMove(board, options));
                } catch (e2) {
                    reject(e2);
                }
            }
        });
    }

    function cancelSearch() {
        const had = pending.size > 0;
        destroyWorker();
        if (had) ensureWorker();
    }

    if (typeof window !== 'undefined') {
        setTimeout(function () { ensureWorker(); }, 0);
    }

    window.GoBot = {
        ALGORITHMS: ['greedy', 'search', 'mcts'],
        findBestMove,
        findBestMoveAsync,
        cancelSearch,
        clampStrength: function (n) {
            const core = getCore();
            return core ? core.clampStrength(n) : Math.max(1, Math.min(5, parseInt(n, 10) || 3));
        }
    };
})();
