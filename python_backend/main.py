from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import uuid
import tempfile
import io
import json
import re
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


# ─── PDF / Excel parsing helpers ──────────────────────────────────────────────

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
    """Extract text and tables from a PDF. Always returns raw_text."""
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

    combined_text = '\n'.join(all_text)
    columns = list(all_tables[0].keys()) if all_tables else []
    return {
        'file_type': 'pdf',
        'row_count': len(all_tables),
        'columns': columns,
        'data': all_tables,
        'raw_text': combined_text,  # always returned, even when tables exist
    }


# ─── AI extraction for FIBA box scores ────────────────────────────────────────

def extract_box_score_with_ai(raw_text, file_name):
    """Use GPT-4o-mini to extract structured FIBA box score data from raw PDF text."""
    prompt = (
        "You are a basketball stats extractor. Parse this FIBA box score text and return ONLY valid JSON.\n\n"
        "Return this exact structure (use 0 for unknown numbers, null for unknown strings):\n"
        "{\n"
        '  "game_date": "YYYY-MM-DD or null",\n'
        '  "home_team": "team name",\n'
        '  "away_team": "team name",\n'
        '  "home_score": 0,\n'
        '  "away_score": 0,\n'
        '  "players": [\n'
        '    {\n'
        '      "team": "team name",\n'
        '      "number": "jersey number",\n'
        '      "name": "full player name",\n'
        '      "minutes": "MM:SS or null",\n'
        '      "fgm": 0, "fga": 0,\n'
        '      "fg3m": 0, "fg3a": 0,\n'
        '      "ftm": 0, "fta": 0,\n'
        '      "oreb": 0, "dreb": 0, "reb": 0,\n'
        '      "ast": 0, "stl": 0, "blk": 0,\n'
        '      "tov": 0, "pf": 0,\n'
        '      "plus_minus": 0,\n'
        '      "pts": 0\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        f'File name: {file_name}\n\n'
        'BOX SCORE TEXT (extract ALL players from BOTH teams):\n'
        + raw_text[:7000]
    )

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=4000,
        temperature=0
    )
    return json.loads(completion.choices[0].message.content)


# ─── Player find-or-create ────────────────────────────────────────────────────

def _normalize_name(name):
    return re.sub(r'\s+', ' ', str(name).strip()).lower()

def _make_slug(name):
    slug = re.sub(r'[^a-z0-9]+', '-', _normalize_name(name))
    return slug.strip('-')

def find_or_create_player(sb, full_name):
    """Return player UUID, creating the player in the players table if not found."""
    if not full_name or not str(full_name).strip():
        return None
    norm = _normalize_name(full_name)
    try:
        res = sb.table('players').select('id, full_name, slug').execute()
        all_players = res.data or []
        for p in all_players:
            if _normalize_name(p.get('full_name', '')) == norm:
                return p['id']

        # Not found — create
        base_slug = _make_slug(full_name)
        existing_slugs = {p.get('slug', '') for p in all_players}
        slug = base_slug
        counter = 1
        while slug in existing_slugs:
            slug = f"{base_slug}-{counter}"
            counter += 1

        result = sb.table('players').insert({
            'full_name': full_name.strip(),
            'slug': slug
        }).execute()
        if result.data:
            return result.data[0]['id']
    except Exception as e:
        print(f"[parse] find_or_create_player error for {full_name!r}: {e}", flush=True)
    return None


# ─── DB write helpers ─────────────────────────────────────────────────────────

def _safe_int(v, default=0):
    try:
        return int(v or default)
    except (TypeError, ValueError):
        return default

