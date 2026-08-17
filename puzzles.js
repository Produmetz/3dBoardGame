/**
 * Общий пул тактических задач — единый источник и для шахматных, и для
 * Go-задач (chess/puzzles.js / go/puzzles.js оба используют этот модуль).
 *
 * Сейчас getPuzzle() берёт позиции из локального массива (window.ChessPuzzles /
 * window.GoPuzzles, каждый — в своём puzzle-data.js), просто чтобы в
 * интерфейсе и коде было где решать задачи. Как только на сервере появится
 * эндпоинт, отдающий задачи (скорее всего сгенерированные, а не руками
 * составленные, как этот стартовый набор) — меняется ТОЛЬКО тело getPuzzle
 * на fetch-запрос к серверу; вызывающий код (puzzles.js на обеих страницах)
 * уже await'ит этот вызов, так что переделывать вызывающие места не придётся.
 *
 * Рейтинг задач — локальный, хранится в localStorage отдельно для шахмат и
 * Go (это заглушка на клиенте, а не серверный рейтинг: как только появится
 * сервер-источник задач, разумно перенести рейтинг туда же, чтобы он не
 * терялся при смене браузера/устройства).
 */
const PuzzlePool = {
  _ratingKey(gameType) {
    return `puzzleRating_${gameType}`;
  },

  getRating(gameType) {
    const raw = localStorage.getItem(this._ratingKey(gameType));
    const n = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(n) ? n : 1500;
  },

  setRating(gameType, rating) {
    localStorage.setItem(this._ratingKey(gameType), String(Math.round(rating)));
  },

  /**
   * Обновляет локальный рейтинг по итогу решения задачи — только в режиме
   * "на рейтинг" (в режиме "без рейтинга" это чистая тренировка, рейтинг не
   * трогаем). Простая Эло-подобная формула: задача и решающий рассматриваются
   * как два "игрока", solvedCleanly=false (была хотя бы одна ошибочная
   * попытка) считается поражением, даже если задача в итоге решена.
   */
  recordResult(gameType, mode, puzzleRating, solvedCleanly) {
    const current = this.getRating(gameType);
    if (mode !== 'rated') return current;

    const K = 32;
    const expected = 1 / (1 + Math.pow(10, (puzzleRating - current) / 400));
    const actual = solvedCleanly ? 1 : 0;
    const next = current + K * (actual - expected);
    this.setRating(gameType, next);
    return next;
  },

  /**
   * @param {'chess'|'go'} gameType
   * @param {string[]} excludeIds - задачи, уже показанные в этой сессии решения
   *   (чтобы не повторять один и тот же пример подряд, пока пул маленький)
   */
  async getPuzzle(gameType, excludeIds) {
    const pool = gameType === 'chess' ? (window.ChessPuzzles || []) : (window.GoPuzzles || []);
    if (!pool.length) return null;

    const exclude = excludeIds || [];
    const candidates = pool.filter((p) => !exclude.includes(p.id));
    const list = candidates.length ? candidates : pool;
    return list[Math.floor(Math.random() * list.length)];
  }
};
