// graphics.js - специальная версия для игры Го
// Работает с движком go-engine_v2.js

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const canvas = renderer.domElement;
renderer.setSize(window.innerWidth, window.innerHeight);
// Ограничиваем pixelRatio — см. пояснение в chess/graphics.js. Особенно важно
// здесь: доска Го может быть до 10x10x10 = 1000 полупрозрачных клеток.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = false;

const BASE_LIGHT_INTENSITY = { ambient: 0.8, dir1: 0.6, dir2: 0.4 };

const ambientLight = new THREE.AmbientLight(0x404040, BASE_LIGHT_INTENSITY.ambient);
scene.add(ambientLight);

const directionalLight1 = new THREE.DirectionalLight(0xffffff, BASE_LIGHT_INTENSITY.dir1);
directionalLight1.position.set(10, 15, 10);
scene.add(directionalLight1);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, BASE_LIGHT_INTENSITY.dir2);
directionalLight2.position.set(-10, -10, -10);
scene.add(directionalLight2);

function applyLightIntensity() {
    ambientLight.intensity = BASE_LIGHT_INTENSITY.ambient * MaterialSettings.lightIntensity;
    directionalLight1.intensity = BASE_LIGHT_INTENSITY.dir1 * MaterialSettings.lightIntensity;
    directionalLight2.intensity = BASE_LIGHT_INTENSITY.dir2 * MaterialSettings.lightIntensity;
}

controls.enablePan = true;
controls.enableZoom = true;
controls.enableRotate = true;
controls.touchRotate = true;
controls.touchZoom = true;
controls.touchPan = true;

const baseSpacing = 2.3;
const expandedSpacing = 2.7;
let expandedAxis = null;

let cubeObjects = [];
let highlightedCell = null;

// См. подробный комментарий у applyBackgroundFit в chess/graphics.js —
// логика идентична.
function applyBackgroundFit() {
    const texture = TextureManager.backgroundTexture;
    if (!texture || !texture.image) return;
    const windowAspect = window.innerWidth / window.innerHeight;
    const tileCount = texture.userData && texture.userData.bgTileCount;
    if (tileCount) {
        if (windowAspect >= 1) {
            texture.repeat.set(tileCount * windowAspect, tileCount);
        } else {
            texture.repeat.set(tileCount, tileCount / windowAspect);
        }
        texture.offset.set(0, 0);
    } else {
        const imageAspect = (texture.image.width || 1) / (texture.image.height || 1);
        if (windowAspect > imageAspect) {
            texture.repeat.set(1, imageAspect / windowAspect);
            texture.offset.set(0, (1 - imageAspect / windowAspect) / 2);
        } else {
            texture.repeat.set(windowAspect / imageAspect, 1);
            texture.offset.set((1 - windowAspect / imageAspect) / 2, 0);
        }
    }
}

// См. подробный комментарий у TextureLibrary.onPhotoLoaded в chess/graphics.js.
TextureLibrary.onPhotoLoaded = function (texture) {
    if (TextureManager.backgroundTexture === texture) applyBackgroundFit();
};

const ColorManager = {
    colors: {
        backgroundColor: 0xFFFFFF,
        boardColor1: 0x1E90FF,
        boardColor2: 0x0a192f,
        whiteFigureColor: 0xffffff,
        blackFigureColor: 0x000000,
        selectedCellColor: 0xFF9500
    },

    hexToColor(hex) {
        return parseInt(hex.replace('#', ''), 16);
    },

    updateColors(newColors) {
        for (const [key, value] of Object.entries(newColors)) {
            if (this.colors.hasOwnProperty(key)) {
                this.colors[key] = value;
            }
        }
        scene.background = TextureManager.backgroundTexture || new THREE.Color(this.colors.backgroundColor);
        applyBackgroundFit();
        // Перерисовка доски должна быть вызвана отдельно, т.к. нужна актуальная доска
        if (window.goGame && window.goGame.board) {
            redrawBoardWithNewColors(window.goGame.board);
        }
        persistAppearance();
    }
};

