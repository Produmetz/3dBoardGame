// chess-engine.js
// Игровой движок для трехмерных шахмат

class Vector {
  constructor() {
    this.Value = [];
  }

  getMultiply(constant) {
    let result = [];
    for (let i = 0; i < this.Value.length; i++) {
      result[i] = this.Value[i] * constant;
    }
    return result;
  }
}

function SummaArray(Array1, Array2, Lenght1, Lenght2) {
  let Summa = [];
  let raz = Lenght2 - Lenght1;

  if (Lenght1 > Lenght2) {
    for (let i = 1; i < (Lenght1 - Lenght2) + 1; i++) {
      Array2[Lenght2 + i] = 0;
    }
  }

  if (Lenght2 > Lenght1) {
    for (let i = 1; i < (raz + 1); i++) {
      Array1[Lenght1 + i] = 0;
    }
  }

  for (let i = 0; i < Math.max(Lenght1, Lenght2); i++) {
    Summa[i] = (Array1[i] || 0) + (Array2[i] || 0);
  }
  return Summa;
}

function ArrayMultiplicationByNumber(number, array) {
  let resArr = [];
  for (let i = 0; i < array.length; i++) {
    resArr[i] = array[i] * number;
  }
  return resArr;
}

class Figure {
  constructor(name, color) {
    this.Color = color;
    this.Name = name;
    // Used for castling eligibility (King/Rook) — set to true the moment a
    // piece makes its first real move, via Move().
    this.hasMoved = false;
  }

  getMaybeMove(LotMaybeMove) {
    let MaybeMove = [];
    for (let i = 0; i < LotMaybeMove; i++) {
      MaybeMove[i] = [0, 0, 0];
    }
    return MaybeMove;
  }
}

class WhitePawn extends Figure {
  constructor() {
    super('Pawn', 'White');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [0, 0, 1];
    MaybeMoveThisFigure[1] = [1, 0, 1];
    MaybeMoveThisFigure[2] = [1, -1, 1];
    MaybeMoveThisFigure[3] = [0, -1, 1];
    MaybeMoveThisFigure[4] = [-1, -1, 1];
    MaybeMoveThisFigure[5] = [-1, 0, 1];
    MaybeMoveThisFigure[6] = [-1, 1, 1];
    MaybeMoveThisFigure[7] = [0, 1, 1];
    MaybeMoveThisFigure[8] = [1, 1, 1];
    MaybeMoveThisFigure[9] = [0, 0, 2];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 10;
  }
}

class WhiteRook extends Figure {
  constructor() {
    super('Rook', 'White');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 0, 0];
    MaybeMoveThisFigure[1] = [-1, 0, 0];
    MaybeMoveThisFigure[2] = [0, -1, 0];
    MaybeMoveThisFigure[3] = [0, 1, 0];
    MaybeMoveThisFigure[4] = [0, 0, 1];
    MaybeMoveThisFigure[5] = [0, 0, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 6;
  }
}

class WhiteKnight extends Figure {
  constructor() {
    super('Knight', 'White');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [2, 0, 1];
    MaybeMoveThisFigure[1] = [2, 0, -1];
    MaybeMoveThisFigure[2] = [2, -1, 0];
    MaybeMoveThisFigure[3] = [2, 1, 0];
    MaybeMoveThisFigure[4] = [0, 2, 1];
    MaybeMoveThisFigure[5] = [-1, 2, 0];
    MaybeMoveThisFigure[6] = [1, 2, 0];
    MaybeMoveThisFigure[7] = [0, 2, -1];
    MaybeMoveThisFigure[8] = [0, 1, 2];
    MaybeMoveThisFigure[9] = [0, -1, 2];
    MaybeMoveThisFigure[10] = [1, 0, 2];
    MaybeMoveThisFigure[11] = [-1, 0, 2];
    MaybeMoveThisFigure[12] = [0, -1, -2];
    MaybeMoveThisFigure[13] = [0, 1, -2];
    MaybeMoveThisFigure[14] = [-1, 0, -2];
    MaybeMoveThisFigure[15] = [1, 0, -2];
    MaybeMoveThisFigure[16] = [0, -2, 1];
    MaybeMoveThisFigure[17] = [0, -2, -1];
    MaybeMoveThisFigure[18] = [1, -2, 0];
    MaybeMoveThisFigure[19] = [-1, -2, 0];
    MaybeMoveThisFigure[20] = [-2, 0, 1];
    MaybeMoveThisFigure[21] = [-2, 0, -1];
    MaybeMoveThisFigure[22] = [-2, 1, 0];
    MaybeMoveThisFigure[23] = [-2, -1, 0];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 24;
  }
}

class WhiteBishop extends Figure {
  constructor() {
    super('Bishop', 'White');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 0];
    MaybeMoveThisFigure[1] = [1, -1, 0];
    MaybeMoveThisFigure[2] = [-1, -1, 0];
    MaybeMoveThisFigure[3] = [-1, 1, 0];
    MaybeMoveThisFigure[4] = [0, 1, -1];
    MaybeMoveThisFigure[5] = [0, -1, -1];
    MaybeMoveThisFigure[6] = [-1, 0, -1];
    MaybeMoveThisFigure[7] = [1, 0, -1];
    MaybeMoveThisFigure[8] = [-1, 0, 1];
    MaybeMoveThisFigure[9] = [1, 0, 1];
    MaybeMoveThisFigure[10] = [0, -1, 1];
    MaybeMoveThisFigure[11] = [0, 1, 1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 12;
  }
}

class WhiteTriort extends Figure {
  constructor() {
    super('Triort', 'White');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 1];
    MaybeMoveThisFigure[1] = [1, 1, -1];
    MaybeMoveThisFigure[2] = [1, -1, -1];
    MaybeMoveThisFigure[3] = [-1, -1, -1];
    MaybeMoveThisFigure[4] = [-1, -1, 1];
    MaybeMoveThisFigure[5] = [-1, 1, 1];
    MaybeMoveThisFigure[6] = [1, -1, 1];
    MaybeMoveThisFigure[7] = [-1, 1, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 8;
  }
}

