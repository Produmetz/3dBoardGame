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
    setShapeSet(name) {
        if (!SHAPE_SETS[name]) return;
        this.shapeSet = name;
        createAndFillBoardOnPole(ChessEngine.Pole);
        persistAppearance();
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

// Сохраняет текущее отображение в AppearanceStore ('chess' — отдельно от Го,
// см. appearance.js) при любом изменении цвета/текстуры/формы, на любой из
// четырёх шахматных страниц. Своя загруженная картинка не сохраняется —
// пришлось бы вшивать data URL в localStorage, а это может быть мегабайты.
function persistAppearance() {
    AppearanceStore.save('chess', {
        colors: ColorManager.colors,
        bgTexture: TextureManager.backgroundTexturePresetName,
        figureTexture: TextureManager.figureTexturePresetName,
        shapeSet: TextureManager.shapeSet
    });
}

// Восстанавливает сохранённое отображение сразу при загрузке скрипта — до
// того, как какая-либо страница успеет построить доску со значениями по
// умолчанию (Game.init()/PositionEditor.init()/инлайн-скрипты создают доску
// уже ПОСЛЕ этого файла, т.к. подключены позже в HTML). Работает одинаково
// на всех четырёх страницах, использующих этот файл.
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
    if (stored.shapeSet) {
        TextureManager.shapeSet = stored.shapeSet;
    }

    scene.background = TextureManager.backgroundTexture || new THREE.Color(ColorManager.colors.backgroundColor);
})();



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

// Геометрии набора "Классический" (см. createTraditional* ниже) — точёные
// фигуры в духе обычных шахмат: общее основание+стебель у всех, различается
// навершие. Триорта в настоящих шахматах нет, поэтому его навершие —
// собственная придумка в том же "точёном" стиле (три узла вокруг стебля,
// по одному на каждую пространственную ось, которые фигура пересекает
// по диагонали одновременно).
const tradBaseGeometry = new THREE.CylinderGeometry(0.34, 0.4, 0.22, 16);
const tradStemGeometry = new THREE.CylinderGeometry(0.16, 0.24, 0.5, 16);
const tradPawnHeadGeometry = new THREE.SphereGeometry(0.2, 16, 16);
const tradKnightHeadGeometry = new THREE.ConeGeometry(0.22, 0.5, 4);
const tradBishopTopGeometry = new THREE.ConeGeometry(0.22, 0.42, 16);
const tradBishopBallGeometry = new THREE.SphereGeometry(0.09, 10, 10);
const tradRookTopGeometry = new THREE.CylinderGeometry(0.32, 0.28, 0.2, 8);
const tradQueenBallGeometry = new THREE.SphereGeometry(0.24, 16, 16);
const tradQueenRingGeometry = new THREE.TorusGeometry(0.27, 0.05, 8, 24);
const tradKingConeGeometry = new THREE.ConeGeometry(0.2, 0.3, 16);
const tradCrossBarGeometry = new THREE.BoxGeometry(0.3, 0.08, 0.08);
const tradTriortCoreGeometry = new THREE.OctahedronGeometry(0.16);
const tradTriortNodeGeometry = new THREE.SphereGeometry(0.13, 12, 12);

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

