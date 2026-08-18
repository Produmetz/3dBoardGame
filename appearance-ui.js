/**
 * Wires the "Отображение"/"Текстуры"/"Освещение и материалы" controls in
 * the settings modal to GraphicsEngine (chess/graphics.js or
 * go/graphics-go.js — both expose the same method names for everything
 * used here). One shared implementation instead of eight near-duplicate
 * copies (main game + puzzles + position-editor + figures-tutorial, for
 * each of chess/go) is what keeps them from drifting apart: previously
 * each page hand-wired its own subset and they quietly diverged.
 *
 * Controls that only exist for one game (shape-set/custom shapes and
 * move-speed for chess, stone-shape for Go) are guarded by checking for
 * their GraphicsEngine method/the DOM element, so this same function is
 * safe to call from every page regardless of which controls its modal
 * markup actually has.
 *
 * Usage: include after graphics.js/graphics-go.js (and after whatever
 * page script creates window.chessGame/goGame, though this file itself
 * doesn't depend on that — it talks to GraphicsEngine directly), then
 * call wireAppearanceSettingsUI() once.
 */
function wireAppearanceSettingsUI() {
    const colorPickers = {
        'bg-color': 'backgroundColor',
        'board-color-1': 'boardColor1',
        'board-color-2': 'boardColor2',
        'white-figures-color': 'whiteFigureColor',
        'black-figures-color': 'blackFigureColor'
    };
    Object.keys(colorPickers).forEach(id => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            const colors = GraphicsEngine.getColors();
            colors[colorPickers[id]] = GraphicsEngine.hexToColor(e.target.value);
            GraphicsEngine.updateColors(colors);
        });
    });

    // Списки пресетов текстур заполняются из GraphicsEngine.*TexturePresets
    // (единый источник — textures.js), а не дублируются в разметке.
    function populatePresetSelect(selectId, presets) {
        const select = document.getElementById(selectId);
        if (!select || !presets) return;
        Object.entries(presets).forEach(([key, label]) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = label;
            select.insertBefore(opt, select.lastElementChild); // перед "Своя картинка…"
        });
    }
    populatePresetSelect('bg-texture', GraphicsEngine.backgroundTexturePresets);
    populatePresetSelect('figure-texture', GraphicsEngine.figureTexturePresets);

    document.getElementById('bg-texture')?.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            document.getElementById('bg-texture-file')?.click();
        } else {
            GraphicsEngine.setBackgroundTexturePreset(e.target.value || null);
        }
    });
    document.getElementById('bg-texture-file')?.addEventListener('change', (e) => {
        if (e.target.files[0]) GraphicsEngine.setBackgroundTextureCustom(e.target.files[0]);
    });

    document.getElementById('figure-texture')?.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            document.getElementById('figure-texture-file')?.click();
        } else {
            GraphicsEngine.setFigureTexturePreset(e.target.value || null);
        }
    });
    document.getElementById('figure-texture-file')?.addEventListener('change', (e) => {
        if (e.target.files[0]) GraphicsEngine.setFigureTextureCustom(e.target.files[0]);
    });

    // Форма фигур (шахматы) — набор с маппингом по типу фигуры, см.
    // GraphicsEngine.shapeSets/chess/graphics.js SHAPE_SETS. Присутствует
    // только в шахматной разметке, поэтому GraphicsEngine.shapeSets — сам
    // по себе флаг "мы в шахматах".
    const customShapesPanel = document.getElementById('custom-shapes-panel');
    if (GraphicsEngine.shapeSets) {
        const shapeSelect = document.getElementById('shape-set');
        if (shapeSelect) {
            Object.entries(GraphicsEngine.shapeSets).forEach(([key, label]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = label;
                shapeSelect.appendChild(opt);
            });
            shapeSelect.value = GraphicsEngine.getShapeSet();
            if (customShapesPanel) customShapesPanel.style.display = shapeSelect.value === 'custom' ? 'block' : 'none';
            shapeSelect.addEventListener('change', (e) => {
                GraphicsEngine.setShapeSet(e.target.value);
                if (customShapesPanel) customShapesPanel.style.display = e.target.value === 'custom' ? 'block' : 'none';
            });
        }
    }
    document.querySelectorAll('#custom-shapes-panel input[type="file"][data-piece]').forEach((input) => {
        input.addEventListener('change', (e) => {
            if (e.target.files[0]) GraphicsEngine.setCustomShapeForType(e.target.dataset.piece, e.target.files[0]);
        });
    });

    // Форма камня (Го) — одна геометрия на весь комплект, а не набор с
    // маппингом по типу (у камней нет разных типов). GraphicsEngine.stoneShapes
    // — флаг "мы в Го".
    if (GraphicsEngine.stoneShapes) {
        const stoneShapeSelect = document.getElementById('stone-shape');
        if (stoneShapeSelect) {
            Object.entries(GraphicsEngine.stoneShapes).forEach(([key, label]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = label;
                stoneShapeSelect.appendChild(opt);
            });
            stoneShapeSelect.value = GraphicsEngine.getStoneShape();
            stoneShapeSelect.addEventListener('change', (e) => {
                GraphicsEngine.setStoneShape(e.target.value);
            });
        }
    }

    const figureScaleInput = document.getElementById('figure-scale');
    const figureScaleValue = document.getElementById('figure-scale-value');
    figureScaleInput?.addEventListener('input', (e) => {
        if (figureScaleValue) figureScaleValue.textContent = parseFloat(e.target.value).toFixed(2);
        GraphicsEngine.setFigureScale(e.target.value);
    });

    // Анимация хода — только у шахмат (у Го нет анимации перемещения, камни
    // просто ставятся). GraphicsEngine.setMoveSpeed отсутствует в Go GraphicsEngine.
    if (GraphicsEngine.setMoveSpeed) {
        document.getElementById('move-speed')?.addEventListener('change', (e) => {
            GraphicsEngine.setMoveSpeed(e.target.value);
        });
    }

    // Прозрачность/блеск клеток, блеск фигур/камней, яркость освещения —
    // одинаковый набор ползунков и API в обеих играх.
    const materialSliders = [
        ['cell-opacity', 'setCellOpacity', 2],
        ['cell-shininess', 'setCellShininess', 0],
        ['figure-gloss', 'setFigureGloss', 2],
        ['light-intensity', 'setLightIntensity', 2]
    ];
    materialSliders.forEach(([id, setter, decimals]) => {
        const input = document.getElementById(id);
        const label = document.getElementById(id + '-value');
        input?.addEventListener('input', (e) => {
            if (label) label.textContent = parseFloat(e.target.value).toFixed(decimals);
            GraphicsEngine[setter](e.target.value);
        });
    });

    // Приводит цвет/текстура/форма-контролы к уже восстановленному из
    // AppearanceStore состоянию (см. graphics.js/graphics-go.js) — иначе
    // селекты показывали бы дефолт "Нет (цвет)"/"По умолчанию", даже когда
    // реально применено что-то другое.
    GraphicsEngine.syncAppearanceUI();
    if (figureScaleValue && figureScaleInput) figureScaleValue.textContent = parseFloat(figureScaleInput.value).toFixed(2);
    materialSliders.forEach(([id, , decimals]) => {
        const input = document.getElementById(id);
        const label = document.getElementById(id + '-value');
        if (input && label) label.textContent = parseFloat(input.value).toFixed(decimals);
    });
}
