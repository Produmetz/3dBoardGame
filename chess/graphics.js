// Инициализация сцены, камеры и рендерера
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const canvas = renderer.domElement;
renderer.setSize(window.innerWidth, window.innerHeight);
// Ограничиваем pixelRatio — на телефонах/hi-DPI мониторах devicePixelRatio может
// быть 3+, что при полупрозрачной 3D-решётке клеток резко умножает стоимость
// заливки пикселей. Выше 2 разница в чёткости незаметна, а FPS проседает сильно.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Добавление управления камерой
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0); // Центрируем цель управления
controls.enableDamping = false;

// Освещение
const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
scene.add(ambientLight);

const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight1.position.set(10, 15, 10);
scene.add(directionalLight1);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
directionalLight2.position.set(-10, -10, -10);
scene.add(directionalLight2);

controls.enablePan = true;
controls.enableZoom = true;
controls.enableRotate = true;
controls.touchRotate = true;
controls.touchZoom = true;
controls.touchPan = true;

// Параметры сетки
const gridSizeX = 6;
const gridSizeY = 6;
const gridSizeZ = 8;
const baseSpacing = 2.3;
const expandedSpacing = 2.7;
let expandedAxis = null;

// Массив для хранения кубиков
//let cubes = [];
let cubeObjects = Array(gridSizeX).fill().map(() => Array(gridSizeY).fill().map(() => Array(gridSizeZ).fill(null)));
let highlightedPossibleMoves = [];
let highlightedCell;

let isWhiteFigure = false, isBlackFigure = false;

// Цвета
/*let cubeColor = 0xFFFFFF;
let backgroundColor = 0xFFFFFF;
let boardColor1 = 0x1E90FF;
let boardColor2 = 0x0a192f;
let whiteFigureColor = 0xffffff;
let blackFigureColor = 0x000000;
let maybeMoveColor = 0x47FF4B;
let dangerKingColor = 0xFF0000;
let selectedCellColor = 0xFF9500;*/

const ColorManager = {
    // Цвета по умолчанию
    colors: {
        cubeColor: 0xFFFFFF,
        backgroundColor: 0xFFFFFF,
        boardColor1: 0x1E90FF,
        boardColor2: 0x0a192f,
        whiteFigureColor: 0xffffff,
        blackFigureColor: 0x000000,
        maybeMoveColor: 0x47FF4B,
        dangerKingColor: 0xFF0000,
        selectedCellColor: 0xFF9500
    },

    // Преобразует hex-строку в числовое значение цвета
    hexToColor(hex) {
        return parseInt(hex.replace('#', ''), 16);
    },

    // Обновляет цвета
    updateColors(newColors) {
        for (const [key, value] of Object.entries(newColors)) {
            if (this.colors.hasOwnProperty(key)) {
                this.colors[key] = value;
            }
        }

        // Обновляем фон сцены — если активна текстура фона, цвет её не
        // перекрывает (TextureManager.setBackgroundPreset/Custom сами
        // выставляют scene.background и это единственный способ его сбросить).
        scene.background = TextureManager.backgroundTexture || new THREE.Color(this.colors.backgroundColor);

        // Перерисовываем доску с новыми цветами
        redrawBoardWithNewColors();
        persistAppearance();
    }
};

