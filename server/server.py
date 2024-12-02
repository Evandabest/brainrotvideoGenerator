from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import os
import asyncio
import edge_tts
import time
import traceback
import google.generativeai as genai
from dotenv import load_dotenv
import io
import tempfile
from test import makeScript  

app = Flask(__name__)
CORS(app)

load_dotenv()
api_key = os.getenv("GOOGLE_GEMINI_KEY")
if not api_key:
    raise EnvironmentError("GOOGLE_GEMINI_KEY is not set in environment variables.")
genai.configure(api_key=api_key)

async def generate_tts(text, output_path, v):
    #voice = "en-US-JennyNeural"
    #voice = "en-US-ChristopherNeural"
    voice = v
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)

@app.route('/generate-audio', methods=['POST'])
def generate_audio():
    try:
        print("Received request for audio generation")
        script = request.form.get('script', '')
        voice = request.form.get('voice', '')
        print(voice)

        if not script:
            return jsonify({'error': 'No text provided'}), 400

        print("Generating TTS audio")
        
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmpfile:
            temp_filename = tmpfile.name

        try:
            asyncio.run(generate_tts(script, temp_filename, voice))
            
            with open(temp_filename, 'rb') as f:
                audio_data = f.read()
            audio_buffer = io.BytesIO(audio_data)
            audio_buffer.seek(0)

            return send_file(
                audio_buffer,
                mimetype='audio/mpeg',
                as_attachment=True,
                download_name=f'audio_{int(time.time())}.mp3'
            )
        finally:
            os.remove(temp_filename)

    except Exception as e:
        print("Error occurred during audio generation:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/getScript', methods=['POST'])
def upload_video():
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400
        file = request.files['video']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        # Log all form data
        print("Received Form Data:", request.form)

        duration = request.form.get('duration', default=60, type=int)  
        print(f"Parsed Duration: {duration}")

        level = request.form.get('level', default=3, type=int)

        if duration is None:
            return jsonify({'error': 'Duration is missing or invalid'}), 400

        video_bytes = file.read()
        video_stream = io.BytesIO(video_bytes)

        script = makeScript(video_stream, duration, level)

        print(f"Duration: {duration}, Script: {script}")

        return jsonify({'script': script}), 200

    except Exception as e:
        print("Error occurred in /getScript:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=5000)