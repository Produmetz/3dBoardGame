/**
 * Общая библиотека процедурных текстур для фона и фигур — используется и
 * шахматами, и Го (chess/graphics.js, go/graphics-go.js). В проекте нет
 * файлов-картинок, поэтому "стандартный набор" — это узоры, рисуемые на
 * canvas и оборачиваемые в THREE.CanvasTexture, а не готовые изображения.
 * Плюс поддержка своей картинки (fromFile) — грузится через FileReader и
 * THREE.TextureLoader.
 *
 * Текстуры для фигур намеренно нейтральные/малонасыщенные: MeshPhongMaterial
 * умножает map на material.color, так что один и тот же узор, тонированный
 * белым/чёрным цветом фигур (уже существующие пикеры), даёт два разных на
 * вид материала без отдельной текстуры на каждый цвет.
 */
const TextureLibrary = {
  _cache: new Map(),

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

  // Разрешения подобраны так, чтобы фон (растягивается на весь экран через
  // scene.background) не размывался при апскейле GPU на больших/hi-DPI
  // мониторах — раньше 256-512px были заметно "мыльными" на весь экран.
  // Число штрихов/звёзд масштабируется вместе с размером холста, иначе
  // более крупный холст просто растянул бы то же количество деталей на
  // большую пустую площадь, а не стал бы выглядеть детальнее.
  marble(size = 1024) {
    return this._canvas(size, (ctx, s) => {
      ctx.fillStyle = '#e8e4da';
      ctx.fillRect(0, 0, s, s);
      const strokes = Math.round(14 * (s / 256));
      for (let i = 0; i < strokes; i++) {
        ctx.strokeStyle = `rgba(120,120,110,${0.25 + Math.random() * 0.3})`;
        ctx.lineWidth = (1 + Math.random() * 2) * (s / 256);
        ctx.beginPath();
        let x = Math.random() * s;
        ctx.moveTo(x, 0);
        for (let y = 0; y <= s; y += s / 10) {
          x += (Math.random() - 0.5) * 40 * (s / 256);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
  },

  wood(size = 1024) {
    return this._canvas(size, (ctx, s) => {
      ctx.fillStyle = '#b5834a';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 20; i++) {
        ctx.strokeStyle = `rgba(90,55,20,${0.15 + Math.random() * 0.2})`;
        ctx.lineWidth = (2 + Math.random() * 4) * (s / 256);
        ctx.beginPath();
        const yBase = (i / 20) * s + (Math.random() - 0.5) * 10 * (s / 256);
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= s; x += 16) {
          ctx.lineTo(x, yBase + Math.sin(x / 20 + i) * 6 * (s / 256));
        }
        ctx.stroke();
      }
    });
  },

  metal(size = 512) {
    return this._canvas(size, (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#d7dce0');
      grad.addColorStop(0.5, '#9099a1');
      grad.addColorStop(1, '#d7dce0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      const img = ctx.getImageData(0, 0, s, s);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 25;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
    });
  },

  fabric(size = 512) {
    return this._canvas(size, (ctx, s) => {
      ctx.fillStyle = '#555b66';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      const step = Math.max(2, s / 64);
      for (let i = 0; i < s; i += step) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
      }
    });
  },

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
  // генераторы предлагаются и для фона, и для фигур — разница только в
  // масштабе (см. текст выше про тонирование).
  figurePresets: { marble: 'Мрамор', wood: 'Дерево', metal: 'Металл', fabric: 'Ткань' },
  backgroundPresets: { starfield: 'Звёздное небо', gradientSky: 'Градиент', grid: 'Сетка', marble: 'Мрамор', wood: 'Дерево' },

  // На фоне (scene.background) текстура растягивается на весь экран одним
  // куском без повторов — для узоров-"материалов" (не атмосферных градиентов/
  // звёзд) это выглядело как один смазанный блин. Проще замостить её плиткой,
  // чем без конца поднимать разрешение холста.
  _tileableOnBackground: new Set(['marble', 'wood', 'grid']),

  /**
   * Возвращает (и кэширует) текстуру пресета. kind — 'figure' или 'background':
   * одна и та же текстура нужна с разным .repeat в этих двух контекстах
   * (фигура — маленький объект, фон — весь экран), поэтому кэш отдельный на
   * каждую комбинацию имя+назначение, а не общий на одно только имя.
   */
  get(name, kind) {
    if (!this[name]) return null;
    const cacheKey = `${kind || 'figure'}:${name}`;
    if (!this._cache.has(cacheKey)) {
      const tex = this[name]();
      if (kind === 'background' && this._tileableOnBackground.has(name)) {
        tex.repeat.set(4, 4);
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
