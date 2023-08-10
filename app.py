import langid
from flask import Flask, render_template, jsonify, request, send_from_directory
from gtts import gTTS
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


@app.route("/gtts", methods=["POST"])
def gtts():
    assitant_sentence = request.form["assistantSentence"]
    sentence_id = request.form["sentenceId"]
    language = langid.classify(assitant_sentence)[0]
    tts = gTTS(text=assitant_sentence, lang=language)
    tts.save(f"./audio/assistant-audio-{sentence_id}.mp3")
    return "success"


@app.route("/audio/<path:filename>")
def audio(filename):
    return send_from_directory("audio/", filename)


@app.route("/reset")
def reset():
    reset_audio_dir()
    return "Chat history has been reset."


if __name__ == "__main__":
    app.run(debug=True)
