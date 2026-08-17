/**
 * Стартовый локальный набор шахматных задач — заглушка на время, пока пул
 * не переехал на сервер (см. комментарий в ../puzzles.js). Обе задачи
 * проверены движком перед добавлением: решение действительно легально на
 * каждом полу-ходу и приводит к заявленному результату (мат / выигрыш
 * фигуры без возможности отыграть).
 *
 * pieces использует тот же формат {x,y,z,figureType,color}, что и задачи в
 * figures-tutorial.html. solution — чередующаяся последовательность
 * полу-ходов начиная с хода решающего (сторона puzzle.sideToMove); чётные
 * индексы (0,2,4…) — ходы решающего, нечётные — форсированный ответ
 * соперника, который страница задач доигрывает сама.
 */
window.ChessPuzzles = [
  {
    id: 'chess-mate-in-1-001',
    rating: 900,
    sideToMove: 'White',
    description: 'Мат в 1 ход',
    pieces: [
      { x: 0, y: 0, z: 0, figureType: 'King', color: 'Black' },
      { x: 1, y: 0, z: 0, figureType: 'Pawn', color: 'Black' },
      { x: 0, y: 1, z: 0, figureType: 'Pawn', color: 'Black' },
      { x: 0, y: 0, z: 1, figureType: 'Pawn', color: 'Black' },
      { x: 1, y: 1, z: 0, figureType: 'Pawn', color: 'Black' },
      { x: 1, y: 0, z: 1, figureType: 'Pawn', color: 'Black' },
      { x: 0, y: 1, z: 1, figureType: 'Pawn', color: 'Black' },
      { x: 1, y: 1, z: 1, figureType: 'Pawn', color: 'Black' },
      { x: 0, y: 2, z: 0, figureType: 'Knight', color: 'White' },
      { x: 5, y: 5, z: 7, figureType: 'King', color: 'White' }
    ],
    solution: [
      { from: { x: 0, y: 2, z: 0 }, to: { x: 0, y: 1, z: 2 } }
    ]
  },
  {
    id: 'chess-win-rook-002',
    rating: 1400,
    sideToMove: 'White',
    description: 'Выигрыш ладьи в 3 полу-хода',
    pieces: [
      { x: 0, y: 0, z: 7, figureType: 'King', color: 'Black' },
      { x: 1, y: 5, z: 7, figureType: 'Rook', color: 'White' },
      { x: 5, y: 1, z: 7, figureType: 'Rook', color: 'White' },
      { x: 0, y: 5, z: 6, figureType: 'Rook', color: 'White' },
      { x: 5, y: 0, z: 6, figureType: 'Rook', color: 'White' },
      { x: 0, y: 2, z: 3, figureType: 'Rook', color: 'White' },
      { x: 3, y: 3, z: 0, figureType: 'Rook', color: 'Black' },
      { x: 3, y: 3, z: 4, figureType: 'Rook', color: 'White' },
      { x: 5, y: 5, z: 7, figureType: 'King', color: 'White' }
    ],
    solution: [
      { from: { x: 0, y: 2, z: 3 }, to: { x: 0, y: 0, z: 3 } },
      { from: { x: 0, y: 0, z: 7 }, to: { x: 1, y: 1, z: 6 } },
      { from: { x: 3, y: 3, z: 4 }, to: { x: 3, y: 3, z: 0 } }
    ]
  }
];
