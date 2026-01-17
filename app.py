from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import requests
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'  # Change this in production
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///discipline_farm.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    game_data = db.Column(db.Text, default='{}')  # JSON string

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_game_data(self):
        return json.loads(self.game_data)

    def set_game_data(self, data):
        self.game_data = json.dumps(data)

# Create database tables
with app.app_context():
    db.create_all()

@app.route('/')
def home():
    if 'user_id' in session:
        return redirect(url_for('game'))
    return render_template('login.html')

@app.route('/game')
def game():
    if 'user_id' not in session:
        return redirect(url_for('home'))
    user = db.session.get(User, session['user_id'])
    game_data = user.get_game_data() if user else {}
    username = user.username if user else 'Guest'
    return render_template('game.html', game_data=game_data, username=username)

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        session['user_id'] = user.id
        return jsonify({'success': True, 'message': 'Logged in successfully'})
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if db.session.query(User).filter_by(username=username).first():
        return jsonify({'success': False, 'message': 'username exist'}), 400

    user = User(username=username)
    user.set_password(password)
    user.set_game_data({'coins': 0, 'totalSeconds': 0, 'inventory': {'wheat': 0, 'carrot': 0, 'egg': 0, 'milk': 0}, 'plots': [{'crop': None, 'plantedAt': 0, 'progress': 0, 'ready': False} for _ in range(6)], 'animals': [], 'stats': {'planted': 0, 'harvested': 0, 'sessions': 0, 'tasksCompleted': 0}, 'tasks': [], 'currentTaskId': None, 'avatar': '👤', 'logs': []})
    db.session.add(user)
    db.session.commit()

    session['user_id'] = user.id
    return jsonify({'success': True, 'message': 'Account created successfully'})

@app.route('/api/save', methods=['POST'])
def save_game():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user = db.session.get(User, session['user_id'])
    data = request.get_json()
    user.set_game_data(data)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/load', methods=['GET'])
def load_game():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user = db.session.get(User, session['user_id'])
    return jsonify({'success': True, 'data': user.get_game_data()})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'success': True})

@app.route('/api/weather')
def weather():
    try:
        # Get location
        loc_res = requests.get('https://ipapi.co/json/')
        loc_data = loc_res.json()
        city = loc_data.get('city', 'London')

        # Get weather
        weather_res = requests.get(f'https://wttr.in/{city}?format=j1')
        weather_data = weather_res.json()
        code = int(weather_data['current_condition'][0]['weatherCode'])

        # Map code to type
        if code == 113:
            weather_type = 'sunny'
        elif code in [116, 119, 122]:
            weather_type = 'cloudy'
        elif code in [176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359]:
            weather_type = 'rainy'
        elif code in [179, 182, 185, 227, 230, 281, 284, 311, 314, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377]:
            weather_type = 'snowy'
        else:
            weather_type = 'sunny'

        return jsonify({'success': True, 'type': weather_type, 'city': city})
    except Exception as e:
        return jsonify({'success': False, 'type': 'sunny', 'city': 'Unknown'})

if __name__ == '__main__':
    app.run(debug=True, port=5001)