class WhiteQueen extends Figure {
  constructor() {
    super('Queen', 'White');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 1];
    MaybeMoveThisFigure[1] = [1, 1, -1];
    MaybeMoveThisFigure[2] = [1, -1, -1];
    MaybeMoveThisFigure[3] = [-1, -1, -1];
    MaybeMoveThisFigure[4] = [-1, -1, 1];
    MaybeMoveThisFigure[5] = [-1, 1, 1];
    MaybeMoveThisFigure[6] = [1, -1, 1];
    MaybeMoveThisFigure[7] = [-1, 1, -1];
    MaybeMoveThisFigure[8] = [1, 1, 0];
    MaybeMoveThisFigure[9] = [1, -1, 0];
    MaybeMoveThisFigure[10] = [-1, -1, 0];
    MaybeMoveThisFigure[11] = [-1, 1, 0];
    MaybeMoveThisFigure[12] = [0, 1, -1];
    MaybeMoveThisFigure[13] = [0, -1, -1];
    MaybeMoveThisFigure[14] = [-1, 0, -1];
    MaybeMoveThisFigure[15] = [1, 0, -1];
    MaybeMoveThisFigure[16] = [-1, 0, 1];
    MaybeMoveThisFigure[17] = [1, 0, 1];
    MaybeMoveThisFigure[18] = [0, -1, 1];
    MaybeMoveThisFigure[19] = [0, 1, 1];
    MaybeMoveThisFigure[20] = [1, 0, 0];
    MaybeMoveThisFigure[21] = [-1, 0, 0];
    MaybeMoveThisFigure[22] = [0, -1, 0];
    MaybeMoveThisFigure[23] = [0, 1, 0];
    MaybeMoveThisFigure[24] = [0, 0, 1];
    MaybeMoveThisFigure[25] = [0, 0, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 26;
  }
}

class WhiteKing extends Figure {
  constructor() {
    super('King', 'White');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 1];
    MaybeMoveThisFigure[1] = [1, 1, -1];
    MaybeMoveThisFigure[2] = [1, -1, -1];
    MaybeMoveThisFigure[3] = [-1, -1, -1];
    MaybeMoveThisFigure[4] = [-1, -1, 1];
    MaybeMoveThisFigure[5] = [-1, 1, 1];
    MaybeMoveThisFigure[6] = [1, -1, 1];
    MaybeMoveThisFigure[7] = [-1, 1, -1];
    MaybeMoveThisFigure[8] = [1, 1, 0];
    MaybeMoveThisFigure[9] = [1, -1, 0];
    MaybeMoveThisFigure[10] = [-1, -1, 0];
    MaybeMoveThisFigure[11] = [-1, 1, 0];
    MaybeMoveThisFigure[12] = [0, 1, -1];
    MaybeMoveThisFigure[13] = [0, -1, -1];
    MaybeMoveThisFigure[14] = [-1, 0, -1];
    MaybeMoveThisFigure[15] = [1, 0, -1];
    MaybeMoveThisFigure[16] = [-1, 0, 1];
    MaybeMoveThisFigure[17] = [1, 0, 1];
    MaybeMoveThisFigure[18] = [0, -1, 1];
    MaybeMoveThisFigure[19] = [0, 1, 1];
    MaybeMoveThisFigure[20] = [1, 0, 0];
    MaybeMoveThisFigure[21] = [-1, 0, 0];
    MaybeMoveThisFigure[22] = [0, -1, 0];
    MaybeMoveThisFigure[23] = [0, 1, 0];
    MaybeMoveThisFigure[24] = [0, 0, 1];
    MaybeMoveThisFigure[25] = [0, 0, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 26;
  }
}

class BlackPawn extends Figure {
  constructor() {
    super('Pawn', 'Black');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [0, 0, -1];
    MaybeMoveThisFigure[1] = [1, 0, -1];
    MaybeMoveThisFigure[2] = [1, -1, -1];
    MaybeMoveThisFigure[3] = [0, -1, -1];
    MaybeMoveThisFigure[4] = [-1, -1, -1];
    MaybeMoveThisFigure[5] = [-1, 0, -1];
    MaybeMoveThisFigure[6] = [-1, 1, -1];
    MaybeMoveThisFigure[7] = [0, 1, -1];
    MaybeMoveThisFigure[8] = [1, 1, -1];
    MaybeMoveThisFigure[9] = [0, 0, -2];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 10;
  }
}

class BlackRook extends Figure {
  constructor() {
    super('Rook', 'Black');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 0, 0];
    MaybeMoveThisFigure[1] = [-1, 0, 0];
    MaybeMoveThisFigure[2] = [0, -1, 0];
    MaybeMoveThisFigure[3] = [0, 1, 0];
    MaybeMoveThisFigure[4] = [0, 0, 1];
    MaybeMoveThisFigure[5] = [0, 0, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 6;
  }
}