// Текстуры фона/фигур и набор форм фигур — отдельно от ColorManager, т.к. это
// не цвета, а THREE.Texture/выбор геометрии. Смена текстуры или набора форм
// требует пересоздания мешей (текстура — часть material, назначается при
// создании), поэтому оба сеттера дёргают полный createAndFillBoardOnPole,
// а не лёгкий redrawBoardWithNewColors (тот только красит существующие материалы).
const TextureManager = {
    figureTexture: null,
    figureTexturePresetName: null, // null = либо "нет текстуры", либо своя картинка (не персистится)
    backgroundTexture: null,
    backgroundTexturePresetName: null,
    shapeSet: 'default',
    figureScale: 1,

    setFigureScale(value) {
        const n = parseFloat(value);
        this.figureScale = Number.isFinite(n) ? Math.min(1.6, Math.max(0.5, n)) : 1;
        createAndFillBoardOnPole(ChessEngine.Pole);
        persistAppearance();
    },
    setFigurePreset(name) {
        this.figureTexture = name ? TextureLibrary.get(name) : null;
        this.figureTexturePresetName = name || null;
        createAndFillBoardOnPole(ChessEngine.Pole);
        persistAppearance();
    },
    async setFigureCustom(file) {
        this.figureTexture = await TextureLibrary.fromFile(file);
        this.figureTexturePresetName = null; // своя картинка не сохраняется между страницами, см. persistAppearance
        createAndFillBoardOnPole(ChessEngine.Pole);
    },
    setBackgroundPreset(name) {
        this.backgroundTexture = name ? TextureLibrary.get(name) : null;
        this.backgroundTexturePresetName = name || null;
        scene.background = this.backgroundTexture || new THREE.Color(ColorManager.colors.backgroundColor);
        persistAppearance();
    },
    async setBackgroundCustom(file) {
        this.backgroundTexture = await TextureLibrary.fromFile(file);
        this.backgroundTexturePresetName = null;
        scene.background = this.backgroundTexture;
    },
    async setShapeSet(name) {
        if (!SHAPE_SETS[name]) return;
        this.shapeSet = name;
        // Рендерим сразу (набор "default" — пока модели "Классического" ещё
        // не подгружены, createAndFillBoardOnPole и так падает обратно на
        // "default" для типов без готовой модели, см. там же), затем, если
        // это первое включение "Классического" в этой вкладке, догружаем все
        // 6 моделей и перерисовываем уже с ними.
        createAndFillBoardOnPole(ChessEngine.Pole);
        persistAppearance();
        if (name === 'traditional' && !TraditionalModelManager.isReady()) {
            await TraditionalModelManager.ensureLoaded();
            if (this.shapeSet === 'traditional') { // пользователь мог успеть переключиться на другой набор
                createAndFillBoardOnPole(ChessEngine.Pole);
            }
        }
    },
    // Загружает свою модель для одного типа фигуры (см. CustomShapeManager,
    // определён ниже в файле — доступен к моменту вызова, не к моменту
    // объявления этого метода). Перерисовывает доску только если сейчас
    // активен набор "custom" — иначе загрузка тихо кэшируется на будущее.
    async setCustomShapeForType(pieceType, file) {
        await CustomShapeManager.loadForType(pieceType, file);
        if (this.shapeSet === 'custom') {
            createAndFillBoardOnPole(ChessEngine.Pole);
        }
    }
};

// Скорость анимации хода — только шахматы (в Го фигуры не переезжают из
// клетки в клетку, там просто ставится камень, анимировать нечего).
// 0 = мгновенно, как было раньше до этой настройки.
const MovementSettings = {
    speedMs: 0,
    setSpeed(ms) {
        const n = parseInt(ms, 10);
        this.speedMs = Number.isFinite(n) && n > 0 ? n : 0;
        persistAppearance();
    }
};

// Сохраняет текущее отображение в AppearanceStore ('chess' — отдельно от Го,
// см. appearance.js) при любом изменении цвета/текстуры/формы, на любой из
// четырёх шахматных страниц. Своя загруженная картинка не сохраняется —
// пришлось бы вшивать data URL в localStorage, а это может быть мегабайты.
function persistAppearance() {
    AppearanceStore.save('chess', {
        colors: ColorManager.colors,
        bgTexture: TextureManager.backgroundTexturePresetName,
        figureTexture: TextureManager.figureTexturePresetName,
        shapeSet: TextureManager.shapeSet,
        figureScale: TextureManager.figureScale,
        moveSpeedMs: MovementSettings.speedMs
    });
}

// restoreStoredAppearance() runs further down this file, right after
// TraditionalModelManager is declared - it references that const, and as an
// IIFE it executes immediately at that point in the script, so it can't run
// any earlier than the declaration itself (unlike the rest of this file's
// cross-references, which are all inside callbacks that only fire after the
// whole script has finished loading).



// Raycaster для определения кликов
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Общие геометрии фигур и клеток. Форма у всех фигур одного типа одинаковая —
// meняется только material (для подсветки, перекраски темы, шаха короля),
// поэтому геометрию безопасно переиспользовать между всеми экземплярами вместо
// создания нового буфера на каждую фигуру/клетку. Сегменты у круглых форм также
// снижены — на объектах такого размера разница незаметна, а треугольников заметно
// меньше.
const cellGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const sphereGeometry = new THREE.SphereGeometry(0.45, 20, 20);
const cubeFigureGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.6);
const coneGeometry = new THREE.ConeGeometry(0.4, 1, 20);
const cylinderGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1, 20);
const torusGeometry = new THREE.TorusGeometry(0.35, 0.16, 12, 48);
const torusKnotGeometry = new THREE.TorusKnotGeometry(0.4, 0.15, 64, 12);
const octahedronGeometry = new THREE.OctahedronGeometry(0.6);
const dodecahedronGeometry = new THREE.DodecahedronGeometry(0.6);

// Геометрии для Триорта в наборе "Классический" — общее основание+стебель,
// тот же язык форм, что и у настоящих фигур (у каждой из шести — одно
// навершие: шар/башенка/митра/корона/крест), навершие Триорта — гранёный
// "камень" (октаэдр), одна цельная деталь, а не набор отдельных шариков.
// Остальные 6 типов фигур в этом наборе больше не собираются из
// примитивов — грузятся как готовые модели, см. TraditionalModelManager.
const tradBaseGeometry = new THREE.CylinderGeometry(0.34, 0.4, 0.22, 16);
const tradStemGeometry = new THREE.CylinderGeometry(0.16, 0.24, 0.5, 16);
const tradTriortGemGeometry = new THREE.OctahedronGeometry(0.26);
const tradTriortCollarGeometry = new THREE.CylinderGeometry(0.2, 0.16, 0.08, 16);

