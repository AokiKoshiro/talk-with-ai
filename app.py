import langid
from flask import Flask, render_template, request, send_from_directory
from gtts import gTTS
import openai
import os
import shutil

app = Flask(__name__)


def reset_audio_dir():
    reset_dir = "audio"
    if os.path.isdir(reset_dir) == True:
        shutil.rmtree(reset_dir)
    os.mkdir(reset_dir)


@app.route("/")
def home():
    reset_audio_dir()
    return render_template("index.html")


@app.route("/api_key", methods=["GET"])
def api_key():
    return os.environ["OPENAI_API_KEY"]


@app.route("/transcribe", methods=["POST"])
def transcribe():
    language = request.form["language"]
    if language == "auto":
        language = None
    audio_file = request.files["audio"]
    audio_data = audio_file.read()
    with open("./audio/user_audio.webm", "wb") as f:
        f.write(audio_data)
    audio_file = open("./audio/user_audio.webm", "rb")
    transcript = openai.Audio.transcribe("whisper-1", audio_file, language=language)
    transcription_text = transcript["text"]
    return transcription_text


@app.route("/gtts")
def gtts():
    assitant_sentence = request.args.get("assistantSentence")
    sentence_id = request.args.get("sentenceId")
    language = langid.classify(assitant_sentence)[0]
    tts = gTTS(text=assitant_sentence, lang=language)
    tts.save(f"./audio/assistant_audio_{sentence_id}.mp3")
    return "success"


@app.route("/audio/<path:filename>")
def audio(filename):
    return send_from_directory("audio/", filename)


@app.route("/reset")
def reset():
    reset_audio_dir()
    return "Conversation history has been reset."


if __name__ == "__main__":
    app.run(debug=True)
