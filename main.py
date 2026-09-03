from flask import Flask, render_template, request, session, redirect, url_for
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask import jsonify
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash
import os
from dotenv import load_dotenv
from pathlib import Path
import string
import secrets
import sqlite3
import re
import hashlib
from PIL import Image, ImageOps
from datetime import datetime, timezone, timedelta
from collections import defaultdict, deque
import time
import logging
import json
import base64

base = Path(__file__).resolve().parent
env_path = base / 'db' / 'info.env'
if not env_path.exists():
    print(f"Файл .env не найден в {env_path}")
load_dotenv(dotenv_path=env_path)

# threading + reloader в dev; gevent — для продакшена (DOVERY_DEV=0)
DEV_MODE = os.getenv('DOVERY_DEV', '1') == '1'


def _socketio_cors_origins():
    """Список origin для WebSocket; без * — только явные домены."""
    raw = os.getenv('SOCKETIO_CORS_ORIGINS', '').strip()
    if raw:
        return [part.strip() for part in raw.split(',') if part.strip()]
    if DEV_MODE:
        return [
            'http://localhost:5000',
            'http://127.0.0.1:5000',
            'http://localhost:8000',
            'http://127.0.0.1:8000',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
        ]
    return False


app = Flask(__name__)
app.secret_key = os.getenv('secret')
if not app.secret_key:
    raise RuntimeError("Не задан secret в db/info.env — без него сессии небезопасны")
db_name = os.getenv('db')
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://",
)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=True,
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    MAX_CONTENT_LENGTH=5 * 1024 * 1024
)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
USERNAME_RE = re.compile(r"^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$")
CLIENT_HASH_RE = re.compile(r"^[a-f0-9]{64}$")
MAX_MESSAGE_CHARS = 1024
MAX_ENCRYPTED_MESSAGE_LEN = 8192
MAX_MESSAGES_PER_MINUTE = 20
HISTORY_PAGE_SIZE = 20
_message_rate_buckets = defaultdict(deque)
# Заглушка для выравнивания времени ответа при неверном логине
DUMMY_PASSWORD_HASH = generate_password_hash("dovery-dummy-password-not-used")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_valid_base64(value, min_len=32, max_len=4096):
    if not value or not isinstance(value, str):
        return False
    if not (min_len <= len(value) <= max_len):
        return False
    try:
        base64.b64decode(value, validate=True)
        return True
    except Exception:
        return False

def allow_message_send(user_id):
    """Не больше MAX_MESSAGES_PER_MINUTE сообщений в минуту на пользователя."""
    if not user_id:
        return False
    now = time.monotonic()
    bucket = _message_rate_buckets[user_id]
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= MAX_MESSAGES_PER_MINUTE:
        return False
    bucket.append(now)
    return True

online_users = {}
typing_in_chat = {}  # user_id -> chat_id
viewing_by_sid = {}  # sid -> {"chat_id", "ts"}
session_by_sid = {}  # sid -> {"user_id", "token_hash"}
VIEWING_EXPIRE_SEC = 6.0
logging.basicConfig(level=logging.INFO)
socketio = SocketIO(
    app,
    cors_allowed_origins=_socketio_cors_origins(),
    async_mode="threading" if DEV_MODE else "gevent",
    ping_timeout=60,
    ping_interval=25,
    logger=DEV_MODE,
    engineio_logger=DEV_MODE,
)

@app.after_request
def add_security_headers(response):
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' blob: data: https://kaspersky-labs.com; "
        "connect-src 'self' wss://kaspersky-labs.com; "
        "upgrade-insecure-requests;"
    )
    response.headers['Content-Security-Policy'] = csp
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

    return response

# Соединение с базой данных
def get_db_connection():
    if db_name is None:
        raise ValueError("Путь к базе данных не настроен в .env (переменная 'db')")
    
    conn = sqlite3.connect(db_name)
    conn.row_factory = sqlite3.Row 
    return conn

