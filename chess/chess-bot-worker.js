// chess-bot-worker.js — поиск бота в отдельном потоке
self.window = self;

importScripts('chess-engine.js');
importScripts('chess-bot-core.js');

self.onmessage = function (e) {
    const data = e.data || {};
    const id = data.id;

    try {
        if (data.type === 'findBestMove') {
            const pole = ChessBotCore.deserializeBoard(data.board);
            if (typeof data.depth === 'number') {
                ChessBotCore.setDepth(data.depth);
            }
            const result = ChessBotCore.findBestMove(pole, data.color, data.depth);
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
