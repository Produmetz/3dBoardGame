// chess-bot-core.js — полная оценка + alpha-beta (QS, null-move, LMR, TT)
// Требует ChessEngine (main или worker).

(function (root) {
    function getEngine() {
        if (typeof ChessEngine !== 'undefined') return ChessEngine;
        if (root && root.ChessEngine) return root.ChessEngine;
        throw new Error('ChessEngine is not available');
    }

    const PIECE_VALUES = {
        Pawn: 1,
        Knight: 3,
        Bishop: 4,
        Triort: 3.5,
        Rook: 5.5,
        Queen: 12,
        King: 0
    };

    const PIECE_CODE = {
        Pawn: 1, Knight: 2, Bishop: 3, Triort: 4, Rook: 5, Queen: 6, King: 7
    };

    const MOBILITY_K = 0.12;
    const TEMPO_BONUS = 0.2;
    const MATE_SCORE = 10000;
    const GRID_X = 6;
    const GRID_Y = 6;
    const GRID_Z = 8;
    const NULL_MOVE_R = 2;
    const QUIESCE_MAX_PLY = 2;
    const MIN_DEPTH = 1;
    const MAX_DEPTH = 5;

    const CENTER_SQUARES = [];
    for (const x of [2, 3]) {
        for (const y of [2, 3]) {
            for (const z of [3, 4]) CENTER_SQUARES.push([x, y, z]);
        }
    }

    const MAX_MOBILITY = {
        Pawn: 10, Knight: 24, Bishop: 60, Triort: 48, Rook: 20, Queen: 128, King: 26
    };

    let defaultDepth = 2;
    let killers = [];
    let history = Object.create(null);
    let tt = new Map();
    let evalCache = new Map();
    const TT_MAX = 200000;
    const EVAL_CACHE_MAX = 80000;

    function sqKey(x, y, z) {
        return x + y * 6 + z * 36;
    }

    function moveKey(move) {
        return sqKey(move.from.x, move.from.y, move.from.z) * 288 +
            sqKey(move.to.x, move.to.y, move.to.z);
    }

    function boardHash(pole) {
        let h = 2166136261;
        for (let x = 0; x < GRID_X; x++) {
            for (let y = 0; y < GRID_Y; y++) {
                for (let z = 0; z < GRID_Z; z++) {
                    const p = pole[x][y][z];
                    if (!p) continue;
                    const v = (PIECE_CODE[p.Name] || 0) + (p.Color === 'White' ? 0 : 8);
                    h ^= (v + 1) * (sqKey(x, y, z) + 1) * 2654435761;
                    h = Math.imul(h ^ (h >>> 16), 2246822507);
                }
            }
        }
        return h >>> 0;
    }

    function resetSearchHeuristics() {
        killers = [];
        history = Object.create(null);
        tt.clear();
        evalCache.clear();
    }

    function centerBonus(x, y, z) {
        const dx = Math.min(Math.abs(x - 2.5), Math.abs(x - 1.5));
        const dy = Math.min(Math.abs(y - 2.5), Math.abs(y - 1.5));
        const dz = Math.min(Math.abs(z - 3.5), Math.abs(z - 2.5));
        return Math.max(0, 1 - (dx / 2.5 + dy / 2.5 + dz / 3.5) / 3);
    }

    function pstForPiece(pieceType, x, y, z, color) {
        const base = centerBonus(x, y, z);
        if (pieceType === 'Pawn') {
            const progress = color === 'White' ? z / 7.0 : (7 - z) / 7.0;
            return 0.3 * base + 0.4 * progress;
        }
        if (pieceType === 'Knight') return 0.4 * base + 0.1 * (1 - Math.abs(z - 3.5) / 3.5);
        if (pieceType === 'Bishop') return 0.35 * base;
        if (pieceType === 'Triort') return 0.5 * base;
        if (pieceType === 'Rook') return 0.15 * base;
        if (pieceType === 'Queen') return 0.3 * base;
        if (pieceType === 'King') return -0.15 * base;
        return 0;
    }

    function pawnStructureScore(whitePawns, blackPawns) {
        let score = 0;
        for (let i = 0; i < whitePawns.length; i++) {
            const [x, y, z] = whitePawns[i];
            score += 0.1 * z;
            let blocked = false;
            for (let j = 0; j < blackPawns.length; j++) {
                const [px, py, pz] = blackPawns[j];
                if (px === x && py === y && pz > z) { blocked = true; break; }
            }
            if (!blocked) score += 0.3 * (z / 7.0);
        }
        for (let i = 0; i < blackPawns.length; i++) {
            const [x, y, z] = blackPawns[i];
            score -= 0.1 * (7 - z);
            let blocked = false;
            for (let j = 0; j < whitePawns.length; j++) {
                const [px, py, pz] = whitePawns[j];
                if (px === x && py === y && pz < z) { blocked = true; break; }
            }
            if (!blocked) score -= 0.3 * ((7 - z) / 7.0);
        }
        return score;
    }

    function kingSafetyPenalty(kingPos, color, whiteAttacks, blackAttacks, ownPawnsNear) {
        if (!kingPos) return 0;
        const [kx, ky, kz] = kingPos;
        let penalty = Math.max(0, 3 - ownPawnsNear) * 0.2;
        const enemyAttacks = color === 'White' ? blackAttacks : whiteAttacks;
        let attackedAround = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const nx = kx + dx, ny = ky + dy, nz = kz + dz;
                    if (nx < 0 || nx >= GRID_X || ny < 0 || ny >= GRID_Y || nz < 0 || nz >= GRID_Z) continue;
                    if (enemyAttacks.has(sqKey(nx, ny, nz))) attackedAround++;
                }
            }
        }
        return penalty + attackedAround * 0.12;
    }

    /**
     * @param {boolean} full — подвижность + контроль центра через MaybeMoves
     */
    function evaluate(pole, sideToMove, full) {
        if (full === undefined) full = true;

        const hash = boardHash(pole) ^ (sideToMove === 'White' ? 1 : 2) ^ (full ? 4 : 0);
        if (evalCache.has(hash)) return evalCache.get(hash);

        let score = 0;
        const whitePawns = [];
        const blackPawns = [];
        let whiteKingPos = null;
        let blackKingPos = null;
        const whiteAttacks = full ? new Set() : null;
        const blackAttacks = full ? new Set() : null;
        const engine = full ? getEngine() : null;

        for (let x = 0; x < GRID_X; x++) {
            for (let y = 0; y < GRID_Y; y++) {
                for (let z = 0; z < GRID_Z; z++) {
                    const piece = pole[x][y][z];
                    if (!piece) continue;

                    const sign = piece.Color === 'White' ? 1 : -1;
                    const ptype = piece.Name;
                    const mat = PIECE_VALUES[ptype];
                    if (mat !== undefined) score += sign * mat;
                    score += sign * pstForPiece(ptype, x, y, z, piece.Color);

                    if (ptype === 'Pawn') {
                        if (piece.Color === 'White') whitePawns.push([x, y, z]);
                        else blackPawns.push([x, y, z]);
                    } else if (ptype === 'King') {
                        if (piece.Color === 'White') whiteKingPos = [x, y, z];
                        else blackKingPos = [x, y, z];
                    }

                    if (full) {
                        const moves = engine.MaybeMoves(x, y, z, pole);
                        const maxM = MAX_MOBILITY[ptype] || 1;
                        const baseVal = mat !== undefined && mat > 0 ? mat : 0.5;
                        const mobilityBonus = MOBILITY_K * baseVal * (moves.length / maxM);
                        score += sign * mobilityBonus * (ptype === 'King' ? 0.3 : 1);
                        const attackSet = piece.Color === 'White' ? whiteAttacks : blackAttacks;
                        for (let i = 0; i < moves.length; i++) {
                            attackSet.add(sqKey(moves[i][0], moves[i][1], moves[i][2]));
                        }
                    }
                }
            }
        }

        score += pawnStructureScore(whitePawns, blackPawns);

        let whitePawnsNear = 0;
        let blackPawnsNear = 0;
        if (whiteKingPos) {
            const [kx, ky, kz] = whiteKingPos;
            for (let i = 0; i < whitePawns.length; i++) {
                const [px, py, pz] = whitePawns[i];
                if (Math.abs(px - kx) <= 1 && Math.abs(py - ky) <= 1 && Math.abs(pz - kz) <= 1) whitePawnsNear++;
            }
        }
        if (blackKingPos) {
            const [kx, ky, kz] = blackKingPos;
            for (let i = 0; i < blackPawns.length; i++) {
                const [px, py, pz] = blackPawns[i];
                if (Math.abs(px - kx) <= 1 && Math.abs(py - ky) <= 1 && Math.abs(pz - kz) <= 1) blackPawnsNear++;
            }
        }

        if (full) {
            score -= kingSafetyPenalty(whiteKingPos, 'White', whiteAttacks, blackAttacks, whitePawnsNear);
            score += kingSafetyPenalty(blackKingPos, 'Black', whiteAttacks, blackAttacks, blackPawnsNear);

            let whiteCenter = 0;
            let blackCenter = 0;
            for (let i = 0; i < CENTER_SQUARES.length; i++) {
                const [cx, cy, cz] = CENTER_SQUARES[i];
                const key = sqKey(cx, cy, cz);
                if (whiteAttacks.has(key)) whiteCenter++;
                if (blackAttacks.has(key)) blackCenter++;
                const occ = pole[cx][cy][cz];
                if (occ) {
                    if (occ.Color === 'White') whiteCenter += 0.5;
                    else blackCenter += 0.5;
                }
            }
            score += 0.2 * (whiteCenter - blackCenter);
        } else {
            // Упрощённая безопасность короля без карт атак
            score -= Math.max(0, 3 - whitePawnsNear) * 0.2;
            score += Math.max(0, 3 - blackPawnsNear) * 0.2;
        }

        if (sideToMove === 'White') score += TEMPO_BONUS;
        else score -= TEMPO_BONUS;

        if (evalCache.size > EVAL_CACHE_MAX) evalCache.clear();
        evalCache.set(hash, score);
        return score;
    }

    function opposite(color) {
        return color === 'White' ? 'Black' : 'White';
    }

    /** Быстрая проверка шаха: только фигуры противника */
    function isInCheck(pole, color) {
        let kx = -1, ky = -1, kz = -1;
        for (let x = 0; x < GRID_X; x++) {
            for (let y = 0; y < GRID_Y; y++) {
                for (let z = 0; z < GRID_Z; z++) {
                    const p = pole[x][y][z];
                    if (p && p.Name === 'King' && p.Color === color) {
                        kx = x; ky = y; kz = z;
                    }
                }
            }
        }
        if (kx < 0) return false;

        const engine = getEngine();
        const enemy = opposite(color);
        for (let x = 0; x < GRID_X; x++) {
            for (let y = 0; y < GRID_Y; y++) {
                for (let z = 0; z < GRID_Z; z++) {
                    const p = pole[x][y][z];
                    if (!p || p.Color !== enemy) continue;
                    const moves = engine.MaybeMoves(x, y, z, pole);
                    for (let i = 0; i < moves.length; i++) {
                        if (moves[i][0] === kx && moves[i][1] === ky && moves[i][2] === kz) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    function makeMove(pole, move) {
        const captured = pole[move.to.x][move.to.y][move.to.z];
        pole[move.to.x][move.to.y][move.to.z] = pole[move.from.x][move.from.y][move.from.z];
        pole[move.from.x][move.from.y][move.from.z] = null;
        return captured;
    }

    function unmakeMove(pole, move, captured) {
        pole[move.from.x][move.from.y][move.from.z] = pole[move.to.x][move.to.y][move.to.z];
        pole[move.to.x][move.to.y][move.to.z] = captured;
    }

    function clonePole(pole) {
        return getEngine().CreateNextPole(pole);
    }

    function collectMoves(pole, color, capturesOnly) {
        const engine = getEngine();
        const moves = [];
        for (let x = 0; x < GRID_X; x++) {
            for (let y = 0; y < GRID_Y; y++) {
                for (let z = 0; z < GRID_Z; z++) {
                    const piece = pole[x][y][z];
                    if (!piece || piece.Color !== color) continue;
                    const targets = engine.MaybeMoves(x, y, z, pole);
                    for (let i = 0; i < targets.length; i++) {
                        const t = targets[i];
                        const captured = pole[t[0]][t[1]][t[2]];
                        if (capturesOnly && !captured) continue;

                        const attackerValue = PIECE_VALUES[piece.Name] || 0;
                        const captureValue = captured ? (PIECE_VALUES[captured.Name] || 0) : 0;
                        moves.push({
                            from: { x, y, z },
                            to: { x: t[0], y: t[1], z: t[2] },
                            captureValue,
                            attackerValue,
                            orderScore: captureValue > 0
                                ? captureValue * 100 - attackerValue
                                : 0
                        });
                    }
                }
            }
        }
        return moves;
    }

    function orderMoves(moves, ply) {
        const k0 = killers[ply] && killers[ply][0];
        const k1 = killers[ply] && killers[ply][1];
        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            let score = m.orderScore;
            if (k0 && m.from.x === k0.from.x && m.from.y === k0.from.y && m.from.z === k0.from.z &&
                m.to.x === k0.to.x && m.to.y === k0.to.y && m.to.z === k0.to.z) score += 90;
            else if (k1 && m.from.x === k1.from.x && m.from.y === k1.from.y && m.from.z === k1.from.z &&
                m.to.x === k1.to.x && m.to.y === k1.to.y && m.to.z === k1.to.z) score += 80;
            const hk = history[moveKey(m)];
            if (hk) score += Math.min(hk, 70);
            m.orderScore = score;
        }
        moves.sort((a, b) => b.orderScore - a.orderScore);
    }

    function storeKiller(move, ply) {
        if (move.captureValue > 0) return;
        if (!killers[ply]) killers[ply] = [null, null];
        const k = killers[ply];
        if (k[0] && k[0].from.x === move.from.x && k[0].to.x === move.to.x &&
            k[0].from.y === move.from.y && k[0].to.y === move.to.y &&
            k[0].from.z === move.from.z && k[0].to.z === move.to.z) return;
        k[1] = k[0];
        k[0] = { from: move.from, to: move.to };
    }

    function bumpHistory(move, depth) {
        if (move.captureValue > 0) return;
        const key = moveKey(move);
        history[key] = (history[key] || 0) + depth * depth;
    }

    function hasNonPawnMaterial(pole, color) {
        for (let x = 0; x < GRID_X; x++) {
            for (let y = 0; y < GRID_Y; y++) {
                for (let z = 0; z < GRID_Z; z++) {
                    const p = pole[x][y][z];
                    if (p && p.Color === color && p.Name !== 'Pawn' && p.Name !== 'King') return true;
                }
            }
        }
        return false;
    }

    function quiescence(pole, alpha, beta, sideToMove, qDepth) {
        // На тихой позиции — полная оценка
        if (qDepth <= 0) {
            return evaluate(pole, sideToMove, true);
        }

        const standPatFast = evaluate(pole, sideToMove, false);

        if (sideToMove === 'White') {
            if (standPatFast >= beta) return beta;
            if (standPatFast > alpha) alpha = standPatFast;
        } else {
            if (standPatFast <= alpha) return alpha;
            if (standPatFast < beta) beta = standPatFast;
        }

        const moves = collectMoves(pole, sideToMove, true);
        if (moves.length === 0) {
            return evaluate(pole, sideToMove, true);
        }
        orderMoves(moves, 0);

        if (sideToMove === 'White') {
            for (let i = 0; i < moves.length; i++) {
                if (standPatFast + moves[i].captureValue + 1.5 < alpha) continue;
                const cap = makeMove(pole, moves[i]);
                if (isInCheck(pole, sideToMove)) {
                    unmakeMove(pole, moves[i], cap);
                    continue;
                }
                const score = quiescence(pole, alpha, beta, 'Black', qDepth - 1);
                unmakeMove(pole, moves[i], cap);
                if (score >= beta) return beta;
                if (score > alpha) alpha = score;
            }
            return alpha;
        }

        for (let i = 0; i < moves.length; i++) {
            if (standPatFast - moves[i].captureValue - 1.5 > beta) continue;
            const cap = makeMove(pole, moves[i]);
            if (isInCheck(pole, sideToMove)) {
                unmakeMove(pole, moves[i], cap);
                continue;
            }
            const score = quiescence(pole, alpha, beta, 'White', qDepth - 1);
            unmakeMove(pole, moves[i], cap);
            if (score <= alpha) return alpha;
            if (score < beta) beta = score;
        }
        return beta;
    }

    function alphabeta(pole, depth, alpha, beta, sideToMove, ply, allowNull) {
        const alphaOrig = alpha;
        const betaOrig = beta;
        const hash = boardHash(pole) ^ (sideToMove === 'White' ? 0x9e3779b9 : 0x7f4a7c15) ^ (depth * 0x85ebca6b);

        const probed = tt.get(hash);
        if (probed && probed.depth >= depth) {
            if (probed.flag === 0) return probed.score;
            if (probed.flag === 1) alpha = Math.max(alpha, probed.score);
            if (probed.flag === -1) beta = Math.min(beta, probed.score);
            if (alpha >= beta) return probed.score;
        }

        if (depth <= 0) {
            return quiescence(pole, alpha, beta, sideToMove, QUIESCE_MAX_PLY);
        }

        const inCheck = isInCheck(pole, sideToMove);
        const staticEval = evaluate(pole, sideToMove, false);

        // Reverse futility pruning
        if (!inCheck && depth <= 2) {
            const margin = 1.2 * depth;
            if (sideToMove === 'White' && staticEval - margin >= beta) return staticEval - margin;
            if (sideToMove === 'Black' && staticEval + margin <= alpha) return staticEval + margin;
        }

        // Razoring
        if (!inCheck && depth === 1) {
            const razor = 1.8;
            if (sideToMove === 'White' && staticEval + razor <= alpha) {
                return quiescence(pole, alpha, beta, sideToMove, QUIESCE_MAX_PLY);
            }
            if (sideToMove === 'Black' && staticEval - razor >= beta) {
                return quiescence(pole, alpha, beta, sideToMove, QUIESCE_MAX_PLY);
            }
        }

        if (allowNull && !inCheck && depth >= 3 && hasNonPawnMaterial(pole, sideToMove)) {
            const nullScore = alphabeta(
                pole, depth - 1 - NULL_MOVE_R, alpha, beta,
                opposite(sideToMove), ply + 1, false
            );
            if (sideToMove === 'White' && nullScore >= beta) return beta;
            if (sideToMove === 'Black' && nullScore <= alpha) return alpha;
        }

        const moves = collectMoves(pole, sideToMove, false);
        orderMoves(moves, ply);

        if (moves.length === 0) {
            if (inCheck) return sideToMove === 'White' ? -MATE_SCORE + ply : MATE_SCORE - ply;
            return 0;
        }

        // Ограничение ширины дерева (beam) на внутренних узлах
        const maxMoves = inCheck ? moves.length
            : (ply === 0 ? moves.length
                : depth >= 3 ? Math.min(moves.length, 16)
                    : depth === 2 ? Math.min(moves.length, 20)
                        : Math.min(moves.length, 24));

        let bestScore = sideToMove === 'White' ? -Infinity : Infinity;
        let bestMove = null;
        let searched = 0;
        let legalCount = 0;

        for (let i = 0; i < moves.length; i++) {
            if (!inCheck && searched >= maxMoves) break;

            const move = moves[i];
            const isCapture = move.captureValue > 0;
            const canLMR = !inCheck && !isCapture && searched >= 3 && depth >= 3;

            const cap = makeMove(pole, move);
            if (isInCheck(pole, sideToMove)) {
                unmakeMove(pole, move, cap);
                continue;
            }
            legalCount++;

            let score;
            if (canLMR) {
                score = alphabeta(pole, depth - 2, alpha, beta, opposite(sideToMove), ply + 1, true);
                const needResearch = sideToMove === 'White' ? score > alpha : score < beta;
                if (needResearch) {
                    score = alphabeta(pole, depth - 1, alpha, beta, opposite(sideToMove), ply + 1, true);
                }
            } else {
                score = alphabeta(pole, depth - 1, alpha, beta, opposite(sideToMove), ply + 1, true);
            }
            unmakeMove(pole, move, cap);
            searched++;

            if (sideToMove === 'White') {
                if (score > bestScore) { bestScore = score; bestMove = move; }
                if (score > alpha) {
                    alpha = score;
                    bumpHistory(move, depth);
                }
                if (beta <= alpha) {
                    storeKiller(move, ply);
                    break;
                }
            } else {
                if (score < bestScore) { bestScore = score; bestMove = move; }
                if (score < beta) {
                    beta = score;
                    bumpHistory(move, depth);
                }
                if (beta <= alpha) {
                    storeKiller(move, ply);
                    break;
                }
            }
        }

        if (legalCount === 0) {
            if (inCheck) return sideToMove === 'White' ? -MATE_SCORE + ply : MATE_SCORE - ply;
            return 0;
        }

        let flag = 0;
        if (bestScore <= alphaOrig) flag = -1;
        else if (bestScore >= betaOrig) flag = 1;
        if (tt.size > TT_MAX) tt.clear();
        tt.set(hash, { depth, score: bestScore, flag, move: bestMove });

        return bestScore;
    }

    function clampDepth(n) {
        const d = parseInt(n, 10);
        if (isNaN(d)) return 2;
        return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, d));
    }

    function setDepth(n) {
        defaultDepth = clampDepth(n);
        return defaultDepth;
    }

    function getDepth() {
        return defaultDepth;
    }

    function findBestMove(pole, color, depth) {
        const searchDepth = clampDepth(depth !== undefined ? depth : defaultDepth);
        resetSearchHeuristics();

        // Рабочая копия — make/unmake не трогает исходную доску
        const work = clonePole(pole);
        const moves = collectMoves(work, color, false);
        if (moves.length === 0) return null;
        orderMoves(moves, 0);

        let bestMove = moves[0];
        let bestScore = color === 'White' ? -Infinity : Infinity;

        for (let d = 1; d <= searchDepth; d++) {
            let iterBest = bestMove;
            let iterScore = color === 'White' ? -Infinity : Infinity;

            // PV предыдущей итерации в начало
            const bi = moves.findIndex(m =>
                m.from.x === bestMove.from.x && m.from.y === bestMove.from.y && m.from.z === bestMove.from.z &&
                m.to.x === bestMove.to.x && m.to.y === bestMove.to.y && m.to.z === bestMove.to.z
            );
            if (bi > 0) {
                const [bm] = moves.splice(bi, 1);
                moves.unshift(bm);
            }

            let alpha = -Infinity;
            let beta = Infinity;

            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                const cap = makeMove(work, move);
                if (isInCheck(work, color)) {
                    unmakeMove(work, move, cap);
                    continue;
                }
                const score = alphabeta(work, d - 1, alpha, beta, opposite(color), 1, true);
                unmakeMove(work, move, cap);

                if (color === 'White') {
                    if (score > iterScore) { iterScore = score; iterBest = move; }
                    if (score > alpha) alpha = score;
                } else {
                    if (score < iterScore) { iterScore = score; iterBest = move; }
                    if (score < beta) beta = score;
                }
            }

            if (iterBest) {
                bestMove = iterBest;
                bestScore = iterScore;
            }
        }

        return {
            from: { x: bestMove.from.x, y: bestMove.from.y, z: bestMove.from.z },
            to: { x: bestMove.to.x, y: bestMove.to.y, z: bestMove.to.z },
            score: bestScore
        };
    }

    root.ChessBotCore = {
        evaluate: function (pole, side) { return evaluate(pole, side, true); },
        findBestMove,
        setDepth,
        getDepth,
        clampDepth,
        MIN_DEPTH,
        MAX_DEPTH,
        PIECE_VALUES,
        serializeBoard: function (pole) {
            const flat = [];
            for (let x = 0; x < GRID_X; x++) {
                for (let y = 0; y < GRID_Y; y++) {
                    for (let z = 0; z < GRID_Z; z++) {
                        const p = pole[x][y][z];
                        flat.push(p ? { Name: p.Name, Color: p.Color } : null);
                    }
                }
            }
            return flat;
        },
        deserializeBoard: function (flat) {
            const engine = getEngine();
            const pole = [];
            let i = 0;
            for (let x = 0; x < GRID_X; x++) {
                pole[x] = [];
                for (let y = 0; y < GRID_Y; y++) {
                    pole[x][y] = [];
                    for (let z = 0; z < GRID_Z; z++) {
                        const cell = flat[i++];
                        if (!cell) pole[x][y][z] = null;
                        else {
                            const Ctor = engine[cell.Color + cell.Name];
                            pole[x][y][z] = Ctor ? new Ctor() : null;
                        }
                    }
                }
            }
            return pole;
        }
    };
})(typeof self !== 'undefined' ? self : window);