def write_pdf_players_to_db(sb, players, league_id, game_key):
    """Write AI-extracted player list to player_stats. Returns count written."""
    if not league_id or not players:
        return 0

    rows = []
    for p in players:
        full_name = (p.get('name') or '').strip()
        if not full_name:
            continue

        player_id = find_or_create_player(sb, full_name)

        reb = _safe_int(p.get('reb')) or (_safe_int(p.get('oreb')) + _safe_int(p.get('dreb')))

        rows.append({
            'league_id': league_id,
            'game_key': game_key,
            'player_id': player_id,
            'full_name': full_name,
            'team_name': (p.get('team') or '').strip(),
            'spoints': _safe_int(p.get('pts')),
            'sfieldgoalsmade': _safe_int(p.get('fgm')),
            'sfieldgoalsattempted': _safe_int(p.get('fga')),
            'sthreepointersmade': _safe_int(p.get('fg3m')),
            'sthreepointersattempted': _safe_int(p.get('fg3a')),
            'sfreethrowsmade': _safe_int(p.get('ftm')),
            'sfreethrowsattempted': _safe_int(p.get('fta')),
            'sreboundsoffensive': _safe_int(p.get('oreb')),
            'sreboundsdefensive': _safe_int(p.get('dreb')),
            'sreboundstotal': reb,
            'sassists': _safe_int(p.get('ast')),
            'ssteals': _safe_int(p.get('stl')),
            'sblocks': _safe_int(p.get('blk')),
            'sturnovers': _safe_int(p.get('tov')),
            'sfoulspersonal': _safe_int(p.get('pf')),
            'splusminuspoints': _safe_int(p.get('plus_minus')),
            'sminutes': p.get('minutes') or '0:00',
        })

    if not rows:
        print("[parse] no valid player rows to write", flush=True)
        return 0

    print(f"[parse] writing {len(rows)} rows to player_stats...", flush=True)
    try:
        result = sb.table('player_stats').upsert(rows, on_conflict='player_id,game_key').execute()
        count = len(result.data or [])
        print(f"[parse] upserted {count} rows OK", flush=True)
        return count
    except Exception as e:
        print(f"[parse] upsert failed ({e}), trying insert...", flush=True)
        try:
            result = sb.table('player_stats').insert(rows).execute()
            count = len(result.data or [])
            print(f"[parse] inserted {count} rows OK", flush=True)
            return count
        except Exception as e2:
            print(f"[parse] insert also failed: {e2}", flush=True)
            return 0


EXCEL_COL_MAP = {
    'name': 'full_name', 'player': 'full_name', 'player name': 'full_name', 'player_name': 'full_name',
    'team': 'team_name', 'club': 'team_name', 'team_name': 'team_name',
    'min': 'sminutes', 'minutes': 'sminutes', 'sminutes': 'sminutes',
    'pts': 'spoints', 'points': 'spoints', 'spoints': 'spoints',
    'fgm': 'sfieldgoalsmade', 'fg made': 'sfieldgoalsmade', 'sfieldgoalsmade': 'sfieldgoalsmade',
    'fga': 'sfieldgoalsattempted', 'fg att': 'sfieldgoalsattempted', 'sfieldgoalsattempted': 'sfieldgoalsattempted',
    '3pm': 'sthreepointersmade', '3pt made': 'sthreepointersmade', '3m': 'sthreepointersmade', 'sthreepointersmade': 'sthreepointersmade',
    '3pa': 'sthreepointersattempted', '3pt att': 'sthreepointersattempted', '3a': 'sthreepointersattempted', 'sthreepointersattempted': 'sthreepointersattempted',
    'ftm': 'sfreethrowsmade', 'ft made': 'sfreethrowsmade', 'sfreethrowsmade': 'sfreethrowsmade',
    'fta': 'sfreethrowsattempted', 'ft att': 'sfreethrowsattempted', 'sfreethrowsattempted': 'sfreethrowsattempted',
    'oreb': 'sreboundsoffensive', 'off reb': 'sreboundsoffensive', 'or': 'sreboundsoffensive', 'sreboundsoffensive': 'sreboundsoffensive',
    'dreb': 'sreboundsdefensive', 'def reb': 'sreboundsdefensive', 'dr': 'sreboundsdefensive', 'sreboundsdefensive': 'sreboundsdefensive',
    'reb': 'sreboundstotal', 'tot reb': 'sreboundstotal', 'tr': 'sreboundstotal', 'sreboundstotal': 'sreboundstotal',
    'ast': 'sassists', 'assists': 'sassists', 'sassists': 'sassists',
    'stl': 'ssteals', 'steals': 'ssteals', 'ssteals': 'ssteals',
    'blk': 'sblocks', 'blocks': 'sblocks', 'sblocks': 'sblocks',
    'to': 'sturnovers', 'tov': 'sturnovers', 'turnovers': 'sturnovers', 'sturnovers': 'sturnovers',
    'pf': 'sfoulspersonal', 'fouls': 'sfoulspersonal', 'sfoulspersonal': 'sfoulspersonal',
    '+/-': 'splusminuspoints', 'plus minus': 'splusminuspoints', 'plus_minus': 'splusminuspoints', 'splusminuspoints': 'splusminuspoints',
}

