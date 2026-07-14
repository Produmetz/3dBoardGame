# Архитектурное описание проекта "3D Chess & Go"

**Версия документа:** 1.0  
**Дата:** 2026-06-06  
**Цель:** Полное описание архитектуры для портирования проекта на другой язык программирования и графику

---

## 📋 ОБЗОР ПРОЕКТА

Проект представляет собой **веб-приложение** для игры в 3D шахматы и 3D го с использованием технологии **WebGL** через библиотеку **Three.js**. Приложение включает:
- Локальную версию (локальный мультиплеер)
- Сетевую версию (онлайн-мультиплеер через WebSocket)

### Основные игровые режимы:
1. **Шахматы 3D** — 6×6×8 доска с нестандартными фигурами
2. **Го 3D** — настраиваемая размерность доски (до 10×10×10)

---

## 🏗️ АРХИТЕКТУРНАЯ СТРУКТУРА

### Общая схема:
```
┌─────────────────────────────────────────────────────────────┐
│                    index.html (Главная страница)              │
│  ┌─────────────────┐         ┌───────────────────────────┐  │
│  │    Chess Card   │ ──────> │ chess/chess.html          │  │
│  │                  │         │                           │  │
│  └─────────────────┘         │ graphics.js                 │  │
│                              │ chess-engine.js              │  │
│                              │ game.js                      │  │
│                              │ network.js                   │  │
│                              │ event-handlers.js            │  │
│                              └───────────────────────────┘  │
│  ┌─────────────────┐         ┌───────────────────────────┐  │
│  │    Go Card      │ ──────> │ go/go.html                  │  │
│  │                  │         │                             │  │
│  └─────────────────┘         │ graphics-go.js               │  │
│                              │ go-engine_v2.js               │  │
│                              │ game-go.js                    │  │
│                              │ graphics-go.js                │  │
│                              └───────────────────────────┘  │
│                              │ position-editor.js            │  │
│                              │ event-handlers-go.js          │  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌────────────────────────┐
              │ server.py              │
              │ (WebSocket сервер)     │
              │ Python + websockets    │
              │ SQLite база данных     │
              └────────────────────────┘
```

---

## 🧠 1. АЛГОРИТМИЧЕСКАЯ СТОРОННА

### 1.1 Шахматный движок (`chess/chess-engine.js`)

#### Классы и структуры данных:

| Класс | Описание |
|-------|----------|
| `Vector` | Векторный класс для операций с координатами (неполный, требует доработки) |
| `Figure` | Базовый класс фигуры с цветом и именем |
| `WhitePawn/BlackPawn` | Белые/черные пешки |
| `WhiteRook/BlackRook` | Белые/черные ладьи |
| `WhiteKnight/BlackKnight` | Белые/черные кони |
| `WhiteBishop/BlackBishop` | Белые/черные слоны |
| `WhiteTriort/BlackTriort` | Белые/черные "Триорты" (фигура с диагональными ходами) |
| `WhiteQueen/BlackQueen` | Белые/черные ферзи |
| `WhiteKing/BlackKing` | Белые/черные короли |

#### Данные доски:
```javascript
// 6×6×8 массив (x: 0-5, y: 0-5, z: 0-7)
let Pole = []; // Глобальная переменная игрового поля

// Функция инициализации
function InitGame() {
  FillPole(); // Заполняет массив null
  // Расстановка стандартных фигур
  // Белые начинают
}
```

#### Алгоритмы логики:

| Функция | Описание |
|---------|----------|
| `MaybeMoves(x, y, z, Pole)` | Вычисляет возможные ходы фигуры |
| `MaybeMovesWithCheck()` | Фильтрует ходы, оставляя легальные (без шаха королю) |
| `IsCheck(color, pole)` | Проверяет шаха для короля указанного цвета |
| `CheckMate(x, y, z, Pole, COLOR)` | Проверяет мат |
| `FoundKing(Pole)` | Ищет короля и определяет шах/мат |
| `Move(fromX, fromY, fromZ, toX, toY, toZ, Pole, ColorMove)` | Выполняет ход |
| `CreateNextPole(Pole)` | Создаёт копию доски (для проверки ходов) |
| `InMaybeMoves(...)` | Проверяет, атакует ли фигура данную клетку |

