from flask import Flask, render_template, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from flask_wtf.csrf import CSRFError
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
import secrets
import hashlib
from PIL import Image, ImageOps
from datetime import datetime, timezone
import logging

base = Path(__file__).resolve().parent
env_path = base / 'db' / 'info.env'
if not env_path.exists():
    print(f"Файл .env не найден в {env_path}")
load_dotenv(dotenv_path=env_path)
app = Flask(__name__)
app.secret_key = os.getenv('secret')
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
    SESSION_COOKIE_SECURE=True
)
csrf = CSRFProtect(app)
socketio = SocketIO(app)

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

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

# Генерация id
def generate_id(length=10):
    first_digit = secrets.choice(string.digits[1:]) 
    other_digits = ''.join(secrets.choice(string.digits) for _ in range(length - 1))
    return first_digit + other_digits

# Сохранение сессии
def save_session(raw_token, user_id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
        
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_hash ON sessions(token_hash)')

            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            cursor.execute(
                "INSERT INTO sessions (user_id, token_hash) VALUES (?, ?)",
                (user_id, token_hash)
            )
            conn.commit()
            return True
    except Exception as e:
        return False

# Сохранение сообщения
def save_message(sender_id, receiver_id, encrypted_text):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            utc_now = datetime.now(timezone.utc)
            time_iso = utc_now.isoformat()

            cursor.execute('''
                INSERT INTO message (sender_id, receiver_id, message_text, time)
                VALUES (?, ?, ?, ?)
            ''', (sender_id, receiver_id, encrypted_text, time_iso))
            conn.commit()
            return True
    except Exception as e:
        return False

# Получение id текущего пользователя
def get_current_user_id():
    auth_token = session.get('auth_token')
    auth_token = hashlib.sha256(auth_token.encode()).hexdigest()
    if not auth_token:
        print("Токен отсутствует")
        return None
    
    conn = get_db_connection()
    try:
        user = conn.execute(
            'SELECT user_id FROM sessions WHERE token_hash = ?', 
            (auth_token,)
        ).fetchone()
        
        return user['user_id'] if user else None
    except Exception as e:
        print(f"Ошибка БД в get_current_user_id: {e}")
        return None
    finally:
        conn.close()

# Аватарус
def process_avatar(file_storage):
    if not file_storage or file_storage.filename == '':
        return "default.png"
    try:
        file_storage.seek(0)
        img = Image.open(file_storage)
        
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img = ImageOps.fit(img, (512, 512), Image.Resampling.LANCZOS)
        
        filename = secrets.token_hex(16) + ".webp"
        img.save(os.path.join('static/files/avatars/', filename), "WEBP", quality=85)
        return filename
    except Exception as e:
        print(f"Ошибка: {e}")
        return "default.png"

# Функция сохранения пользователя
def save_user(name, username, secure_db_hash, pub_key, priv_key, ava):
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
                "INSERT INTO users (id, name, username, password, public_key, private_key, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (user_id, name, username, secure_db_hash, pub_key, priv_key, ava,)
            )
            return True, user_id
    except sqlite3.IntegrityError:
        return False, "d203"
    except Exception as e:
        print(e)
        return False, "d204"

# Существует ли пользователь?
def get_user_by_username(username):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
            return cursor.fetchone()
    except Exception as e:
        return "d103"

# Подключение к сокету
@socketio.on('connect')
def handle_connect():
    user_id = get_current_user_id()
    if user_id:
        join_room(f"user_{user_id}")

# Главная страница
@app.route("/")
def index():
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

# Вход в аккаунт
@app.route("/login", methods=['GET', 'POST'])
@limiter.limit("10 per hour")
def login():
    if request.method == 'GET':
        return render_template('login.html')
    username = request.form.get('username').lower()
    client_hash = request.form.get('password')

    if not username or not client_hash:
        return jsonify({"status": "error", "message": "d101"})

    user = get_user_by_username(username)
    
    if user and user != "d103" and check_password_hash(user['password'], client_hash):
        session.clear()
        raw_token = secrets.token_urlsafe(64)

        if save_session(raw_token, user['id']):
            session['auth_token'] = raw_token
            session.permanent = True 

            return jsonify({
                "status": "success",
                "priv_key": user['private_key'],
                "user_data": {"id": user['id'], "username": user['username']}
            })
        else:
            return jsonify({"status": "error", "message": "d103"})
    
    return jsonify({"status": "error", "message": "d102"})