// Текстуры фона/камней — см. подробный комментарий в chess/graphics.js,
// логика та же. У камней Го нет разных типов фигур, так что набора форм
// здесь нет — только текстура.
const TextureManager = {
    figureTexture: null,
    figureTexturePresetName: null,
    backgroundTexture: null,
    backgroundTexturePresetName: null,
    figureScale: 1,

    setFigureScale(value) {
        const n = parseFloat(value);
        this.figureScale = Number.isFinite(n) ? Math.min(1.6, Math.max(0.5, n)) : 1;
        if (window.goGame && window.goGame.board) createAndFillBoardForGo(window.goGame.board);
        persistAppearance();
    },
    setFigurePreset(name) {
        this.figureTexture = name ? TextureLibrary.get(name, 'figure') : null;
        this.figureTexturePresetName = name || null;
        if (window.goGame && window.goGame.board) createAndFillBoardForGo(window.goGame.board);
        persistAppearance();
    },
    async setFigureCustom(file) {
        this.figureTexture = await TextureLibrary.fromFile(file);
        this.figureTexturePresetName = null; // своя картинка не сохраняется между страницами
        if (window.goGame && window.goGame.board) createAndFillBoardForGo(window.goGame.board);
    },
    setBackgroundPreset(name) {
        this.backgroundTexture = name ? TextureLibrary.get(name, 'background') : null;
        this.backgroundTexturePresetName = name || null;
        scene.background = this.backgroundTexture || new THREE.Color(ColorManager.colors.backgroundColor);
        applyBackgroundFit();
        persistAppearance();
    },
    async setBackgroundCustom(file) {
        this.backgroundTexture = await TextureLibrary.fromFile(file);
        this.backgroundTexturePresetName = null;
        scene.background = this.backgroundTexture;
        applyBackgroundFit();
    }
};

// См. подробный комментарий у MaterialSettings в chess/graphics.js — логика
// идентична.
const MaterialSettings = {
    cellOpacity: 0.3,
    cellShininess: 80,
    figureGloss: 1,
    lightIntensity: 1,

    setCellOpacity(value) {
        const n = parseFloat(value);
        this.cellOpacity = Number.isFinite(n) ? Math.min(1, Math.max(0.05, n)) : 0.3;
        applyCellMaterialSettings();
        persistAppearance();
    },
    setCellShininess(value) {
        const n = parseFloat(value);
        this.cellShininess = Number.isFinite(n) ? Math.min(200, Math.max(0, n)) : 80;
        applyCellMaterialSettings();
        persistAppearance();
    },
    setFigureGloss(value) {
        const n = parseFloat(value);
        this.figureGloss = Number.isFinite(n) ? Math.min(2, Math.max(0.1, n)) : 1;
        if (window.goGame && window.goGame.board) createAndFillBoardForGo(window.goGame.board);
        persistAppearance();
    },
    setLightIntensity(value) {
        const n = parseFloat(value);
        this.lightIntensity = Number.isFinite(n) ? Math.min(2, Math.max(0.2, n)) : 1;
        applyLightIntensity();
        persistAppearance();
    }
};

// См. подробный комментарий у persistAppearance/restoreStoredAppearance в
// chess/graphics.js — логика идентична, ключ 'go' отдельный от 'chess'.
function persistAppearance() {
    AppearanceStore.save('go', {
        colors: ColorManager.colors,
        bgTexture: TextureManager.backgroundTexturePresetName,
        figureTexture: TextureManager.figureTexturePresetName,
        figureScale: TextureManager.figureScale,
        cellOpacity: MaterialSettings.cellOpacity,
        cellShininess: MaterialSettings.cellShininess,
        figureGloss: MaterialSettings.figureGloss,
        lightIntensity: MaterialSettings.lightIntensity
    });
}