class BlackKnight extends Figure {
  constructor() {
    super('Knight', 'Black');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [2, 0, 1];
    MaybeMoveThisFigure[1] = [2, 0, -1];
    MaybeMoveThisFigure[2] = [2, -1, 0];
    MaybeMoveThisFigure[3] = [2, 1, 0];
    MaybeMoveThisFigure[4] = [0, 2, 1];
    MaybeMoveThisFigure[5] = [-1, 2, 0];
    MaybeMoveThisFigure[6] = [1, 2, 0];
    MaybeMoveThisFigure[7] = [0, 2, -1];
    MaybeMoveThisFigure[8] = [0, 1, 2];
    MaybeMoveThisFigure[9] = [0, -1, 2];
    MaybeMoveThisFigure[10] = [1, 0, 2];
    MaybeMoveThisFigure[11] = [-1, 0, 2];
    MaybeMoveThisFigure[12] = [0, -1, -2];
    MaybeMoveThisFigure[13] = [0, 1, -2];
    MaybeMoveThisFigure[14] = [-1, 0, -2];
    MaybeMoveThisFigure[15] = [1, 0, -2];
    MaybeMoveThisFigure[16] = [0, -2, 1];
    MaybeMoveThisFigure[17] = [0, -2, -1];
    MaybeMoveThisFigure[18] = [1, -2, 0];
    MaybeMoveThisFigure[19] = [-1, -2, 0];
    MaybeMoveThisFigure[20] = [-2, 0, 1];
    MaybeMoveThisFigure[21] = [-2, 0, -1];
    MaybeMoveThisFigure[22] = [-2, 1, 0];
    MaybeMoveThisFigure[23] = [-2, -1, 0];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 24;
  }
}

class BlackBishop extends Figure {
  constructor() {
    super('Bishop', 'Black');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 0];
    MaybeMoveThisFigure[1] = [1, -1, 0];
    MaybeMoveThisFigure[2] = [-1, -1, 0];
    MaybeMoveThisFigure[3] = [-1, 1, 0];
    MaybeMoveThisFigure[4] = [0, 1, -1];
    MaybeMoveThisFigure[5] = [0, -1, -1];
    MaybeMoveThisFigure[6] = [-1, 0, -1];
    MaybeMoveThisFigure[7] = [1, 0, -1];
    MaybeMoveThisFigure[8] = [-1, 0, 1];
    MaybeMoveThisFigure[9] = [1, 0, 1];
    MaybeMoveThisFigure[10] = [0, -1, 1];
    MaybeMoveThisFigure[11] = [0, 1, 1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 12;
  }
}

class BlackTriort extends Figure {
  constructor() {
    super('Triort', 'Black');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 1];
    MaybeMoveThisFigure[1] = [1, 1, -1];
    MaybeMoveThisFigure[2] = [1, -1, -1];
    MaybeMoveThisFigure[3] = [-1, -1, -1];
    MaybeMoveThisFigure[4] = [-1, -1, 1];
    MaybeMoveThisFigure[5] = [-1, 1, 1];
    MaybeMoveThisFigure[6] = [1, -1, 1];
    MaybeMoveThisFigure[7] = [-1, 1, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 8;
  }
}

class BlackQueen extends Figure {
  constructor() {
    super('Queen', 'Black');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 1];
    MaybeMoveThisFigure[1] = [1, 1, -1];
    MaybeMoveThisFigure[2] = [1, -1, -1];
    MaybeMoveThisFigure[3] = [-1, -1, -1];
    MaybeMoveThisFigure[4] = [-1, -1, 1];
    MaybeMoveThisFigure[5] = [-1, 1, 1];
    MaybeMoveThisFigure[6] = [1, -1, 1];
    MaybeMoveThisFigure[7] = [-1, 1, -1];
    MaybeMoveThisFigure[8] = [1, 1, 0];
    MaybeMoveThisFigure[9] = [1, -1, 0];
    MaybeMoveThisFigure[10] = [-1, -1, 0];
    MaybeMoveThisFigure[11] = [-1, 1, 0];
    MaybeMoveThisFigure[12] = [0, 1, -1];
    MaybeMoveThisFigure[13] = [0, -1, -1];
    MaybeMoveThisFigure[14] = [-1, 0, -1];
    MaybeMoveThisFigure[15] = [1, 0, -1];
    MaybeMoveThisFigure[16] = [-1, 0, 1];
    MaybeMoveThisFigure[17] = [1, 0, 1];
    MaybeMoveThisFigure[18] = [0, -1, 1];
    MaybeMoveThisFigure[19] = [0, 1, 1];
    MaybeMoveThisFigure[20] = [1, 0, 0];
    MaybeMoveThisFigure[21] = [-1, 0, 0];
    MaybeMoveThisFigure[22] = [0, -1, 0];
    MaybeMoveThisFigure[23] = [0, 1, 0];
    MaybeMoveThisFigure[24] = [0, 0, 1];
    MaybeMoveThisFigure[25] = [0, 0, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 26;
  }
}

class BlackKing extends Figure {
  constructor() {
    super('King', 'Black');
  }

  getMaybeMoveThisFigure() {
    let MaybeMoveThisFigure = [];
    MaybeMoveThisFigure[0] = [1, 1, 1];
    MaybeMoveThisFigure[1] = [1, 1, -1];
    MaybeMoveThisFigure[2] = [1, -1, -1];
    MaybeMoveThisFigure[3] = [-1, -1, -1];
    MaybeMoveThisFigure[4] = [-1, -1, 1];
    MaybeMoveThisFigure[5] = [-1, 1, 1];
    MaybeMoveThisFigure[6] = [1, -1, 1];
    MaybeMoveThisFigure[7] = [-1, 1, -1];
    MaybeMoveThisFigure[8] = [1, 1, 0];
    MaybeMoveThisFigure[9] = [1, -1, 0];
    MaybeMoveThisFigure[10] = [-1, -1, 0];
    MaybeMoveThisFigure[11] = [-1, 1, 0];
    MaybeMoveThisFigure[12] = [0, 1, -1];
    MaybeMoveThisFigure[13] = [0, -1, -1];
    MaybeMoveThisFigure[14] = [-1, 0, -1];
    MaybeMoveThisFigure[15] = [1, 0, -1];
    MaybeMoveThisFigure[16] = [-1, 0, 1];
    MaybeMoveThisFigure[17] = [1, 0, 1];
    MaybeMoveThisFigure[18] = [0, -1, 1];
    MaybeMoveThisFigure[19] = [0, 1, 1];
    MaybeMoveThisFigure[20] = [1, 0, 0];
    MaybeMoveThisFigure[21] = [-1, 0, 0];
    MaybeMoveThisFigure[22] = [0, -1, 0];
    MaybeMoveThisFigure[23] = [0, 1, 0];
    MaybeMoveThisFigure[24] = [0, 0, 1];
    MaybeMoveThisFigure[25] = [0, 0, -1];
    return MaybeMoveThisFigure;
  }