#### Особенности шахматного движка:
- Доска 6×6×8 (не стандартные 8×8)
- 3D координаты (x, y, z)
- Поддержка нестандартных фигур (Triort)
- Автоматическое определение шаха и мата
- ❌ **Отсутствие**: рокировки, взятия на проходе, превращения пешек

### 1.2 Движок Го (`go/go-engine_v2.js`)

#### Класс `Board` — основная структура:

```javascript
class Board {
    constructor(dims, komi = 7.5) {
        this.dims = dims;           // [X, Y, Z] размеры
        this.grid = [];             // Линейный массив камней
        this.komi = komi;           // Коми (компенсация белым)
        this.currentPlayer = BLACK; // Текущий игрок
        this.captures = {};         // Захваченные камни
        this.moveHistory = [];      // История хэшей доски (для ко)
        this.stateHistory = [];     // История состояний (для undo)
        this.passCount = 0;         // Счёт пропусков
        this.gameOver = false;
        this.resigned = false;
        this.hash = 0n;             // Хэш состояния
        this.initZobrist();         // Инициализация случайных значений
    }
}
```

#### Алгоритмы движка Го:

| Метод | Описание | Сложность |
|-------|----------|-----------|
| `coordToIndex(coord)` | Преобразует 3D координаты в линейный индекс | O(n) |
| `indexToCoord(idx)` | Инвертирует преобразование | O(n) |
| `getNeighbors(coord)` | Получает соседей по Манхэттенскому расстоянию | O(n) |
| `getGroup(coord)` | Получает группу камней (связную компоненту) | O(n²) |
| `getLiberties(coord)` | Считает дамэ (либерти) группы | O(n²) |
| `isLegalMove(coord, player)` | Проверяет легальность хода (самоубийство, ко) | O(n²) |
| `makeMove(coord, player)` | Выполняет ход, захватывает камни | O(n²) |
| `pass()` | Пропуск хода | O(1) |
| `undo()` | Отмена хода | O(n) |
| `computeScore()` | Подсчёт очков по территории | O(n²) |

#### Реализация простых правил Го:

1. **Ко (простое)**: Запрещает повторение состояния доски (сравнивает хэши Цобриста)
2. **Захват**: Удаляет группы без либерти (0 дамэ)
3. **Дамэ**: Считает пустые соседние клетки группы
4. **Подсчёт очков**: Китайский метод (по территориям + камни)
5. **Два паса**: Игра заканчивается после 2 подряд пропущенных ходов

#### Хэширование Цобриста:
```javascript
// Случайное значение для каждой клетки
this.zobristTable = [
    { EMPTY: 0n, BLACK: randomBigINT(), WHITE: randomBigINT() }
];

// Вычисление хэша
hash = 0n;
for cell in grid:
    if cell != EMPTY:
        hash ^= zobristTable[cell_index][cell_type];
```

---

## 🎨 2. ВИЗУАЛЬНАЯ СТОРОННА

### 2.1 Three.js Setup (общий для обеих игр)

#### Сцена и рендеринг:
```javascript
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF);

const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
camera.position.set(15, 15, 15); // Позиция камеры

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableRotate = true;
controls.enableZoom = true;
controls.touchRotate = true;
```

#### Освещение:
```javascript
const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
```

#### Управление осевым масштабированием:
```javascript
let expandedAxis = null; // 'x', 'y', 'z' или null
const baseSpacing = 2.3;
const expandedSpacing = 2.7;

// Расчёт позиций клеток с учётом расширенной оси
const spacingX = expandedAxis === 'x' ? baseSpacing * expandedSpacing : baseSpacing;
const spacingY = expandedAxis === 'y' ? baseSpacing * expandedSpacing : baseSpacing;
const spacingZ = expandedAxis === 'z' ? baseSpacing * expandedSpacing : baseSpacing;
```

### 2.2 Создание фигур (Шахматы)