(function restoreStoredAppearance() {
    const stored = AppearanceStore.load('go');
    if (!stored) return;

    if (stored.colors) {
        for (const [key, value] of Object.entries(stored.colors)) {
            if (ColorManager.colors.hasOwnProperty(key)) ColorManager.colors[key] = value;
        }
    }
    if (stored.bgTexture) {
        TextureManager.backgroundTexture = TextureLibrary.get(stored.bgTexture, 'background');
        TextureManager.backgroundTexturePresetName = stored.bgTexture;
    }
    if (stored.figureTexture) {
        TextureManager.figureTexture = TextureLibrary.get(stored.figureTexture, 'figure');
        TextureManager.figureTexturePresetName = stored.figureTexture;
    }
    if (stored.figureScale) {
        TextureManager.figureScale = stored.figureScale;
    }
    if (stored.cellOpacity !== undefined) {
        MaterialSettings.cellOpacity = stored.cellOpacity;
    }
    if (stored.cellShininess !== undefined) {
        MaterialSettings.cellShininess = stored.cellShininess;
    }
    if (stored.figureGloss !== undefined) {
        MaterialSettings.figureGloss = stored.figureGloss;
    }
    if (stored.lightIntensity !== undefined) {
        MaterialSettings.lightIntensity = stored.lightIntensity;
        applyLightIntensity();
    }

    scene.background = TextureManager.backgroundTexture || new THREE.Color(ColorManager.colors.backgroundColor);
    applyBackgroundFit();
})();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Общие геометрии — см. пояснение в chess/graphics.js. Здесь особенно важно:
// createAndFillBoardForGo пересоздаёт ВСЮ доску (до 1000 клеток) после каждого
// хода, так что переиспользование геометрии и очистка материалов старых мешей
// (см. clearBoard) экономят как GPU-память, так и время на каждом ходу.
const cellGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const stoneGeometry = new THREE.SphereGeometry(0.45, 20, 20);