function createTraditionalPawn(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.28;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.scale.set(0.65, 0.55, 0.65); stem.position.y = -0.02;
    const head = new THREE.Mesh(tradPawnHeadGeometry, material); head.position.y = 0.32;
    group.add(base, stem, head);
    return group;
}
function createTraditionalRook(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.3;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.position.y = 0.0;
    const top = new THREE.Mesh(tradRookTopGeometry, material); top.position.y = 0.38;
    group.add(base, stem, top);
    return group;
}
function createTraditionalKnight(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.3;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.scale.set(0.8, 0.8, 0.8); stem.position.y = -0.02;
    // Наклонённый конус вместо настоящей "головы коня" (для той нужна
    // произвольная геометрия/лофт, не выражается через примитивы) — читается
    // как отдельная, непохожая на другие фигуры силуэтная деталь.
    const head = new THREE.Mesh(tradKnightHeadGeometry, material);
    head.position.set(0, 0.35, 0.05);
    head.rotation.z = 0.4;
    head.rotation.y = Math.PI / 4;
    group.add(base, stem, head);
    return group;
}
function createTraditionalBishop(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.3;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.position.y = -0.02;
    const top = new THREE.Mesh(tradBishopTopGeometry, material); top.position.y = 0.36;
    const ball = new THREE.Mesh(tradBishopBallGeometry, material); ball.position.y = 0.62;
    group.add(base, stem, top, ball);
    return group;
}
function createTraditionalQueen(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.32;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.scale.set(1, 1.15, 1); stem.position.y = 0.02;
    const ring = new THREE.Mesh(tradQueenRingGeometry, material); ring.position.y = 0.36; ring.rotation.x = Math.PI / 2;
    const ball = new THREE.Mesh(tradQueenBallGeometry, material); ball.position.y = 0.5;
    group.add(base, stem, ring, ball);
    return group;
}
function createTraditionalKing(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.32;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.scale.set(1, 1.3, 1); stem.position.y = 0.08;
    const top = new THREE.Mesh(tradKingConeGeometry, material); top.position.y = 0.5;
    const crossV = new THREE.Mesh(tradCrossBarGeometry, material); crossV.position.y = 0.72; crossV.rotation.z = Math.PI / 2;
    const crossH = new THREE.Mesh(tradCrossBarGeometry, material); crossH.position.y = 0.72; crossH.scale.set(0.6, 1, 1);
    group.add(base, stem, top, crossV, crossH);
    return group;
}
function createTraditionalTriort(color) {
    const material = traditionalMaterial(color);
    const group = new THREE.Group();
    const base = new THREE.Mesh(tradBaseGeometry, material); base.position.y = -0.3;
    const stem = new THREE.Mesh(tradStemGeometry, material); stem.position.y = -0.02;
    const core = new THREE.Mesh(tradTriortCoreGeometry, material); core.position.y = 0.36;
    const node1 = new THREE.Mesh(tradTriortNodeGeometry, material); node1.position.set(0.2, 0.5, 0);
    const node2 = new THREE.Mesh(tradTriortNodeGeometry, material); node2.position.set(-0.17, 0.5, 0.17);
    const node3 = new THREE.Mesh(tradTriortNodeGeometry, material); node3.position.set(-0.17, 0.5, -0.17);
    group.add(base, stem, core, node1, node2, node3);
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
// - "traditional" — точёные фигуры в духе обычных шахмат (createTraditional*
//   выше), плюс придуманное в том же стиле навершие для Триорта, которого в
//   настоящих шахматах нет.
// - "custom" — обрабатывается отдельно в createAndFillBoardOnPole через
//   CustomShapeManager (загруженные модели), поэтому реального маппинга
//   тут не требует — пустой объект только чтобы setShapeSet('custom') прошло
//   валидацию "такой набор существует".
const SHAPE_CREATORS = {
    sphere: createSphere, cube: createCube, cone: createCone, cylinder: createCylinder,
    torus: createTorus, torusKnot: createTorusKnot, octahedron: createOctahedron, dodecahedron: createDodecahedron,
    tradPawn: createTraditionalPawn, tradRook: createTraditionalRook, tradKnight: createTraditionalKnight,
    tradBishop: createTraditionalBishop, tradQueen: createTraditionalQueen, tradKing: createTraditionalKing,
    tradTriort: createTraditionalTriort
};
const SHAPE_SETS = {
    default: { Pawn: 'cone', Rook: 'cube', Knight: 'torus', Bishop: 'sphere', Triort: 'octahedron', Queen: 'dodecahedron', King: 'torusKnot' },
    traditional: { Pawn: 'tradPawn', Rook: 'tradRook', Knight: 'tradKnight', Bishop: 'tradBishop', Triort: 'tradTriort', Queen: 'tradQueen', King: 'tradKing' },
    custom: {}
};
// Подписи для выпадающего списка в настройках.
const SHAPE_SET_LABELS = { default: 'По умолчанию', traditional: 'Классический', custom: 'Свои формы' };

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
            this.models[pieceType] = this._normalize(gltf.scene);
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    // Загруженные модели бывают любого масштаба/расположения — вписываем в
    // тот же примерный размерный "бюджет", что и остальные фигуры (~0.9 по
    // наибольшему измерению), и центрируем, чтобы не улетали за пределы клетки.
    _normalize(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        object.position.set(-center.x, -center.y, -center.z);
        const wrapper = new THREE.Group();
        wrapper.add(object);
        wrapper.scale.setScalar(0.9 / maxDim);
        return wrapper;
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
                    } else {
                        // Набор "custom" без загруженной модели для этого типа
                        // (или неизвестный/устаревший сохранённый набор) —
                        // используем форму "default", а не пустую клетку.
                        const shapeName = (SHAPE_SETS[TextureManager.shapeSet] || SHAPE_SETS.default)[figure.Name]
                            || SHAPE_SETS.default[figure.Name];
                        const shapeCreator = SHAPE_CREATORS[shapeName];
                        figureMesh = shapeCreator ? shapeCreator(color) : createRandomFigure();
                    }

                    cubeObjects[x][y][z].add(figureMesh);
                }
            }
        }
    }
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
    }
};