# Миграция схемы БД: добавляем chat_id в messages и id в chats
def migrate_schema():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("PRAGMA table_info(chats)")
            chats_columns = [row[1] for row in cursor.fetchall()]
            
            cursor.execute("PRAGMA table_info(message)")
            message_columns = [row[1] for row in cursor.fetchall()]
            
            if 'id' not in chats_columns:
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS chats_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_one_id INTEGER NOT NULL,
                        user_two_id INTEGER NOT NULL,
                        UNIQUE(user_one_id, user_two_id)
                    )
                ''')
                cursor.execute('INSERT INTO chats_new (user_one_id, user_two_id) SELECT user_one_id, user_two_id FROM chats')
                cursor.execute('DROP TABLE chats')
                cursor.execute('ALTER TABLE chats_new RENAME TO chats')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_chats_users ON chats(user_one_id, user_two_id)')
            
            if 'chat_id' not in message_columns:
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS message_new (
                        id TEXT PRIMARY KEY,
                        chat_id INTEGER NOT NULL,
                        sender_id INTEGER NOT NULL,
                        message_text TEXT NOT NULL,
                        time TEXT NOT NULL,
                        FOREIGN KEY (chat_id) REFERENCES chats(id)
                    )
                ''')
                cursor.execute('''
                    INSERT INTO message_new (id, chat_id, sender_id, message_text, time)
                    SELECT m.id, c.id, m.sender_id, m.message_text, m.time
                    FROM message m
                    JOIN chats c ON (CAST(m.sender_id AS INTEGER) = c.user_one_id AND CAST(m.receiver_id AS INTEGER) = c.user_two_id)
                       OR (CAST(m.sender_id AS INTEGER) = c.user_two_id AND CAST(m.receiver_id AS INTEGER) = c.user_one_id)
                ''')
                cursor.execute('DROP TABLE message')
                cursor.execute('ALTER TABLE message_new RENAME TO message')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_message_chat_id ON message(chat_id)')

            cursor.execute("PRAGMA table_info(message)")
            message_columns = [row[1] for row in cursor.fetchall()]
            if 'is_read' not in message_columns:
                # Старые сообщения считаем прочитанными, чтобы не вспыхнули бейджи
                cursor.execute('ALTER TABLE message ADD COLUMN is_read INTEGER NOT NULL DEFAULT 1')
                cursor.execute(
                    'CREATE INDEX IF NOT EXISTS idx_message_chat_unread ON message(chat_id, is_read, sender_id)'
                )

            cursor.execute(
                'CREATE INDEX IF NOT EXISTS idx_message_chat_time ON message(chat_id, time, id)'
            )
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS blocks (
                    chat_id INTEGER NOT NULL,
                    blocked_user_id INTEGER NOT NULL,
                    UNIQUE(chat_id, blocked_user_id)
                )
            ''')
            cursor.execute(
                'CREATE INDEX IF NOT EXISTS idx_blocks_chat_id ON blocks(chat_id)'
            )
            cursor.execute(
                'CREATE INDEX IF NOT EXISTS idx_blocks_blocked_user_id ON blocks(blocked_user_id)'
            )

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    device_name TEXT,
                    device_os TEXT
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_hash ON sessions(token_hash)')
            cursor.execute("PRAGMA table_info(sessions)")
            session_columns = [row[1] for row in cursor.fetchall()]
            if 'device_name' not in session_columns:
                cursor.execute('ALTER TABLE sessions ADD COLUMN device_name TEXT')
            if 'device_os' not in session_columns:
                cursor.execute('ALTER TABLE sessions ADD COLUMN device_os TEXT')

            cursor.execute("PRAGMA table_info(users)")
            user_columns = [row[1] for row in cursor.fetchall()]
            if 'key_salt' not in user_columns:
                cursor.execute('ALTER TABLE users ADD COLUMN key_salt TEXT')
            if 'signing_public_key' not in user_columns:
                cursor.execute('ALTER TABLE users ADD COLUMN signing_public_key TEXT')
            if 'signing_private_key' not in user_columns:
                cursor.execute('ALTER TABLE users ADD COLUMN signing_private_key TEXT')
            if 'public_key_sig' not in user_columns:
                cursor.execute('ALTER TABLE users ADD COLUMN public_key_sig TEXT')
            
            conn.commit()
    except Exception as e:
        print(f"Ошибка миграции схемы БД: {e}")

migrate_schema()

# Генерация id
def generate_id(length=10):
    first_digit = secrets.choice(string.digits[1:]) 
    other_digits = ''.join(secrets.choice(string.digits) for _ in range(length - 1))
    return first_digit + other_digits

def normalize_device_info(device_name=None, device_os=None):
    name = (device_name or '').strip()[:80] or None
    os_key = (device_os or '').strip().lower()
    if os_key not in ('windows', 'android', 'apple', 'unknown'):
        os_key = 'unknown'
    if not name:
        name = {
            'windows': 'Windows',
            'android': 'Android',
            'apple': 'Apple',
        }.get(os_key, 'Неизвестное устройство')
    return name, os_key


# Сохранение сессии
def save_session(raw_token, user_id, device_name=None, device_os=None):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
        
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    device_name TEXT,
                    device_os TEXT
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_hash ON sessions(token_hash)')

            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            name, os_key = normalize_device_info(device_name, device_os)
            created_at = datetime.now(timezone.utc).isoformat()
            cursor.execute(
                "INSERT INTO sessions (user_id, token_hash, created_at, device_name, device_os) VALUES (?, ?, ?, ?, ?)",
                (user_id, token_hash, created_at, name, os_key)
            )
            conn.commit()
            return True
    except Exception as e:
        print(f"Ошибка сохранения сессии: {e}")
        return False

# Сохранение сообщения
def save_message(chat_id, sender_id, encrypted_text, msg_id, is_read=0):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            utc_now = datetime.now(timezone.utc)
            time_iso = utc_now.isoformat()
            read_flag = 1 if is_read else 0

            cursor.execute('''
                INSERT INTO message (id, chat_id, sender_id, message_text, time, is_read)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (msg_id, chat_id, sender_id, encrypted_text, time_iso, read_flag))
            conn.commit()
            return time_iso
    except Exception as e:
        return False


def get_unread_count(chat_id, user_id, conn=None):
    own = conn is None
    if own:
        conn = get_db_connection()
    try:
        row = conn.execute(
            '''SELECT COUNT(*) AS n FROM message
               WHERE chat_id = ? AND sender_id != ? AND COALESCE(is_read, 1) = 0''',
            (chat_id, user_id),
        ).fetchone()
        return int(row['n'] if row else 0)
    except Exception:
        return 0
    finally:
        if own:
            conn.close()


def emit_unread_update(user_id, chat_id, conn=None):
    if user_id is None or chat_id is None:
        return
    count = get_unread_count(chat_id, user_id, conn=conn)
    socketio.emit(
        'unread_update',
        {'chat_id': str(chat_id), 'unread': count},
        to=f"user_{user_id}",
    )


def is_viewing_chat(user_id, chat_id):
    if user_id is None or chat_id is None:
        return False
    sids = online_users.get(user_id) or set()
    now = time.monotonic()
    for sid in list(sids):
        info = viewing_by_sid.get(sid)
        if not info:
            continue
        if now - info['ts'] > VIEWING_EXPIRE_SEC:
            viewing_by_sid.pop(sid, None)
            continue
        if str(info['chat_id']) == str(chat_id):
            return True
    return False

# Получение id текущего пользователя
def get_current_user_id():
    raw_token = session.get('auth_token')
    if not raw_token:
        return None

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    conn = get_db_connection()
    try:
        user = conn.execute(
            'SELECT user_id FROM sessions WHERE token_hash = ?',
            (token_hash,),
        ).fetchone()

        return user['user_id'] if user else None
    except Exception as e:
        print(f"Ошибка БД в get_current_user_id: {e}")
        return None
    finally:
        conn.close()

# Аватарус
def process_avatar(file_storage):
    # Дополнительная проверка на расширение файла перед обработкой
    if not file_storage or file_storage.filename == '' or not allowed_file(file_storage.filename):
        return "avatarkins.png"
    try:
        file_storage.seek(0)
        img = Image.open(file_storage)
        
        # Защита от декомпрессионных бомб (Pillow делает это частично сам, но лимит важен)
        img.verify() # Проверяем, что файл не битый
        file_storage.seek(0)
        img = Image.open(file_storage) # Переоткрываем для обработки
        
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img = ImageOps.fit(img, (256, 256), Image.Resampling.LANCZOS)
        
        filename = secrets.token_hex(16) + ".webp"
        avatar_path = os.path.join('static/files/avatars/', filename)
        
        # Создаем директорию, если её нет
        os.makedirs(os.path.dirname(avatar_path), exist_ok=True)
        
        img.save(avatar_path, "WEBP", quality=85)
        return filename
    except Exception as e:
        print(f"Ошибка обработки изображения: {e}")
        return "avatarkins.png"