| Тип фигуры | Three.js геометрия | Описание |
|------------|-------------------|----------|
| Pawn (пешка) | `ConeGeometry` | Конус |
| Rook (ладья) | `BoxGeometry` | Куб |
| Knight (конь) | `TorusGeometry` | Тороид |
| Bishop (слон) | `SphereGeometry` | Сфера |
| Triort | `OctahedronGeometry` | Октаэдр |
| Queen (ферзь) | `DodecahedronGeometry` | Додекаэдр |
| King (король) | `TorusKnotGeometry` | Торусный узел |

#### Материал фигур:
```javascript
const material = new THREE.MeshPhongMaterial({
    color: figureColor,
    shininess: 800,
    specular: 0xFFFFFF,
    emissive: 0x000011,
    emissiveIntensity: 0.1
});
```

### 2.3 Создание клеток доски

```javascript
function createCellOfBoard(x, y, z, i, j, k) {
    const cubeSize = 1.5;
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const isEvenPosition = (i + j + k) % 2 === 0;
    const cubeBaseColor = isEvenPosition 
        ? ColorManager.colors.boardColor1 
        : ColorManager.colors.boardColor2;
    
    const cubeMaterial = new THREE.MeshPhongMaterial({
        color: cubeBaseColor,
        transparent: true,
        opacity: 0.3,
        shininess: 80,
        specular: 0x111111
    });
    
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(x, y, z);
    cube.userData.gridPosition = { i, j, k }; // Данные для raycasting
    
    scene.add(cube);
    return cube;
}
```

### 2.4 Эффекты и подсветка

| Эффект | Реализация |
|--------|------------|
| Выбранная клетка | Изменение цвета + прозрачности |
| Возможные ходы | Подсветка зелёным цветом |
| Шах королю | Красное свечение (подсветка короля) |
| Невозможный ход | Вспышка красным (в Го) |

---

## 🔗 3. ФУНКЦИОНАЛЬНАЯ СТОРОННА

### 3.1 Основной класс игры (Chess: `chess/game.js`)

```javascript
class Game {
    constructor() {
        this.currentPlayer = 'White';
        this.moveHistory = [];
        this.isDragging = false;
        this.dragThreshold = 5;
        this.isNetworkGame = false;
        this.networkManager = new NetworkManager(this);
        
        this.init();
    }
    
    init() {
        ChessEngine.InitGame();
        createAndFillBoardOnPole(ChessEngine.Pole);
        this.setupEventListeners();
        animate();
        this.updateUI();
    }
    
    handleCanvasClick(event) {
        // Обработка клика, выбор фигуры, выполнение хода
    }
    
    makeMove(from, to) {
        // Сохранение хода
        // Вызов шахматного движка
        // Обновление графики
        // Проверка состояния игры
    }
    
    undoMove() {
        // Восстановление позиции из истории
    }
    
    // Методы для UI
    updateUI()
    updateMoveHistory()
    changeColor(type, value)
    saveGame()
    loadGame(file)
}
```

### 3.2 Класс игры Го (`go/game-go.js`)

Аналогичен chess/game.js, но использует:
- `GoEngine.Board` вместо `ChessEngine.Pole`
- Методы: `makeMove()`, `pass()`, `undo()`, `computeScore()`
- Поддержка touch-событий

### 3.3 Сетевой менеджер (`network.js`)

```javascript
class NetworkManager {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.connected = false;
        this.roomId = null;
        this.playerColor = null;
        this.opponentName = null;
        this.playerName = null;
    }
    
    connect(address, playerName) {
        this.socket = new WebSocket(address);
        
        this.socket.onopen = () => {
            this.connected = true;
            this.send({ type: 'join', playerName: playerName });
        };
        
        this.socket.onmessage = (event) => {
            this.handleMessage(JSON.parse(event.data));
        };
        
        this.socket.onclose = () => {
            this.connected = false;
        };
    }
    
    handleMessage(data) {
        switch (data.type) {
            case 'room_list': this.game.displayRooms(data.rooms); break;
            case 'room_created':
                this.roomId = data.roomId;
                this.playerColor = data.color;
                this.game.switchToInRoom();
                break;
            case 'move': this.game.makeMoveFromNetwork(data.move); break;
            case 'chat': this.game.addChatMessage(data.sender, data.message); break;
            case 'undo_request': this.game.handleUndoRequest(); break;
            // ... другие типы
        }
    }
    
    sendMove(move) {
        this.send({ type: 'move', move: move });
    }
    
    sendChat(message) {
        this.send({ type: 'chat', message: message });
    }
}
```

