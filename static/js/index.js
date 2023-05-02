$(function () {
    const $submitButton = $('#submit-button');
    const $messages = $('#messages');
    const $userInputText = $('#user-input-text');
    const $resetButton = $('#reset-button');
    const $selectVoice = $('#select-voice');
    const $selectLanguage = $('#select-language');
    const $selectRate = $('#select-rate');

    function playAudio(assistantAudio, responseId) {
        const assistantAudioList = assistantAudioDict[responseId] || [];
        assistantAudioList.push(assistantAudio);
        assistantAudioDict[responseId] = assistantAudioList;

        const playAudioAtIndex = (index) => {
            if (index >= assistantAudioList.length) {
                return;
            }
            assistantAudioList[index].play();
            assistantAudioList[index].addEventListener('ended', () => {
                playAudioAtIndex(index + 1);
            });
        };

        if (assistantAudioList.length === 1) {
            playAudioAtIndex(0);
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
                        const audio = new Audio(`../../audio/assistant_audio_${sentenceId}.mp3`);
                        audio.playbackRate = $selectRate.val() * 1.5;
                        playAudio(audio, responseId);
                    },
                });
                break;

            case 'zundamon':
                const rate = $selectRate.val() * 1.2;
                let audioLoaded = false;
                for (const voicevoxApiKey of voicevoxApiKeys) {
                    if (audioLoaded) break;
                    const audio = new Audio(`https://deprecatedapis.tts.quest/v2/voicevox/audio/?key=${voicevoxApiKey}&speaker=3&speed=${rate}&text=${assistantSentence}`);
                    audio.addEventListener('canplaythrough', () => {
                        audioLoaded = true;
                        playAudio(audio);
                    });
                }
                break;

            default:
                break;
        }
    }

    function renderUserMessage(userInput) {
        $('#processing').remove();
        $resetButton.show();
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

        const reader = response.body.getReader();
        const textDecoder = new TextDecoder();
        const punctuation = ['.', '?', '!', '…', ' ', '。', '？', '！', '　'];

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                return assistantMessage;
            }

            const buffer = textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (trimmedLine.startsWith('data:')) {
                    const jsonData = JSON.parse(trimmedLine.slice(5));
                    const responseId = jsonData.id;

                    if (trimmedLine.includes('[DONE]')) {
                        if (assistantSentence !== '') {
                            tts(assistantSentence, responseId, sentenceCount);
                        }
                        assistantAudioDict = {};
                        return assistantMessage;
                    }

                    if (jsonData.choices?.[0]?.delta?.content) {
                        const assistantToken = jsonData.choices[0].delta.content;
                        assistantMessage += assistantToken;
                        assistantSentence += assistantToken;
                        if (punctuation.includes(assistantToken.slice(-1)) && assistantSentence.length >= 5) {
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

    function handleMediaStream(stream) {
        mediaRecorder = new MediaRecorder(stream);
        let audioChunks = [];

        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener('start', () => {
            $submitButton.removeClass('bi-mic-fill btn-secondary').addClass('bi-stop-circle btn-danger');
            audioChunks = [];
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, recodingTimeLimit);
        });

        mediaRecorder.addEventListener('stop', () => {
            $submitButton.removeClass('bi-stop-circle btn-danger').addClass('bi-mic-fill btn-secondary');
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
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', blob, 'audio.webm');
            formData.append('language', language);
            $.ajax({
                url: '/transcribe',
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: transcript => {
                    getAssitantMessage(transcript);
                }
            });
        });
    }

    function toggleRecording() {
        pauseAssistantAudio();
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        } else {
            mediaRecorder.start();
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

    function pauseAssistantAudio() {
        Object.values(assistantAudioDict).flat().forEach(audio => {
            audio.pause();
        });
    }

    function main() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            handleMediaStream(stream);
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
            assistantAudioDict = {};
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
            pauseAssistantAudio();
            $.ajax({
                type: 'GET',
                url: '/reset',
                success: () => {
                    $messages.empty();
                    $resetButton.hide();
                }
            });
        });
    }

    let messageHistory = [];
    let mediaRecorder = null;
    let assistantAudioDict = {};
    let apiKeys = {};
    let openaiApiKey = '';
    let voicevoxApiKeys = [];
    const maxMessages = 10;
    const recodingTimeLimit = 30000;

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