// Убирает и уничтожает материалы (не геометрию — она общая и живёт всё время
// страницы) всех дочерних мешей клетки. Вызывается при замене/удалении фигур,
// чтобы старые материалы не копились в GPU-памяти на каждом ходу/сбросе доски.
function disposeCellContents(cell) {
    while (cell.children.length > 0) {
        const child = cell.children[0];
        cell.remove(child);
        child.traverse((obj) => obj.material?.dispose());
    }
}

// Общий материал для фигур — читает активную текстуру из TextureManager
// (map: null просто означает "нет текстуры", MeshPhongMaterial тогда ведёт
// себя как раньше, чистый цвет). Текстура тонируется color'ом фигуры, см.
// комментарий в TextureManager.
function buildFigureMaterial(color, extra) {
    return new THREE.MeshPhongMaterial(Object.assign({
        color: color,
        map: TextureManager.figureTexture
    }, extra));
}

// Функции для создания фигур (внутренние)
function createSphere(color) {
    const material = buildFigureMaterial(color, {
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(sphereGeometry, material);
}
function createCube(color) {
    const material = buildFigureMaterial(color, {
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(cubeFigureGeometry, material);
}
function createCone(color) {
    const material = buildFigureMaterial(color, {
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(coneGeometry, material);
}
function createCylinder(color) {
    const material = buildFigureMaterial(color, { shininess: 100, specular: 0x111111 });
    return new THREE.Mesh(cylinderGeometry, material);
}
function createTorus(color) {
    const material = buildFigureMaterial(color, {
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(torusGeometry, material);
}
// Общий материал для "Классического" набора — один на все части одной
// фигуры (не по одному на меш), они всё равно всегда красятся вместе.
function traditionalMaterial(color) {
    return buildFigureMaterial(color, { shininess: 300, specular: 0xCCCCCC, emissive: 0x000011, emissiveIntensity: 0.08 });
}

// Триорта в обычных шахматах нет — это фигура только этого варианта, так что
// для неё нет модели в chess/models/ (см. TraditionalModelManager ниже).
// Собрана из тех же примитивов "основание+стебель", что и настоящие фигуры
// этого набора, с ОДНИМ навершием — гранёным "камнем" на воротничке, как у
// пешки шар или у слона митра — а не тремя отдельными шариками врозь: та
// версия читалась как что-то из другого набора, не как ещё одна точёная
// фигура этого же комплекта.
function createTraditionalTriort(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.3;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.position.y = -0.02;
    const collar = new THREE.Mesh(tradTriortCollarGeometry, material); collar.position.y = 0.25;
    const gem = new THREE.Mesh(tradTriortGemGeometry, material); gem.position.y = 0.42; gem.rotation.y = Math.PI / 8;
    group.add(base, stem, collar, gem);
    // Без масштабирования эта фигура заметно шире загруженных моделей
    // остальных 6 типов — они нормализованы в normalizeLoadedModel по
    // наибольшему измерению, а эта собрана из примитивов с абсолютными
    // размерами. Подгоняем вручную под тот же силуэт.
    group.scale.set(0.62, 0.95, 0.62);
    return group;
}
function createTorusKnot(color) {
    const material = buildFigureMaterial(color, { shininess: 100, specular: 0x111111 });
    return new THREE.Mesh(torusKnotGeometry, material);
}
function createOctahedron(color) {
    const material = buildFigureMaterial(color, {
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000001, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(octahedronGeometry, material);
}
function createDodecahedron(color) {
    const material = buildFigureMaterial(color, {
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.5
    });
    return new THREE.Mesh(dodecahedronGeometry, material);
}

// Наборы форм фигур:
// - "default" — ровно то, что было до появления смены форм (маппинг раньше
//   был захардкожен switch'ем в createAndFillBoardOnPole).
// - "traditional" — настоящие модели шахматных фигур (см. TraditionalModelManager
//   ниже), плюс придуманная в похожем стиле форма для Триорта, которого в
//   настоящих шахматах нет — единственная запись, которая тут реально нужна
//   (для остальных 6 типов SHAPE_CREATORS не используется, пока модель не
//   загрузится - см. createAndFillBoardOnPole).
// - "custom" — обрабатывается отдельно через CustomShapeManager (загруженные
//   пользователем модели) — пустой объект только чтобы setShapeSet('custom')
//   прошло валидацию "такой набор существует".
const SHAPE_CREATORS = {
    sphere: createSphere, cube: createCube, cone: createCone, cylinder: createCylinder,
    torus: createTorus, torusKnot: createTorusKnot, octahedron: createOctahedron, dodecahedron: createDodecahedron,
    tradTriort: createTraditionalTriort
};
const SHAPE_SETS = {
    default: { Pawn: 'cone', Rook: 'cube', Knight: 'torus', Bishop: 'sphere', Triort: 'octahedron', Queen: 'dodecahedron', King: 'torusKnot' },
    traditional: { Triort: 'tradTriort' },
    custom: {}
};
// Подписи для выпадающего списка в настройках.
const SHAPE_SET_LABELS = { default: 'По умолчанию', traditional: 'Классический', custom: 'Свои формы' };

// Вписывает загруженную модель (свободного масштаба/расположения) в тот же
// размерный "бюджет", что и остальные фигуры (~0.9 по наибольшему измерению),
// и центрирует — общая логика для CustomShapeManager и TraditionalModelManager.
function normalizeLoadedModel(object, targetSize) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    object.position.set(-center.x, -center.y, -center.z);
    const wrapper = new THREE.Group();
    wrapper.add(object);
    wrapper.scale.setScalar((targetSize || 0.9) / maxDim);
    return wrapper;
}

// Набор "Классический" — настоящие модели шахматных фигур (CC0, см.
// chess/models/CREDITS.txt), решённые заранее под этот проект: у исходников
// (3D-печатные STL) было 45-79 тысяч треугольников на фигуру - на порядок
// больше, чем нужно вебу, и совершенно неприемлемо, когда одна и та же
// фигура может стоять на доске в паре десятков экземпляров. Не загружаются
// заранее при инициализации страницы (модели не нужны, пока не выбран этот
// набор форм) — ensureLoaded() грузит все 6 разом при первом переключении на
// "traditional" и кэширует навсегда.
const TraditionalModelManager = {
    models: {}, // { Pawn: THREE.Group (нормализованный шаблон), ... }
    _loadingPromise: null,
    PIECE_FILES: { Pawn: 'pawn.glb', Rook: 'rook.glb', Knight: 'knight.glb', Bishop: 'bishop.glb', Queen: 'queen.glb', King: 'king.glb' },

    isReady() {
        return Object.keys(this.PIECE_FILES).every((type) => !!this.models[type]);
    },

    ensureLoaded() {
        if (this.isReady()) return Promise.resolve();
        if (this._loadingPromise) return this._loadingPromise;
        // allSettled, not all - a single failed piece (e.g. a 404, or a
        // model file that got moved) shouldn't take down the five that DID
        // load; each successfully-loaded one still populates this.models
        // before we get here regardless.
        this._loadingPromise = Promise.allSettled(
            Object.entries(this.PIECE_FILES).map(([type, file]) => new Promise((resolve, reject) => {
                new THREE.GLTFLoader().load('models/' + file, (gltf) => {
                    this.models[type] = normalizeLoadedModel(gltf.scene, 0.95);
                    resolve();
                }, undefined, reject);
            }))
        ).then((results) => {
            const failed = results.filter((r) => r.status === 'rejected');
            if (failed.length) {
                // The most common cause by far: the page was opened directly
                // as a file (file://) instead of through a local web server -
                // browsers block scripts from fetching other files off disk
                // that way, so GLTFLoader's requests fail silently unless we
                // surface it ourselves.
                // GLTFLoader's onError often hands back a raw ProgressEvent for
                // network-level failures (404, blocked request), not an Error
                // with a useful .message - String(ProgressEvent) is just
                // "[object ProgressEvent]", so fall back to a generic message
                // rather than show that.
                const rawReason = failed[0].reason;
                const reason = location.protocol === 'file:'
                    ? 'страница открыта как файл (file://) — браузер не даёт скриптам подгружать другие файлы прямо с диска. Откройте сайт через локальный веб-сервер (например, npx serve или python -m http.server), а не двойным кликом по .html.'
                    : (rawReason && rawReason.message) || 'не удалось загрузить файл модели (сеть/404) — см. вкладку Network в инструментах разработчика';
                console.error('TraditionalModelManager: не удалось загрузить модели набора "Классический" —', reason, failed);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('Не удалось загрузить часть моделей "Классического" набора: ' + reason, 'error');
                }
                // Не запоминаем неудачу навсегда - следующий вызов (например,
                // после того как сайт открыли правильно) попробует снова
                // вместо того, чтобы вечно отдавать этот же зависший промис.
                this._loadingPromise = null;
            }
        });
        return this._loadingPromise;
    },

    createMesh(pieceType, color) {
        const template = this.models[pieceType];
        if (!template) return null;
        const clone = template.clone(true);
        const material = buildFigureMaterial(color, { shininess: 300, specular: 0xCCCCCC });
        clone.traverse((child) => { if (child.isMesh) child.material = material; });
        return clone;
    }
};

// "Свои формы" — загрузка модели (.glb/.gltf) на каждый тип фигуры отдельно.
// Не персистится между страницами/перезагрузками (как и своя текстура) —
// модель хранится только в памяти этой вкладки; для типа без загруженной
// модели используется форма из набора "default", а не пустая клетка.
const CustomShapeManager = {
    models: {}, // { Pawn: THREE.Group (нормализованный шаблон), ... }

    async loadForType(pieceType, file) {
        const url = URL.createObjectURL(file);
        try {
            const gltf = await new Promise((resolve, reject) => {
                new THREE.GLTFLoader().load(url, resolve, undefined, reject);
            });
            this.models[pieceType] = normalizeLoadedModel(gltf.scene, 0.9);
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    hasType(pieceType) {
        return !!this.models[pieceType];
    },

    // Клонирует шаблон и красит все меши общим материалом фигуры (та же
    // логика цвета/текстуры, что и у остальных наборов форм) — своя модель
    // всё равно должна быть узнаваема как белая/чёрная фигура на доске.
    createMesh(pieceType, color) {
        const template = this.models[pieceType];
        if (!template) return null;
        const clone = template.clone(true);
        const material = buildFigureMaterial(color, { shininess: 300, specular: 0xCCCCCC });
        clone.traverse((child) => { if (child.isMesh) child.material = material; });
        return clone;
    }
};

// Восстанавливает сохранённое отображение сразу при загрузке скрипта — до
// того, как какая-либо страница успеет построить доску со значениями по
// умолчанию (Game.init()/PositionEditor.init()/инлайн-скрипты создают доску
// уже ПОСЛЕ этого файла, т.к. подключены позже в HTML). Работает одинаково
// на всех четырёх страницах, использующих этот файл. Должна идти именно
// здесь, а не раньше — ссылается на TraditionalModelManager, а сама
// исполняется немедленно (IIFE), так что не может стартовать раньше, чем
// этот const реально объявлен.
(function restoreStoredAppearance() {
    const stored = AppearanceStore.load('chess');
    if (!stored) return;

    if (stored.colors) {
        for (const [key, value] of Object.entries(stored.colors)) {
            if (ColorManager.colors.hasOwnProperty(key)) ColorManager.colors[key] = value;
        }
    }
    if (stored.bgTexture) {
        TextureManager.backgroundTexture = TextureLibrary.get(stored.bgTexture);
        TextureManager.backgroundTexturePresetName = stored.bgTexture;
    }
    if (stored.figureTexture) {
        TextureManager.figureTexture = TextureLibrary.get(stored.figureTexture);
        TextureManager.figureTexturePresetName = stored.figureTexture;
    }
    if (stored.figureScale) {
        TextureManager.figureScale = stored.figureScale;
    }
    if (stored.moveSpeedMs !== undefined) {
        MovementSettings.speedMs = stored.moveSpeedMs;
    }
    if (stored.shapeSet) {
        TextureManager.shapeSet = stored.shapeSet;
        // Восстановленный набор "Классический" ещё без моделей (они не
        // персистятся, только выбор набора, см. persistAppearance) — первый
        // рендер (сделает вызывающий код страницы, например Game.init())
        // пойдёт с запасным "default", а как только модели догрузятся здесь,
        // перерисовываем. createAndFillBoardOnPole ещё не объявлена в этой
        // точке файла, но объявление function-выражением хостится, а .then
        // сработает уже после того, как весь скрипт выполнится.
        if (stored.shapeSet === 'traditional') {
            TraditionalModelManager.ensureLoaded().then(() => {
                // On some pages (e.g. puzzles.html, whose Game subclass is
                // constructed on window 'load', not immediately) this can
                // resolve before the page's own init has ever called
                // ChessEngine.FillPole()/InitGame() - Pole is still its
                // initial [] in that case. Nothing to (re)draw yet; that
                // page's own init will render correctly once it runs, and by
                // then TraditionalModelManager.isReady() is already true.
                if (TextureManager.shapeSet === 'traditional' && ChessEngine.Pole && ChessEngine.Pole.length > 0) {
                    createAndFillBoardOnPole(ChessEngine.Pole);
                }
            });
        }
    }

    scene.background = TextureManager.backgroundTexture || new THREE.Color(ColorManager.colors.backgroundColor);
})();

// Функция для создания случайной фигуры (запасная)
function createRandomFigure() {
    const random = Math.floor(Math.random() * 5);
    const color = Math.random() > 0.5 ? whiteFigureColor : blackFigureColor;

    switch (random) {
        case 0: return createSphere(color);
        case 1: return createCube(color);
        case 2: return createCone(color);
        case 3: return createCylinder(color);
        case 4: return createTorus(color);
        default: return createSphere(color);
    }
}
function createCellOfBoard(x, y, z, i, j, k) {
    const isEvenPosition = (i + j + k) % 2 === 0;
    const cubeBaseColor = isEvenPosition ?
        ColorManager.colors.boardColor1 :
        ColorManager.colors.boardColor2;

    const cubeMaterial = new THREE.MeshPhongMaterial({
        color: cubeBaseColor,
        transparent: true,
        opacity: 0.3,
        shininess: 80,
        specular: 0x111111
    });

    const cube = new THREE.Mesh(cellGeometry, cubeMaterial);
    cube.position.set(x, y, z);
    cube.userData.gridPosition = { i, j, k };

    scene.add(cube);
    return cube;
}


function createAndFillBoardOnPole(pole) {
    const spacingX = expandedAxis == 'x' ? baseSpacing * expandedSpacing : baseSpacing;
    const spacingY = expandedAxis == 'y' ? baseSpacing * expandedSpacing : baseSpacing;
    const spacingZ = expandedAxis == 'z' ? baseSpacing * expandedSpacing : baseSpacing;
    GraphicsEngine.isWhiteFigure = false , GraphicsEngine.isBlackFigure = false ;

    for (let x = 0; x < gridSizeX; x++) {
        for (let y = 0; y < gridSizeY; y++) {
            for (let z = 0; z < gridSizeZ; z++) {
                const figure = pole[x][y][z];

                const posX = (x - (gridSizeX - 1) / 2) * spacingX;
                const posY = (y - (gridSizeY - 1) / 2) * spacingY;
                const posZ = (z - (gridSizeZ - 1) / 2) * spacingZ;

                if (cubeObjects[x][y][z]) {
                    cubeObjects[x][y][z].position.set(posX, posY, posZ);
                } else {
                    cubeObjects[x][y][z] = createCellOfBoard(posX, posY, posZ, x, y, z);
                }
                disposeCellContents(cubeObjects[x][y][z]);

                if (figure) {
                    let figureMesh;
                    const color = figure.Color === 'White' ?
                        ColorManager.colors.whiteFigureColor :
                        ColorManager.colors.blackFigureColor;
                    figure.Color === 'White' ? GraphicsEngine.isWhiteFigure = true : GraphicsEngine.isBlackFigure = true ;
                    if (TextureManager.shapeSet === 'custom' && CustomShapeManager.hasType(figure.Name)) {
                        figureMesh = CustomShapeManager.createMesh(figure.Name, color);
                    } else if (TextureManager.shapeSet === 'traditional' && TraditionalModelManager.models[figure.Name]) {
                        figureMesh = TraditionalModelManager.createMesh(figure.Name, color);
                    } else {
                        // "custom" без загруженной модели для этого типа, или
                        // "traditional" пока модели ещё грузятся (кроме Триорта —
                        // для него в SHAPE_SETS.traditional есть tradTriort и
                        // готовая модель никогда не нужна), или неизвестный/
                        // устаревший сохранённый набор — используем "default".
                        const shapeName = (SHAPE_SETS[TextureManager.shapeSet] || SHAPE_SETS.default)[figure.Name]
                            || SHAPE_SETS.default[figure.Name];
                        const shapeCreator = SHAPE_CREATORS[shapeName];
                        figureMesh = shapeCreator ? shapeCreator(color) : createRandomFigure();
                    }

                    figureMesh.scale.multiplyScalar(TextureManager.figureScale);
                    cubeObjects[x][y][z].add(figureMesh);
                }
            }
        }
    }
}

// Анимирует фигуру(ы), едущую(ие) из одной клетки в другую (обычный ход —
// один элемент в moves; рокировка — король и ладья, два), затем перестраивает
// доску целиком, как и раньше — animateMoveThenRebuild лишь показывает
// промежуточное движение ПЕРЕД финальной перестройкой, а не заменяет её:
// перестройка всё равно нужна, чтобы отразить взятие/превращение/и т.д.
// Если анимация выключена (MovementSettings.speedMs === 0, как было всегда
// до этой настройки) — просто перестраивает немедленно, без изменений в
// поведении.
function animateMoveThenRebuild(pole, moves, onComplete) {
    const duration = MovementSettings.speedMs;
    if (!duration) {
        createAndFillBoardOnPole(pole);
        if (onComplete) onComplete();
        return;
    }

    const animations = [];
    for (const { from, to } of moves) {
        const fromCell = cubeObjects[from.x] && cubeObjects[from.x][from.y] && cubeObjects[from.x][from.y][from.z];
        const toCell = cubeObjects[to.x] && cubeObjects[to.x][to.y] && cubeObjects[to.x][to.y][to.z];
        const movingMesh = fromCell && fromCell.children[0];
        if (!fromCell || !toCell || !movingMesh) continue;
        fromCell.remove(movingMesh);
        movingMesh.position.copy(fromCell.position);
        scene.add(movingMesh);
        animations.push({ mesh: movingMesh, start: fromCell.position.clone(), end: toCell.position.clone() });
    }

    if (!animations.length) {
        // Ничего не нашли по указанным координатам (например, доска уже была
        // перестроена чем-то другим) — просто перестраиваем как обычно.
        createAndFillBoardOnPole(pole);
        if (onComplete) onComplete();
        return;
    }

    const startTime = performance.now();
    function step(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - (1 - t) * (1 - t); // ease-out — чуть приятнее линейного, без лишней библиотеки
        for (const a of animations) a.mesh.position.lerpVectors(a.start, a.end, eased);
        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            for (const a of animations) scene.remove(a.mesh);
            createAndFillBoardOnPole(pole);
            if (onComplete) onComplete();
        }
    }
    requestAnimationFrame(step);
}

function selectCell(i, j, k) {
    // Снимаем предыдущее выделение
    GraphicsEngine.unselectCell();

    // Сохраняем выбранную клетку
    GraphicsEngine.highlightedCell = { i, j, k };

    // Подсвечиваем выбранную клетку
    changeCellColor(i, j, k, ColorManager.colors.selectedCellColor);
    changeCellOpacity(i, j, k, 0.65);
}

function unselectCell() {
    if (GraphicsEngine.highlightedCell) {
        // Возвращаем обычный цвет выбранной клетке
        const { i, j, k } = GraphicsEngine.highlightedCell;
        const isEvenPosition = (i + j + k) % 2 === 0;
        const cubeBaseColor = isEvenPosition ?
            ColorManager.colors.boardColor1 :
            ColorManager.colors.boardColor2;
        changeCellColor(i, j, k, cubeBaseColor);
        changeCellOpacity(i, j, k, 0.3);

        // Сбрасываем состояние
        GraphicsEngine.highlightedCell = null;
    }
}

function changeCellColor(x, y, z, color) {
    cubeObjects[x][y][z].material.color.set(color);
}
function changeCellOpacity(x, y, z, value) {
    cubeObjects[x][y][z].material.opacity = value;
}

// Красит материал фигуры в клетке. Большинство фигур — один Mesh
// (cell.children[0].material существует напрямую), но "звезда" (форма Коня
// в альтернативном наборе, см. createStar) — THREE.Group из двух конусов со
// своим материалом на каждом, у самой Group материала нет — красим детей.
function setFigureMeshColor(cellChild, color) {
    if (cellChild.material) {
        cellChild.material.color.set(color);
    } else if (cellChild.children) {
        cellChild.children.forEach((child) => child.material?.color.set(color));
    }
}

// Функция для перерисовки доски с новыми цветами
function redrawBoardWithNewColors() {
    // Удаляем старые клетки
    for (let x = 0; x < gridSizeX; x++) {
        for (let y = 0; y < gridSizeY; y++) {
            for (let z = 0; z < gridSizeZ; z++) {
                const isEvenPosition = (x + y + z) % 2 === 0;
                const cubeBaseColor = isEvenPosition ?
                    ColorManager.colors.boardColor1 :
                    ColorManager.colors.boardColor2;
                changeCellColor(x, y, z, cubeBaseColor);
                if (ChessEngine.Pole[x][y][z] != null) {
                    const colorFigure = ChessEngine.Pole[x][y][z].Color === 'White' ?
                        ColorManager.colors.whiteFigureColor :
                        ColorManager.colors.blackFigureColor;
                    setFigureMeshColor(cubeObjects[x][y][z].children[0], colorFigure);
                }

            }
        }
    }

}

function cellFromClick(click_x, click_y) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((click_x - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((click_y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        return intersects[0].object.userData.gridPosition;
    }
}
function unHighlightingPossibleMoves() {

    GraphicsEngine.highlightedPossibleMoves.forEach(move => {
        const [x, y, z] = move;
        const isEvenPosition = (x + y + z) % 2 == 0;
        const cubeBaseColor = isEvenPosition ?
            ColorManager.colors.boardColor1 :
            ColorManager.colors.boardColor2;
        changeCellColor(x, y, z, cubeBaseColor);
        changeCellOpacity(x, y, z, 0.3);
    });
    GraphicsEngine.highlightedPossibleMoves = [];
}
// Функция для подсветки короля. Идентифицируем короля по ChessEngine.Pole,
// не по форме меша — раньше это был King === 'TorusKnotGeometry' (форма
// короля в классическом наборе форм), что ломалось при выборе
// альтернативного набора (там король — тетраэдр) и вообще не должно было
// зависеть от того, какая геометрия выбрана для отображения.
function highlightKing(color) {
    for (let x = 0; x < gridSizeX; x++) {
        for (let y = 0; y < gridSizeY; y++) {
            for (let z = 0; z < gridSizeZ; z++) {
                const piece = ChessEngine.Pole[x][y][z];
                if (piece != null && piece.Name === 'King' && piece.Color == color) {
                    setFigureMeshColor(cubeObjects[x][y][z].children[0], ColorManager.colors.dangerKingColor);
                    return; // Нашли короля, выходим
                };
            }
        }
    }
}
// Функция для подсветки короля при шаге
function highlightKingInCheck(status) {
    // Сначала сбрасываем все подсветки
    if (status === 'CheckWhite' || status === 'CheckMateWhite') {
        highlightKing('White');
        return;
    } else if (status === 'CheckBlack' || status === 'CheckMateBlack') {
        highlightKing('Black');
        return;
    }
    unhighlightKing();
}

function unhighlightKing() {
    for (let x = 0; x < gridSizeX; x++) {
        for (let y = 0; y < gridSizeY; y++) {
            for (let z = 0; z < gridSizeZ; z++) {
                const piece = ChessEngine.Pole[x][y][z];
                if (piece != null && piece.Name === 'King') {
                    setFigureMeshColor(cubeObjects[x][y][z].children[0], piece.Color === 'White' ?
                        ColorManager.colors.whiteFigureColor :
                        ColorManager.colors.blackFigureColor);
                }
            }
        }
    }
}



function highlightingPossibleMoves(moves) {

    unHighlightingPossibleMoves();

    moves.forEach(move => {
        const [x, y, z] = move;
        changeCellColor(x, y, z, ColorManager.colors.maybeMoveColor);
        changeCellOpacity(x, y, z, 0.65);
    });
    GraphicsEngine.highlightedPossibleMoves = moves;
}
function drawAfterMove(x1, y1, z1, x2, y2, z2) {
    const source = cubeObjects[x1][y1][z1];
    const target = cubeObjects[x2][y2][z2];

    // Полностью очищаем целевую ячейку (удаляем и уничтожаем материал взятой фигуры)
    disposeCellContents(target);

    // Перемещаем всех детей из исходной ячейки в целевую
    while (source.children.length > 0) {
        const child = source.children[0];
        source.remove(child);
        target.add(child);
    }
    unHighlightingPossibleMoves();
};

// Обработчик изменения размера окна
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Обновляем размеры canvas
    canvas.style.width = '100%';
    canvas.style.height = '100%';
}

// Анимация
function animate() {
    requestAnimationFrame(animate);

    // Плавное движение камеры
    controls.update();

    renderer.render(scene, camera);
}


// Экспорт API для использования извне
// Добавляем функции в API
window.GraphicsEngine = {
    highlightedCell: highlightedCell,
    highlightedPossibleMoves: highlightedPossibleMoves,
    isWhiteFigure: isWhiteFigure,
    isBlackFigure: isBlackFigure,
    setExpandedAxis: function (axis) {
        expandedAxis = axis;
    },
    getExpandedAxis: function () {
        return expandedAxis;
    },
    createAndFillBoardOnPole,
    animateMoveThenRebuild,
    changeCellColor,
    changeCellOpacity,
    cellFromClick,
    highlightingPossibleMoves,
    unHighlightingPossibleMoves,
    drawAfterMove,
    animate,
    redrawBoardWithNewColors,
    unselectCell,
    selectCell,
    onWindowResize,
    updateColors: ColorManager.updateColors.bind(ColorManager),
    getColors: () => ColorManager.colors,
    hexToColor: ColorManager.hexToColor,
    setFigureTexturePreset: (name) => TextureManager.setFigurePreset(name),
    setFigureTextureCustom: (file) => TextureManager.setFigureCustom(file),
    setBackgroundTexturePreset: (name) => TextureManager.setBackgroundPreset(name),
    setBackgroundTextureCustom: (file) => TextureManager.setBackgroundCustom(file),
    setShapeSet: (name) => TextureManager.setShapeSet(name),
    getShapeSet: () => TextureManager.shapeSet,
    setCustomShapeForType: (pieceType, file) => TextureManager.setCustomShapeForType(pieceType, file),
    hasCustomShape: (pieceType) => CustomShapeManager.hasType(pieceType),
    figureTexturePresets: TextureLibrary.figurePresets,
    backgroundTexturePresets: TextureLibrary.backgroundPresets,
    shapeSets: SHAPE_SET_LABELS,
    setFigureScale: (value) => TextureManager.setFigureScale(value),
    getFigureScale: () => TextureManager.figureScale,
    setMoveSpeed: (ms) => MovementSettings.setSpeed(ms),
    getMoveSpeed: () => MovementSettings.speedMs,
    // Приводит элементы формы настроек (если они есть на текущей странице —
    // не на всех четырёх есть текстуры/форма) в соответствие с тем, что
    // сейчас реально применено (включая восстановленное из AppearanceStore
    // при загрузке страницы). Вызывать после того, как <option> пресетов
    // уже вставлены в select'ы.
    syncAppearanceUI: function () {
        const hex = (n) => '#' + n.toString(16).padStart(6, '0');
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const c = ColorManager.colors;
        setVal('bg-color', hex(c.backgroundColor));
        setVal('board-color-1', hex(c.boardColor1));
        setVal('board-color-2', hex(c.boardColor2));
        setVal('white-figures-color', hex(c.whiteFigureColor));
        setVal('black-figures-color', hex(c.blackFigureColor));
        setVal('bg-texture', TextureManager.backgroundTexturePresetName || '');
        setVal('figure-texture', TextureManager.figureTexturePresetName || '');
        setVal('shape-set', TextureManager.shapeSet);
        setVal('figure-scale', TextureManager.figureScale);
        setVal('move-speed', MovementSettings.speedMs);
    }
};