  getLotMaybeMove() {
    return 26;
  }
}

// Глобальная переменная для игрового поля
let Pole = [];

// Клетка, "пропущенная" пешкой при двойном шаге по оси z — доступна для
// взятия на проходе только следующим ходом, затем сбрасывается в null.
let EnPassantTarget = null;

// Нужен для отмены хода (undo) — restore-функция извне не может присвоить
// module-level переменной напрямую, только через сеттер.
function SetEnPassantTarget(target) {
  EnPassantTarget = target;
}

function GetEnPassantTarget() {
  return EnPassantTarget;
}

function FillPole() {
  EnPassantTarget = null;
  for (let x = 0; x < 6; x++) {
    Pole[x] = [];
    for (let y = 0; y < 6; y++) {
      Pole[x][y] = [];
      for (let z = 0; z < 8; z++) {
        Pole[x][y][z] = null;
      }
    }
  }
}

// Инициализация игрового поля
function InitGame() {
  FillPole();

  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 8; z++) {
        if (((x == 0) && ((y == 0) || (y == 5)) && (z == 0)) || ((x == 5) && ((y == 0) || (y == 5)) && (z == 0))) {
          Pole[x][y][z] = new WhiteRook();
        }
        if (((x == 0) && ((y == 0) || (y == 5)) && (z == 7)) || ((x == 5) && ((y == 0) || (y == 5)) && (z == 7))) {
          Pole[x][y][z] = new BlackRook();
        }
        if ((((x == 1) || (x == 4)) && ((y == 0) || (y == 5)) && (z == 0)) || (((y == 1) || (y == 4)) && ((x == 0) || (x == 5)) && (z == 0))) {
          Pole[x][y][z] = new WhiteKnight();
        }
        if ((((x == 1) || (x == 4)) && ((y == 0) || (y == 5)) && (z == 7)) || (((y == 1) || (y == 4)) && ((x == 0) || (x == 5)) && (z == 7))) {
          Pole[x][y][z] = new BlackKnight();
        }
        if ((((((x == 0) || (x == 5)) && ((y == 2) || (y == 3)) && (z == 0))) || (((y == 0) || (y == 5)) && ((x == 2) || (x == 3)) && (z == 0))) || (((x == 1) || (x == 4)) && ((y == 1) || (y == 4)) && (z == 0))) {
          Pole[x][y][z] = new WhiteBishop();
        }
        if ((((((x == 0) || (x == 5)) && ((y == 2) || (y == 3)) && (z == 7))) || (((y == 0) || (y == 5)) && ((x == 2) || (x == 3)) && (z == 7))) || (((x == 1) || (x == 4)) && ((y == 1) || (y == 4)) && (z == 7))) {
          Pole[x][y][z] = new BlackBishop();
        }
        if (((((x == 2) || (x == 3)) && ((y == 1) || (y == 4))) || (((y == 2) || (y == 3)) && ((x == 1) || (x == 4)))) && (z == 0)) {
          Pole[x][y][z] = new WhiteTriort();
        }
        if (((((x == 2) || (x == 3)) && ((y == 1) || (y == 4))) || (((y == 2) || (y == 3)) && ((x == 1) || (x == 4)))) && (z == 7)) {
          Pole[x][y][z] = new BlackTriort();
        }
        if (((((x == 2) || (x == 3)) && (y == 2)) || ((y == 3) && (x == 2))) && (z == 0)) {
          Pole[x][y][z] = new WhiteQueen();
        }
        if (((((x == 2) || (x == 3)) && (y == 2)) || ((y == 3) && (x == 2))) && (z == 7)) {
          Pole[x][y][z] = new BlackQueen();
        }
        if ((x == 3) && (y == 3) && (z == 0)) {
          Pole[x][y][z] = new WhiteKing();
        }
        if ((x == 3) && (y == 3) && (z == 7)) {
          Pole[x][y][z] = new BlackKing();
        }
        if (z == 1) {
          Pole[x][y][z] = new WhitePawn();
        }
        if (z == 6) {
          Pole[x][y][z] = new BlackPawn();
        }
      }
    }
  }
}