### 3.4 Редактор позиций (`chess/position-editor.js`)

```javascript
class PositionEditor {
    constructor() {
        this.selectedFigure = null;
        this.selectedColor = 'White';
        this.isEraserMode = false;
        this.currentTurn = 'White';
        
        this.init();
    }
    
    handleCanvasClick(event) {
        const cellCoords = cellFromClick(event.clientX, event.clientY);
        const { i, j, k } = cellCoords;
        
        if (this.isEraserMode) {
            ChessEngine.Pole[i][j][k] = null;
        } else if (this.selectedFigure) {
            ChessEngine.Pole[i][j][k] = {
                Name: this.selectedFigure,
                Color: this.selectedColor
            };
        }
    }
    
    savePosition() {
        // Сохраняет в текстовом файле
        // Формат: Custom Position\nWhite/Black\n<фигуры в строках>\n<история ходов>
    }
}
```

---

## 🌐 4. СЕТЕВАЯ АРХИТЕКТУРА

### 4.1 WebSocket сервер (`server.py`)

#### Технологии:
- **Язык**: Python 3.x
- **Библиотека**: `websockets`
- **База данных**: SQLite (`game_server.db`)

#### Структура данных:

```python
# Хранилище подключённых клиентов
connected = { websocket: Player }
players_by_name = { name: Player }
rooms = { room_id: Room }

class Player:
    def __init__(self, name: str):
        self.name = name
        self.ws = None
        self.online = False
        self.room_id = None
        self.color = None

class Room:
    def __init__(self, name, password, is_public, game_type, owner, board_params):
        self.id = uuid
        self.name = name
        self.game_type = game_type  # 'chess' или 'go'
        self.board_x, self.board_y, self.board_z = board_params
        self.komi = board_params.get('komi')
        self.owner = owner
        self.players = {}  # color -> Player
        self.moves = []
```

#### Обработчики событий:

| Событие | Действие |
|---------|----------|
| `join` | Регистрация игрока |
| `list_rooms` | Отправка списка доступных комнат |
| `create_room` | Создание комнаты |
| `join_room` | Присоединение к комнате |
| `leave_room` | Покидание комнаты |
| `move` | Сохранение хода, уведомление оппонента |
| `chat` | Передача сообщения всем в комнате |
| `undo_request` | Запрос отмены хода у оппонента |
| `pass` | Пропуск хода |
| `resign` | Сдача игры |

#### Автоматическое удаление комнат:
```python
async def delete_room_after_delay(room_id):
    await asyncio.sleep(300)  # 5 минут
    if room_id in rooms:
        # Удаление комнаты если игроки не онлайн
        pass
```

### 4.2 Протокол обмена данными

```json
// Подключение к серверу
{ "type": "join", "playerName": "Игрок" }

// Создание комнаты
{ "type": "create_room", "roomName": "Name", "password": null, 
  "isPublic": true, "gameType": "chess", 
  "boardX": 6, "boardY": 6, "boardZ": 8, "komi": null }

// Ход
{ "type": "move", "move": { "to": { "x": 1, "y": 2, "z": 3 } } }

// Чат
{ "type": "chat", "message": "Привет!" }

// Ответ на отмену хода
{ "type": "undo_response", "accepted": true }
```

---

## 📁 5. СТРУКТУРА ПРОЕКТА

