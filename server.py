import asyncio
import json
import uuid
import os
import logging
import time
import sqlite3
import hashlib
import http
from typing import Dict, Optional

import websockets
import jwt
import bcrypt
from aiohttp import web
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.environ.get("JWT_SECRET", "default-secret-key-" + str(uuid.uuid4()))
WS_PORT = int(os.environ.get("PORT", 10000))
HTTP_PORT = int(os.environ.get("HTTP_PORT", 8000))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger("websockets.server").setLevel(logging.CRITICAL)

connected = {}
players_by_name = {}
rooms = {}


def get_db():
    conn = sqlite3.connect('game_server.db')
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            skill_level TEXT DEFAULT 'amateur',
            public_rating INTEGER DEFAULT 1,
            rating_chess INTEGER DEFAULT 1200,
            rating_go INTEGER DEFAULT 1200,
            games_played_chess INTEGER DEFAULT 0,
            wins_chess INTEGER DEFAULT 0,
            losses_chess INTEGER DEFAULT 0,
            draws_chess INTEGER DEFAULT 0,
            games_played_go INTEGER DEFAULT 0,
            wins_go INTEGER DEFAULT 0,
            losses_go INTEGER DEFAULT 0,
            draws_go INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            game_type TEXT NOT NULL,
            game_mode TEXT DEFAULT 'rated',
            player1_id INTEGER,
            player1_name TEXT,
            player2_id INTEGER,
            player2_name TEXT,
            winner_id INTEGER,
            winner_name TEXT,
            moves TEXT,
            board_params TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player1_id) REFERENCES users(id),
            FOREIGN KEY (player2_id) REFERENCES users(id),
            FOREIGN KEY (winner_id) REFERENCES users(id)
        )
    ''')
    conn.commit()
    conn.close()

    # Миграция: добавить недостающие колонки
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("ALTER TABLE users ADD COLUMN skill_level TEXT DEFAULT 'amateur'")
        cursor.execute("ALTER TABLE users ADD COLUMN public_rating INTEGER DEFAULT 1")
        cursor.execute("ALTER TABLE games ADD COLUMN game_mode TEXT DEFAULT 'rated'")
        conn.commit()
        conn.close()
    except:
        pass


init_db()


def hash_password(password):
    if bcrypt:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    else:
        return hashlib.sha256((password + SECRET_KEY).encode('utf-8')).hexdigest()


def verify_password(password, password_hash):
    if bcrypt:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    else:
        return hashlib.sha256((password + SECRET_KEY).encode('utf-8')).hexdigest() == password_hash


def generate_token(user_id, nickname):
    if jwt:
        payload = {
            'user_id': user_id,
            'nickname': nickname,
            'exp': int(time.time()) + 86400 * 30
        }
        return jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    else:
        return f"{user_id}:{nickname}:{int(time.time())}"


def verify_token(token):
    if jwt:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            if payload.get('exp', 0) < time.time():
                return None
            return payload
        except:
            return None
    else:
        try:
            parts = token.split(':')
            if len(parts) == 3:
                return {'user_id': int(parts[0]), 'nickname': parts[1]}
        except:
            pass
        return None


def get_or_create_guest(nickname):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE nickname = ?', (nickname,))
    user = cursor.fetchone()
    if user:
        conn.close()
        return dict(user)
    cursor.execute(
        'INSERT INTO users (nickname, password_hash) VALUES (?, ?)',
        (nickname, hash_password(str(uuid.uuid4())))
    )
    conn.commit()
    user_id = cursor.lastrowid
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user)


def elo_expected(ra, rb):
    return 1 / (1 + 10 ** ((rb - ra) / 400))

def elo_k_factor(rating, games_played):
    if games_played < 30:
        return 40
    elif rating < 2000:
        return 20
    else:
        return 10

def record_game_result(room, winner_player=None, result_type='win'):
    game_mode = getattr(room, 'game_mode', 'rated')

    if game_mode == 'casual':
        return None

    conn = get_db()
    cursor = conn.cursor()

    player1_name = None
    player2_name = None
    player1_id = None
    player2_id = None
    winner_id = None
    winner_name = None

    for color, player in room.players.items():
        if player1_name is None:
            player1_name = player.name
            player1_id = player.user_id if hasattr(player, 'user_id') else None
        else:
            player2_name = player.name
            player2_id = player.user_id if hasattr(player, 'user_id') else None

    if winner_player:
        winner_name = winner_player.name
        winner_id = winner_player.user_id if hasattr(winner_player, 'user_id') else None

    board_params = json.dumps({
        'boardX': room.board_x,
        'boardY': room.board_y,
        'boardZ': room.board_z,
        'komi': room.komi
    })

    moves_json = json.dumps(room.moves) if room.moves else '[]'

    cursor.execute('''
        INSERT INTO games (room_id, game_type, game_mode, player1_id, player1_name, player2_id, player2_name,
                          winner_id, winner_name, moves, board_params)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (room.id, room.game_type, game_mode, player1_id, player1_name, player2_id, player2_name,
          winner_id, winner_name, moves_json, board_params))

    game_id = cursor.lastrowid

    game_type = room.game_type

    if game_mode == 'unranked':
        if winner_name and player1_name:
            is_p1_winner = (winner_name == player1_name)
            if player1_id:
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    wins_{game_type} = wins_{game_type} + ? WHERE id = ?''',
                    (1 if is_p1_winner else 0, player1_id))
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    losses_{game_type} = losses_{game_type} + ? WHERE id = ?''',
                    (0 if is_p1_winner else 1, player1_id))
            if player2_id:
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    wins_{game_type} = wins_{game_type} + ? WHERE id = ?''',
                    (1 if not is_p1_winner else 0, player2_id))
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    losses_{game_type} = losses_{game_type} + ? WHERE id = ?''',
                    (0 if not is_p1_winner else 1, player2_id))
        else:
            for pid in [player1_id, player2_id]:
                if pid:
                    cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                        draws_{game_type} = draws_{game_type} + 1 WHERE id = ?''', (pid,))
    else:
        if player1_id and player2_id and player1_name and player2_name:
            cursor.execute(f'SELECT rating_{game_type}, games_played_{game_type} FROM users WHERE id = ?', (player1_id,))
            p1_row = cursor.fetchone()
            cursor.execute(f'SELECT rating_{game_type}, games_played_{game_type} FROM users WHERE id = ?', (player2_id,))
            p2_row = cursor.fetchone()

            r1 = p1_row[0] if p1_row else 1200
            r2 = p2_row[0] if p2_row else 1200
            g1 = p1_row[1] if p1_row else 0
            g2 = p2_row[1] if p2_row else 0

            e1 = elo_expected(r1, r2)
            e2 = elo_expected(r2, r1)

            if winner_name and player1_name:
                is_p1_winner = (winner_name == player1_name)
                s1 = 1.0 if is_p1_winner else 0.0
                s2 = 0.0 if is_p1_winner else 1.0
            else:
                s1 = 0.5
                s2 = 0.5

            k1 = elo_k_factor(r1, g1)
            k2 = elo_k_factor(r2, g2)

            new_r1 = max(100, round(r1 + k1 * (s1 - e1)))
            new_r2 = max(100, round(r2 + k2 * (s2 - e2)))

            delta1 = new_r1 - r1
            delta2 = new_r2 - r2

            if s1 == 1.0:
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    wins_{game_type} = wins_{game_type} + 1, rating_{game_type} = ? WHERE id = ?''', (new_r1, player1_id))
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    losses_{game_type} = losses_{game_type} + 1, rating_{game_type} = ? WHERE id = ?''', (new_r2, player2_id))
            elif s2 == 1.0:
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    losses_{game_type} = losses_{game_type} + 1, rating_{game_type} = ? WHERE id = ?''', (new_r1, player1_id))
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    wins_{game_type} = wins_{game_type} + 1, rating_{game_type} = ? WHERE id = ?''', (new_r2, player2_id))
            else:
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    draws_{game_type} = draws_{game_type} + 1, rating_{game_type} = ? WHERE id = ?''', (new_r1, player1_id))
                cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                    draws_{game_type} = draws_{game_type} + 1, rating_{game_type} = ? WHERE id = ?''', (new_r2, player2_id))
        else:
            for pid in [player1_id, player2_id]:
                if pid:
                    cursor.execute(f'''UPDATE users SET games_played_{game_type} = games_played_{game_type} + 1,
                        draws_{game_type} = draws_{game_type} + 1 WHERE id = ?''', (pid,))

    conn.commit()
    conn.close()
    return game_id


class Player:
    def __init__(self, name: str):
        self.name = name
        self.ws = None
        self.online = False
        self.room_id = None
        self.color = None
        self.user_id = None
        self.token = None


class Room:
    def __init__(self, name: str, password: Optional[str], is_public: bool,
                 game_type: str, owner: Player, board_params: dict,
                 allow_spectators: bool = True, color_mode: str = 'creator_pick',
                 game_mode: str = 'rated', creator_color: str = 'white'):
        self.id = str(uuid.uuid4())[:8]
        self.name = name
        self.password = password
        self.is_public = is_public
        self.game_type = game_type
        self.board_x = board_params.get('boardX')
        self.board_y = board_params.get('boardY')
        self.board_z = board_params.get('boardZ')
        self.komi = board_params.get('komi')
        self.owner = owner
        self.players: Dict[str, Player] = {}
        self.spectators: list = []
        self.moves = []
        self.game_over = False
        self.allow_spectators = allow_spectators
        self.color_mode = color_mode
        self.game_mode = game_mode
        self.draw_offers = {}

        if game_type == 'chess':
            color = creator_color if creator_color in ('white', 'black') else 'white'
            self.players[color] = owner
            owner.color = color
        else:
            self.players['player1'] = owner
            owner.color = 'Black'

    def add_player(self, player: Player, color: str = None):
        if self.game_type == 'chess':
            self.players[color] = player
            player.color = color
        else:
            self.players['player2'] = player
            player.color = 'White'

    def add_spectator(self, player: Player):
        if player not in self.spectators:
            self.spectators.append(player)
            player.color = 'spectator'

    def remove_spectator(self, player: Player):
        if player in self.spectators:
            self.spectators.remove(player)
            player.color = None

    def remove_player(self, player: Player):
        for key, p in list(self.players.items()):
            if p == player:
                del self.players[key]
                player.room_id = None
                player.color = None
                break
        self.remove_spectator(player)

    def opponent_of(self, player: Player) -> Optional[Player]:
        for p in self.players.values():
            if p != player:
                return p
        return None

    def is_full(self):
        return len(self.players) == 2

    def to_dict(self):
        player_names = [p.name for p in self.players.values()]
        spectator_names = [p.name for p in self.spectators]
        return {
            'id': self.id,
            'name': self.name,
            'gameType': self.game_type,
            'playersCount': len(self.players),
            'playerNames': player_names,
            'spectatorCount': len(self.spectators),
            'spectatorNames': spectator_names,
            'hasPassword': self.password is not None,
            'isPublic': self.is_public,
            'boardX': self.board_x,
            'boardY': self.board_y,
            'boardZ': self.board_z,
            'komi': self.komi,
            'ownerName': self.owner.name,
            'allowSpectators': self.allow_spectators,
            'colorMode': self.color_mode,
            'gameMode': self.game_mode
        }


async def send_message(websocket, message):
    try:
        await websocket.send(json.dumps(message))
    except:
        pass


async def broadcast_to_room(room: Room, message, exclude=None):
    for player in room.players.values():
        if player.ws != exclude and player.ws and player.online:
            await send_message(player.ws, message)
    for spectator in room.spectators:
        if spectator.ws != exclude and spectator.ws and spectator.online:
            await send_message(spectator.ws, message)


async def delete_room_after_delay(room_id):
    await asyncio.sleep(300)
    if room_id in rooms:
        room = rooms[room_id]
        if not any(p.online for p in room.players.values()):
            for player in room.players.values():
                player.room_id = None
                player.color = None
            del rooms[room_id]


def health_check(connection, request):
    if request.headers.get("Upgrade") is None:
        return connection.respond(http.HTTPStatus.OK, "OK\n")
    return None


async def websocket_handler(websocket):
    player = None
    try:
        async for raw_msg in websocket:
            try:
                data = json.loads(raw_msg)
            except:
                continue

            msg_type = data.get('type')

            if msg_type == 'register':
                nickname = data.get('nickname', '').strip()
                password = data.get('password', '')
                email = data.get('email', '').strip() or None
                skill_level = data.get('skillLevel', 'amateur')

                skill_ratings = {'beginner': 500, 'amateur': 1500, 'professional': 2500}
                initial_rating = skill_ratings.get(skill_level, 1500)

                if not nickname or len(nickname) < 2:
                    await send_message(websocket, {'type': 'error', 'message': 'Ник должен быть от 2 символов'})
                    continue
                if not password or len(password) < 4:
                    await send_message(websocket, {'type': 'error', 'message': 'Пароль должен быть от 4 символов'})
                    continue

                conn = get_db()
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM users WHERE nickname = ?', (nickname,))
                if cursor.fetchone():
                    conn.close()
                    await send_message(websocket, {'type': 'error', 'message': 'Этот ник уже занят'})
                    continue

                try:
                    cursor.execute(
                        'INSERT INTO users (nickname, email, password_hash, skill_level, rating_chess, rating_go) VALUES (?, ?, ?, ?, ?, ?)',
                        (nickname, email, hash_password(password), skill_level, initial_rating, initial_rating)
                    )
                    conn.commit()
                    user_id = cursor.lastrowid
                    conn.close()

                    token = generate_token(user_id, nickname)
                    await send_message(websocket, {
                        'type': 'registered',
                        'userId': user_id,
                        'nickname': nickname,
                        'token': token,
                        'skillLevel': skill_level
                    })
                except Exception as e:
                    conn.close()
                    await send_message(websocket, {'type': 'error', 'message': 'Ошибка регистрации: ' + str(e)})
                continue

            if msg_type == 'login':
                nickname = data.get('nickname', '').strip()
                password = data.get('password', '')

                conn = get_db()
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM users WHERE nickname = ?', (nickname,))
                user = cursor.fetchone()
                conn.close()

                if not user:
                    await send_message(websocket, {'type': 'error', 'message': 'Пользователь не найден'})
                    continue

                if not verify_password(password, user['password_hash']):
                    await send_message(websocket, {'type': 'error', 'message': 'Неверный пароль'})
                    continue

                token = generate_token(user['id'], user['nickname'])
                await send_message(websocket, {
                    'type': 'logged_in',
                    'userId': user['id'],
                    'nickname': user['nickname'],
                    'token': token
                })
                continue

            if msg_type == 'guest_join':
                player_name = data.get('playerName', 'Anonymous')
                user_data = get_or_create_guest(player_name)

                if player_name in players_by_name:
                    player = players_by_name[player_name]
                    player.ws = websocket
                    player.online = True
                else:
                    player = Player(player_name)
                    players_by_name[player_name] = player
                    player.ws = websocket
                    player.online = True
                player.user_id = user_data['id']
                connected[websocket] = player

                token = generate_token(user_data['id'], player_name)
                player.token = token

                await send_message(websocket, {
                    'type': 'guest_joined',
                    'userId': user_data['id'],
                    'nickname': player_name,
                    'token': token
                })
                continue

            if msg_type == 'auth_join':
                token = data.get('token', '')
                player_name = data.get('playerName', 'Anonymous')

                token_data = verify_token(token)
                user_id = None
                if token_data:
                    user_id = token_data.get('user_id')

                if player_name in players_by_name:
                    player = players_by_name[player_name]
                    player.ws = websocket
                    player.online = True
                else:
                    player = Player(player_name)
                    players_by_name[player_name] = player
                    player.ws = websocket
                    player.online = True
                player.user_id = user_id
                player.token = token
                connected[websocket] = player

                if player.room_id and player.room_id in rooms:
                    room = rooms[player.room_id]
                    if room.game_type == 'go':
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'Black') or (len(room.moves) % 2 == 1 and player.color == 'White')
                    else:
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'white') or (len(room.moves) % 2 == 1 and player.color == 'black')
                    await send_message(websocket, {
                        'type': 'joined_room',
                        'roomId': room.id,
                        'color': player.color,
                        'opponentName': room.opponent_of(player).name if room.opponent_of(player) else None,
                        'gameType': room.game_type,
                        'boardX': room.board_x,
                        'boardY': room.board_y,
                        'boardZ': room.board_z,
                        'komi': room.komi,
                        'isMyTurn': is_my_turn
                    })
                    for move in room.moves:
                        await send_message(websocket, {'type': 'move', 'move': move})
                    opponent = room.opponent_of(player)
                    if opponent and opponent.online:
                        await send_message(opponent.ws, {'type': 'opponent_reconnected', 'playerName': player.name})
                else:
                    if player.room_id:
                        player.room_id = None
                        player.color = None
                    await send_message(websocket, {'type': 'joined'})
                continue

            if msg_type == 'get_stats':
                target_name = data.get('nickname', '')
                conn = get_db()
                cursor = conn.cursor()
                if target_name:
                    cursor.execute('SELECT * FROM users WHERE nickname = ?', (target_name,))
                elif player and player.user_id:
                    cursor.execute('SELECT * FROM users WHERE id = ?', (player.user_id,))
                else:
                    conn.close()
                    await send_message(websocket, {'type': 'error', 'message': 'Не указан игрок'})
                    continue
                user_row = cursor.fetchone()
                conn.close()
                if not user_row:
                    await send_message(websocket, {'type': 'error', 'message': 'Игрок не найден'})
                    continue
                await send_message(websocket, {
                    'type': 'stats',
                    'nickname': user_row['nickname'],
                    'skillLevel': user_row['skill_level'],
                    'publicRating': user_row['public_rating'],
                    'rating_chess': user_row['rating_chess'],
                    'rating_go': user_row['rating_go'],
                    'games_played_chess': user_row['games_played_chess'],
                    'wins_chess': user_row['wins_chess'],
                    'losses_chess': user_row['losses_chess'],
                    'draws_chess': user_row['draws_chess'],
                    'games_played_go': user_row['games_played_go'],
                    'wins_go': user_row['wins_go'],
                    'losses_go': user_row['losses_go'],
                    'draws_go': user_row['draws_go'],
                    'created_at': user_row['created_at']
                })
                continue

            if msg_type == 'get_game_history':
                target_name = data.get('nickname', '')
                limit = data.get('limit', 20)
                conn = get_db()
                cursor = conn.cursor()
                if target_name:
                    cursor.execute(
                        'SELECT * FROM games WHERE player1_name = ? OR player2_name = ? ORDER BY created_at DESC LIMIT ?',
                        (target_name, target_name, limit))
                elif player and player.user_id:
                    cursor.execute(
                        'SELECT * FROM games WHERE player1_id = ? OR player2_id = ? ORDER BY created_at DESC LIMIT ?',
                        (player.user_id, player.user_id, limit))
                else:
                    conn.close()
                    await send_message(websocket, {'type': 'error', 'message': 'Не указан игрок'})
                    continue
                games = cursor.fetchall()
                conn.close()
                game_list = []
                for g in games:
                    game_list.append({
                        'id': g['id'],
                        'room_id': g['room_id'],
                        'game_type': g['game_type'],
                        'player1_name': g['player1_name'],
                        'player2_name': g['player2_name'],
                        'winner_name': g['winner_name'],
                        'created_at': g['created_at']
                    })
                await send_message(websocket, {
                    'type': 'game_history',
                    'games': game_list
                })
                continue

            if msg_type == 'get_replay':
                game_id = data.get('gameId')
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM games WHERE id = ?', (game_id,))
                game = cursor.fetchone()
                conn.close()
                if not game:
                    await send_message(websocket, {'type': 'error', 'message': 'Игра не найдена'})
                    continue
                moves = json.loads(game['moves']) if game['moves'] else []
                board_params = json.loads(game['board_params']) if game['board_params'] else {}
                await send_message(websocket, {
                    'type': 'replay',
                    'gameId': game['id'],
                    'gameType': game['game_type'],
                    'player1Name': game['player1_name'],
                    'player2Name': game['player2_name'],
                    'winnerName': game['winner_name'],
                    'moves': moves,
                    'boardParams': board_params,
                    'createdAt': game['created_at']
                })
                continue

            if msg_type == 'get_leaderboard':
                game = data.get('game', 'chess')
                limit = data.get('limit', 50)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute(
                    f'SELECT nickname, skill_level, rating_{game}, games_played_{game}, '
                    f'wins_{game}, losses_{game}, draws_{game} '
                    f'FROM users WHERE public_rating = 1 ORDER BY rating_{game} DESC LIMIT ?',
                    (limit,)
                )
                users = cursor.fetchall()
                conn.close()
                board = []
                for u in users:
                    board.append({
                        'nickname': u['nickname'],
                        'skillLevel': u['skill_level'],
                        'rating': u[f'rating_{game}'],
                        'gamesPlayed': u[f'games_played_{game}'],
                        'wins': u[f'wins_{game}'],
                        'losses': u[f'losses_{game}'],
                        'draws': u[f'draws_{game}']
                    })
                await send_message(websocket, {'type': 'leaderboard', 'game': game, 'leaderboard': board})
                continue

            if msg_type == 'set_public_rating':
                if player and player.user_id:
                    public = data.get('public', 1)
                    conn = get_db()
                    cursor = conn.cursor()
                    cursor.execute('UPDATE users SET public_rating = ? WHERE id = ?', (public, player.user_id))
                    conn.commit()
                    conn.close()
                continue

            player = connected.get(websocket)
            if not player:
                await send_message(websocket, {'type': 'error', 'message': 'Not registered'})
                continue

            if msg_type == 'join':
                player_name = data.get('playerName', 'Anonymous')
                if player_name in players_by_name:
                    player = players_by_name[player_name]
                    player.ws = websocket
                    player.online = True
                else:
                    player = Player(player_name)
                    players_by_name[player_name] = player
                    player.ws = websocket
                    player.online = True
                connected[websocket] = player

                if player.room_id and player.room_id in rooms:
                    room = rooms[player.room_id]
                    if room.game_type == 'go':
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'Black') or (len(room.moves) % 2 == 1 and player.color == 'White')
                    else:
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'white') or (len(room.moves) % 2 == 1 and player.color == 'black')
                    await send_message(websocket, {
                        'type': 'joined_room',
                        'roomId': room.id,
                        'color': player.color,
                        'opponentName': room.opponent_of(player).name if room.opponent_of(player) else None,
                        'gameType': room.game_type,
                        'boardX': room.board_x,
                        'boardY': room.board_y,
                        'boardZ': room.board_z,
                        'komi': room.komi,
                        'isMyTurn': is_my_turn
                    })
                    for move in room.moves:
                        await send_message(websocket, {'type': 'move', 'move': move})
                    opponent = room.opponent_of(player)
                    if opponent and opponent.online:
                        await send_message(opponent.ws, {'type': 'opponent_reconnected', 'playerName': player.name})
                else:
                    if player.room_id:
                        player.room_id = None
                        player.color = None
                    await send_message(websocket, {'type': 'joined'})
                continue

            if msg_type == 'list_rooms':
                room_list = []
                for room in rooms.values():
                    if room.is_public and not room.is_full() and not room.game_over:
                        room_list.append(room.to_dict())
                await send_message(websocket, {'type': 'room_list', 'rooms': room_list})

            elif msg_type == 'create_room':
                room_name = data.get('roomName', 'New Room')
                password = data.get('password')
                is_public = data.get('isPublic', True)
                game_type = data.get('gameType', 'chess')
                allow_spectators = data.get('allowSpectators', True)
                color_mode = data.get('colorMode', 'creator_pick')
                game_mode = data.get('gameMode', 'rated')
                creator_color = data.get('creatorColor', 'white')
                board_params = {
                    'boardX': data.get('boardX'),
                    'boardY': data.get('boardY'),
                    'boardZ': data.get('boardZ'),
                    'komi': data.get('komi')
                }

                if player.room_id:
                    old_room = rooms.get(player.room_id)
                    if old_room:
                        old_room.remove_player(player)
                        opponent = old_room.opponent_of(player)
                        if opponent and opponent.online:
                            await send_message(opponent.ws, {'type': 'opponent_left'})
                        if not old_room.players:
                            del rooms[old_room.id]
                    player.room_id = None

                room = Room(room_name, password, is_public, game_type, player, board_params,
                           allow_spectators, color_mode, game_mode, creator_color)
                rooms[room.id] = room
                player.room_id = room.id

                await send_message(websocket, {
                    'type': 'room_created',
                    'roomId': room.id,
                    'roomName': room.name,
                    'gameType': game_type,
                    'color': player.color,
                    'boardX': room.board_x,
                    'boardY': room.board_y,
                    'boardZ': room.board_z,
                    'komi': room.komi,
                    'isMyTurn': True,
                    'allowSpectators': allow_spectators,
                    'colorMode': color_mode,
                    'gameMode': game_mode
                })

            elif msg_type == 'join_room':
                room_id = data.get('roomId')
                password = data.get('password')
                role = data.get('role', 'player')
                room = rooms.get(room_id)
                if not room:
                    await send_message(websocket, {'type': 'error', 'message': 'Room not found'})
                    continue
                if room.password and room.password != password:
                    await send_message(websocket, {'type': 'error', 'message': 'Wrong password'})
                    continue

                if player.room_id and player.room_id != room_id:
                    old_room = rooms.get(player.room_id)
                    if old_room:
                        old_room.remove_player(player)
                        opponent = old_room.opponent_of(player)
                        if opponent and opponent.online:
                            await send_message(opponent.ws, {'type': 'opponent_left'})
                        if not old_room.players:
                            del rooms[old_room.id]
                    player.room_id = None

                if player.room_id == room_id:
                    if room.game_type == 'go':
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'Black') or (len(room.moves) % 2 == 1 and player.color == 'White')
                    else:
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'white') or (len(room.moves) % 2 == 1 and player.color == 'black')
                    await send_message(websocket, {
                        'type': 'joined_room',
                        'roomId': room.id,
                        'roomName': room.name,
                        'color': player.color,
                        'role': 'player',
                        'opponentName': room.opponent_of(player).name if room.opponent_of(player) else None,
                        'gameType': room.game_type,
                        'boardX': room.board_x,
                        'boardY': room.board_y,
                        'boardZ': room.board_z,
                        'komi': room.komi,
                        'isMyTurn': is_my_turn
                    })
                    for move in room.moves:
                        await send_message(websocket, {'type': 'move', 'move': move})
                    continue

                if role == 'spectator':
                    if not room.allow_spectators:
                        await send_message(websocket, {'type': 'error', 'message': 'Зрители не разрешены'})
                        continue
                    room.add_spectator(player)
                    player.room_id = room.id

                    player_names = [p.name for p in room.players.values()]
                    player_colors = {p.name: p.color for p in room.players.values()}
                    await send_message(websocket, {
                        'type': 'joined_room',
                        'roomId': room.id,
                        'roomName': room.name,
                        'color': 'spectator',
                        'role': 'spectator',
                        'playerNames': player_names,
                        'playerColors': player_colors,
                        'opponentName': player_names[1] if len(player_names) > 1 else None,
                        'gameType': room.game_type,
                        'boardX': room.board_x,
                        'boardY': room.board_y,
                        'boardZ': room.board_z,
                        'komi': room.komi,
                        'isMyTurn': False
                    })
                    for move in room.moves:
                        await send_message(websocket, {'type': 'move', 'move': move})
                else:
                    if room.is_full():
                        await send_message(websocket, {'type': 'error', 'message': 'Room is full'})
                        continue

                    if room.game_type == 'chess':
                        if room.color_mode == 'free_choice':
                            requested_color = data.get('color')
                            if requested_color in room.players:
                                new_color = 'black' if 'white' in room.players else 'white'
                            else:
                                new_color = requested_color if requested_color in ['white', 'black'] else ('black' if 'white' in room.players else 'white')
                        else:
                            new_color = 'black' if 'white' in room.players else 'white'
                        room.add_player(player, new_color)
                    else:
                        room.add_player(player)
                    player.room_id = room.id

                    opponent = room.opponent_of(player)
                    if room.game_type == 'go':
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'Black') or (len(room.moves) % 2 == 1 and player.color == 'White')
                    else:
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'white') or (len(room.moves) % 2 == 1 and player.color == 'black')

                    await send_message(websocket, {
                        'type': 'joined_room',
                        'roomId': room.id,
                        'roomName': room.name,
                        'color': player.color,
                        'role': 'player',
                        'opponentName': opponent.name if opponent else None,
                        'gameType': room.game_type,
                        'boardX': room.board_x,
                        'boardY': room.board_y,
                        'boardZ': room.board_z,
                        'komi': room.komi,
                        'isMyTurn': is_my_turn
                    })
                    for move in room.moves:
                        await send_message(websocket, {'type': 'move', 'move': move})

                    if opponent:
                        await send_message(opponent.ws, {
                            'type': 'opponent_joined',
                            'playerName': player.name
                        })

            elif msg_type == 'leave_room':
                if player.room_id:
                    room = rooms.get(player.room_id)
                    if room:
                        opponent = room.opponent_of(player)
                        room.remove_player(player)
                        if opponent and opponent.online:
                            await send_message(opponent.ws, {'type': 'opponent_left'})
                        if not room.players and not room.spectators:
                            del rooms[room.id]
                    player.room_id = None
                    player.color = None
                await send_message(websocket, {'type': 'left_room'})

            elif msg_type == 'move':
                if not player.room_id:
                    await send_message(websocket, {'type': 'error', 'message': 'Not in a room'})
                    continue
                room = rooms.get(player.room_id)
                if not room:
                    continue
                move_data = data.get('move')
                if move_data is None:
                    continue
                room.moves.append(move_data)
                opponent = room.opponent_of(player)
                if opponent and opponent.online:
                    await send_message(opponent.ws, {'type': 'move', 'move': move_data})

            elif msg_type == 'game_over':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room and not room.game_over:
                    room.game_over = True
                    winner_name = data.get('winner')
                    result = data.get('result', 'win')
                    reason = data.get('reason', '')
                    winner_player = None
                    if winner_name:
                        for p in room.players.values():
                            if p.name == winner_name:
                                winner_player = p
                                break

                    rating_changes = {}
                    if room.game_mode == 'rated':
                        for p in room.players.values():
                            if p.user_id:
                                conn = get_db()
                                cursor = conn.cursor()
                                gt = room.game_type
                                cursor.execute(f'SELECT rating_{gt} FROM users WHERE id = ?', (p.user_id,))
                                row = cursor.fetchone()
                                conn.close()
                                if row:
                                    rating_changes[p.name] = row[0]

                    record_game_result(room, winner_player, result)

                    if room.game_mode == 'rated':
                        for p in room.players.values():
                            if p.user_id:
                                conn = get_db()
                                cursor = conn.cursor()
                                gt = room.game_type
                                cursor.execute(f'SELECT rating_{gt} FROM users WHERE id = ?', (p.user_id,))
                                row = cursor.fetchone()
                                conn.close()
                                if row and p.name in rating_changes:
                                    rating_changes[p.name] = row[0] - rating_changes[p.name]

                    await broadcast_to_room(room, {
                        'type': 'game_over',
                        'winner': winner_name,
                        'result': result,
                        'reason': reason,
                        'gameMode': room.game_mode,
                        'ratingChanges': rating_changes if room.game_mode == 'rated' else {}
                    })

            elif msg_type == 'chat':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room:
                    await broadcast_to_room(room, {
                        'type': 'chat',
                        'sender': player.name,
                        'message': data.get('message')
                    }, exclude=player.ws)

            elif msg_type == 'undo_request':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                opponent = room.opponent_of(player) if room else None
                if opponent and opponent.online:
                    await send_message(opponent.ws, {'type': 'undo_request'})

            elif msg_type == 'undo_response':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                opponent = room.opponent_of(player) if room else None
                if opponent and opponent.online:
                    await send_message(opponent.ws, {
                        'type': 'undo_response',
                        'accepted': data.get('accepted', False)
                    })

            elif msg_type == 'pass':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                opponent = room.opponent_of(player) if room else None
                if opponent and opponent.online:
                    await send_message(opponent.ws, {'type': 'pass'})

            elif msg_type == 'resign':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room and not room.game_over:
                    room.game_over = True
                    opponent = room.opponent_of(player) if room else None
                    winner_player = opponent
                    record_game_result(room, winner_player)
                    await broadcast_to_room(room, {
                        'type': 'game_over',
                        'winner': opponent.name if opponent else None,
                        'result': 'resign',
                        'reason': f'{player.name} сдался',
                        'gameMode': room.game_mode
                    })

            elif msg_type == 'draw_offer':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room and not room.game_over:
                    opponent = room.opponent_of(player)
                    if opponent and opponent.online:
                        await send_message(opponent.ws, {
                            'type': 'draw_offer',
                            'from': player.name
                        })

            elif msg_type == 'draw_response':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room and not room.game_over:
                    accepted = data.get('accepted', False)
                    if accepted:
                        room.game_over = True
                        record_game_result(room, None)
                        await broadcast_to_room(room, {
                            'type': 'game_over',
                            'winner': None,
                            'result': 'draw',
                            'reason': 'Ничья по соглашению',
                            'gameMode': room.game_mode
                        })
                    else:
                        opponent = room.opponent_of(player)
                        if opponent and opponent.online:
                            await send_message(opponent.ws, {
                                'type': 'draw_response',
                                'accepted': False,
                                'from': player.name
                            })

            elif msg_type == 'rematch_offer':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room:
                    opponent = room.opponent_of(player)
                    if opponent and opponent.online:
                        await send_message(opponent.ws, {
                            'type': 'rematch_offer',
                            'from': player.name
                        })

            elif msg_type == 'rematch_response':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room:
                    accepted = data.get('accepted', False)
                    if accepted:
                        room.game_over = False
                        room.moves = []
                        room.draw_offers = {}

                        old_players = dict(room.players)
                        if room.game_type == 'chess':
                            colors = list(old_players.keys())
                            if len(colors) == 2:
                                room.players = {}
                                room.players[colors[0]] = old_players[colors[1]]
                                room.players[colors[1]] = old_players[colors[0]]
                                for color, p in room.players.items():
                                    p.color = color
                        else:
                            for p in room.players.values():
                                p.color = 'White' if p.color == 'Black' else 'Black'

                        for p in room.players.values():
                            is_my_turn = (p.color == 'white') if room.game_type == 'chess' else (p.color == 'Black')
                            if p.ws and p.online:
                                await send_message(p.ws, {
                                    'type': 'rematch_start',
                                    'color': p.color,
                                    'isMyTurn': is_my_turn,
                                    'boardX': room.board_x,
                                    'boardY': room.board_y,
                                    'boardZ': room.board_z,
                                    'komi': room.komi
                                })
                    else:
                        opponent = room.opponent_of(player)
                        if opponent and opponent.online:
                            await send_message(opponent.ws, {
                                'type': 'rematch_response',
                                'accepted': False,
                                'from': player.name
                            })

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        player = connected.pop(websocket, None)
        if player:
            player.online = False
            player.ws = None
            if player.room_id:
                room = rooms.get(player.room_id)
                if room:
                    opponent = room.opponent_of(player)
                    if opponent and opponent.online:
                        await send_message(opponent.ws, {'type': 'opponent_disconnected', 'playerName': player.name})
                    any_online = any(p.online for p in room.players.values())
                    if not any_online:
                        asyncio.create_task(delete_room_after_delay(room.id))


async def register_handler(request):
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    nickname = data.get('nickname', '').strip()
    password = data.get('password', '')
    email = data.get('email', '').strip() or None

    if not nickname or len(nickname) < 2:
        return web.json_response({'error': 'Ник должен быть от 2 символов'}, status=400)
    if not password or len(password) < 4:
        return web.json_response({'error': 'Пароль должен быть от 4 символов'}, status=400)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM users WHERE nickname = ?', (nickname,))
    if cursor.fetchone():
        conn.close()
        return web.json_response({'error': 'Этот ник уже занят'}, status=400)

    try:
        cursor.execute(
            'INSERT INTO users (nickname, email, password_hash) VALUES (?, ?, ?)',
            (nickname, email, hash_password(password))
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        token = generate_token(user_id, nickname)
        return web.json_response({
            'userId': user_id,
            'nickname': nickname,
            'token': token
        })
    except Exception as e:
        conn.close()
        return web.json_response({'error': str(e)}, status=500)


async def login_handler(request):
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    nickname = data.get('nickname', '').strip()
    password = data.get('password', '')

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE nickname = ?', (nickname,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return web.json_response({'error': 'Пользователь не найден'}, status=404)
    if not verify_password(password, user['password_hash']):
        return web.json_response({'error': 'Неверный пароль'}, status=401)

    token = generate_token(user['id'], user['nickname'])
    return web.json_response({
        'userId': user['id'],
        'nickname': user['nickname'],
        'token': token
    })


async def stats_handler(request):
    nickname = request.match_info.get('nickname')
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header[7:]
        payload = verify_token(token)
        if not payload:
            return web.json_response({'error': 'Invalid token'}, status=401)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE nickname = ?', (nickname,))
    user = cursor.fetchone()
    conn.close()
    if not user:
        return web.json_response({'error': 'Игрок не найден'}, status=404)

    return web.json_response({
        'nickname': user['nickname'],
        'skillLevel': user['skill_level'],
        'publicRating': user['public_rating'],
        'rating_chess': user['rating_chess'],
        'rating_go': user['rating_go'],
        'games_played_chess': user['games_played_chess'],
        'wins_chess': user['wins_chess'],
        'losses_chess': user['losses_chess'],
        'draws_chess': user['draws_chess'],
        'games_played_go': user['games_played_go'],
        'wins_go': user['wins_go'],
        'losses_go': user['losses_go'],
        'draws_go': user['draws_go'],
        'created_at': user['created_at']
    })


async def history_handler(request):
    nickname = request.match_info.get('nickname')
    limit = int(request.query.get('limit', 20))

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT * FROM games WHERE player1_name = ? OR player2_name = ? ORDER BY created_at DESC LIMIT ?',
        (nickname, nickname, limit)
    )
    games = cursor.fetchall()
    conn.close()

    game_list = []
    for g in games:
        game_list.append({
            'id': g['id'],
            'room_id': g['room_id'],
            'game_type': g['game_type'],
            'player1_name': g['player1_name'],
            'player2_name': g['player2_name'],
            'winner_name': g['winner_name'],
            'created_at': g['created_at']
        })
    return web.json_response({'games': game_list})


async def rooms_handler(request):
    room_list = []
    for room in rooms.values():
        if room.is_public and not room.is_full():
            room_list.append(room.to_dict())
    return web.json_response({'rooms': room_list})


async def replay_handler(request):
    game_id = request.match_info.get('game_id')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM games WHERE id = ?', (game_id,))
    game = cursor.fetchone()
    conn.close()
    if not game:
        return web.json_response({'error': 'Игра не найдена'}, status=404)

    moves = json.loads(game['moves']) if game['moves'] else []
    board_params = json.loads(game['board_params']) if game['board_params'] else {}
    return web.json_response({
        'gameId': game['id'],
        'gameType': game['game_type'],
        'player1Name': game['player1_name'],
        'player2Name': game['player2_name'],
        'winnerName': game['winner_name'],
        'moves': moves,
        'boardParams': board_params,
        'createdAt': game['created_at']
    })


async def leaderboard_handler(request):
    game_type = request.query.get('game', 'chess')
    limit = int(request.query.get('limit', 50))

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        f'SELECT nickname, skill_level, rating_{game_type}, games_played_{game_type}, '
        f'wins_{game_type}, losses_{game_type}, draws_{game_type} '
        f'FROM users WHERE public_rating = 1 ORDER BY rating_{game_type} DESC LIMIT ?',
        (limit,)
    )
    users = cursor.fetchall()
    conn.close()

    board = []
    for u in users:
        board.append({
            'nickname': u['nickname'],
            'skillLevel': u['skill_level'],
            'rating': u[f'rating_{game_type}'],
            'gamesPlayed': u[f'games_played_{game_type}'],
            'wins': u[f'wins_{game_type}'],
            'losses': u[f'losses_{game_type}'],
            'draws': u[f'draws_{game_type}']
        })
    return web.json_response({'game': game_type, 'leaderboard': board})


async def main():
    ws_server = await websockets.serve(
        websocket_handler,
        host="0.0.0.0",
        port=WS_PORT,
        process_request=health_check,
    )
    logger.info(f"WebSocket сервер запущен на ws://0.0.0.0:{WS_PORT}")

    app = web.Application()
    app.router.add_post('/api/auth/register', register_handler)
    app.router.add_post('/api/auth/login', login_handler)
    app.router.add_get('/api/users/{nickname}/stats', stats_handler)
    app.router.add_get('/api/users/{nickname}/history', history_handler)
    app.router.add_get('/api/rooms', rooms_handler)
    app.router.add_get('/api/games/{game_id}/replay', replay_handler)
    app.router.add_get('/api/leaderboard', leaderboard_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', HTTP_PORT)
    await site.start()
    logger.info(f"REST API запущен на http://0.0.0.0:{HTTP_PORT}")

    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        await runner.cleanup()
        ws_server.close()
        await ws_server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