function MaybeMoves(x, y, z, Pole) {


  let j = 0;
  let k = 1;
  let MaybePositions = [];
  let x_1; let y_1; let z_1;
  let Position = [x, y, z];
  let MaybePosition = [];
  let TTT = Pole[x][y][z];
  let what2;
  let what = [];
  if (Pole[x][y][z] != null) {
    what = TTT.getMaybeMoveThisFigure();
    let Max_i = Pole[x][y][z].getLotMaybeMove();
    if ((Pole[x][y][z].Name == 'Pawn') && (Pole[x][y][z].Color == 'White')) {
      for (let i = 0; i < 10; i++) {
        what2 = what[i];
        MaybePosition = SummaArray(Position, what2, 3, 3);
        x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
        if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {
          if (((i == 9)) && (Pole[x_1][y_1][z_1] == null) && ((Pole[x_1][y_1][z_1 - 1] == null)) && (z == 1)) { MaybePositions[j] = MaybePosition; j++ }
          else if ((Pole[x_1][y_1][z_1] == null) && (i == 0)) { MaybePositions[j] = MaybePosition; j++ }
          else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black') && (i != 0) && (i != 9)) { MaybePositions[j] = MaybePosition; j++ }
          else if ((Pole[x_1][y_1][z_1] == null) && (i != 0) && (i != 9) && EnPassantTarget && (x_1 === EnPassantTarget[0]) && (y_1 === EnPassantTarget[1]) && (z_1 === EnPassantTarget[2])) { MaybePositions[j] = MaybePosition; j++ };
        };
      };
    };
    if ((Pole[x][y][z].Name == 'Pawn') && (Pole[x][y][z].Color == 'Black')) {
      for (let i = 0; i < 10; i++) {
        what2 = what[i];
        MaybePosition = SummaArray(Position, what2, 3, 3);
        x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
        if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {
          if (((i == 9)) && (Pole[x_1][y_1][z_1] == null) && ((Pole[x_1][y_1][z_1 + 1] == null)) && (z == 6)) { MaybePositions[j] = MaybePosition; j++ }
          else if ((Pole[x_1][y_1][z_1] == null) && (i == 0)) { MaybePositions[j] = MaybePosition; j++ };
          if (((i != 0) || (i != 9)) && (Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White') && (i != 0) && (i != 9)) { MaybePositions[j] = MaybePosition; j++ };
          if ((Pole[x_1][y_1][z_1] == null) && (i != 0) && (i != 9) && EnPassantTarget && (x_1 === EnPassantTarget[0]) && (y_1 === EnPassantTarget[1]) && (z_1 === EnPassantTarget[2])) { MaybePositions[j] = MaybePosition; j++ };
        };
      };
    };
    if ((Pole[x][y][z].Name == 'Rook') && (Pole[x][y][z].Color == 'White')) {
      for (let i = 0; i < 6; i++) {
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {
            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { MaybePositions[j] = MaybePosition; j++; k = 9; }
            else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { k = 9; }
            else if ((Pole[x_1][y_1][z_1] == null) || (Pole[x_1][y_1][z_1] == undefined)) { MaybePositions[j] = MaybePosition; j++; k++; };
          } else { k = 9; };
        };
        k = 1;
      };
    };
    if ((Pole[x][y][z].Name == 'Rook') && (Pole[x][y][z].Color == 'Black')) {
      for (let i = 0; i < 6; i++) {
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { MaybePositions[j] = MaybePosition; j++; k = 9; }
            else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { k = 9; }
            else { MaybePositions[j] = MaybePosition; j++, k++; };


          } else { k = 9; };
        }; k = 1;
      };

    };
    if ((Pole[x][y][z].Name == 'Knight') && (Pole[x][y][z].Color == 'White')) {
      for (let i = 0; i < 24; i++) {
        what2 = what[i];
        MaybePosition = SummaArray(Position, what2, 3, 3);
        x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
        if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

          if ((Pole[x_1][y_1][z_1] == null)) { MaybePositions[j] = MaybePosition; j++ };
          if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { MaybePositions[j] = MaybePosition; j++ };
        };
      };
    };
    if ((Pole[x][y][z].Name == 'Knight') && (Pole[x][y][z].Color == 'Black')) {
      for (let i = 0; i < 24; i++) {
        what2 = what[i];
        MaybePosition = SummaArray(Position, what2, 3, 3);
        x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
        if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

          if ((Pole[x_1][y_1][z_1] == null)) { MaybePositions[j] = MaybePosition; j++ };
          if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { MaybePositions[j] = MaybePosition; j++ };
        };
      };
    };
    if ((Pole[x][y][z].Name == 'Bishop') && (Pole[x][y][z].Color == 'White')) {
      for (let i = 0; i < 12; i++) {
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { MaybePositions[j] = MaybePosition; j++; k = 9; } else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { k = 9; } else { MaybePositions[j] = MaybePosition; j++, k++; };


          } else { k = 9; };
        }; k = 1;
      };
    };
    if ((Pole[x][y][z].Name == 'Bishop') && (Pole[x][y][z].Color == 'Black')) {
      for (let i = 0; i < 12; i++) {
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { MaybePositions[j] = MaybePosition; j++; k = 9; } else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { k = 9; } else { MaybePositions[j] = MaybePosition; j++, k++; };


          } else { k = 9; };
        }; k = 1;
      };
    };
    if ((Pole[x][y][z].Name == 'Triort') && (Pole[x][y][z].Color == 'White')) {
      for (let i = 0; i < 8; i++) {
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {
            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { MaybePositions[j] = MaybePosition; j++; k = 9; } else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { k = 9; } else { MaybePositions[j] = MaybePosition; j++, k++; };


          } else { k = 9; };
        }; k = 1;
      };
    };
    if ((Pole[x][y][z].Name == 'Triort') && (Pole[x][y][z].Color == 'Black')) {
      for (let i = 0; i < 8; i++) {
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { MaybePositions[j] = MaybePosition; j++; k = 9; } else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { k = 9; } else { MaybePositions[j] = MaybePosition; j++, k++; };


          } else { k = 9; };
        }; k = 1;
      };
    };
    if ((Pole[x][y][z].Name == 'Queen') && (Pole[x][y][z].Color == 'White')) {
      for (let i = 0; i < 26; i++) {
        let k = 1;
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {
            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { MaybePositions[j] = MaybePosition; j++; k = 9; } else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { k = 9; } else { MaybePositions[j] = MaybePosition; j++, k++; };




          } else { k = 9; };
        }; k = 1;
      };
    };
    if ((Pole[x][y][z].Name == 'Queen') && (Pole[x][y][z].Color == 'Black')) {
      for (let i = 0; i < 26; i++) {
        while (k < 9) {
          what2 = ArrayMultiplicationByNumber(k, what[i])
          MaybePosition = SummaArray(Position, what2, 3, 3);
          x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
          if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

            if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { MaybePositions[j] = MaybePosition; j++; k = 9; } else if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { k = 9; } else { MaybePositions[j] = MaybePosition; j++, k++; };


          } else { k = 9; };
        }; k = 1;
      };
    };
    if ((Pole[x][y][z].Name == 'King') && (Pole[x][y][z].Color == 'White')) {
      for (let i = 0; i < 26; i++) {
        what2 = what[i];
        MaybePosition = SummaArray(Position, what2, 3, 3);
        x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
        if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

          if ((Pole[x_1][y_1][z_1] == null)) { MaybePositions[j] = MaybePosition; j++ };
          if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'Black')) { MaybePositions[j] = MaybePosition; j++ };

        };
      };
    };
    if ((Pole[x][y][z].Name == 'King') && (Pole[x][y][z].Color == 'Black')) {
      for (let i = 0; i < 26; i++) {
        what2 = what[i];
        MaybePosition = SummaArray(Position, what2, 3, 3);
        x_1 = MaybePosition[0]; y_1 = MaybePosition[1]; z_1 = MaybePosition[2];
        if ((x_1 < 6) && (y_1 < 6) && (z_1 < 8) && (x_1 > -1) && (y_1 > -1) && (z_1 > -1)) {

          if ((Pole[x_1][y_1][z_1] == null)) { MaybePositions[j] = MaybePosition; j++ };
          if ((Pole[x_1][y_1][z_1] != null) && (Pole[x_1][y_1][z_1].Color == 'White')) { MaybePositions[j] = MaybePosition; j++ };
        };
      };
    };

    return MaybePositions;
  } else { return false; };
};
// Диагональная рокировка: король и ладья ещё не двигались, путь по чистой
// диагонали в плоскости XY свободен, король не стоит и не проходит под шахом.
// Не добавляется в MaybeMoves (используется детектором атак) — рокировка не
// является угрозой, только реальным ходом, доступным игроку.
function getCastlingMoves(x, y, z, Pole) {
  const king = Pole[x][y][z];
  if (!king || king.Name !== 'King' || king.hasMoved) return [];
  if (IsCheck(king.Color, Pole)) return [];

  const diagDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const results = [];

  for (const [dx, dy] of diagDirs) {
    let cx = x, cy = y;
    let rookX = null, rookY = null;
    while (true) {
      cx += dx; cy += dy;
      if (cx < 0 || cx > 5 || cy < 0 || cy > 5) break;
      if (Pole[cx][cy][z] != null) {
        if (Pole[cx][cy][z].Name === 'Rook' && Pole[cx][cy][z].Color === king.Color && !Pole[cx][cy][z].hasMoved) {
          rookX = cx; rookY = cy;
        }
        break;
      }
    }
    if (rookX === null) continue;

    const passX = x + dx, passY = y + dy; // клетка, которую перепрыгивает король
    const kingDestX = x + 2 * dx, kingDestY = y + 2 * dy;

    if (Pole[passX][passY][z] != null) continue;

    const destOccupant = Pole[kingDestX][kingDestY][z];
    const destIsRook = (kingDestX === rookX) && (kingDestY === rookY);
    if (destOccupant != null && !destIsRook) continue;

    let ok = true;
    let sx = rookX - dx, sy = rookY - dy;
    while (!(sx === passX && sy === passY)) {
      if (sx < 0 || sx > 5 || sy < 0 || sy > 5) { ok = false; break; }
      if (Pole[sx][sy][z] != null) { ok = false; break; }
      sx -= dx; sy -= dy;
    }
    if (!ok) continue;

    // Король не должен проходить через атакованную клетку
    const passBoard = CreateNextPole(Pole);
    passBoard[x][y][z] = null;
    passBoard[passX][passY][z] = king;
    if (IsCheck(king.Color, passBoard)) continue;

    results.push([kingDestX, kingDestY, z]);
  }

  return results;
}

