// Инициализация сцены, камеры и рендерера
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const canvas = renderer.domElement;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
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

        // Обновляем фон сцены
        scene.background = new THREE.Color(this.colors.backgroundColor);

        // Перерисовываем доску с новыми цветами
        redrawBoardWithNewColors();
    }
};



// Raycaster для определения кликов
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();



// Функции для создания фигур (внутренние)
function createSphere(color) {
    const geometry = new THREE.SphereGeometry(0.45, 32, 32);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(geometry, material);
}
function createCube(color) {
    const geometry = new THREE.BoxGeometry(0.6, 0.8, 0.6);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(geometry, material);
}
function createCone(color) {
    const geometry = new THREE.ConeGeometry(0.4, 1, 32);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(geometry, material);
}
function createCylinder(color) {
    const geometry = new THREE.CylinderGeometry(0.4, 0.4, 1, 32);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 100,
        specular: 0x111111
    });
    return new THREE.Mesh(geometry, material);
}
function createTorus(color) {
    const geometry = new THREE.TorusGeometry(0.35, 0.16, 15, 100);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(geometry, material);
}
function createPyramid(color) {
    const geometry = new THREE.ConeGeometry(0.5, 1, 4);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 100,
        specular: 0x111111
    });
    return new THREE.Mesh(geometry, material);
}
function createStar(color) {
    const group = new THREE.Group();

    // Основной материал для звезды
    const starMaterial = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 100,
        specular: 0x111111
    });

    // Создаем два конуса для формирования звезды
    const cone1 = new THREE.ConeGeometry(0.5, 1, 5);
    const cone2 = new THREE.ConeGeometry(0.5, 1, 5);

    // Первый конус (основание)
    const mesh1 = new THREE.Mesh(cone1, starMaterial);
    mesh1.rotation.x = Math.PI; // Переворачиваем конус

    // Второй конус (повернут на 36 градусов для формирования лучей)
    const mesh2 = new THREE.Mesh(cone2, starMaterial);
    mesh2.rotation.x = Math.PI;
    mesh2.rotation.y = Math.PI / 5; // 36 градусов

    group.add(mesh1);
    group.add(mesh2);

    return group;
}
function createTorusKnot(color) {
    const geometry = new THREE.TorusKnotGeometry(0.4, 0.15, 100, 16);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 100,
        specular: 0x111111
    });
    return new THREE.Mesh(geometry, material);
}
function createTetrahedron(color) {
    const geometry = new THREE.TetrahedronGeometry(0.8);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.8
    });
    return new THREE.Mesh(geometry, material);
}
function createOctahedron(color) {
    const geometry = new THREE.OctahedronGeometry(0.6);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000001, // Можно добавить небольшое свечение
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(geometry, material);
}
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

function createDodecahedron(color) {
    const geometry = new THREE.DodecahedronGeometry(0.6);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800, // Увеличьте значение для более концентрированного блеска
        specular: 0xFFFFFF, // Более яркий цвет бликов (ближе к белому)
        emissive: 0x000011, // Можно добавить небольшое свечение
        emissiveIntensity: 0.5
    });
    return new THREE.Mesh(geometry, material);
}
function createCellOfBoard(x, y, z, i, j, k) {
    const cubeSize = 1.5;
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
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

    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
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
                while (cubeObjects[x][y][z].children.length > 0) {
                    cubeObjects[x][y][z].remove(cubeObjects[x][y][z].children[0]);
                }

                if (figure) {
                    let figureMesh;
                    const color = figure.Color === 'White' ?
                        ColorManager.colors.whiteFigureColor :
                        ColorManager.colors.blackFigureColor;
                    figure.Color === 'White' ? GraphicsEngine.isWhiteFigure = true : GraphicsEngine.isBlackFigure = true ;
                    switch (figure.Name) {
                        case 'Pawn':
                            figureMesh = createCone(color);
                            break;
                        case 'Rook':
                            figureMesh = createCube(color);
                            break;
                        case 'Knight':
                            figureMesh = createTorus(color);
                            break;
                        case 'Bishop':
                            figureMesh = createSphere(color);
                            break;
                        case 'Triort':
                            figureMesh = createOctahedron(color);
                            break;
                        case 'Queen':
                            figureMesh = createDodecahedron(color);
                            break;
                        case 'King':
                            figureMesh = createTorusKnot(color);
                            break;
                        default:
                            figureMesh = createRandomFigure();
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
                    cubeObjects[x][y][z].children[0].material.color.set(colorFigure);
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
// Функция для подсветки короля
function highlightKing(color) {
    for (let x = 0; x < gridSizeX; x++) {
        for (let y = 0; y < gridSizeY; y++) {
            for (let z = 0; z < gridSizeZ; z++) {
                if (ChessEngine.Pole[x][y][z] != null && cubeObjects[x][y][z].children[0].geometry.type === "TorusKnotGeometry" && ChessEngine.Pole[x][y][z].Color == color) {
                    cubeObjects[x][y][z].children[0].material.color.set(ColorManager.colors.dangerKingColor);
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
                if (ChessEngine.Pole[x][y][z] != null && cubeObjects[x][y][z].children[0].geometry.type === "TorusKnotGeometry") {
                    cubeObjects[x][y][z].children[0].material.color.set(ChessEngine.Pole[x][y][z].Color === 'White' ?
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

    // Полностью очищаем целевую ячейку (удаляем все дочерние объекты)
    while (target.children.length > 0) {
        target.remove(target.children[0]);
    }

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
    hexToColor: ColorManager.hexToColor
};