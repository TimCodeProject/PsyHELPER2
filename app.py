import os
import json
from flask import Flask, render_template, request, jsonify, make_response
import g4f
from werkzeug.utils import secure_filename
from datetime import datetime

app = Flask(__name__)

# Конфигурация
app.config.update({
    'UPLOAD_FOLDER': 'static/images',
    'MAX_CONTENT_LENGTH': 16 * 1024 * 1024,  # 16MB
    'CHATS_FILE': 'chats.json',
    'ALLOWED_EXTENSIONS': {'png', 'jpg', 'jpeg', 'gif'}
})

# Создаем необходимые директории
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def init_chats_file():
    if not os.path.exists(app.config['CHATS_FILE']):
        with open(app.config['CHATS_FILE'], 'w', encoding='utf-8') as f:
            json.dump({"chats": []}, f, ensure_ascii=False, indent=2)

def load_chats():
    try:
        with open(app.config['CHATS_FILE'], 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"chats": []}

def save_chats(data):
    with open(app.config['CHATS_FILE'], 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def generate_chat_id(chats):
    return max([chat['id'] for chat in chats['chats']] or [0]) + 1

def prepare_prompt(user_prompt, chat_history=None, images=None):
    base_prompt = (
        "Ты - PsyHELPER, AI-психолог. Есть правила:\n"
        "1. Ты должен поддерживать контекст беседы, учитывая предыдущие сообщения\n"
        "2. На вопрос о имени говори что ты PsyHELPER\n"
        "3. На вопрос о создателе: 'Меня разработал Тимофей Бадаев'\n"
        "4. Отвечай на языке пользователя, сохраняя профессиональный тон\n"
        "5. Будь эмпатичным, поддерживающим и внимательным к деталям\n"
        "6. На математические вопросы используй формат KaTeX для всех математических выражений. Оборачивай формулы в $$ для отдельных строк и $ для встроенных выражений.\n"  
        "7. Если пользователь ссылается на предыдущие сообщения - учитывай их в ответе\n\n"
    )
    
    # Добавляем историю чата, если она есть
    history_prompt = ""
    if chat_history and len(chat_history) > 0:
        history_prompt = "История текущего диалога:\n"
        for msg in chat_history[-6:]:  # Берем последние 6 сообщений для контекста
            role = "Пользователь" if msg['role'] == 'user' else "PsyHELPER"
            history_prompt += f"{role}: {msg['content']}\n"
        history_prompt += "\n"
    
    image_prompt = ""
    if images:
        image_prompt = "Пользователь приложил изображение(я). Проанализируй их в контексте запроса.\n\n"
    
    full_prompt = (
        base_prompt +
        history_prompt +
        image_prompt +
        f"Текущий запрос пользователя: {user_prompt}\n\n"
        "Ответь максимально полезно, учитывая контекст беседы."
    )
    
    return full_prompt

def process_ai_response(prompt, chat_history=None, images=None):
    try:
        client = g4f.Client(provider=g4f.Provider.Blackbox)
        messages = [{"content": prepare_prompt(prompt, chat_history, images), "role": "user"}]
        
        if images:
            image_files = []
            for img in images:
                img_path = os.path.join(app.config['UPLOAD_FOLDER'], img)
                if os.path.exists(img_path):
                    image_files.append([open(img_path, "rb"), img])
            
            response = client.chat.completions.create(
                messages=messages,
                model="",
                images=image_files
            )
        else:
            response = client.chat.completions.create(
                messages=messages,
                model=""
            )
        
        return response.choices[0].message.content
    
    except Exception as e:
        app.logger.error(f"AI processing error: {str(e)}")
        return "Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже."

# Маршруты Flask
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/chats', methods=['GET', 'POST', 'DELETE', 'PUT'])
def handle_chats():
    chats = load_chats()
    
    if request.method == 'GET':
        return jsonify(chats)
    
    elif request.method == 'POST':
        new_chat = {
            "id": generate_chat_id(chats),
            "title": request.json.get("title", "Новый чат"),
            "created_at": datetime.now().isoformat(),
            "messages": []
        }
        chats["chats"].append(new_chat)
        save_chats(chats)
        return jsonify(new_chat), 201
    
    elif request.method == 'PUT':
        chat_id = request.json.get("id")
        new_title = request.json.get("title")
        
        if not chat_id or not new_title:
            return jsonify({"error": "Не указан ID чата или новое название"}), 400
            
        chat = next((c for c in chats["chats"] if c["id"] == chat_id), None)
        if not chat:
            return jsonify({"error": "Чат не найден"}), 404
            
        chat["title"] = new_title
        save_chats(chats)
        return jsonify({"status": "success"}), 200
    
    elif request.method == 'DELETE':
        chat_id = request.json.get("id")
        if not chat_id:
            return jsonify({"error": "Не указан ID чата"}), 400
            
        chats["chats"] = [c for c in chats["chats"] if c["id"] != chat_id]
        save_chats(chats)
        return jsonify({"status": "success"}), 200

@app.route('/api/chat/<int:chat_id>', methods=['GET', 'POST'])
def handle_chat(chat_id):
    chats = load_chats()
    chat = next((c for c in chats["chats"] if c["id"] == chat_id), None)
    
    if not chat:
        return jsonify({"error": "Чат не найден"}), 404
    
    if request.method == 'GET':
        return jsonify(chat)
    
    elif request.method == 'POST':
        if not request.json or 'content' not in request.json:
            return jsonify({"error": "Неверные данные"}), 400
            
        message = {
            "role": "user",
            "content": request.json['content'],
            "timestamp": datetime.now().isoformat()
        }
        chat["messages"].append(message)
        save_chats(chats)
        return jsonify(message), 201

@app.route('/api/generate', methods=['POST'])
def generate_response():
    if not request.form or 'prompt' not in request.form:
        return jsonify({"error": "Неверные данные"}), 400
    
    try:
        chat_id = int(request.form.get('chat_id', 0))
    except ValueError:
        return jsonify({"error": "Неверный ID чата"}), 400
    
    # Обработка загружаемых файлов
    images = []
    if 'images' in request.files:
        for file in request.files.getlist('images'):
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                images.append(filename)
    
    # Получаем чат
    chats = load_chats()
    chat = next((c for c in chats["chats"] if c["id"] == chat_id), None)
    if not chat:
        return jsonify({"error": "Чат не найден"}), 404
    
    # Сохраняем сообщение пользователя
    user_message = {
        "role": "user",
        "content": request.form['prompt'],
        "images": images,
        "timestamp": datetime.now().isoformat()
    }
    chat["messages"].append(user_message)
    
    # Получаем ответ от AI (передаем промпт, историю чата и изображения)
    ai_response = process_ai_response(
        request.form['prompt'],
        chat["messages"][:-1],  # Вся история кроме текущего сообщения
        images if images else None
    )
    
    # Сохраняем ответ AI
    ai_message = {
        "role": "assistant",
        "content": ai_response,
        "timestamp": datetime.now().isoformat()
    }
    chat["messages"].append(ai_message)
    
    save_chats(chats)
    return jsonify(ai_message)

@app.errorhandler(404)
def not_found(error):
    return make_response(jsonify({'error': 'Не найдено'}), 404)

@app.errorhandler(500)
def internal_error(error):
    return make_response(jsonify({'error': 'Внутренняя ошибка сервера'}), 500)

if __name__ == '__main__':
    init_chats_file()
    app.run(host='0.0.0.0', port=5000, debug=True)