function MaybeMovesWithCheck(x, y, z, Pole) {
  let MaybePositions = MaybeMoves(x, y, z, Pole);
  if (Pole[x][y][z] && Pole[x][y][z].Name === 'King') {
    MaybePositions = MaybePositions.concat(getCastlingMoves(x, y, z, Pole));
  }
  let color = Pole[x][y][z].Color;
  let validMoves = [];
  for (let i = 0; i < MaybePositions.length; i++) {
    let move = MaybePositions[i];
    let tempBoard = CreateNextPole(Pole);
    // Применяем ход на временной доске
    tempBoard[move[0]][move[1]][move[2]] = tempBoard[x][y][z];
    tempBoard[x][y][z] = null;
    // Проверяем, не находится ли король под шахом после хода
    if (!IsCheck(color, tempBoard)) {
      validMoves.push(move);
    }
  }
  return validMoves;
}


function WhatFigure(x, y, z, Pole) {
  let answer;
  if (Pole[x][y][z] != null) {
    answer = Pole[x][y][z].Color + Pole[x][y][z].Name;
  } else {
    answer = 'Nothing';
  }
  return answer;
}

function CreateNextPole(Pole) {
  let arrrray = [];
  for (let x_2 = 0; x_2 < 6; x_2++) {
    arrrray[x_2] = [];
    for (let y_2 = 0; y_2 < 6; y_2++) {
      arrrray[x_2][y_2] = [];
      for (let z_2 = 0; z_2 < 8; z_2++) {
        arrrray[x_2][y_2][z_2] = Pole[x_2][y_2][z_2];
      }
    }
  }
  return arrrray;
}

function InMaybeMoves(x_1, y_1, z_1, NextPole) {
  let ArrayMoves = [];
  let result = [];
  result[0] = false;
  result[1] = 0;
  let k = 0;

  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 8; z++) {
        if (NextPole[x][y][z] != null) {
          ArrayMoves = MaybeMoves(x, y, z, NextPole);
          let i = 0;
          while (i < ArrayMoves.length) {
            if ((x_1 == ArrayMoves[i][0]) && (y_1 == ArrayMoves[i][1]) && (z_1 == ArrayMoves[i][2])) {
              result[0] = true;
              result[1]++;
              result[2 + k] = x;
              result[3 + k] = y;
              result[4 + k] = z;
              k = k + 3;
              i++;
            } else {
              i++;
            }
          }
        }
      }
    }
  }
  return result[0];
}

