// go-bot-worker.js
self.window = self;

importScripts('go-engine_v2.js');
importScripts('go-bot-core.js');

self.onmessage = function (e) {
    const data = e.data || {};
    const id = data.id;
    try {
        if (data.type === 'findBestMove') {
            const board = GoBotCore.deserializeBoard(data.board);
            const result = GoBotCore.findBestMove(board, {
                algorithm: data.algorithm,
                strength: data.strength
            });
            self.postMessage({ id: id, ok: true, result: result });
            return;
        }
        if (data.type === 'ping') {
            self.postMessage({ id: id, ok: true, result: 'pong' });
            return;
        }
        self.postMessage({ id: id, ok: false, error: 'Unknown message type' });
    } catch (err) {
        self.postMessage({
            id: id,
            ok: false,
            error: err && err.message ? err.message : String(err)
        });
    }
};