function createSphere(color) {
    const geometry = stoneGeometry;
    const material = new THREE.MeshPhongMaterial({
        color: color,
        map: TextureManager.figureTexture,
        shininess: 800 * MaterialSettings.figureGloss,
        specular: 0xFFFFFF,
        emissive: 0x000011,
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(geometry, material);
}

function createCellOfBoard(x, y, z, i, j, k) {
    const isEvenPosition = (i + j + k) % 2 === 0;
    const cubeBaseColor = isEvenPosition ? ColorManager.colors.boardColor1 : ColorManager.colors.boardColor2;

    const cubeMaterial = new THREE.MeshPhongMaterial({
        color: cubeBaseColor,
        transparent: true,
        opacity: MaterialSettings.cellOpacity,
        shininess: MaterialSettings.cellShininess,
        specular: 0x111111
    });

    const cube = new THREE.Mesh(cellGeometry, cubeMaterial);
    cube.position.set(x, y, z);
    cube.userData.gridPosition = { i, j, k };

    scene.add(cube);
    return cube;
}

// Уничтожает материалы клетки и её камня (геометрия общая — не трогаем).
// Без этого каждый ход/сброс доски оставлял в GPU-памяти материалы всех
// клеток и камней предыдущего состояния — на большой доске Го это быстро
// накапливается за партию.
function disposeCell(cell) {
    cell.material?.dispose();
    cell.children.forEach((child) => child.material?.dispose());
}

function clearBoard() {
    for (let x = 0; x < cubeObjects.length; x++) {
        for (let y = 0; y < cubeObjects[x]?.length; y++) {
            for (let z = 0; z < cubeObjects[x][y]?.length; z++) {
                if (cubeObjects[x][y][z]) {
                    disposeCell(cubeObjects[x][y][z]);
                    scene.remove(cubeObjects[x][y][z]);
                }
            }
        }
    }
    cubeObjects = [];
}

// Вспомогательная функция для получения камня из доски
function getStoneAt(board, x, y, z) {
    const idx = board.coordToIndex([x, y, z]);
    return board.grid[idx];
}

function createAndFillBoardForGo(board, deadStoneKeys) {
    if (!board) return;
    clearBoard();

    const dims = board.dims;
    const sizeX = dims[0];
    const sizeY = dims[1];
    const sizeZ = dims[2];

    const spacingX = expandedAxis == 'x' ? baseSpacing * expandedSpacing : baseSpacing;
    const spacingY = expandedAxis == 'y' ? baseSpacing * expandedSpacing : baseSpacing;
    const spacingZ = expandedAxis == 'z' ? baseSpacing * expandedSpacing : baseSpacing;

    cubeObjects = Array(sizeX).fill().map(() => Array(sizeY).fill().map(() => Array(sizeZ).fill(null)));

    for (let x = 0; x < sizeX; x++) {
        for (let y = 0; y < sizeY; y++) {
            for (let z = 0; z < sizeZ; z++) {
                const stone = getStoneAt(board, x, y, z);
                const posX = (x - (sizeX - 1) / 2) * spacingX;
                const posY = (y - (sizeY - 1) / 2) * spacingY;
                const posZ = (z - (sizeZ - 1) / 2) * spacingZ;

                const cell = createCellOfBoard(posX, posY, posZ, x, y, z);
                cubeObjects[x][y][z] = cell;

                if (stone !== GoEngine.Stone.EMPTY) {
                    const color = stone === GoEngine.Stone.WHITE ? ColorManager.colors.whiteFigureColor : ColorManager.colors.blackFigureColor;
                    const sphere = createSphere(color);
                    const isDead = deadStoneKeys && deadStoneKeys.has(`${x},${y},${z}`);
                    if (isDead) {
                        sphere.scale.setScalar(0.5 * TextureManager.figureScale);
                        sphere.material.transparent = true;
                        sphere.material.opacity = 0.35;
                    } else {
                        sphere.scale.setScalar(0.7 * TextureManager.figureScale);
                    }
                    cell.add(sphere);
                }
            }
        }
    }
}

function changeCellColor(x, y, z, color) {
    if (cubeObjects[x] && cubeObjects[x][y] && cubeObjects[x][y][z]) {
        cubeObjects[x][y][z].material.color.set(color);
    }
}

function changeCellOpacity(x, y, z, value) {
    if (cubeObjects[x] && cubeObjects[x][y] && cubeObjects[x][y][z]) {
        cubeObjects[x][y][z].material.opacity = value;
    }
}

// См. подробный комментарий у applyCellMaterialSettings в chess/graphics.js.
function applyCellMaterialSettings() {
    for (let x = 0; x < cubeObjects.length; x++) {
        for (let y = 0; y < cubeObjects[x]?.length; y++) {
            for (let z = 0; z < cubeObjects[x][y]?.length; z++) {
                const cell = cubeObjects[x][y][z];
                if (cell) {
                    cell.material.opacity = MaterialSettings.cellOpacity;
                    cell.material.shininess = MaterialSettings.cellShininess;
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
    return null;
}

function selectCell(i, j, k) {
    unselectCell();
    highlightedCell = { i, j, k };
    changeCellColor(i, j, k, ColorManager.colors.selectedCellColor);
    changeCellOpacity(i, j, k, 0.65);
}

function unselectCell() {
    if (highlightedCell) {
        const { i, j, k } = highlightedCell;
        const isEvenPosition = (i + j + k) % 2 === 0;
        const cubeBaseColor = isEvenPosition ? ColorManager.colors.boardColor1 : ColorManager.colors.boardColor2;
        changeCellColor(i, j, k, cubeBaseColor);
        changeCellOpacity(i, j, k, MaterialSettings.cellOpacity);
        highlightedCell = null;
    }
}

function redrawBoardWithNewColors(board) {
    if (!cubeObjects.length || !board) return;
    const sizeX = cubeObjects.length;
    const sizeY = cubeObjects[0].length;
    const sizeZ = cubeObjects[0][0].length;

    for (let x = 0; x < sizeX; x++) {
        for (let y = 0; y < sizeY; y++) {
            for (let z = 0; z < sizeZ; z++) {
                const isEvenPosition = (x + y + z) % 2 === 0;
                const cubeBaseColor = isEvenPosition ? ColorManager.colors.boardColor1 : ColorManager.colors.boardColor2;
                changeCellColor(x, y, z, cubeBaseColor);
                if (cubeObjects[x][y][z].children.length > 0) {
                    const stone = getStoneAt(board, x, y, z);
                    const stoneColor = stone === GoEngine.Stone.WHITE ? ColorManager.colors.whiteFigureColor : ColorManager.colors.blackFigureColor;
                    cubeObjects[x][y][z].children[0].material.color.set(stoneColor);
                }
            }
        }
    }
}

function setExpandedAxis(axis) {
    expandedAxis = axis;
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    applyBackgroundFit();
}

function flashCellInvalid(i, j, k) {
    if (!cubeObjects[i] || !cubeObjects[i][j] || !cubeObjects[i][j][k]) return;
    const originalColor = cubeObjects[i][j][k].material.color.getHex();
    const originalOpacity = cubeObjects[i][j][k].material.opacity;
    cubeObjects[i][j][k].material.color.set(0xff0000);
    cubeObjects[i][j][k].material.opacity = 0.7;
    setTimeout(() => {
        cubeObjects[i][j][k].material.color.set(originalColor);
        cubeObjects[i][j][k].material.opacity = originalOpacity;
    }, 300);
}

window.GraphicsEngine = {
    createAndFillBoardForGo,
    changeCellColor,
    changeCellOpacity,
    cellFromClick,
    selectCell,
    flashCellInvalid,
    unselectCell,
    setExpandedAxis,
    getExpandedAxis: () => expandedAxis,
    animate,
    onWindowResize,
    updateColors: ColorManager.updateColors.bind(ColorManager),
    getColors: () => ColorManager.colors,
    hexToColor: ColorManager.hexToColor,
    setFigureTexturePreset: (name) => TextureManager.setFigurePreset(name),
    setFigureTextureCustom: (file) => TextureManager.setFigureCustom(file),
    setBackgroundTexturePreset: (name) => TextureManager.setBackgroundPreset(name),
    setBackgroundTextureCustom: (file) => TextureManager.setBackgroundCustom(file),
    figureTexturePresets: TextureLibrary.figurePresets,
    backgroundTexturePresets: TextureLibrary.backgroundPresets,
    setFigureScale: (value) => TextureManager.setFigureScale(value),
    getFigureScale: () => TextureManager.figureScale,
    setCellOpacity: (value) => MaterialSettings.setCellOpacity(value),
    getCellOpacity: () => MaterialSettings.cellOpacity,
    setCellShininess: (value) => MaterialSettings.setCellShininess(value),
    getCellShininess: () => MaterialSettings.cellShininess,
    setFigureGloss: (value) => MaterialSettings.setFigureGloss(value),
    getFigureGloss: () => MaterialSettings.figureGloss,
    setLightIntensity: (value) => MaterialSettings.setLightIntensity(value),
    getLightIntensity: () => MaterialSettings.lightIntensity,
    // См. комментарий у одноимённого метода в chess/graphics.js.
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
        setVal('figure-scale', TextureManager.figureScale);
        setVal('cell-opacity', MaterialSettings.cellOpacity);
        setVal('cell-shininess', MaterialSettings.cellShininess);
        setVal('figure-gloss', MaterialSettings.figureGloss);
        setVal('light-intensity', MaterialSettings.lightIntensity);
    }
};

// Запуск анимации
animate();
window.addEventListener('resize', onWindowResize);