function CheckMate(x, y, z, Pole, COLOR) {
  let CL;
  // Стоит true: "мат, пока не найден ход, снимающий шах". Если у короля или
  // у всех его фигур вообще нет ни одного хода-кандидата (например, король
  // в углу полностью окружён своими же фигурами), циклы ниже ни разу не
  // выполнятся и result никогда не будет переприсвоен — раньше он оставался
  // undefined, что в вызывающем коде (FoundKing) трактовалось как "не мат"
  // из-за приведения к false, хотя это как раз мат.
  let result = true;
  let SecondResult = [];
  let ThirdResult = [];
  let NextPole = [];
  let ArrayMoves = [];

  if (COLOR) {
    CL = 'White';
  } else {
    CL = 'Black';
  }

  NextPole = CreateNextPole(Pole);
  ArrayMoves = MaybeMoves(x, y, z, NextPole);
  ThirdResult = InMaybeMoves(x, y, z, NextPole);

  if (ThirdResult) {
    let i = 0;
    while (i < ArrayMoves.length) {
      let a, b, c;
      a = ArrayMoves[i][0];
      b = ArrayMoves[i][1];
      c = ArrayMoves[i][2];
      NextPole[a][b][c] = Pole[x][y][z];
      NextPole[x][y][z] = null;
      SecondResult = InMaybeMoves(a, b, c, NextPole);

      if (SecondResult) {
        result = true;
        i++;
      } else {
        result = false;
        i++;
        return result;
      }

      NextPole = CreateNextPole(Pole);
    }

    for (let x_2 = 0; x_2 < 6; x_2++) {
      for (let y_2 = 0; y_2 < 6; y_2++) {
        for (let z_2 = 0; z_2 < 8; z_2++) {
          if ((Pole[x_2][y_2][z_2] != null) && (Pole[x_2][y_2][z_2].Color == CL)) {
            ArrayMoves = MaybeMoves(x_2, y_2, z_2, Pole);
            let i = 0;
            while (i < ArrayMoves.length) {
              let a, b, c;
              a = ArrayMoves[i][0];
              b = ArrayMoves[i][1];
              c = ArrayMoves[i][2];
              NextPole[a][b][c] = Pole[x_2][y_2][z_2];
              NextPole[x_2][y_2][z_2] = null;
              SecondResult = InMaybeMoves(x, y, z, NextPole);

              if (SecondResult) {
                result = true;
                i++;
              } else {
                result = false;
                i++;
                return result;
              }

              NextPole = CreateNextPole(Pole);
            }
          }
        }
      }
    }
  }

  return result;
}

function FoundKing(Pole) {
  let result = [false, false];

  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 8; z++) {
        if (Pole[x][y][z] != null) {
          if (Pole[x][y][z].Name == 'King') {
            if (Pole[x][y][z].Color == 'White') {
              if ((InMaybeMoves(x, y, z, Pole)) && (CheckMate(x, y, z, Pole, true))) {
                return 'CheckMateWhite';
              } else if ((InMaybeMoves(x, y, z, Pole)) && (!CheckMate(x, y, z, Pole, true))) {
                return 'CheckWhite';
              }
              continue;
            }

            if (Pole[x][y][z].Color == 'Black') {
              if ((InMaybeMoves(x, y, z, Pole)) && (CheckMate(x, y, z, Pole, false))) {
                return 'CheckMateBlack';
              } else if ((InMaybeMoves(x, y, z, Pole)) && (!CheckMate(x, y, z, Pole, false))) {
                return 'CheckBlack';
              }
              continue;
            }
          }
        }
      }
    }
  }

  return 'NotCheck';
}

// Клетка последнего ряда для цвета, на которой пешка превращается —
// White идёт от z=1 к возрастающему z, значит её дальний край z=7; Black
// идёт от z=6 к убывающему z, дальний край z=0.
function IsPromotionSquare(z_1, isWhite) {
  return isWhite ? z_1 === 7 : z_1 === 0;
}

function CreatePromotedFigure(figureType, color) {
  const isWhite = color === 'White';
  switch (figureType) {
    case 'Rook': return isWhite ? new WhiteRook() : new BlackRook();
    case 'Bishop': return isWhite ? new WhiteBishop() : new BlackBishop();
    case 'Knight': return isWhite ? new WhiteKnight() : new BlackKnight();
    case 'Triort': return isWhite ? new WhiteTriort() : new BlackTriort();
    case 'Queen':
    default: return isWhite ? new WhiteQueen() : new BlackQueen();
  }
}

