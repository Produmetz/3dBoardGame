import asyncio
import json
import uuid
import websockets
from typing import Dict, Optional

# Хранилище подключённых клиентов и игроков
connected = {}              # websocket -> player info
players_by_name = {}        # name -> Player
rooms = {}                  # room_id -> Room

class Player:
    def __init__(self, name: str):
        self.name = name
        self.ws = None
        self.online = False
        self.room_id = None
        self.color = None

class Room:
    def __init__(self, name: str, password: Optional[str], is_public: bool,
                 game_type: str, owner: Player, board_params: dict):
        self.id = str(uuid.uuid4())[:8]
        self.name = name
        self.password = password
        self.is_public = is_public
        self.game_type = game_type          # 'chess' или 'go'
        self.board_x = board_params.get('boardX')
        self.board_y = board_params.get('boardY')
        self.board_z = board_params.get('boardZ')
        self.komi = board_params.get('komi')
        self.owner = owner
        self.players: Dict[str, Player] = {}   # для шахмат: color -> Player; для Го: просто словарь с ключами 'player1','player2'
        self.moves = []                         # история ходов

        if game_type == 'chess':
            self.players['white'] = owner
            owner.color = 'white'
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

    def remove_player(self, player: Player):
        for key, p in list(self.players.items()):
            if p == player:
                del self.players[key]
                player.room_id = None
                player.color = None
                break

    def opponent_of(self, player: Player) -> Optional[Player]:
        for p in self.players.values():
            if p != player:
                return p
        return None

    def is_full(self):
        return len(self.players) == 2

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'gameType': self.game_type,
            'playersCount': len(self.players),
            'hasPassword': self.password is not None,
            'isPublic': self.is_public,
            'boardX': self.board_x,
            'boardY': self.board_y,
            'boardZ': self.board_z,
            'komi': self.komi
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

async def delete_room_after_delay(room_id):
    await asyncio.sleep(300)  # 5 минут
    if room_id in rooms:
        room = rooms[room_id]
        if not any(p.online for p in room.players.values()):
            # удаляем комнату и сбрасываем ссылки у игроков
            for player in room.players.values():
                player.room_id = None
                player.color = None
            del rooms[room_id]