# Регистрация
@app.route('/signup', methods=['GET', 'POST'])
@limiter.limit("10 per hour")
def signup():
    if request.method == 'GET':
        return render_template('signup.html')
    name = request.form.get('name')
    username = request.form.get('username').lower()
    client_hash = request.form.get('password') 
    pub_key = request.form.get('public_key')
    priv_key = request.form.get('encrypted_private_key')

    avatar_file = request.files.get('avatar')
    avatar_name = "avatarkins.png"
    if avatar_file and avatar_file.filename != '':
        processed_name = process_avatar(avatar_file)
        if processed_name:
            avatar_name = processed_name

    if not name or not username or not client_hash:
        return jsonify({"status": "error", "message": "d201"})
    if not re.fullmatch(r"^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$", username):
        return jsonify({"status": "error", "message": "d206"})
    if not (4 <= len(username) <= 16):
        return jsonify({"status": "error", "message": "d208"})

    secure_db_hash = generate_password_hash(client_hash)
    success, message = save_user(name, username, secure_db_hash, pub_key, priv_key, avatar_name)

    if success:
        user_id = message
        raw_token = secrets.token_urlsafe(64)
        
        if save_session(raw_token, user_id):
            session.clear()
            session['auth_token'] = raw_token
            session.permanent = True
            
            return jsonify({
                "status": "success", 
                "user_data": {"id": user_id, "username": username}
            })
        else:
            return jsonify({"status": "error", "message": "d204"})
    
    return jsonify({"status": "error", "message": message})
    
# Поиск
@app.route('/search_users')
def search_users():
    query = request.args.get('q', '').lower()
    if not query:
        return jsonify([])

    try:
        conn = get_db_connection()
        users = conn.execute(
            'SELECT id, name, avatar, username FROM users WHERE username LIKE ? LIMIT 15',
            ('%' + query + '%',)
        ).fetchall()
        conn.close()

        results = []
        for user in users:
            results.append({
                'id': user['id'],
                'name': user['name'],
                'ava': user['avatar'],
                'username': user['username']
            })
            
        return jsonify(results)
    
    except Exception as e:
        print(f"Ошибка поиска: {e}")
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
        conn.execute('''INSERT or IGNORE INTO chats (user_one_id, user_two_id) VALUES (?, ?)''', (u1, u2,))
        conn.commit()
        return jsonify({"status": "ok"})
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
    query = '''
        SELECT 
            u.id, 
            u.username, 
            u.name, 
            u.avatar,
            u.public_key
        FROM chats c
        JOIN users u ON u.id = (CASE WHEN c.user_one_id = ? THEN c.user_two_id ELSE c.user_one_id END)
        WHERE c.user_one_id = ? OR c.user_two_id = ?
    '''
    chats = conn.execute(query, (current_user_id, current_user_id, current_user_id)).fetchall()
    conn.close()
    return jsonify([dict(chat) for chat in chats])

# Защита CSRF
@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    return jsonify({"status": "error", "message": "d207"})

# Сокеты 
@socketio.on('send_direct_message')
def handle_message(data):
    # Данные от клиента
    receiver_id = data.get('receiver_id')
    encrypted_text = data.get('text')
    
    # Определяем отправителя (через сессию Flask или кастомный метод)
    sender_id = get_current_user_id()

    if not receiver_id or not encrypted_text:
        return

    # 1. Сохраняем в БД зашифрованную строку
    save_message(sender_id, receiver_id, encrypted_text)

    # 2. Пересылаем получателю в его персональную комнату
    emit('new_message', {
        'text': encrypted_text,
        'sender_id': sender_id,
        'time': datetime.now().strftime('%H:%M')
    }, to=f"user_{receiver_id}")

# Получить историю чата
@app.route('/get_history_messages/<int:second_id>')
def get_history(second_id):
    user_id = get_current_user_id()
    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, sender_id, message_text, time 
            FROM message 
            WHERE (sender_id = ? AND receiver_id = ?) 
            OR (sender_id = ? AND receiver_id  = ?)
            ORDER BY id DESC 
            LIMIT 15
        ''', (user_id, second_id, second_id, user_id))

        
        rows = cursor.fetchall()
        # Разворачиваем, чтобы новые были внизу, и превращаем в список словарей
        messages = [dict(row) for row in reversed(rows)]
        
        return jsonify(messages)
    except Exception as e:
        print(f"Ошибка базы данных: {e}")

if __name__ == "__main__":
    app.run(debug=True, port="8080")
