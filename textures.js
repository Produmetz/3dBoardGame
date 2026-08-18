/**
 * Общая библиотека текстур для фона и фигур — используется и шахматами, и
 * Го (chess/graphics.js, go/graphics-go.js).
 *
 * Материалы (мрамор/дерево/металл/кожа/ткань/гранит) — настоящие фото CC0
 * с Poly Haven (см. textures/CREDITS.txt), а не нарисованные на canvas
 * узоры: первая версия рисовала их процедурно и выглядела заметно "картонно"
 * на глаз пользователя. Звёздное небо/градиент/сетка остались процедурными —
 * это не материалы, а абстрактные фоны, рисовать их проще, чем искать фото.
 * Плюс поддержка своей картинки (fromFile) — грузится через FileReader и
 * THREE.TextureLoader, как и фото-пресеты.
 *
 * Текстуры для фигур намеренно нейтральные/малонасыщенные: MeshPhongMaterial
 * умножает map на material.color, так что один и тот же узор, тонированный
 * белым/чёрным цветом фигур (уже существующие пикеры), даёт два разных на
 * вид материала без отдельной текстуры на каждый цвет.
 */
const TextureLibrary = {
  _cache: new Map(),

  // Вызывается графикой (chess/graphics.js, go/graphics-go.js) сразу после
  // загрузки — фото грузятся асинхронно (в отличие от canvas-узоров, готовых
  // сразу), а .repeat/.offset для фона (applyBackgroundFit) считаются по
  // реальным размерам картинки, которых при первом применении ещё нет.
  onPhotoLoaded: null,

  _canvas(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  },

  _photo(url) {
    const tex = new THREE.TextureLoader().load(url, () => {
      if (typeof TextureLibrary.onPhotoLoaded === 'function') TextureLibrary.onPhotoLoaded(tex);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  // Путь на уровень вверх от корня сайта — все 8 страниц, использующих
  // textures.js, лежат в chess/ или go/ (см. <script src="../textures.js">
  // в их разметке), так что textures/ рядом с самой textures.js всегда
  // "../textures/..." отсюда. Плоский относительный 'textures/marble.jpg'
  // резолвился бы от текущей страницы и ушёл бы в chess/textures/... (404) -
  // так и было при первой проверке.
  marble() { return this._photo('../textures/marble.jpg'); },
  wood() { return this._photo('../textures/wood.jpg'); },
  metal() { return this._photo('../textures/metal.jpg'); },
  leather() { return this._photo('../textures/leather.jpg'); },
  granite() { return this._photo('../textures/granite.jpg'); },
  fabric() { return this._photo('../textures/fabric.jpg'); },

  starfield(size = 1536) {
    return this._canvas(size, (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#050814');
      grad.addColorStop(1, '#0a1a2f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      const stars = Math.round(400 * (s / 512));
      for (let i = 0; i < stars; i++) {
        const x = Math.random() * s, y = Math.random() * s, r = Math.random() * 1.4 * (s / 512);
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    });
  },

  gradientSky(size = 1536) {
    return this._canvas(size, (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#1e3c72');
      grad.addColorStop(1, '#eaf6ff');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    });
  },

  grid(size = 1024) {
    return this._canvas(size, (ctx, s) => {
      ctx.fillStyle = '#0a192f';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(76,201,240,0.35)';
      ctx.lineWidth = s / 256;
      for (let i = 0; i <= s; i += s / 8) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
      }
    });
  },

  // Пресеты, доступные в выпадающих списках (ключ -> подпись). Одни и те же
  // текстуры предлагаются и для фона, и для фигур — разница только в
  // масштабе (см. текст выше про тонирование) и в repeat/offset (см. _bgTileCount).
  figurePresets: { marble: 'Мрамор', wood: 'Дерево', metal: 'Металл', leather: 'Кожа', fabric: 'Ткань' },
  backgroundPresets: { starfield: 'Звёздное небо', gradientSky: 'Градиент', grid: 'Сетка', marble: 'Мрамор', wood: 'Дерево', granite: 'Гранит' },

  // Материалы мостятся плиткой на фоне — иначе одна фотография, растянутая
  // на весь (не квадратный) экран, теряется в размытии. Число повторов по
  // короткой стороне экрана задаётся здесь — для настоящих фото (уже
  // достаточно детальных самих по себе) держим его ниже, чем для
  // процедурной "Сетки" (которой, наоборот, нужно больше повторов тонких
  // линий, иначе она выглядит пусто). Фактический repeat.x/y с поправкой на
  // соотношение сторон окна (чтобы плитки оставались квадратными, а не
  // эллипсами) считает applyBackgroundFit() в graphics.js — тут этого
  // сделать нельзя, это единственное место, которое знает текущий размер
  // окна и следит за resize.
  _bgTileCount: { marble: 2, wood: 2, granite: 2, grid: 4 },

  /**
   * Возвращает (и кэширует) текстуру пресета. kind — 'figure' или 'background':
   * одна и та же текстура нужна по-разному настроенной (.repeat/.offset) в
   * этих двух контекстах (фигура — маленький объект, фон — весь экран),
   * поэтому кэш отдельный на каждую комбинацию имя+назначение, а не общий на
   * одно только имя.
   */
  get(name, kind) {
    if (!this[name]) return null;
    const cacheKey = `${kind || 'figure'}:${name}`;
    if (!this._cache.has(cacheKey)) {
      const tex = this[name]();
      // Texture.userData не инициализируется конструктором в этой версии
      // three.js (в отличие от Object3D) — создаём сами перед первым использованием.
      tex.userData = tex.userData || {};
      if (kind === 'background' && this._bgTileCount[name]) {
        tex.userData.bgTileCount = this._bgTileCount[name];
      }
      this._cache.set(cacheKey, tex);
    }
    return this._cache.get(cacheKey);
  },

  /** Грузит пользовательское изображение как THREE.Texture. Не кэшируется — вызывающий код сам держит ссылку. */
  fromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        new THREE.TextureLoader().load(
          e.target.result,
          (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
          },
          undefined,
          reject
        );
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};
