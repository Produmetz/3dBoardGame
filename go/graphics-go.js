// graphics.js - специальная версия для игры Го
// Работает с движком go-engine_v2.js

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const canvas = renderer.domElement;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = false;

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

const baseSpacing = 2.3;
const expandedSpacing = 2.7;
let expandedAxis = null;

let cubeObjects = [];
let highlightedCell = null;

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
        scene.background = new THREE.Color(this.colors.backgroundColor);
        // Перерисовка доски должна быть вызвана отдельно, т.к. нужна актуальная доска
        if (window.goGame && window.goGame.board) {
            redrawBoardWithNewColors(window.goGame.board);
        }
    }
};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function createSphere(color) {
    const geometry = new THREE.SphereGeometry(0.45, 32, 32);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        shininess: 800,
        specular: 0xFFFFFF,
        emissive: 0x000011,
        emissiveIntensity: 0.1
    });
    return new THREE.Mesh(geometry, material);
}

function createCellOfBoard(x, y, z, i, j, k) {
    const cubeSize = 1.5;
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const isEvenPosition = (i + j + k) % 2 === 0;
    const cubeBaseColor = isEvenPosition ? ColorManager.colors.boardColor1 : ColorManager.colors.boardColor2;

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

function clearBoard() {
    for (let x = 0; x < cubeObjects.length; x++) {
        for (let y = 0; y < cubeObjects[x]?.length; y++) {
            for (let z = 0; z < cubeObjects[x][y]?.length; z++) {
                if (cubeObjects[x][y][z]) {
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

function createAndFillBoardForGo(board) {
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
                    sphere.scale.set(0.7, 0.7, 0.7);
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
        changeCellOpacity(i, j, k, 0.3);
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
    hexToColor: ColorManager.hexToColor
};

// Запуск анимации
animate();
window.addEventListener('resize', onWindowResize);