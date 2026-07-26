// go-bot-core.js — три режима локального бота Го: greedy / search / mcts

(function (root) {
    const ALGORITHMS = ['greedy', 'search', 'mcts'];

    function getEngine() {
        if (typeof GoEngine !== 'undefined') return GoEngine;
        if (root && root.GoEngine) return root.GoEngine;
        throw new Error('GoEngine is not available');
    }

    function stoneName(stone) {
        const S = getEngine().Stone;
        return stone === S.BLACK ? 'Black' : 'White';
    }

    function clampStrength(n) {
        const s = parseInt(n, 10);
        if (isNaN(s)) return 3;
        return Math.max(1, Math.min(5, s));
    }

    function centerOf(dims) {
        return dims.map((d) => (d - 1) / 2);
    }

    function distToCenter(coord, center) {
        let s = 0;
        for (let i = 0; i < coord.length; i++) {
            const d = coord[i] - center[i];
            s += d * d;
        }
        return Math.sqrt(s);
    }

    function maxCenterDist(dims) {
        const c = centerOf(dims);
        return distToCenter(dims.map((d) => d - 1), c) || 1;
    }

    /** Быстрая эвристика позиции с точки зрения чёрных (>0 лучше чёрным). */
    function evaluateQuick(board) {
        const S = getEngine().Stone;
        const center = centerOf(board.dims);
        const maxD = maxCenterDist(board.dims);
        let score = 0;
        let blackStones = 0;
        let whiteStones = 0;

        for (let i = 0; i < board.totalSize; i++) {
            const stone = board.grid[i];
            if (stone === S.EMPTY) continue;
            const coord = board.indexToCoord(i);
            const centrality = 1 - distToCenter(coord, center) / maxD;
            const lib = board.getLiberties(coord);
            const sign = stone === S.BLACK ? 1 : -1;
            if (stone === S.BLACK) blackStones++;
            else whiteStones++;

            score += sign * (1.0 + 0.15 * centrality);
            if (lib === 1) score -= sign * 2.5;      // atari
            else if (lib === 2) score -= sign * 0.6;
            else score += sign * Math.min(lib, 4) * 0.08;
        }

        score += (board.captures[S.BLACK] - board.captures[S.WHITE]) * 1.2;
        score -= board.komi * 0.15;
        // лёгкий бонус за материал
        score += (blackStones - whiteStones) * 0.2;
        return score;
    }

    /** Оценка хода до применения (для сортировки / greedy). */
    function scoreMoveCandidate(board, coord, player) {
        const S = getEngine().Stone;
        const opponent = player === S.BLACK ? S.WHITE : S.BLACK;
        const center = centerOf(board.dims);
        const maxD = maxCenterDist(board.dims);
        let score = (1 - distToCenter(coord, center) / maxD) * 0.8;

        const neighbors = board.getNeighbors(coord);
        let captureBonus = 0;
        let saveBonus = 0;
        let eyeish = 0;

        for (const n of neighbors) {
            const nIdx = board.coordToIndex(n);
            const stone = board.grid[nIdx];
            if (stone === S.EMPTY) {
                eyeish += 0.05;
            } else if (stone === opponent) {
                if (board.getLiberties(n) === 1) captureBonus += 4 + board.getGroup(n).length * 0.5;
                else if (board.getLiberties(n) === 2) captureBonus += 0.8;
            } else if (stone === player) {
                if (board.getLiberties(n) === 1) saveBonus += 3.5;
                else if (board.getLiberties(n) === 2) saveBonus += 0.7;
            }
        }

        score += captureBonus + saveBonus + eyeish;
        return score;
    }

    function listMoves(board, includePass) {
        const moves = board.getPossibleMoves().map((coord) => ({ type: 'move', coord }));
        if (includePass !== false) {
            moves.push({ type: 'pass' });
        }
        return moves;
    }

    /** Быстрый случайный легальный ход без полного скана доски. */
    function randomLegalAction(board) {
        const player = board.getCurrentPlayer();
        const empties = [];
        for (let i = 0; i < board.totalSize; i++) {
            if (board.grid[i] === getEngine().Stone.EMPTY) {
                empties.push(board.indexToCoord(i));
            }
        }
        // Перемешать частично
        const tries = Math.min(empties.length, 24);
        for (let t = 0; t < tries; t++) {
            const j = t + Math.floor(Math.random() * (empties.length - t));
            const tmp = empties[t];
            empties[t] = empties[j];
            empties[j] = tmp;
            const coord = empties[t];
            if (board.isLegalMove(coord, player)) {
                return { type: 'move', coord };
            }
        }
        return { type: 'pass' };
    }

    function applyAction(board, action) {
        if (action.type === 'pass') {
            board.pass();
            return true;
        }
        return board.makeMove(action.coord, board.getCurrentPlayer());
    }

    function actionKey(action) {
        if (action.type === 'pass') return 'pass';
        return action.coord.join(',');
    }

    function signedEval(board, forPlayer) {
        const S = getEngine().Stone;
        const v = evaluateQuick(board);
        return forPlayer === S.BLACK ? v : -v;
    }

    // ---------- Greedy ----------
    function findGreedy(board, strength) {
        const player = board.getCurrentPlayer();
        const moves = listMoves(board, true);
        if (moves.length === 0) return { type: 'pass' };

        const scored = [];
        for (const m of moves) {
            let s;
            if (m.type === 'pass') {
                s = -0.3 + (board.passCount === 1 ? 0.5 : 0); // второй пас чаще уместен
            } else {
                s = scoreMoveCandidate(board, m.coord, player);
            }
            // шум на низкой силе
            const noise = (6 - strength) * (Math.random() - 0.5) * 0.8;
            scored.push({ action: m, score: s + noise });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored[0].action;
    }

    // ---------- Shallow search ----------
    function findSearch(board, strength) {
        const depth = strength <= 2 ? 1 : 2;
        const topN = Math.min(8 + strength * 5, 40);
        const rootPlayer = board.getCurrentPlayer();
        const S = getEngine().Stone;

        let candidates = listMoves(board, true);
        // Сортировка эвристикой, beam
        candidates = candidates.map((m) => {
            const h = m.type === 'pass'
                ? -0.2
                : scoreMoveCandidate(board, m.coord, rootPlayer);
            return { action: m, h };
        }).sort((a, b) => b.h - a.h).slice(0, topN).map((x) => x.action);

        if (candidates.length === 0) return { type: 'pass' };

        let best = candidates[0];
        let bestScore = -Infinity;

        for (const action of candidates) {
            const b = board.clone();
            if (!applyAction(b, action)) continue;
            let score;
            if (b.isGameOver() || depth === 1) {
                score = signedEval(b, rootPlayer);
                if (b.isGameOver()) {
                    const sc = b.computeScore();
                    const diff = sc.black - sc.white;
                    score = rootPlayer === S.BLACK ? diff * 10 : -diff * 10;
                }
            } else {
                // один ответный полуход противника (жадный)
                const replies = listMoves(b, true)
                    .map((m) => ({
                        action: m,
                        h: m.type === 'pass' ? 0 : scoreMoveCandidate(b, m.coord, b.getCurrentPlayer())
                    }))
                    .sort((a, c) => c.h - a.h)
                    .slice(0, Math.max(6, topN >> 1));

                let worstForRoot = Infinity;
                if (replies.length === 0) {
                    worstForRoot = signedEval(b, rootPlayer);
                }
                for (const r of replies) {
                    const b2 = b.clone();
                    if (!applyAction(b2, r.action)) continue;
                    const ev = signedEval(b2, rootPlayer);
                    if (ev < worstForRoot) worstForRoot = ev;
                }
                score = worstForRoot === Infinity ? signedEval(b, rootPlayer) : worstForRoot;
            }

            // лёгкий prior
            score += (action.type === 'pass' ? -0.1 : scoreMoveCandidate(board, action.coord, rootPlayer) * 0.05);

            if (score > bestScore) {
                bestScore = score;
                best = action;
            }
        }

        return best;
    }

    // ---------- MCTS ----------
    function mctsPolicyMove(board) {
        // В playout — быстрый сэмпл, без полного getPossibleMoves
        if (Math.random() < 0.08) return { type: 'pass' };
        return randomLegalAction(board);
    }

    function playout(board, maxPlies) {
        let plies = 0;
        let consecutivePasses = board.passCount;
        while (!board.isGameOver() && plies < maxPlies) {
            const action = mctsPolicyMove(board);
            if (!applyAction(board, action)) {
                board.pass();
                consecutivePasses++;
            } else if (action.type === 'pass') {
                consecutivePasses++;
            } else {
                consecutivePasses = 0;
            }
            if (consecutivePasses >= 2) break;
            plies++;
        }
        if (!board.isGameOver()) {
            // приближённый счёт без полного подсчёта дамэ
            const S = getEngine().Stone;
            let score = 0;
            for (let i = 0; i < board.totalSize; i++) {
                if (board.grid[i] === S.BLACK) score++;
                else if (board.grid[i] === S.WHITE) score--;
            }
            score += (board.captures[S.BLACK] - board.captures[S.WHITE]) * 1.2;
            score -= board.komi * 0.15;
            return score;
        }
        const sc = board.computeScore();
        return sc.black - sc.white;
    }

    function findMcts(board, strength) {
        const S = getEngine().Stone;
        const rootPlayer = board.getCurrentPlayer();
        // Сила 1→40, 3→200, 5→500 симуляций (раньше было слишком много)
        const simulations = Math.min(20 + strength * strength * 20, 500);
        const maxPlayoutPlies = Math.min(30 + strength * 8, 60);
        const C = 1.35;

        const rootActions = listMoves(board, true);
        if (rootActions.length === 0) return { type: 'pass' };

        let actions = rootActions;
        if (actions.length > 40) {
            actions = actions
                .map((m) => ({
                    action: m,
                    h: m.type === 'pass' ? 0.1 : scoreMoveCandidate(board, m.coord, rootPlayer)
                }))
                .sort((a, b) => b.h - a.h)
                .slice(0, 36)
                .map((x) => x.action);
            if (!actions.some((a) => a.type === 'pass')) {
                actions.push({ type: 'pass' });
            }
        }

        const stats = actions.map((action) => ({
            action,
            visits: 0,
            wins: 0
        }));

        for (let sim = 0; sim < simulations; sim++) {
            let totalVisits = 0;
            for (const s of stats) totalVisits += s.visits;
            let bestIdx = 0;
            let bestUcb = -Infinity;
            for (let i = 0; i < stats.length; i++) {
                const s = stats[i];
                let ucb;
                if (s.visits === 0) ucb = 1e9 - i;
                else {
                    const mean = s.wins / s.visits;
                    ucb = mean + C * Math.sqrt(Math.log(totalVisits + 1) / s.visits);
                }
                if (ucb > bestUcb) {
                    bestUcb = ucb;
                    bestIdx = i;
                }
            }

            const node = stats[bestIdx];
            const b = board.clone();
            if (!applyAction(b, node.action)) {
                node.visits++;
                continue;
            }

            let diff;
            if (b.isGameOver()) {
                const sc = b.computeScore();
                diff = sc.black - sc.white;
            } else {
                diff = playout(b, maxPlayoutPlies);
            }

            const rootWon = rootPlayer === S.BLACK ? diff > 0 : diff < 0;
            const rootDraw = Math.abs(diff) < 0.01;
            node.visits++;
            node.wins += rootWon ? 1 : (rootDraw ? 0.5 : 0);
        }

        stats.sort((a, b) => b.visits - a.visits || b.wins - a.wins);
        return stats[0].action;
    }

    function findBestMove(board, options) {
        const opts = options || {};
        const algorithm = ALGORITHMS.includes(opts.algorithm) ? opts.algorithm : 'search';
        const strength = clampStrength(opts.strength !== undefined ? opts.strength : 3);

        if (board.isGameOver()) return null;

        let action;
        if (algorithm === 'greedy') action = findGreedy(board, strength);
        else if (algorithm === 'mcts') action = findMcts(board, strength);
        else action = findSearch(board, strength);

        if (!action) return { type: 'pass' };
        if (action.type === 'pass') return { type: 'pass' };
        return {
            type: 'move',
            coord: action.coord.slice(),
            x: action.coord[0],
            y: action.coord[1],
            z: action.coord[2]
        };
    }

    function serializeBoard(board) {
        return {
            dims: board.dims.slice(),
            komi: board.komi,
            grid: board.grid.slice(),
            captures: {
                [getEngine().Stone.BLACK]: board.captures[getEngine().Stone.BLACK],
                [getEngine().Stone.WHITE]: board.captures[getEngine().Stone.WHITE]
            },
            currentPlayer: board.currentPlayer,
            passCount: board.passCount,
            gameOver: board.gameOver,
            resigned: board.resigned,
            moveHistory: board.moveHistory.map((h) => h.toString()),
            hash: board.hash.toString(),
            zobristTable: board.zobristTable.map((cell) => ({
                0: '0',
                1: cell[1].toString(),
                2: cell[2].toString()
            }))
        };
    }

    function deserializeBoard(data) {
        const Engine = getEngine();
        const S = Engine.Stone;
        const board = Object.create(Engine.Board.prototype);
        board.dims = data.dims.slice();
        board.totalSize = data.dims.reduce((a, b) => a * b, 1);
        board.komi = data.komi;
        board.grid = data.grid.slice();
        board.captures = {
            [S.BLACK]: data.captures[S.BLACK] || data.captures['1'] || 0,
            [S.WHITE]: data.captures[S.WHITE] || data.captures['2'] || 0
        };
        board.currentPlayer = data.currentPlayer;
        board.passCount = data.passCount;
        board.gameOver = data.gameOver;
        board.resigned = data.resigned;
        board.hash = BigInt(data.hash);
        board.moveHistory = data.moveHistory.map((h) => BigInt(h));
        board.zobristTable = data.zobristTable.map((cell) => ({
            [S.EMPTY]: 0n,
            [S.BLACK]: BigInt(cell[1] || cell['1']),
            [S.WHITE]: BigInt(cell[2] || cell['2'])
        }));
        board.stateHistory = [];
        board.saveState();
        return board;
    }

    root.GoBotCore = {
        ALGORITHMS,
        findBestMove,
        evaluateQuick,
        clampStrength,
        serializeBoard,
        deserializeBoard,
        stoneName
    };
})(typeof self !== 'undefined' ? self : window);