```
3d-Chess/
├── index.html                 # Главная страница (список игр)
├── network.js                 # Сетевой менеджер
├── server.py                  # WebSocket сервер
├── game_server.db             # SQLite база данных
├── requirements.txt           # Зависимости Python (для сервера)
├── .gitignore
├── .vscode/settings.json
│
├── chess/                     # Шахматы
│   ├── chess.html            # Страница игры
│   ├── chess-engine.js       # Шахматный движок
│   ├── graphics.js           # Графика шахмат
│   ├── game.js               # Логика игры
│   ├── event-handlers.js     # Обработчики событий
│   ├── position-editor.js    # Редактор позиций
│   ├── position-editor.html  # Страница редактора
│   ├── figures-tutorial.js   # Обучение фигурам
│   └── figures-tutorial.html # Страница обучения
│   └── examples-list.json    # Примеры позиций
│
└── go/                        # Го
    ├── go.html               # Страница игры
    ├── go-engine_v2.js       # Движок Го
    ├── graphics-go.js        # Графика Го
    ├── game-go.js            # Логика игры Го
    ├── event-handlers-go.js  # Обработчики событий Го
    └── [доп. файлы]
```

---

## 🔧 6. ИНТЕРФЕЙС И UI

### 6.1 Структура HTML панелей

```html
<!-- Левая панель -->
<div id="left-panel">
    <div class="panel-section">
        <h3>Подсказки</h3>
        <div class="panel-content">
            <!-- Секции подсказок -->
        </div>
    </div>
    <div class="panel-section">
        <h3>История ходов</h3>
        <div id="history-list"></div>
    </div>
</div>

<!-- Правая панель -->
<div id="right-panel">
    <div id="game-info">Текущий игрок, статус</div>
    <div class="panel-section">
        <h3>Сетевая игра</h3>
        <!-- Подключение, список комнат -->
    </div>
    <div class="panel-section">
        <h3>Настройки</h3>
        <!-- Цвета, оси -->
    </div>
    <div class="panel-section">
        <h3>Игра</h3>
        <!-- Кнопки управления -->
    </div>
</div>
```

### 6.2 Система цветов

```javascript
const ColorManager = {
    colors: {
        backgroundColor: 0xFFFFFF,
        boardColor1: 0x1E90FF,
        boardColor2: 0x0a192f,
        whiteFigureColor: 0xffffff,
        blackFigureColor: 0x000000,
        selectedCellColor: 0xFF9500,
        maybeMoveColor: 0x47FF4B,
        dangerKingColor: 0xFF0000
    },
    
    updateColors(newColors) {
        // Обновление цветов сцены
        redrawBoardWithNewColors();
    }
};
```

### 6.3 Адаптивность

- **Mobile-first**: CSS media queries для экранов < 768px
- Панели перестраиваются вертикально
- Canvas становится fixed
- Крупные кнопки для тач-устройств

---

## 📡 7. ВЗАИМОСВЯЗИ МОДУЛЕЙ

### Схема зависимостей:

```
┌─────────────────────────────────────────────────┐
│                    UI Layer                      │
│           (index.html, chess.html, go.html)     │
└────────────────┬─────────────────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
┌────────▼────────┐ ┌────▼────────────┐
│  HTML Panels    │ │   Game Logic    │
│  (event-handlers│ │  (Game class)   │
│   .js)          │ │  (game-go.js)   │
└─────────────────┘ └─────────────────┘
         │               │
         │         ┌─────┴────────────┐
         │         │   Graphics Layer │
         │         │   (graphics.js,  │
         │         │    graphics-go.js)│
         │         └───────────────────┘
         │                  │
         │         ┌────────▼──────────┐
         │         │   Engine Layer    │
         │         │ (ChessEngine,     │
         │         │  GoEngine)        │
         │         └───────────────────┘
         │                  │
         │         ┌────────▼──────────┐
         │         │   Network Layer   │
         │         │ (NetworkManager)  │
         │         │ + server.py       │
         │         └───────────────────┘
         │
     ┌───▼────────────┐
     │   Position      │
     │   Editor        │
     └─────────────────┘
```

### Взаимосвязи:

1. **UI → Game Logic**:
   - Обработчики кликов вызывают методы класса Game
   - UI обновляется через `updateUI()`