async def handler(websocket):
    player = None
    try:
        async for raw_msg in websocket:
            try:
                data = json.loads(raw_msg)
            except:
                continue

            msg_type = data.get('type')
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

                # Если игрок уже был в комнате, восстанавливаем его состояние
                if player.room_id and player.room_id in rooms:
                    room = rooms[player.room_id]
                    # Сначала отправляем параметры комнаты
                    # Определяем, чей ход
                    if room.game_type == 'go':
                        is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'Black') or (len(room.moves) % 2 == 1 and player.color == 'White')
                    else:  # chess
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
                    # Затем отправляем все ходы
                    for move in room.moves:
                        await send_message(websocket, {'type': 'move', 'move': move})
                    # Уведомляем оппонента о переподключении
                    opponent = room.opponent_of(player)
                    if opponent and opponent.online:
                        await send_message(opponent.ws, {'type': 'opponent_reconnected', 'playerName': player.name})
                else:
                    # Игрок не в комнате или комната уже удалена
                    if player.room_id:
                        player.room_id = None
                        player.color = None
                    await send_message(websocket, {'type': 'joined'})
                continue

            player = connected.get(websocket)
            if not player:
                await send_message(websocket, {'type': 'error', 'message': 'Not registered'})
                continue

            if msg_type == 'list_rooms':
                room_list = []
                for room in rooms.values():
                    if room.is_public and not room.is_full():
                        room_list.append(room.to_dict())
                await send_message(websocket, {'type': 'room_list', 'rooms': room_list})

            elif msg_type == 'create_room':
                room_name = data.get('roomName', 'New Room')
                password = data.get('password')
                is_public = data.get('isPublic', True)
                game_type = data.get('gameType', 'chess')
                board_params = {
                    'boardX': data.get('boardX'),
                    'boardY': data.get('boardY'),
                    'boardZ': data.get('boardZ'),
                    'komi': data.get('komi')
                }

                # Выход из старой комнаты
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

                # Создаём комнату
                room = Room(room_name, password, is_public, game_type, player, board_params)
                rooms[room.id] = room
                player.room_id = room.id

                await send_message(websocket, {
                    'type': 'room_created',
                    'roomId': room.id,
                    'gameType': game_type,
                    'color': player.color,
                    'boardX': room.board_x,
                    'boardY': room.board_y,
                    'boardZ': room.board_z,
                    'komi': room.komi,
                    'isMyTurn': True   # создатель всегда ходит первым
                })

            elif msg_type == 'join_room':
                room_id = data.get('roomId')
                password = data.get('password')
                room = rooms.get(room_id)
                if not room:
                    await send_message(websocket, {'type': 'error', 'message': 'Room not found'})
                    continue
                if room.is_full():
                    await send_message(websocket, {'type': 'error', 'message': 'Room is full'})
                    continue
                if room.password and room.password != password:
                    await send_message(websocket, {'type': 'error', 'message': 'Wrong password'})
                    continue

                # Выход из старой комнаты
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

                # Определяем цвет присоединяющегося
                if room.game_type == 'chess':
                    new_color = 'black' if 'white' in room.players else 'white'
                    room.add_player(player, new_color)
                else:  # go
                    room.add_player(player)  # цвет установится внутри add_player
                player.room_id = room.id

                opponent = room.opponent_of(player)
                # Определяем, чей ход (в зависимости от количества уже сделанных ходов)
                if room.game_type == 'go':
                    is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'Black') or (len(room.moves) % 2 == 1 and player.color == 'White')
                else:
                    is_my_turn = (len(room.moves) % 2 == 0 and player.color == 'white') or (len(room.moves) % 2 == 1 and player.color == 'black')

                await send_message(websocket, {
                    'type': 'joined_room',
                    'roomId': room.id,
                    'color': player.color,
                    'opponentName': opponent.name if opponent else None,
                    'gameType': room.game_type,
                    'boardX': room.board_x,
                    'boardY': room.board_y,
                    'boardZ': room.board_z,
                    'komi': room.komi,
                    'isMyTurn': is_my_turn
                })
                # Отправляем все предыдущие ходы новому игроку
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
                        if not room.players:
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
                # Сохраняем ход
                room.moves.append(move_data)
                opponent = room.opponent_of(player)
                if opponent and opponent.online:
                    await send_message(opponent.ws, {'type': 'move', 'move': move_data})

            elif msg_type == 'chat':
                if not player.room_id:
                    continue
                room = rooms.get(player.room_id)
                if room:
                    await broadcast_to_room(room, {
                        'type': 'chat',
                        'sender': player.name,
                        'message': data.get('message')
                    })

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
                opponent = room.opponent_of(player) if room else None
                if opponent and opponent.online:
                    await send_message(opponent.ws, {'type': 'resign'})

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        # Игрок отключился
        player = connected.pop(websocket, None)
        if player:
            player.online = False
            player.ws = None
            if player.room_id:
                room = rooms.get(player.room_id)
                if room:
                    # Уведомляем оппонента (если он онлайн) об отключении
                    opponent = room.opponent_of(player)
                    if opponent and opponent.online:
                        await send_message(opponent.ws, {'type': 'opponent_disconnected', 'playerName': player.name})
                    # Проверяем, остались ли в комнате онлайн-игроки
                    any_online = any(p.online for p in room.players.values())
                    if not any_online:
                        # Запускаем таймер на удаление комнаты
                        asyncio.create_task(delete_room_after_delay(room.id))

async def main():
    async with websockets.serve(handler, "localhost", 8765):
        print("Сервер запущен на ws://localhost:8765")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())