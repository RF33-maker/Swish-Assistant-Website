from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import uuid
from datetime import datetime
from openai import OpenAI

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

conversation_store = {}

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'League Chatbot Backend'
    })

@app.route('/start', methods=['GET'])
def start_thread():
    thread_id = str(uuid.uuid4())
    conversation_store[thread_id] = []
    return jsonify({'thread_id': thread_id})

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        thread_id = data.get('thread_id', '')
        message = data.get('message', '')
        player_name = data.get('player_name', '')
        chat_mode = data.get('chatMode', 'general')

        if not thread_id or not message:
            return jsonify({'error': 'thread_id and message are required'}), 400

        if thread_id not in conversation_store:
            conversation_store[thread_id] = []

        history = conversation_store[thread_id]

        if chat_mode == 'scouting':
            system_prompt = (
                "You are an expert basketball scouting assistant. "
                "Help coaches evaluate players, identify strengths and weaknesses, "
                "and provide actionable scouting insights. Be concise and professional."
            )
        else:
            system_prompt = (
                "You are a knowledgeable basketball coaching assistant. "
                "Help coaches with game strategy, player development, and performance analysis. "
                "Be concise, practical, and data-driven in your responses."
            )

        if player_name:
            system_prompt += f" The coach is asking about player: {player_name}."

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-10:])
        messages.append({"role": "user", "content": message})

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=500
        )

        answer = completion.choices[0].message.content

        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": answer})
        conversation_store[thread_id] = history

        summary_completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Summarise the following coaching response in 1-2 concise sentences for a quick-read summary."},
                {"role": "user", "content": answer}
            ],
            max_tokens=100
        )
        summary = summary_completion.choices[0].message.content

        return jsonify({
            'response': answer,
            'gpt_summary': summary
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat/league', methods=['POST'])
def chat_league():
    try:
        data = request.get_json()
        question = data.get('question', '')
        league_id = data.get('league_id', '')
        league_data = data.get('league_data', '')

        if not question:
            return jsonify({'error': 'question is required'}), 400

        if league_data:
            system_prompt = (
                "You are an expert basketball league analyst and coaching assistant. "
                "You have been provided with REAL current league data below — use it to answer questions accurately. "
                "Always reference actual player names, teams, and stats from the data provided. "
                "Be concise and specific. If asked for top scorers or leaders, list them by name with their numbers. "
                "Do not make up or estimate stats — only use what is in the data provided.\n\n"
                f"CURRENT LEAGUE DATA:\n{league_data}"
            )
            user_message = question
        else:
            system_prompt = (
                "You are an expert basketball league analyst and coaching assistant. "
                "Help with performance analysis, player statistics, team strategies, and league insights. "
                "Be concise and data-driven."
            )
            user_message = f"Question about league {league_id}: {question}"

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            max_tokens=500
        )

        answer = completion.choices[0].message.content

        # Generate dynamic follow-up suggestions based on the answer
        suggestions = [
            'Who are the top scorers?',
            'Show me recent game results',
            'Who is the most efficient player?'
        ]

        return jsonify({
            'response': answer,
            'suggestions': suggestions,
            'status': 'success'
        })

    except Exception as e:
        return jsonify({'error': str(e), 'status': 'error'}), 500

@app.route('/api/ai-analysis', methods=['POST'])
def ai_analysis():
    try:
        data = request.get_json()
        name = data.get('name', 'Player')
        avg_points = data.get('avg_points', 0)
        avg_rebounds = data.get('avg_rebounds', 0)
        avg_assists = data.get('avg_assists', 0)
        avg_steals = data.get('avg_steals', 0)
        avg_blocks = data.get('avg_blocks', 0)
        fg_pct = data.get('fg_percentage', 0)
        three_pct = data.get('three_point_percentage', 0)
        ft_pct = data.get('ft_percentage', 0)
        games_played = data.get('games_played', 0)

        prompt = (
            f"Analyse the following basketball player stats and write a 2-3 sentence professional scouting summary:\n"
            f"Player: {name}\n"
            f"Games Played: {games_played}\n"
            f"Points: {avg_points} PPG | Rebounds: {avg_rebounds} RPG | Assists: {avg_assists} APG\n"
            f"Steals: {avg_steals} | Blocks: {avg_blocks}\n"
            f"FG%: {fg_pct:.1f}% | 3P%: {three_pct:.1f}% | FT%: {ft_pct:.1f}%"
        )

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert basketball analyst. Write concise, insightful player analysis."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=200
        )

        analysis = completion.choices[0].message.content

        return jsonify({'analysis': analysis})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