# Получение id чатов пользователя
def get_user_s_chats(user_id):
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        pass

    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT 
            c.id AS chat_id,
            CASE 
                WHEN c.user_one_id = ? THEN c.user_two_id 
                ELSE c.user_one_id 
            END AS contact_id
        FROM chats c
        WHERE c.user_one_id = ? OR c.user_two_id = ?
    """
    
    try:
        cursor.execute(query, (user_id, user_id, user_id))
        rows = cursor.fetchall()
        return [{'chat_id': row['chat_id'], 'contact_id': str(row['contact_id'])} for row in rows]
    except sqlite3.OperationalError as e:
        print(f"[SQLite Error] Ошибка при чтении контактов: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

# Отправка статуса пользователя в сети / был(а) недавно
def send_user_status(user_id, status):
    chats = get_user_s_chats(user_id)
    for chat in chats:
        socketio.emit(
            'user_status_update', 
            {'user_id': user_id, 'status': status}, 
            to=f"user_{chat['contact_id']}"
        )

def check_username(username, exclude_user_id=None):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if exclude_user_id is not None:
            cursor.execute(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND CAST(id AS TEXT) != ?",
                (username, str(exclude_user_id)),
            )
        else:
            cursor.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        if cursor.fetchone():
            return False
        else:
            return True 

# Функция сохранения пользователя
def save_user(
    name,
    username,
    secure_db_hash,
    pub_key,
    priv_key,
    ava,
    key_salt=None,
    signing_public_key=None,
    signing_private_key=None,
    public_key_sig=None,
):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            step = 0
            user_id = None
            while step < 100:
                temp_id = generate_id(10)
                cursor.execute("SELECT id FROM users WHERE id = ?", (temp_id,))
                if not cursor.fetchone():
                    user_id = temp_id
                    break
                step += 1
            
            if not user_id:
                return False, "d205"

            cursor.execute(
                '''INSERT INTO users (
                    id, name, username, password, public_key, private_key, avatar,
                    key_salt, signing_public_key, signing_private_key, public_key_sig
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    user_id, name, username, secure_db_hash, pub_key, priv_key, ava,
                    key_salt, signing_public_key, signing_private_key, public_key_sig,
                ),
            )
            conn.commit()
            return True, user_id
            
    except sqlite3.IntegrityError:
        return False, "d203"
    except Exception as e:
        print(f"Ошибка БД: {e}")
        return False, "d204"

# Удаление сообщения (только участник чата)
def delete_message(msg_id, requester_id):
    if not msg_id or requester_id is None:
        return False
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT chat_id, sender_id FROM message WHERE id = ?", (msg_id,))
            row = cursor.fetchone()

            if not row:
                return False

            chat_id, sender_id = row[0], row[1]

            cursor.execute("SELECT user_one_id, user_two_id FROM chats WHERE id = ?", (chat_id,))
            chat_row = cursor.fetchone()
            if not chat_row:
                return False

            user_one_id, user_two_id = chat_row[0], chat_row[1]
            if not user_is_chat_member(requester_id, user_one_id, user_two_id):
                return False

            other_user_id = user_two_id if str(sender_id) == str(user_one_id) else user_one_id

            cursor.execute("DELETE FROM message WHERE id = ?", (msg_id,))
            conn.commit()
            return chat_id, sender_id, other_user_id
    except Exception as e:
        print(e)
        return False

# Существует ли пользователь?
def get_user_by_username(username):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
                (username,),
            )
            return cursor.fetchone()
    except Exception as e:
        return "d103"

# Подключение к сокету
@socketio.on('connect')
def handle_connect():
    user_id = get_current_user_id()
    if user_id:
        join_room(f"user_{user_id}")
        if user_id not in online_users:
            online_users[user_id] = set()
            send_user_status(user_id, 'в сети')

        online_users[user_id].add(request.sid)
        raw_token = session.get('auth_token')
        if raw_token:
            session_by_sid[request.sid] = {
                'user_id': int(user_id),
                'token_hash': hashlib.sha256(raw_token.encode()).hexdigest(),
            }


def kick_session_sockets(token_hash):
    """Отключает все активные сокеты с данной сессией и шлёт session_revoked."""
    if not token_hash:
        return
    for sid, info in list(session_by_sid.items()):
        if info.get('token_hash') != token_hash:
            continue
        try:
            socketio.emit('session_revoked', {'reason': 'deleted'}, to=sid)
        except Exception:
            pass
        try:
            socketio.server.disconnect(sid)
        except Exception:
            pass
        session_by_sid.pop(sid, None)

def get_chat_peer(chat_id, user_id):
    if not chat_id or user_id is None:
        return None
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_one_id, user_two_id FROM chats WHERE id = ?",
            (chat_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        user_one_id, user_two_id = row[0], row[1]
        if str(user_id) == str(user_one_id):
            return user_two_id
        if str(user_id) == str(user_two_id):
            return user_one_id
        return None
    except Exception:
        return None
    finally:
        conn.close()


def get_chat_users(chat_id, conn=None):
    own = conn is None
    if own:
        conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT user_one_id, user_two_id FROM chats WHERE id = ?",
            (chat_id,),
        ).fetchone()
        if not row:
            return None
        return int(row[0]), int(row[1])
    except Exception:
        return None
    finally:
        if own:
            conn.close()


def user_is_chat_member(user_id, user_one_id, user_two_id):
    if user_id is None:
        return False
    uid = str(user_id)
    return uid in (str(user_one_id), str(user_two_id))


def get_block_state(chat_id, viewer_id, conn=None):
    own = conn is None
    if own:
        conn = get_db_connection()
    try:
        users = get_chat_users(chat_id, conn=conn)
        if not users:
            return {
                'blocked_by_me': False,
                'blocked_me': False,
                'can_send': True,
                'hide_avatar': False,
            }
        user_one_id, user_two_id = users
        viewer_id = int(viewer_id)
        if viewer_id not in (user_one_id, user_two_id):
            return {
                'blocked_by_me': False,
                'blocked_me': False,
                'can_send': True,
                'hide_avatar': False,
            }

        peer_id = user_two_id if viewer_id == user_one_id else user_one_id
        rows = conn.execute(
            "SELECT blocked_user_id FROM blocks WHERE chat_id = ?",
            (chat_id,),
        ).fetchall()
        blocked_ids = {int(row[0]) for row in rows}
        blocked_by_me = peer_id in blocked_ids
        blocked_me = viewer_id in blocked_ids
        return {
            'blocked_by_me': blocked_by_me,
            'blocked_me': blocked_me,
            'can_send': not (blocked_by_me or blocked_me),
            'hide_avatar': blocked_me,
        }
    except Exception:
        return {
            'blocked_by_me': False,
            'blocked_me': False,
            'can_send': True,
            'hide_avatar': False,
        }
    finally:
        if own:
            conn.close()


def emit_block_state(chat_id, user_id, conn=None):
    state = get_block_state(chat_id, user_id, conn=conn)
    socketio.emit(
        'block_state_updated',
        {'chat_id': str(chat_id), 'block_state': state},
        to=f"user_{user_id}",
    )


def emit_partner_typing(chat_id, sender_id, is_typing):
    peer_id = get_chat_peer(chat_id, sender_id)
    if peer_id is None:
        return
    socketio.emit(
        'partner_typing',
        {'chat_id': str(chat_id), 'typing': bool(is_typing)},
        to=f"user_{peer_id}",
    )


def clear_user_typing(user_id):
    chat_id = typing_in_chat.pop(user_id, None)
    if chat_id is not None:
        emit_partner_typing(chat_id, user_id, False)


@socketio.on('disconnect')
def handle_disconnect():
    sid_info = session_by_sid.pop(request.sid, None)
    user_id = sid_info['user_id'] if sid_info else get_current_user_id()
    if not user_id:
        return

    viewing_by_sid.pop(request.sid, None)

    if user_id in online_users:
        online_users[user_id].discard(request.sid)
        if not online_users[user_id]:
            del online_users[user_id]
            send_user_status(user_id, 'был(а) недавно')
            clear_user_typing(user_id)

# Главная страница
@app.route("/")
def index():
    # return render_template("first.html")
    raw_token = session.get('auth_token')
    if not raw_token:
        return render_template("first.html")
    
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    try:
        with get_db_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''SELECT token_hash FROM sessions WHERE token_hash = ?''', (token_hash,))
            user = cursor.fetchone()
    except Exception as e:
        return render_template("first.html")

    if user and user['token_hash'] == token_hash:
        return render_template("home.html")
    else:
        session.clear()
        return render_template("first.html")


@app.route('/api/me', methods=['GET', 'POST'])
def api_me():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"status": "error"}), 401

    if request.method == 'GET':
        conn = get_db_connection()
        try:
            uid_str = str(user_id)
            user = conn.execute(
                "SELECT id, name, username, avatar FROM users WHERE id = ? OR CAST(id AS TEXT) = ?",
                (user_id, uid_str),
            ).fetchone()
            if not user:
                return jsonify({"status": "error", "message": "user_not_found"}), 404
            online = (
                user_id in online_users
                or uid_str in online_users
                or user['id'] in online_users
                or str(user['id']) in online_users
                or (str(user['id']).isdigit() and int(user['id']) in online_users)
            )
            return jsonify({
                "status": "ok",
                "id": user['id'],
                "name": user['name'] or '',
                "username": user['username'] or '',
                "avatar": user['avatar'] or '',
                "real_status": 'в сети' if online else 'был(а) недавно',
            })
        except Exception as e:
            print(f"Ошибка /api/me GET: {e}")
            return jsonify({"status": "error"}), 500
        finally:
            conn.close()

    name = (request.form.get('name') or '').strip()
    username = (request.form.get('username') or '').strip()
    avatar_file = request.files.get('avatar')

    if not name or not username:
        return jsonify({"status": "error", "message": "d201"}), 400
    if not (1 <= len(name) <= 32):
        return jsonify({"status": "error", "message": "d201"}), 400
    if not (4 <= len(username) <= 16):
        return jsonify({"status": "error", "message": "d208"}), 400
    if not USERNAME_RE.fullmatch(username):
        return jsonify({"status": "error", "message": "d206"}), 400
    if not check_username(username, exclude_user_id=user_id):
        return jsonify({"status": "error", "message": "d203"}), 409

    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT avatar FROM users WHERE id = ? OR CAST(id AS TEXT) = ?",
            (user_id, str(user_id)),
        ).fetchone()
        if not row:
            return jsonify({"status": "error"}), 404

        avatar_name = row['avatar'] or 'avatarkins.png'
        if avatar_file and avatar_file.filename:
            processed = process_avatar(avatar_file)
            if processed:
                avatar_name = processed

        conn.execute(
            "UPDATE users SET name = ?, username = ?, avatar = ? WHERE id = ? OR CAST(id AS TEXT) = ?",
            (name, username, avatar_name, user_id, str(user_id)),
        )
        conn.commit()

        payload = {
            "status": "ok",
            "id": user_id,
            "name": name,
            "username": username,
            "avatar": avatar_name,
        }
        socketio.emit('profile_updated', payload, to=f"user_{user_id}")
        # Собеседники подхватят имя/аватар при следующем обновлении списка
        try:
            for chat in get_user_s_chats(user_id):
                socketio.emit(
                    'contact_profile_updated',
                    {
                        'user_id': user_id,
                        'name': name,
                        'username': username,
                        'avatar': avatar_name,
                    },
                    to=f"user_{chat['contact_id']}",
                )
        except Exception:
            pass
        return jsonify(payload)
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "d203"}), 409
    except Exception as e:
        print(f"Ошибка /api/me POST: {e}")
        return jsonify({"status": "error"}), 500
    finally:
        conn.close()


@app.route('/api/me/key_migrate', methods=['POST'])
def api_me_key_migrate():
    """Миграция legacy ключей (соль username) на случайную соль + подписи."""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"status": "error"}), 401

    client_hash = (request.form.get('password') or '').strip()
    key_salt = (request.form.get('key_salt') or '').strip()
    priv_key = (request.form.get('encrypted_private_key') or '').strip()
    signing_priv_key = (request.form.get('encrypted_signing_private_key') or '').strip()
    signing_public_key = (request.form.get('signing_public_key') or '').strip()
    public_key_sig = (request.form.get('public_key_sig') or '').strip()

    if not CLIENT_HASH_RE.fullmatch(client_hash):
        return jsonify({"status": "error", "message": "d102"}), 401
    if not is_valid_base64(key_salt, min_len=16, max_len=64):
        return jsonify({"status": "error", "message": "d209"}), 400
    if not is_valid_base64(priv_key, min_len=80, max_len=2048):
        return jsonify({"status": "error", "message": "d209"}), 400
    if not is_valid_base64(signing_priv_key, min_len=80, max_len=2048):
        return jsonify({"status": "error", "message": "d209"}), 400
    if not is_valid_base64(signing_public_key, min_len=80, max_len=512):
        return jsonify({"status": "error", "message": "d209"}), 400
    if not is_valid_base64(public_key_sig, min_len=40, max_len=512):
        return jsonify({"status": "error", "message": "d209"}), 400

    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT password FROM users WHERE id = ? OR CAST(id AS TEXT) = ?",
            (user_id, str(user_id)),
        ).fetchone()
        if not row:
            return jsonify({"status": "error"}), 404
        if not check_password_hash(row['password'], client_hash):
            return jsonify({"status": "error", "message": "d102"}), 401

        conn.execute(
            '''UPDATE users SET
               key_salt = ?, private_key = ?, signing_private_key = ?,
               signing_public_key = ?, public_key_sig = ?
               WHERE id = ? OR CAST(id AS TEXT) = ?''',
            (
                key_salt, priv_key, signing_priv_key,
                signing_public_key, public_key_sig,
                user_id, str(user_id),
            ),
        )
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        print(f"Ошибка /api/me/key_migrate: {e}")
        return jsonify({"status": "error"}), 500
    finally:
        conn.close()


@app.route('/api/me/private_key', methods=['GET'])
def api_me_private_key():
    """Отдаёт зашифрованные ключи текущего пользователя (только авторизованному)."""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"status": "error"}), 401

    conn = get_db_connection()
    try:
        user = conn.execute(
            '''SELECT username, private_key, signing_private_key, key_salt,
                      signing_public_key, public_key_sig, public_key
               FROM users WHERE id = ? OR CAST(id AS TEXT) = ?''',
            (user_id, str(user_id)),
        ).fetchone()
        if not user or not user['private_key']:
            return jsonify({"status": "error", "message": "not_found"}), 404
        return jsonify({
            "status": "ok",
            "username": user['username'] or '',
            "private_key": user['private_key'],
            "signing_private_key": user['signing_private_key'] or '',
            "key_salt": user['key_salt'] or '',
            "signing_public_key": user['signing_public_key'] or '',
            "public_key_sig": user['public_key_sig'] or '',
            "public_key": user['public_key'] or '',
        })
    except Exception as e:
        print(f"Ошибка /api/me/private_key: {e}")
        return jsonify({"status": "error"}), 500
    finally:
        conn.close()


@app.route('/api/sessions', methods=['GET'])
def list_sessions():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"status": "error"}), 401

    raw_token = session.get('auth_token')
    current_hash = hashlib.sha256(raw_token.encode()).hexdigest() if raw_token else None

    conn = get_db_connection()
    try:
        rows = conn.execute(
            '''SELECT id, created_at, device_name, device_os, token_hash
               FROM sessions
               WHERE user_id = ?
               ORDER BY datetime(created_at) DESC, id DESC''',
            (user_id,),
        ).fetchall()
        current = None
        others = []
        for row in rows:
            name, os_key = normalize_device_info(row['device_name'], row['device_os'])
            item = {
                'id': row['id'],
                'device_name': name,
                'device_os': os_key,
                'created_at': row['created_at'],
                'is_current': bool(current_hash and row['token_hash'] == current_hash),
            }
            if item['is_current'] and current is None:
                current = item
            else:
                others.append(item)
        return jsonify({'status': 'ok', 'current': current, 'sessions': others})
    except Exception as e:
        print(f"Ошибка списка сессий: {e}")
        return jsonify({"status": "error"}), 500
    finally:
        conn.close()


@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"status": "error"}), 401

    raw_token = session.get('auth_token')
    current_hash = hashlib.sha256(raw_token.encode()).hexdigest() if raw_token else None

    conn = get_db_connection()
    try:
        row = conn.execute(
            'SELECT id, token_hash FROM sessions WHERE id = ? AND user_id = ?',
            (session_id, user_id),
        ).fetchone()
        if not row:
            return jsonify({"status": "error", "message": "not_found"}), 404

        token_hash = row['token_hash']
        is_current = bool(current_hash and token_hash == current_hash)
        conn.execute('DELETE FROM sessions WHERE id = ? AND user_id = ?', (session_id, user_id))
        conn.commit()

        kick_session_sockets(token_hash)

        if is_current:
            session.clear()
            return jsonify({"status": "ok", "logout": True})
        return jsonify({"status": "ok", "logout": False})
    except Exception as e:
        print(f"Ошибка удаления сессии: {e}")
        return jsonify({"status": "error"}), 500
    finally:
        conn.close()


@app.route('/logout', methods=['POST'])
def logout():
    """Удаляет текущий токен сессии и очищает cookie-сессию."""
    raw_token = session.get('auth_token')
    if raw_token:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        try:
            with get_db_connection() as conn:
                conn.execute('DELETE FROM sessions WHERE token_hash = ?', (token_hash,))
                conn.commit()
        except Exception as e:
            print(f"Ошибка logout: {e}")
        kick_session_sockets(token_hash)
    session.clear()
    return jsonify({"status": "ok"})


# Вход в аккаунт
@app.route("/login", methods=['POST'])
@limiter.limit("10 per hour")
@limiter.limit("5 per minute", key_func=lambda: (request.form.get('username') or 'unknown').strip().lower())
def login():
    username = (request.form.get('username') or '').strip()
    client_hash = request.form.get('password') or ''

    if not username or not client_hash:
        return jsonify({"status": "error", "message": "d101"}), 400

    if not CLIENT_HASH_RE.fullmatch(client_hash):
        return jsonify({"status": "error", "message": "d102"}), 401

    user = get_user_by_username(username)
    if user == "d103":
        return jsonify({"status": "error", "message": "d103"}), 500

    # Всегда проверяем хэш (даже если пользователя нет) — меньше утечки по таймингу
    password_hash = user['password'] if user else DUMMY_PASSWORD_HASH
    password_ok = check_password_hash(password_hash, client_hash)

    if user and password_ok:
        session.clear()
        raw_token = secrets.token_urlsafe(64)
        device_name = request.form.get('device_name')
        device_os = request.form.get('device_os')

        if save_session(raw_token, user['id'], device_name=device_name, device_os=device_os):
            session['auth_token'] = raw_token
            session.permanent = True

            return jsonify({
                "status": "success",
                "priv_key": user['private_key'],
                "signing_priv_key": user['signing_private_key'] or '',
                "public_key": user['public_key'] or '',
                "key_salt": user['key_salt'] or '',
                "signing_public_key": user['signing_public_key'] or '',
                "public_key_sig": user['public_key_sig'] or '',
                "user_data": {"id": user['id'], "username": user['username']}
            })
        return jsonify({"status": "error", "message": "d103"}), 500

    return jsonify({"status": "error", "message": "d102"}), 401

# Регистрация
@app.route('/signup', methods=['POST'])
@limiter.limit("10 per hour")
@limiter.limit("5 per minute")
def signup():
    name = (request.form.get('name') or '').strip()
    username = (request.form.get('username') or '').strip()
    client_hash = request.form.get('password') or ''
    pub_key = request.form.get('public_key') or ''
    priv_key = request.form.get('encrypted_private_key') or ''
    key_salt = (request.form.get('key_salt') or '').strip()
    signing_public_key = (request.form.get('signing_public_key') or '').strip()
    signing_priv_key = (request.form.get('encrypted_signing_private_key') or '').strip()
    public_key_sig = (request.form.get('public_key_sig') or '').strip()
    avatar_file = request.files.get('avatar')

    if not name or not username or not client_hash:
        return jsonify({"status": "error", "message": "d201"}), 400

    if not (1 <= len(name) <= 32):
        return jsonify({"status": "error", "message": "d201"}), 400

    if not (4 <= len(username) <= 16):
        return jsonify({"status": "error", "message": "d208"}), 400

    if not USERNAME_RE.fullmatch(username):
        return jsonify({"status": "error", "message": "d206"}), 400

    if not CLIENT_HASH_RE.fullmatch(client_hash):
        return jsonify({"status": "error", "message": "d201"}), 400

    # Без ключей аккаунт бесполезен и опасен — не принимаем пустые/битые
    if not is_valid_base64(pub_key, min_len=80, max_len=512):
        return jsonify({"status": "error", "message": "d201"}), 400
    if not is_valid_base64(priv_key, min_len=80, max_len=2048):
        return jsonify({"status": "error", "message": "d201"}), 400
    if not is_valid_base64(key_salt, min_len=16, max_len=64):
        return jsonify({"status": "error", "message": "d201"}), 400
    if not is_valid_base64(signing_public_key, min_len=80, max_len=512):
        return jsonify({"status": "error", "message": "d201"}), 400
    if not is_valid_base64(signing_priv_key, min_len=80, max_len=2048):
        return jsonify({"status": "error", "message": "d201"}), 400
    if not is_valid_base64(public_key_sig, min_len=40, max_len=512):
        return jsonify({"status": "error", "message": "d201"}), 400

    if not check_username(username):
        return jsonify({"status": "error", "message": "d203"}), 409

    avatar_name = "avatarkins.png"
    if avatar_file and avatar_file.filename != '':
        processed_name = process_avatar(avatar_file)
        if processed_name:
            avatar_name = processed_name

    secure_db_hash = generate_password_hash(client_hash)

    success, message = save_user(
        name,
        username,
        secure_db_hash,
        pub_key,
        priv_key,
        avatar_name,
        key_salt=key_salt,
        signing_public_key=signing_public_key,
        signing_private_key=signing_priv_key,
        public_key_sig=public_key_sig,
    )

    if success:
        user_id = message
        raw_token = secrets.token_urlsafe(64)
        device_name = request.form.get('device_name')
        device_os = request.form.get('device_os')

        if save_session(raw_token, user_id, device_name=device_name, device_os=device_os):
            session.clear()
            session['auth_token'] = raw_token
            session.permanent = True

            return jsonify({
                "status": "success",
                "user_data": {"id": user_id, "username": username}
            })
        return jsonify({"status": "error", "message": "d204"}), 500

    status_code = 409 if message == "d203" else 400
    return jsonify({"status": "error", "message": message}), status_code

# Обработчик ошибки 429
@app.errorhandler(429)
def ratelimit_handler(e):
    # API (login/signup) ждут JSON; иначе фронт падает в catch
    if request.path in ('/login', '/signup') or request.accept_mimetypes.best == 'application/json':
        return jsonify({"status": "error", "message": "d207"}), 429
    return render_template('error.html', error="429"), 429

# Обработчик ошибки 404
@app.errorhandler(404)
def page_not_found(e):
    if request.path.startswith('/api/') or request.accept_mimetypes.best == 'application/json':
        return jsonify({"status": "error", "message": "not_found"}), 404
    return render_template('error.html', error="404"), 404

# Поиск
@app.route('/search_users')
def search_users():
    query = request.args.get('q', '').lower()
    if not query:
        return jsonify([])
    current_user_id = int(get_current_user_id())
    try:
        conn = get_db_connection()
        users = conn.execute(
            'SELECT id, name, avatar, username FROM users WHERE username LIKE ? LIMIT 15',
            ('%' + query + '%',)
        ).fetchall()
        conn.close()

        results = []
        for user in users:
            user_id = int(user['id'])
            if user_id != current_user_id:
                results.append({
                    'id': user['id'],
                    'name': user['name'],
                    'ava': user['avatar'],
                    'username': user['username']
                })
            
        return jsonify(results)
    
    except Exception as e:
        return jsonify([]), 500

# Добавить чат
@app.route('/add', methods=['POST'])
def add_to_chats():
    current_user_id = int(get_current_user_id())
    if not current_user_id:
        return jsonify({"error": "Unauthorized"}), 401

    target_id = int(request.json.get('user_id'))
    if current_user_id == target_id:
        return jsonify({"error": "Нельзя добавить самого себя"}), 400

    conn = get_db_connection()
    try:
        u1, u2 = sorted([int(current_user_id), int(target_id)])
        cursor = conn.cursor()
        cursor.execute('''INSERT OR IGNORE INTO chats (user_one_id, user_two_id) VALUES (?, ?)''', (u1, u2,))
        conn.commit()
        
        cursor.execute('SELECT id FROM chats WHERE user_one_id = ? AND user_two_id = ?', (u1, u2))
        chat_row = cursor.fetchone()
        chat_id = chat_row['id'] if chat_row else None
        
        socketio.emit('chat_created', to=f"user_{target_id}")
        
        return jsonify({"status": "ok", "chat_id": chat_id})
    except Exception as e:
        print(f"Ошибка сохранения чата: {e}")
        return jsonify({"status": "error"}), 500
    finally:
        conn.close()

# Получить чаты
@app.route('/get_my_chats')
def get_my_chats(): 
    current_user_id = get_current_user_id()
    if not current_user_id:
        return jsonify([]), 401
    conn = get_db_connection()
    
    query_chats = '''
        SELECT 
            c.id AS chat_id,
            u.id, 
            u.username, 
            u.name, 
            u.avatar,
            u.public_key,
            u.signing_public_key,
            u.public_key_sig,
            (
                SELECT COUNT(*) FROM message m
                WHERE m.chat_id = c.id
                  AND m.sender_id != ?
                  AND COALESCE(m.is_read, 1) = 0
            ) AS unread_count,
            (
                SELECT m.message_text FROM message m
                WHERE m.chat_id = c.id
                ORDER BY m.time DESC, m.id DESC
                LIMIT 1
            ) AS last_message_text,
            (
                SELECT m.sender_id FROM message m
                WHERE m.chat_id = c.id
                ORDER BY m.time DESC, m.id DESC
                LIMIT 1
            ) AS last_message_sender_id
        FROM chats c
        JOIN users u ON u.id = (CASE WHEN c.user_one_id = ? THEN c.user_two_id ELSE c.user_one_id END)
        WHERE c.user_one_id = ? OR c.user_two_id = ?
    '''
    chats_rows = conn.execute(
        query_chats,
        (current_user_id, current_user_id, current_user_id, current_user_id),
    ).fetchall()
    chats = [dict(chat) for chat in chats_rows]

    for chat in chats:
        user_id_str = int(chat['id'])
        real_status = 'в сети' if user_id_str in online_users else 'был(а) недавно'
        block_state = get_block_state(chat['chat_id'], current_user_id, conn=conn)
        chat['real_status'] = real_status
        chat['status'] = 'Вас заблокировали' if block_state['blocked_me'] else real_status
        chat['hide_avatar'] = bool(block_state['hide_avatar'])
        chat['block_state'] = block_state
        if chat['hide_avatar']:
            chat['avatar'] = ''

    conn.close()

    return jsonify(chats)

# Сокеты отправка сообщения
@socketio.on('send_direct_message')
def handle_message(data):
    chat_id = data.get('chat_id')
    encrypted_text = data.get('text')
    msg_id = data.get('msgId')
    sender_id = get_current_user_id()

    if not sender_id:
        emit('message_error', {'code': 'unauthorized', 'msg_id': msg_id})
        return

    if not chat_id or not encrypted_text or not msg_id:
        emit('message_error', {'code': 'invalid', 'msg_id': msg_id})
        return

    if not isinstance(encrypted_text, str) or len(encrypted_text) > MAX_ENCRYPTED_MESSAGE_LEN:
        emit('message_error', {'code': 'too_long', 'msg_id': msg_id})
        return

    if not allow_message_send(sender_id):
        emit('message_error', {'code': 'rate_limit', 'msg_id': msg_id})
        return

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT user_one_id, user_two_id FROM chats WHERE id = ?", (chat_id,))
        chat_row = cursor.fetchone()
        if not chat_row:
            emit('message_error', {'code': 'invalid_chat', 'msg_id': msg_id})
            return
        
        user_one_id, user_two_id = chat_row[0], chat_row[1]
        if not user_is_chat_member(sender_id, user_one_id, user_two_id):
            emit('message_error', {'code': 'forbidden', 'msg_id': msg_id})
            return

        receiver_id = user_two_id if str(sender_id) == str(user_one_id) else user_one_id
        block_state = get_block_state(chat_id, sender_id, conn=conn)
        if not block_state.get('can_send', True):
            emit(
                'message_error',
                {
                    'code': 'blocked_by_me' if block_state.get('blocked_by_me') else 'blocked_me',
                    'msg_id': msg_id,
                },
            )
            return
    except Exception as e:
        emit('message_error', {'code': 'save_failed', 'msg_id': msg_id})
        return
    finally:
        conn.close()

    is_read = 1 if is_viewing_chat(receiver_id, chat_id) else 0
    time_iso = save_message(chat_id, sender_id, encrypted_text, msg_id, is_read)
    if not time_iso:
        emit('message_error', {'code': 'save_failed', 'msg_id': msg_id})
        return

    data_mess = {
        'msg_id': msg_id,
        'text': encrypted_text,
        'sender_id': sender_id,
        'chat_id': chat_id,
        'time': time_iso,
        'is_read': is_read,
    }

    emit('new_message', data_mess, to=f"user_{receiver_id}")
    emit('new_message', data_mess, to=f"user_{sender_id}")
    emit_unread_update(receiver_id, chat_id)


@socketio.on('typing')
def handle_typing(data):
    sender_id = get_current_user_id()
    if not sender_id or not isinstance(data, dict):
        return

    chat_id = data.get('chat_id')
    is_typing = bool(data.get('typing'))
    if not chat_id:
        return

    peer_id = get_chat_peer(chat_id, sender_id)
    if peer_id is None:
        return
    if not get_block_state(chat_id, sender_id).get('can_send', True):
        emit(
            'partner_typing',
            {'chat_id': str(chat_id), 'typing': False},
            to=f"user_{peer_id}",
        )
        return

    if is_typing:
        prev_chat = typing_in_chat.get(sender_id)
        if prev_chat is not None and str(prev_chat) != str(chat_id):
            emit_partner_typing(prev_chat, sender_id, False)
        typing_in_chat[sender_id] = chat_id
    else:
        current_chat = typing_in_chat.get(sender_id)
        if current_chat is None or str(current_chat) != str(chat_id):
            return
        typing_in_chat.pop(sender_id, None)

    emit(
        'partner_typing',
        {'chat_id': str(chat_id), 'typing': is_typing},
        to=f"user_{peer_id}",
    )


@socketio.on('viewing_chat')
def handle_viewing_chat(data):
    user_id = get_current_user_id()
    if not user_id or not isinstance(data, dict):
        return

    chat_id = data.get('chat_id')
    viewing = bool(data.get('viewing'))
    if viewing:
        if not chat_id:
            return
        if get_chat_peer(chat_id, user_id) is None:
            return
        viewing_by_sid[request.sid] = {
            'chat_id': str(chat_id),
            'ts': time.monotonic(),
        }
        return

    info = viewing_by_sid.get(request.sid)
    if not info:
        return
    if chat_id and str(info['chat_id']) != str(chat_id):
        return
    viewing_by_sid.pop(request.sid, None)


@socketio.on('mark_chat_read')
def handle_mark_chat_read(data):
    user_id = get_current_user_id()
    if not user_id or not isinstance(data, dict):
        return

    chat_id = data.get('chat_id')
    if not chat_id:
        return

    try:
        chat_id_int = int(chat_id)
    except (TypeError, ValueError):
        return

    peer_id = get_chat_peer(chat_id_int, user_id)
    if peer_id is None:
        return

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            '''UPDATE message SET is_read = 1
               WHERE chat_id = ? AND sender_id != ? AND COALESCE(is_read, 1) = 0''',
            (chat_id_int, user_id),
        )
        changed = cursor.rowcount
        conn.commit()
        unread = get_unread_count(chat_id_int, user_id, conn=conn)
    except Exception:
        return
    finally:
        conn.close()

    emit('unread_update', {'chat_id': str(chat_id_int), 'unread': unread}, to=f"user_{user_id}")
    if changed:
        emit(
            'messages_read',
            {'chat_id': str(chat_id_int)},
            to=f"user_{peer_id}",
        )


# Удаление сообщения сокет
@socketio.on('delete_message')
def handle_delete(data):
    user_id = get_current_user_id()
    if not user_id or not isinstance(data, dict):
        return

    msg_id = data.get('msg_id')
    if not msg_id:
        return

    result = delete_message(msg_id, user_id)
    if result:
        chat_id, sender_id, other_user_id = result
        emit('message_deleted', {'msg_id': msg_id, 'chat_id': chat_id}, to=f"user_{other_user_id}")
        emit('message_deleted', {'msg_id': msg_id, 'chat_id': chat_id}, to=f"user_{sender_id}")
        emit_unread_update(other_user_id, chat_id)

# Получить историю чата
@app.route('/get_history_messages/<int:chat_id>')
def get_history(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify([]), 401
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT user_one_id, user_two_id FROM chats WHERE id = ?", (chat_id,))
        chat_row = cursor.fetchone()
        if not chat_row:
            conn.close()
            return jsonify([]), 403
        
        user_one_id, user_two_id = chat_row[0], chat_row[1]
        if int(user_id) not in (int(user_one_id), int(user_two_id)):
            conn.close()
            return jsonify([]), 403
        
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        before_time = (request.args.get('before_time') or '').strip() or None
        before_id = (request.args.get('before_id') or '').strip() or None
        page_limit = HISTORY_PAGE_SIZE + 1

        if before_time:
            cursor.execute(
                '''
                SELECT id, sender_id, message_text, time, is_read
                FROM message
                WHERE chat_id = ?
                  AND (time < ? OR (time = ? AND id < ?))
                ORDER BY time DESC, id DESC
                LIMIT ?
                ''',
                (chat_id, before_time, before_time, before_id or '', page_limit),
            )
        else:
            cursor.execute(
                '''
                SELECT id, sender_id, message_text, time, is_read
                FROM message
                WHERE chat_id = ?
                ORDER BY time DESC, id DESC
                LIMIT ?
                ''',
                (chat_id, page_limit),
            )

        rows = cursor.fetchall()
        has_more = len(rows) > HISTORY_PAGE_SIZE
        rows = rows[:HISTORY_PAGE_SIZE]
        messages = [dict(row) for row in reversed(rows)]
        block_state = get_block_state(chat_id, user_id, conn=conn)
        conn.close()

        return jsonify({'messages': messages, 'has_more': has_more, 'block_state': block_state})
    except Exception as e:
        print(f"Ошибка базы данных: {e}")
        return jsonify([]), 500

# Логирование: не шумим от служебных /ping (если кто-то всё же дернёт)
class _QuietPingFilter(logging.Filter):
    def filter(self, record):
        try:
            msg = record.getMessage()
        except Exception:
            return True
        return '/ping' not in msg

logging.getLogger('werkzeug').addFilter(_QuietPingFilter())

@app.route('/ping', methods=['GET', 'HEAD'])
@limiter.exempt
def ping():
    """Лёгкий healthcheck. Клиент Dovery больше не поллит его — статус через Socket.IO."""
    return '', 204

# Анализ username
@app.route('/<string:username>')
def get_user_profile(username):
    username = (username or '').strip()
    if not username:
        return render_template('error.html', error="404"), 404

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, username, avatar FROM users WHERE LOWER(username) = LOWER(?)",
        (username,),
    )
    user = cursor.fetchone()
    conn.close()

    if not user:
        return render_template('error.html', error="404"), 404

    if get_current_user_id():
        return redirect(url_for('index', profile='true', user_id=user['id']))

    return render_template(
        'profile.html',
        profile_name=user['name'] or '',
        profile_username=user['username'] or '',
        profile_avatar=user['avatar'] or '',
    )

@app.route('/get_use_profile/<int:user_id>')
def get_user_data_api(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    user_id_int = int(user['id'])
    current_user_id = get_current_user_id()
    block_state = {
        'blocked_by_me': False,
        'blocked_me': False,
        'can_send': True,
        'hide_avatar': False,
    }
    if current_user_id:
        u1, u2 = sorted([int(current_user_id), user_id_int])
        chat_row = conn.execute(
            "SELECT id FROM chats WHERE user_one_id = ? AND user_two_id = ?",
            (u1, u2),
        ).fetchone()
        if chat_row:
            block_state = get_block_state(chat_row['id'], current_user_id, conn=conn)

    if user_id_int in online_users:
        real_status = 'в сети'
    else:
        real_status = 'был(а) недавно'
    conn.close()
    status = 'Вас заблокировали' if block_state['blocked_me'] else real_status
    return jsonify({
        "id": user['id'],
        "username": user['username'],
        "name": user['name'],
        "avatar": "" if block_state['hide_avatar'] else (user['avatar'] if user['avatar'] else ""),
        "public_key": user['public_key'],
        "signing_public_key": user['signing_public_key'] or '',
        "public_key_sig": user['public_key_sig'] or '',
        "status": status,
        "real_status": real_status,
        "hide_avatar": block_state['hide_avatar'],
        "block_state": block_state
    })

@app.route('/get_user_by_username/<username>')
def get_user_by_username_api(username):
    """Профиль по username — только для авторизованных (ключи не для публичного API)."""
    current_user_id = get_current_user_id()
    if not current_user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404

    user_id_int = int(user['id'])

    if user_id_int in online_users:
        status = 'в сети'
    else:
        status = 'был(а) недавно'
    return jsonify({
        "id": user['id'],
        "username": user['username'],
        "name": user['name'],
        "avatar": user['avatar'] if user['avatar'] else "",
        "public_key": user['public_key'],
        "signing_public_key": user['signing_public_key'] or '',
        "public_key_sig": user['public_key_sig'] or '',
        "status": status
    })

# Удалить чат
@socketio.on('delete_chat')
def delete_chat(data):
    try:
        chat_id = data.get('id')
        if not chat_id:
            return
        userid = get_current_user_id()
        if not userid:
            return

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("PRAGMA foreign_keys = ON;")

        cursor.execute("SELECT user_one_id, user_two_id FROM chats WHERE id = ?", (chat_id,))
        chat_row = cursor.fetchone()
        if not chat_row:
            conn.close()
            return

        user_one_id, user_two_id = chat_row[0], chat_row[1]
        if not user_is_chat_member(userid, user_one_id, user_two_id):
            emit('chat_delete_error', {'code': 'forbidden', 'chat_id': str(chat_id)}, to=f"user_{userid}")
            conn.close()
            return

        other_user_id = user_two_id if str(userid) == str(user_one_id) else user_one_id

        if not get_block_state(chat_id, userid, conn=conn).get('can_send', True):
            emit('chat_delete_error', {'code': 'blocked', 'chat_id': str(chat_id)}, to=f"user_{userid}")
            conn.close()
            return

        cursor.execute("DELETE FROM message WHERE chat_id = ?", (chat_id,))
        cursor.execute("DELETE FROM chats WHERE id = ?", (chat_id,))

        conn.commit()
        conn.close()

        emit('chat_deleted', {'chat_id': chat_id}, to=f"user_{userid}")
        emit('chat_deleted', {'chat_id': chat_id}, to=f"user_{other_user_id}")
    except Exception as e:
        print(f"Ошибка при удалении чата через сокет: {e}")


@socketio.on('toggle_block')
def toggle_block(data):
    user_id = get_current_user_id()
    if not user_id or not isinstance(data, dict):
        return
    chat_id = data.get('chat_id')
    if not chat_id:
        return

    conn = get_db_connection()
    try:
        users = get_chat_users(chat_id, conn=conn)
        if not users:
            return
        user_one_id, user_two_id = users
        user_id = int(user_id)
        if user_id not in (user_one_id, user_two_id):
            return
        peer_id = user_two_id if user_id == user_one_id else user_one_id

        state = get_block_state(chat_id, user_id, conn=conn)
        if state.get('blocked_by_me'):
            conn.execute(
                "DELETE FROM blocks WHERE chat_id = ? AND blocked_user_id = ?",
                (chat_id, peer_id),
            )
        else:
            conn.execute(
                "INSERT OR IGNORE INTO blocks (chat_id, blocked_user_id) VALUES (?, ?)",
                (chat_id, peer_id),
            )
        conn.commit()

        emit_block_state(chat_id, user_id, conn=conn)
        emit_block_state(chat_id, peer_id, conn=conn)
    except Exception as e:
        print(f"Ошибка блокировки чата: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    # В DEV_MODE: threading + reloader — Ctrl+S перезапускает процесс на том же порту,
    # туннель обычно переживает это без ручного перезапуска.
    socketio.run(
        app,
        host='0.0.0.0',
        port=8080,
        debug=DEV_MODE,
        use_reloader=DEV_MODE,
        allow_unsafe_werkzeug=True,
    )