def write_excel_players_to_db(sb, records, league_id, game_key):
    """Map Excel rows to player_stats columns and write to DB. Returns count written."""
    if not league_id or not records:
        return 0

    rows = []
    for record in records:
        mapped = {'league_id': league_id, 'game_key': game_key}
        for raw_col, raw_val in record.items():
            norm = str(raw_col).strip().lower()
            db_col = EXCEL_COL_MAP.get(norm)
            if db_col:
                mapped[db_col] = raw_val

        full_name = str(mapped.get('full_name') or '').strip()
        if not full_name:
            continue
        mapped['full_name'] = full_name
        player_id = find_or_create_player(sb, full_name)
        if player_id:
            mapped['player_id'] = player_id
        rows.append(mapped)

    if not rows:
        return 0

    print(f"[parse] writing {len(rows)} Excel rows to player_stats...", flush=True)
    try:
        result = sb.table('player_stats').upsert(rows, on_conflict='player_id,game_key').execute()
        count = len(result.data or [])
        print(f"[parse] Excel upserted {count} rows OK", flush=True)
        return count
    except Exception as e:
        print(f"[parse] Excel upsert failed ({e}), trying insert...", flush=True)
        try:
            result = sb.table('player_stats').insert(rows).execute()
            count = len(result.data or [])
            print(f"[parse] Excel inserted {count} rows OK", flush=True)
            return count
        except Exception as e2:
            print(f"[parse] Excel insert also failed: {e2}", flush=True)
            return 0


# ─── Main parse endpoint ──────────────────────────────────────────────────────

@app.route('/api/parse', methods=['POST'])
def parse_file():
    try:
        data = request.get_json()
        file_path = data.get('file_path', '')
        user_id = data.get('user_id', '')
        league_id = data.get('league_id', '')
        parent_league_id = data.get('parent_league_id', '') or league_id

        if not file_path:
            return jsonify({'error': 'file_path is required'}), 400

        if '/' in file_path:
            bucket = file_path.split('/')[0]
            path_in_bucket = '/'.join(file_path.split('/')[1:])
        else:
            bucket = 'XLSX Uploads'
            path_in_bucket = file_path

        file_name = path_in_bucket.split('/')[-1]
        game_key = re.sub(r'[^a-z0-9_-]', '_', re.sub(r'\.(pdf|xlsx?)$', '', file_name, flags=re.IGNORECASE).lower())

        print(f"[parse] bucket='{bucket}' path='{path_in_bucket}' game_key='{game_key}' league={league_id}", flush=True)

        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        try:
            file_bytes = sb.storage.from_(bucket).download(path_in_bucket)
        except Exception as dl_err:
            print(f"[parse] download error: {dl_err}", flush=True)
            return jsonify({'error': f'File not found in storage: bucket={bucket!r} path={path_in_bucket!r} — {dl_err}'}), 404

        is_pdf = path_in_bucket.lower().endswith('.pdf')

        if is_pdf:
            raw = parse_pdf(file_bytes)
            raw_text = raw.get('raw_text', '') or ''
            print(f"[parse] PDF text length: {len(raw_text)} chars", flush=True)

            if not raw_text.strip():
                return jsonify({'error': 'Could not extract any text from the PDF. Is it a scanned image?'}), 422

            print("[parse] sending PDF text to AI for box score extraction...", flush=True)
            game_data = extract_box_score_with_ai(raw_text, file_name)
            players = game_data.get('players', [])
            print(f"[parse] AI extracted {len(players)} players", flush=True)

            rows_written = write_pdf_players_to_db(sb, players, league_id, game_key)

            return jsonify({
                'file_type': 'pdf',
                'file_path': file_path,
                'user_id': user_id,
                'league_id': league_id,
                'parent_league_id': parent_league_id,
                'game_key': game_key,
                'game_data': game_data,
                'row_count': len(players),
                'rows_written': rows_written,
                'created_league_ids': [],
            })

        else:
            raw = parse_excel(file_bytes)
            excel_records = raw.get('data', [])
            print(f"[parse] Excel rows: {len(excel_records)}, columns: {raw.get('columns', [])}", flush=True)

            rows_written = write_excel_players_to_db(sb, excel_records, league_id, game_key)

            return jsonify({
                **raw,
                'file_path': file_path,
                'user_id': user_id,
                'league_id': league_id,
                'parent_league_id': parent_league_id,
                'game_key': game_key,
                'rows_written': rows_written,
                'created_league_ids': [],
            })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Parse failed: {str(e)}'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
