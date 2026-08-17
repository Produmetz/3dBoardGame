/**
 * Персистентность настроек отображения — общая для ВСЕХ страниц одной игры.
 *
 * Раньше цвета/текстуры жили только в оперативной памяти конкретной
 * страницы: chess.html, figures-tutorial.html, position-editor.html и
 * puzzles.html каждая создают свой ColorManager/TextureManager с нуля при
 * загрузке (у каждой свой <script src="graphics.js">, это разные запуски
 * скрипта, не общее состояние) — поменяв цвет на одной странице, на всех
 * остальных при переходе снова видишь дефолт. Это и есть тот самый "меняется
 * только в одном месте".
 *
 * Здесь — просто персистентный слой поверх localStorage, ключ на игру
 * (шахматы и Го хранятся раздельно, как и должно — у них может быть разное
 * оформление), который graphics.js/graphics-go.js читают при загрузке и
 * пишут при каждом изменении. Как только один и тот же браузер открывает
 * любую страницу той же игры — читается тот же ключ, эффект универсальный
 * в рамках игры, но не смешивается между шахматами и Го.
 */
const AppearanceStore = {
  _key(gameType) {
    return `appearance_${gameType}`;
  },

  save(gameType, data) {
    try {
      localStorage.setItem(this._key(gameType), JSON.stringify(data));
    } catch (e) {
      // localStorage недоступен (приватный режим, квота) — не критично,
      // просто эта смена цвета не переживёт переход на другую страницу.
    }
  },

  load(gameType) {
    try {
      const raw = localStorage.getItem(this._key(gameType));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
};