2. **Game Logic → Graphics**:
   - Изменение состояния доски → `createAndFillBoardOnPole()`
   - Обновление цветов → `updateColors()`

3. **Graphics → Engine**:
   - Получает данные из `ChessEngine.Pole` или `GoEngine.Board`
   - Перерисовывает при каждом изменении

4. **Network ↔ Game**:
   - Получает ходы → вызывает `makeMoveFromNetwork()`
   - Отправляет ходы → `sendMove()`

5. **Position Editor**:
   - Отдельный модуль для создания начальных позиций
   - Использует `ChessEngine` для валидации

---

## 📦 8. ФОРМАТЫ ДАННЫХ

### 8.1 Сохранение игры (Шахматы)

```
Стандартная:
standart
<JSON история ходов>

Кастомная:
custom
<White/Black>
x	y	z	...	 (6 строк по 8 ячеек)
x	y	z	...
...
<JSON история ходов>
```

### 8.2 Сохранение игры (Го)

```json
{
    "version": 1,
    "gameType": "go",
    "dims": [10, 10, 10],
    "komi": 6.5,
    "grid": [...],
    "currentPlayer": 1,
    "captures": {"black": 15, "white": 12},
    "passCount": 0,
    "gameOver": false,
    "resigned": false,
    "moveHistory": [...]
}
```

---

## 🚀 9. ДЛЯ ПОРТИРОВАНИЯ: КЛЮЧЕВЫЕ МОДУЛИ

### Что нужно перенести:

#### Обязательные модули:
1. **Chess Engine** (`chess/chess-engine.js`) — алгоритмы шахмат
2. **Go Engine** (`go/go-engine_v2.js`) — алгоритмы Го
3. **Graphics System** (`chess/graphics.js`, `go/graphics-go.js`) — 3D рендеринг
4. **Network Layer** (`network.js`) — WebSocket клиент
5. **Game Logic** (`chess/game.js`, `go/game-go.js`) — основная логика игры
6. **Server** (`server.py`) — если нужен онлайн (или аналог на новом языке)

#### Опционально (можно переделать):
- HTML/CSS UI — можно использовать фреймворк (React, Vue, Unity UI)
- Event handlers — можно использовать систему сигналов нового фреймворка

---

## 🎯 10. РЕКОМЕНДАЦИИ ПО ПОРТИРОВАНИЮ

### Цель: Перенос на Unity + VRC或直接 Unity HDRP

#### Шаг 1: Алгоритмический слой (независим от графики)
```
┌─────────────────────────────────────┐
│   ChessEngine (JS) → ChessEngine    │
│   (C#/C++/Rust/Go)                  │
│                                     │
│   GoEngine (JS) → GoEngine          │
└─────────────────────────────────────┘
```

#### Шаг 2: Сетевой слой
```
WebSocket → Socket.IO / Unity Netcode
server.py → ASP.NET Core / Go / Rust
```

#### Шаг 3: Графический слой
**Three.js → Unity Graphics**
- `createSphere()` → MeshRenderer (SphereMesh)
- `createCube()` → MeshRenderer (CubeMesh)
- Raycasting → Raycast API Unity
- OrbitControls → Unity Camera + Input System

#### Шаг 4: UI слой
```
HTML/CSS → Unity Canvas/UGUI или
         → ImGui (если десктоп)
         → SkiaSharp (Windows Forms/WPF)
```

---

## 📝 ПРИЛОЖЕНИЕ: ГЛЮКИ И ОГРАНИЧЕНИЯ

### Шахматный движок:
- ❌ Нет рокировки
- ❌ Нет взятия на проходе
- ❌ Нет превращения пешек
- ⚠️ Векторный класс неполный
- ⚠️ Доска 6×6×8 (не стандарт)

### Движок Го:
- ✅ Простое ко реализовано
- ⚠️ Только территориальный подсчёт (нет счета по камням)
- ⚠️ Нет правила чёрной комы (сложно)

---

## 📞 КОНТАКТЫ

Если есть вопросы по архитектуре или нужно уточнить детали для портирования — обращайтесь!

**Документ создан для переноса проекта на новый стек технологий.**