function Move(x, y, z, x_1, y_1, z_1, Pole, ColorMove, promotionType) {
  const movingPiece = Pole[x][y][z];
  const colorMatches =
    (ColorMove && movingPiece && movingPiece.Color == 'White') ||
    (!ColorMove && movingPiece && movingPiece.Color == 'Black');

  if (!colorMatches) {
    return { success: false, message: 'Invalid move' };
  }

  const priorEnPassantTarget = EnPassantTarget;
  let enPassantCapture = null;
  let castling = null;

  // Взятие на проходе: пешка идёт на пустую клетку, совпадающую с текущей
  // целью взятия на проходе — снимаем настоящую взятую пешку (она стоит не
  // на клетке назначения, а рядом, на исходном z-слое ходящей пешки).
  if (
    movingPiece.Name === 'Pawn' &&
    Pole[x_1][y_1][z_1] == null &&
    priorEnPassantTarget &&
    x_1 === priorEnPassantTarget[0] && y_1 === priorEnPassantTarget[1] && z_1 === priorEnPassantTarget[2] &&
    (x_1 !== x || y_1 !== y)
  ) {
    const capturedFigure = Pole[x_1][y_1][z];
    if (capturedFigure) {
      enPassantCapture = { x: x_1, y: y_1, z: z, figure: capturedFigure };
      Pole[x_1][y_1][z] = null;
    }
  }

  // Диагональная рокировка: король идёт на 2 клетки по диагонали из ещё не
  // двигавшейся позиции — переставляем ближайшую в этом направлении (уже
  // валидированную в getCastlingMoves) ладью на клетку, которую перепрыгнул король.
  if (
    movingPiece.Name === 'King' && !movingPiece.hasMoved &&
    z === z_1 && Math.abs(x_1 - x) === 2 && Math.abs(y_1 - y) === 2
  ) {
    const dx = (x_1 - x) / 2;
    const dy = (y_1 - y) / 2;
    let cx = x, cy = y;
    let rookX = null, rookY = null;
    while (true) {
      cx += dx; cy += dy;
      if (cx < 0 || cx > 5 || cy < 0 || cy > 5) break;
      if (Pole[cx][cy][z] != null) { rookX = cx; rookY = cy; break; }
    }
    if (rookX !== null) {
      const rookPiece = Pole[rookX][rookY][z];
      const rookToX = x + dx, rookToY = y + dy;
      castling = { rookFrom: { x: rookX, y: rookY, z: z }, rookTo: { x: rookToX, y: rookToY, z: z } };
      Pole[rookX][rookY][z] = null;
      Pole[rookToX][rookToY][z] = rookPiece;
      rookPiece.hasMoved = true;
    }
  }

  // Превращение пешки: дошедшая до дальнего ряда пешка заменяется новой
  // фигурой выбранного типа (по умолчанию — ферзь). Создаём НОВЫЙ объект
  // вместо мутации movingPiece.Name, чтобы game.js.undoMove() продолжал
  // работать без изменений — там ссылка на movingPiece (сохранённая ДО
  // вызова Move) кладётся обратно на исходную клетку при отмене хода.
  let placedPiece = movingPiece;
  let promotion = null;
  if (movingPiece.Name === 'Pawn' && IsPromotionSquare(z_1, ColorMove)) {
    const chosenType = ['Queen', 'Rook', 'Bishop', 'Knight', 'Triort'].includes(promotionType)
      ? promotionType
      : 'Queen';
    placedPiece = CreatePromotedFigure(chosenType, movingPiece.Color);
    placedPiece.hasMoved = true;
    promotion = { figureType: chosenType };
  }

  Pole[x_1][y_1][z_1] = placedPiece;
  Pole[x][y][z] = null;
  movingPiece.hasMoved = true;

  // Цель взятия на проходе доступна только следующим ходом сразу после
  // двойного шага пешки по z — иначе сбрасывается.
  if (movingPiece.Name === 'Pawn' && x === x_1 && y === y_1 && Math.abs(z_1 - z) === 2) {
    EnPassantTarget = [x, y, (z + z_1) / 2];
  } else {
    EnPassantTarget = null;
  }

  return {
    success: true,
    nextMove: ColorMove ? 'Black' : 'White',
    board: Pole,
    castling: castling,
    enPassantCapture: enPassantCapture,
    previousEnPassantTarget: priorEnPassantTarget,
    promotion: promotion
  };
}

// Добавьте эту функцию в конец файла, перед экспортом
function IsCheck(color, pole) {
  // Найти короля указанного цвета
  let kingPos = null;
  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 8; z++) {
        if (pole[x][y][z] &&
          pole[x][y][z].Name === 'King' &&
          pole[x][y][z].Color === color) {
          kingPos = { x, y, z };
          break;
        }
      }
      if (kingPos) break;
    }
    if (kingPos) break;
  }

  if (!kingPos) return false;

  // Проверить, атакован ли король
  return InMaybeMoves(kingPos.x, kingPos.y, kingPos.z, pole);
}

// Пат: у стороны isWhite нет ни одного легального хода, но её король не под
// шахом (иначе это был бы мат, а не пат — CheckMate уже определяет это).
function IsStalemate(Pole, isWhite) {
  const color = isWhite ? 'White' : 'Black';
  if (IsCheck(color, Pole)) return false;

  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 8; z++) {
        const piece = Pole[x][y][z];
        if (piece && piece.Color === color && MaybeMovesWithCheck(x, y, z, Pole).length > 0) {
          return false;
        }
      }
    }
  }
  return true;
}

// Экспорт API для использования извне
window.ChessEngine = {
  IsStalemate: IsStalemate,
  IsPromotionSquare: IsPromotionSquare,
  CreatePromotedFigure: CreatePromotedFigure,
  Pole: Pole,
  InitGame: InitGame,
  MaybeMoves: MaybeMoves,
  WhatFigure: WhatFigure,
  CreateNextPole: CreateNextPole,
  InMaybeMoves: InMaybeMoves,
  CheckMate: CheckMate,
  IsCheck: IsCheck,
  FoundKing: FoundKing,
  MaybeMovesWithCheck: MaybeMovesWithCheck,
  getCastlingMoves: getCastlingMoves,
  SetEnPassantTarget: SetEnPassantTarget,
  GetEnPassantTarget: GetEnPassantTarget,
  Move: Move,
  FillPole: FillPole,
  Figure: Figure,
  WhitePawn: WhitePawn,
  WhiteRook: WhiteRook,
  WhiteKnight: WhiteKnight,
  WhiteBishop: WhiteBishop,
  WhiteTriort: WhiteTriort,
  WhiteQueen: WhiteQueen,
  WhiteKing: WhiteKing,
  BlackPawn: BlackPawn,
  BlackRook: BlackRook,
  BlackKnight: BlackKnight,
  BlackBishop: BlackBishop,
  BlackTriort: BlackTriort,
  BlackQueen: BlackQueen,
  BlackKing: BlackKing
};