
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'League Chatbot Backend'
    })

@app.route('/api/chat/league', methods=['POST'])
def chat_league():
    try:
        data = request.get_json()
        question = data.get('question', '')
        league_id = data.get('league_id', '')
        context = data.get('context', '')

        # Simple response for now - you can enhance this with AI later
        response = f"✅ Python Backend Response: I received your question '{question}' about league {league_id}. This is working from the Python Flask backend!"
        
        return jsonify({
            'response': response,
            'suggestions': [
                'Who are the top scorers?',
                'Show me team standings',
                'Who is the most efficient player?'
            ],
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
