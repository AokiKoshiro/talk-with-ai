$(function () {
    const $submitButton = $('#submit-button');
    const $messages = $('#messages');
    const $footer = $('#footer');
    const $userInputText = $('#user-input-text');
    const $resetButton = $('#reset-button');
    const $selectVoice = $('#select-voice');
    const $selectLanguage = $('#select-language');
    const $selectRate = $('#select-rate');
    const $switchContinuous = $('#switch-continuous');

    let recorder;
    let isRecording = false;
    let canPlayAudio = true;
    let audioChunks = [];
    let messageHistory = [];
    let audioQueue = [];
    let apiKeys = {};
    let openaiApiKey = '';
    let voicevoxApiKeys = [];
    const maxMessages = 10;
    const recodingTimeLimit = 3600000; // 1 hour

    function playNextAudio() {
        const audio = audioQueue[0];
        audio.addEventListener('ended', () => {
            audioQueue.shift();
            if (audioQueue.length > 0) {
                playNextAudio();
            }
        });
        audio.play();
    }

    function playAudio(audio) {
        audioQueue.push(audio);
        if (audioQueue.length === 1) {
            playNextAudio();
        }
    }

    function tts(assistantSentence, responseId, sentenceCount) {
        switch ($selectVoice.val()) {
            case 'gtts':
                const sentenceId = responseId + '-' + sentenceCount;
                $.ajax({
                    type: 'GET',
                    url: '/gtts',
                    data: {
                        'assistantSentence': assistantSentence,
                        'sentenceId': sentenceId,
                    },
                    success: () => {
                        const audio = new Audio(`../../audio/assistant-audio-${sentenceId}.mp3`);
                        audio.playbackRate = $selectRate.val() * 1.5;
                        playAudio(audio);
                    },
                });
                break;

            case 'zundamon':
                const rate = $selectRate.val() * 1.2;
                for (const voicevoxApiKey of voicevoxApiKeys) {
                    try {
                        const encodedAssistantSentence = encodeURIComponent(assistantSentence);
                        const audio = new Audio(`https://deprecatedapis.tts.quest/v2/voicevox/audio/?key=${voicevoxApiKey}&speaker=3&speed=${rate}&text=${encodedAssistantSentence}`);
                        playAudio(audio);
                        break;
                    } catch (error) {
                        continue;
                    }
                }
                break;

            default:
                break;
        }
    }

    function renderUserMessage(userInput) {
        $('#processing').remove();
        $messages.append(`
            <div class="d-flex flex-row-reverse">
                <div class="rounded mw-75 mb-2 p-2 text-white bg-primary">${userInput}</div>
            </div>
        `);
        $messages.append(`
            <div class="d-flex flex-row">
                <div class="assistant-message rounded mw-75 mb-2 p-2 pb-0 bg-white"></div>
            </div>
        `);
        $('html, body').animate({ scrollTop: $('body').get(0).scrollHeight }, 100);
    }

    async function processResponse(response) {
        let assistantMessage = '';
        let assistantSentence = '';
        let sentenceCount = 0;
        let jsonData = {};
        let responseId = '';

        const reader = response.body.getReader();
        const textDecoder = new TextDecoder();
        const punctuation = ['.', '?', '!', '…', '。', '？', '！', '　'];

        canPlayAudio = true;

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                return assistantMessage;
            }

            const buffer = textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (trimmedLine.startsWith('data:') && canPlayAudio) {
                    if (trimmedLine.includes('[DONE]')) {
                        if (assistantSentence !== '') {
                            tts(assistantSentence, responseId, sentenceCount);
                        }
                        return assistantMessage;
                    }

                    jsonData = JSON.parse(trimmedLine.slice(5));
                    responseId = jsonData.id;

                    if (jsonData.choices?.[0]?.delta?.content) {
                        const assistantToken = jsonData.choices[0].delta.content;
                        assistantMessage += assistantToken;
                        assistantSentence += assistantToken;
                        const lastChar = assistantToken.slice(-1);
                        if (punctuation.includes(lastChar) && assistantSentence.length >= 5) {
                            tts(assistantSentence, responseId, sentenceCount);
                            assistantSentence = '';
                            sentenceCount++;
                        }
                        $('.assistant-message').last().html(marked.parse(assistantMessage));
                        $('html, body').animate({ scrollTop: $('body').get(0).scrollHeight }, 100);
                    }
                }
            }
        }
    }

    async function getAssitantMessage(userInput) {
        renderUserMessage(userInput);
        messageHistory.push({ 'role': 'user', 'content': userInput });
        const url = 'https://api.openai.com/v1/chat/completions';
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + openaiApiKey,
            },
            body: JSON.stringify({
                'model': 'gpt-3.5-turbo',
                'stream': true,
                'messages': messageHistory,
            }),
        });
        const assistantMessage = await processResponse(response);
        messageHistory.push({ 'role': 'assistant', 'content': assistantMessage });
        if (messageHistory.length > 2 * maxMessages) {
            messageHistory = messageHistory.slice(-maxMessages * 2);
        }
    }

    function onSpeechStart() {
        audioChunks = [];
        pauseAssistantAudio();
        $submitButton.removeClass('btn-primary').addClass('btn-danger');
        setTimeout(() => {
            if (isRecording) {
                audioChunks = [];
                stopRecording();
            }
        }, recodingTimeLimit);
    }

    function onSpeechEnd(file) {
        $submitButton.removeClass('btn-danger').addClass('btn-primary');
        $messages.append(`
            <div id="processing" class="d-flex flex-row-reverse">
                <div class="rounded mw-75 mb-2 p-2 text-white bg-primary">
                    <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
                    processing...
                </div>
            </div>
        `);
        $('html, body').animate({ scrollTop: $('body').get(0).scrollHeight }, 100);
        const language = $selectLanguage.val();
        // const file = new File(audioChunks, 'audio.wav', { type: 'audio/wav' });
        const XHR = new XMLHttpRequest();
        XHR.open("POST", "https://api.openai.com/v1/audio/transcriptions");
        XHR.setRequestHeader("Authorization", "Bearer " + openaiApiKey);
        var formData = new FormData();
        formData.append("file", file);
        formData.append("model", "whisper-1");
        if (language !== 'auto') {
            formData.append("language", language);
        }
        XHR.send(formData);
        XHR.addEventListener("load", (event) => {
            transcript = JSON.parse(event.target.responseText).text;
            if (transcript === '') {
                $('#processing').remove();
                $('html, body').animate({ scrollTop: $('body').get(0).scrollHeight }, 100);
            } else {
                getAssitantMessage(transcript);
            }
        });
    }

    async function initVADRecorder() {
        recorder = await vad.MicVAD.new({
            onSpeechStart: () => {
                onSpeechStart();
            },
            onSpeechEnd: (arr) => {
                const wavBuffer = vad.utils.encodeWAV(arr);
                const file = new File([wavBuffer], `audio.wav`);
                onSpeechEnd(file);
            },
        });
    };

    async function initRecorder() {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        recorder = new MediaRecorder(stream);
        audioChunks = [];
        recorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });
        recorder.addEventListener('start', () => {
            onSpeechStart();
        });
        recorder.addEventListener('stop', () => {
            const file = new File(audioChunks, 'audio.wav', { type: 'audio/wav' });
            onSpeechEnd(file);
        });
    }

    function pauseAssistantAudio() {
        canPlayAudio = false;
        audioQueue.forEach(audio => {
            audio.pause();
            audioQueue = [];
        });
    }

    function startRecording() {
        pauseAssistantAudio();
        recorder.start();
        $submitButton.removeClass('bi-mic-fill btn-secondary').addClass('bi-stop-circle btn-primary');
    }

    function stopRecording() {
        if ($switchContinuous.is(':checked')) {
            recorder.pause();
        } else {
            recorder.stop();
        }
        $submitButton.removeClass('bi-stop-circle btn-danger').addClass('bi-mic-fill btn-secondary');
    }

    function toggleRecording() {
        if (isRecording) {
            stopRecording();
            isRecording = false;
        } else {
            startRecording();
            isRecording = true;
        }
    }

    function sendInputText() {
        const userInput = $userInputText.val();
        if (userInput !== '') {
            pauseAssistantAudio();
            getAssitantMessage(userInput);
            $userInputText.val('');
            $userInputText.focus();
            $submitButton.removeClass('bi-mic-fill').addClass('bi-send');
        }
    }

    function setMargin() {
        const footerHeight = $footer.height();
        const fontSize = getComputedStyle(document.documentElement).fontSize;
        const margin = parseFloat(fontSize);
        console.log("height: " + margin);
        $messages.css("margin-bottom", footerHeight + margin + "px");
    }

    function main() {
        setMargin();

        initVADRecorder();

        $switchContinuous.on('change', () => {
            if ($switchContinuous.is(':checked')) {
                initVADRecorder();
            } else {
                initRecorder();
            }
        });

        $submitButton.mousedown(() => {
            const userInput = $userInputText.val();
            if (userInput !== '' || $userInputText.is(':focus')) {
                sendInputText();
            } else {
                toggleRecording();
            }
        });

        $(document).keypress(event => {
            if (event.which === 32 && !$userInputText.is(':focus')) {
                event.stopImmediatePropagation();
                toggleRecording();
            }
        });

        $userInputText.on("focus", () => {
            $submitButton.removeClass('bi-mic-fill').addClass('bi-send');
        });

        $userInputText.on("blur", () => {
            const userInput = $userInputText.val();
            if (userInput === '') {
                $submitButton.removeClass('bi-send').addClass('bi-mic-fill');
            }
        });

        $userInputText.keyup(event => {
            if (event.key === "Enter") {
                sendInputText();
            }
        });

        $resetButton.click(() => {
            messageHistory = [];
            audioQueue = [];
            if (isRecording) {
                stopRecording();
            }
            pauseAssistantAudio();
            $.ajax({
                type: 'GET',
                url: '/reset',
                success: () => {
                    $messages.empty();
                }
            });
        });
    }

    $.ajax({
        type: 'POST',
        url: '/api_key',
        success: response => {
            apiKeys = response;
            openaiApiKey = apiKeys.openai;
            voicevoxApiKeys = apiKeys.voicevox;
            main();
        }
    });
});