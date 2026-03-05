// Редактор позиций
class PositionEditor {
    constructor() {
        this.selectedFigure = null;
        this.selectedColor = 'White';
        this.currentTurn = 'White';
        this.isEraserMode = false;

        // Добавляем свойства для отслеживания перетаскивания
        this.isDragging = false;
        this.dragThreshold = 5;
        this.mouseDownX = 0;
        this.mouseDownY = 0;

        // Инициализируем редактор
        this.init();
    }

    init() {
        // Инициализация шахматного движка
        ChessEngine.FillPole();

        // Очищаем доску
        this.clearBoard();

        // Создаем пустую доску
        createAndFillBoardOnPole(ChessEngine.Pole);

        // Добавляем обработчики событий
        this.setupEventListeners();

        // Запускаем анимацию
        animate();

        console.log('Редактор позиций загружен!');
    }

    setupEventListeners() {
        // Обработчики для выбора фигур
        const figureItems = document.querySelectorAll('.figure-item');
        figureItems.forEach(item => {
            item.addEventListener('click', () => {
                figureItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                const figureType = item.dataset.figure;
                if (figureType === 'Eraser') {
                    this.isEraserMode = true;
                    this.selectedFigure = null;
                    document.getElementById('selected-figure-name').textContent = 'Ластик';
                    document.getElementById('figure-description').textContent = 'Кликните на фигуру чтобы удалить её';
                } else {
                    this.isEraserMode = false;
                    this.selectedFigure = figureType;
                    document.getElementById('selected-figure-name').textContent = item.textContent;
                    this.updateFigureDescription();
                }
            });
        });

        // Добавляем обработчик события resize
        window.addEventListener('resize', () => GraphicsEngine.onWindowResize(), false);

        // Обработчик для кнопки сохранения
        document.getElementById('save-position').addEventListener('click', () => {
            this.savePosition();
        });

        // Обработчик для кнопки загрузки
        document.getElementById('load-position').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadPosition(e.target.files[0]);
            }
        });

        // Обработчики для выбора цвета
        document.getElementById('color-white').addEventListener('click', () => {
            this.selectedColor = 'White';
            document.getElementById('color-white').classList.add('active');
            document.getElementById('color-black').classList.remove('active');
            this.updateFigureDescription();
        });

        document.getElementById('color-black').addEventListener('click', () => {
            this.selectedColor = 'Black';
            document.getElementById('color-black').classList.add('active');
            document.getElementById('color-white').classList.remove('active');
            this.updateFigureDescription();
        });

        // Обработчики для выбора хода
        document.getElementById('turn-white').addEventListener('click', () => {
            this.currentTurn = 'White';
            document.getElementById('turn-white').classList.add('active');
            document.getElementById('turn-black').classList.remove('active');
        });

        document.getElementById('turn-black').addEventListener('click', () => {
            this.currentTurn = 'Black';
            document.getElementById('turn-black').classList.add('active');
            document.getElementById('turn-white').classList.remove('active');
        });

        // Обработчики для кнопок очистки
        document.getElementById('clear-all').addEventListener('click', () => {
            this.clearBoard();
            createAndFillBoardOnPole(ChessEngine.Pole);
        });


        // Обработчики для изменения осей
        document.getElementById('axis-x').addEventListener('click', () => this.handleAxisChange('axis-x'));
        document.getElementById('axis-y').addEventListener('click', () => this.handleAxisChange('axis-y'));
        document.getElementById('axis-z').addEventListener('click', () => this.handleAxisChange('axis-z'));
        document.getElementById('axis-none').addEventListener('click', () => this.handleAxisChange('axis-none'));

        // Обработчики для мыши
        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                this.mouseDownX = event.clientX;
                this.mouseDownY = event.clientY;
                this.isDragging = false;
            }
        });

        canvas.addEventListener('mousemove', (event) => {
            if (event.buttons === 1) {
                const dx = Math.abs(event.clientX - this.mouseDownX);
                const dy = Math.abs(event.clientY - this.mouseDownY);

                if (dx > this.dragThreshold || dy > this.dragThreshold) {
                    this.isDragging = true;
                }
            }
        });

        canvas.addEventListener('click', (event) => {
            if (event.button === 0 && !this.isDragging) {
                this.handleCanvasClick(event);
            }
        });
    }

    updateFigureDescription() {
        if (this.isEraserMode) {
            document.getElementById('figure-description').textContent = 'Кликните на фигуру чтобы удалить её';
        } else if (this.selectedFigure) {
            document.getElementById('figure-description').textContent =
                `${this.selectedColor === 'White' ? 'Белая' : 'Черная'} ${this.getFigureName(this.selectedFigure)}. Кликните на клетку чтобы поставить фигуру.`;
        }
    }

    getFigureName(figureType) {
        const names = {
            'Pawn': 'Пешка',
            'Rook': 'Ладья',
            'Knight': 'Конь',
            'Bishop': 'Слон',
            'Triort': 'Триорт',
            'Queen': 'Ферзь',
            'King': 'Король'
        };
        return names[figureType] || figureType;
    }

    handleCanvasClick(event) {
        // Получаем координаты клетки по клику
        const cellCoords = cellFromClick(event.clientX, event.clientY);
        if (!cellCoords) return;

        const { i, j, k } = cellCoords;

        if (this.isEraserMode) {
            // Режим ластика - удаляем фигуру
            ChessEngine.Pole[i][j][k] = null;
            createAndFillBoardOnPole(ChessEngine.Pole);
        } else if (this.selectedFigure) {
            // Режим размещения фигуры
            const figure = {
                Name: this.selectedFigure,
                Color: this.selectedColor
            };
            ChessEngine.Pole[i][j][k] = figure;
            createAndFillBoardOnPole(ChessEngine.Pole);
        }
    }

    clearBoard() {
        // Очищаем всю доску
        ChessEngine.FillPole();
    }

    handleAxisChange(axisId) {
        let axis = null;
        // Преобразуем идентификатор кнопки в значение оси
        if (axisId === 'axis-x') axis = 'x';
        else if (axisId === 'axis-y') axis = 'y';
        else if (axisId === 'axis-z') axis = 'z';
        else if (axisId === 'axis-none') axis = null;

        // Сбрасываем активность всех кнопок
        document.querySelectorAll('.axis-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Устанавливаем активность выбранной кнопки
        document.getElementById(axisId).classList.add('active');

        GraphicsEngine.setExpandedAxis(axis);
        GraphicsEngine.createAndFillBoardOnPole(ChessEngine.Pole);
    }

    // Метод для сохранения позиции 
    savePosition() {
        // Создаем данные в нужном формате
        let fileContent = "Custom Position\n"; // Название позиции (не standart)
        fileContent += this.currentTurn + "\n"; // Чей ход

        // Добавляем данные о фигурах в новом формате
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) {
                let row = [];
                for (let k = 0; k < 8; k++) {
                    const figure = ChessEngine.Pole[i][j][k];
                    row.push(figure ? JSON.stringify(figure) : 'null');
                }
                fileContent += row.join('\t') + "\n";
            }
        }

        // Создаем Blob и ссылку для скачивания
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        // Создаем элемент для скачивания
        const a = document.createElement('a');
        a.href = url;
        a.download = `chess_position_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();

        // Очищаем
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('Позиция сохранена в текстовом файле');
    }

    loadPosition(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const lines = content.split('\n');

                // Пропускаем первую строку (название позиции)
                // Вторая строка - чей ход
                this.currentTurn = lines[1].trim();

                // Обновляем UI для хода
                document.getElementById(`turn-${this.currentTurn.toLowerCase()}`).click();

                // Восстанавливаем фигуры на доске из нового формата
                let lineIndex = 2; // Начинаем с третьей строки
                for (let i = 0; i < 6; i++) {
                    for (let j = 0; j < 6; j++) {
                        if (lineIndex < lines.length) {
                            const line = lines[lineIndex].trim();
                            if (line) {
                                const cells = line.split('\t');
                                for (let k = 0; k < 8; k++) {
                                    if (k < cells.length) {
                                        const cell = cells[k].trim();
                                        if (cell !== 'null') {
                                            ChessEngine.Pole[i][j][k] = JSON.parse(cell);
                                        } else {
                                            ChessEngine.Pole[i][j][k] = null;
                                        }
                                    } else {
                                        ChessEngine.Pole[i][j][k] = null;
                                    }
                                }
                            }
                            lineIndex++;
                        }
                    }
                }

                createAndFillBoardOnPole(ChessEngine.Pole);
                console.log('Позиция загружена из текстового файла');
            } catch (error) {
                alert('Ошибка при загрузке позиции: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

}

// Инициализация редактора при загрузке страницы
window.addEventListener('load', () => {
    window.positionEditor = new PositionEditor();

    // Устанавливаем первую фигуру как активную
    document.querySelector('.figure-item').click();
});