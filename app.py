import langid
from flask import Flask, render_template, request, send_from_directory
from gtts import gTTS
from markupsafe import Markup
import openai
import os
import shutil
import markdown
import markdown.extensions.fenced_code
import markdown.extensions.codehilite

openai.api_key = os.environ["OPENAI_API_KEY"]
app = Flask(__name__)
messages = []
assistant_answer = ""
response_id = ""

def reset_messages_and_dir():
    global messages
    messages = []
    reset_dir = "audio"
    if os.path.isdir(reset_dir) == True:
        shutil.rmtree(reset_dir)
    os.mkdir(reset_dir)


@app.route("/")
def home():
    reset_messages_and_dir()
    return render_template("index.html")


@app.route("/get_response", methods=["POST"])
def get_bot_response():
    global messages
    global assistant_answer
    global response_id
    max_messages = 10
    user_input = request.form["user_input"]
    messages.append({"role": "user", "content": user_input})
    completion = openai.ChatCompletion.create(model="gpt-3.5-turbo", messages=messages)
    assistant_answer = completion.choices[0].message["content"]
    response_id = completion.id
    messages.append({"role": "assistant", "content": assistant_answer})
    print(messages)
    if len(messages) > max_messages * 2:
        messages = messages[-max_messages * 2 :]
    return Markup(markdown.markdown(assistant_answer, extensions=["fenced_code", "codehilite"]))


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
    global assistant_answer
    global response_id
    language = langid.classify(assistant_answer)[0]
    tts = gTTS(text=assistant_answer, lang=language)
    tts.save(f"./audio/assistant_audio_{response_id}.mp3")
    return response_id


@app.route("/audio/<path:filename>")
def audio(filename):
    return send_from_directory("audio/", filename)


@app.route("/reset")
def reset():
    reset_messages_and_dir()
    return "Conversation history has been reset."


if __name__ == "__main__":
    app.run(debug=True)
