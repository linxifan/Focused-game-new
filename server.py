from flask import Flask, request, jsonify, render_template
import json
import os

app = Flask(__name__)

# --- DATABASE HELPERS ---
DB_FILE = 'users.json'

def load_db():
    if not os.path.exists(DB_FILE):
        with open(DB_FILE, 'w') as f:
            json.dump({}, f)
        return {}
    with open(DB_FILE, 'r') as f:
        return json.load(f)

def save_db(data):
    with open(DB_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# --- ROUTES FOR WEB PAGES ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/game')
def game():
    return render_template('game.html')

# --- API ENDPOINTS ---

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    db = load_db()
    if username in db:
        return jsonify({"success": False, "message": "User already exists"}), 400
        
    db[username] = {
        "password": password,
        "game_data": {
            "coins": 0, 
            "plots": [], 
            "animals": [], 
            "inventory": {}, 
            "stats": {"sessions": 0, "harvests": 0}
        }
    }
    save_db(db)
    return jsonify({"success": True, "message": "Account created"})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    db = load_db()
    if username in db and db[username]['password'] == password:
        return jsonify({"success": True, "message": "Logged in"})
    else:
        return jsonify({"success": False, "message": "Invalid credentials"}), 401

@app.route('/api/get_data', methods=['POST'])
def get_data():
    data = request.json
    username = data.get('username')
    
    db = load_db()
    if username in db:
        return jsonify({"success": True, "data": db[username]['game_data']})
    return jsonify({"success": False}), 404

@app.route('/api/save_data', methods=['POST'])
def save_data():
    data = request.json
    username = data.get('username')
    new_game_data = data.get('game_data')
    
    db = load_db()
    if username in db:
        db[username]['game_data'] = new_game_data
        save_db(db)
        return jsonify({"success": True, "message": "Data saved"})
    return jsonify({"success": False}), 404

if __name__ == '__main__':
    print("🌱 Discipline Farm Server running at http://127.0.0.1:5000")
    app.run(debug=True, port=5000)