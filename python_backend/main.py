from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import uuid
import tempfile
import io
from datetime import datetime
from openai import OpenAI
import pandas as pd
from supabase import create_client

app = Flask(__name__)
CORS(app)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "https://omkwqpcgttrgvbhcxgqf.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")

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
                "You are an expert basketball league analyst for a professional league app, similar to the NBA app's Ask NBA feature.\n\n"
                "IMPORTANT: The data you receive may include a FOCUS: directive and labelled sections (TEAM OVERVIEW, ROSTER, etc.). "
                "Always follow the FOCUS directive. If it says to describe a team's overall performance, lead with TEAM-LEVEL stats — "
                "do NOT make individual players the main subject. The ROSTER section is supplementary context only.\n\n"
                "RESPONSE FORMAT — follow this structure exactly:\n"
                "1. Open with ONE context sentence naming the subject (team or player) and what you are summarising.\n"
                "2. Use a bullet list for the key stats — bold the team/player name at the top, then stat lines beneath.\n"
                "   For team queries: summarise record, PPG, RPG, APG, FG% as bullet points. Mention top players briefly at the end.\n"
                "   For player queries: summarise PPG, RPG, APG, shooting splits as bullet points.\n"
                "3. Close with 1-2 sentences of insight — e.g. what makes this team/player stand out, a trend, a strength.\n"
                "4. Keep total response under 220 words. Be punchy and specific — no fluff.\n\n"
                "RULES:\n"
                "- Only use stats from the data provided. Never invent numbers.\n"
                "- Bold all player and team names.\n"
                "- Use plain English, not overly formal language.\n"
                "- Never start with 'As of this season' — vary your opening.\n\n"
                "At the very end of your response (after the insight), append exactly this line:\n"
                "SUGGESTIONS: <question 1> | <question 2> | <question 3>\n"
                "These should be 3 natural follow-up questions a fan would ask, specific to the players/teams you mentioned.\n\n"
                f"CURRENT LEAGUE DATA:\n{league_data}"
            )
            user_message = question
        else:
            system_prompt = (
                "You are an expert basketball league analyst. "
                "Help with performance analysis, player statistics, team strategies, and league insights. "
                "Be concise and data-driven. Bold all player and team names. "
                "At the very end append: SUGGESTIONS: <q1> | <q2> | <q3>"
            )
            user_message = f"Question about league {league_id}: {question}"

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            max_tokens=700,
            temperature=0.2
        )

        raw_answer = completion.choices[0].message.content

        # Parse SUGGESTIONS out of the response
        suggestions = []
        answer = raw_answer
        if 'SUGGESTIONS:' in raw_answer:
            parts = raw_answer.rsplit('SUGGESTIONS:', 1)
            answer = parts[0].strip()
            suggestion_line = parts[1].strip()
            suggestions = [s.strip() for s in suggestion_line.split('|') if s.strip()][:3]

        if not suggestions:
            suggestions = ['Who are the top scorers?', 'Show me recent game results', 'Who is the most efficient player?']

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

def parse_excel(file_bytes):
    df = pd.read_excel(io.BytesIO(file_bytes), engine='openpyxl')
    records = df.to_dict(orient='records')
    columns = list(df.columns)
    return {
        'file_type': 'excel',
        'row_count': len(records),
        'columns': columns,
        'data': records
    }

def parse_pdf(file_bytes):
    import pdfplumber
    all_tables = []
    all_text = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                all_text.append(text)

            tables = page.extract_tables()
            for table in tables:
                if table and len(table) > 1:
                    headers = table[0]
                    for row in table[1:]:
                        record = {}
                        for i, header in enumerate(headers):
                            if header and i < len(row):
                                record[str(header).strip()] = row[i]
                        if record:
                            all_tables.append(record)

    columns = list(all_tables[0].keys()) if all_tables else []
    return {
        'file_type': 'pdf',
        'row_count': len(all_tables),
        'columns': columns,
        'data': all_tables,
        'raw_text': '\n'.join(all_text) if not all_tables else None
    }

@app.route('/api/parse', methods=['POST'])
def parse_file():
    try:
        data = request.get_json()
        file_path = data.get('file_path', '')
        user_id = data.get('user_id', '')
        league_id = data.get('league_id', '')

        if not file_path:
            return jsonify({'error': 'file_path is required'}), 400

        if '/' in file_path:
            bucket = file_path.split('/')[0]
            path_in_bucket = '/'.join(file_path.split('/')[1:])
        else:
            bucket = 'XLSX Uploads'
            path_in_bucket = file_path

        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        file_bytes = sb.storage.from_(bucket).download(path_in_bucket)

        is_pdf = path_in_bucket.lower().endswith('.pdf')

        if is_pdf:
            result = parse_pdf(file_bytes)
        else:
            result = parse_excel(file_bytes)

        result['file_path'] = file_path
        result['user_id'] = user_id
        result['league_id'] = league_id

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': f'Parse failed: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
