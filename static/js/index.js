$(function () {
    const $openaiApiKey = $('#openai-api-key');
    const $voicevoxApiKey = $('#voicevox-api-key');
    const $submitButton = $('#submit-button');
    const $messages = $('#messages');
    const $footer = $('#footer');
    const $userInputText = $('#user-input-text');
    const $resetButton = $('#reset-button');
    const $unsendButton = $('#unsend-button');
    const $selectVoice = $('#select-voice');
    const $selectLanguage = $('#select-language');
    const $selectRate = $('#select-rate');
    const $selectModel = $('#select-model');
    const $switchContinuous = $('#switch-continuous');
    const $settingButton = $('#setting-button');
    const $saveSettingButton = $('#save-setting-button');
    const settingElementsDict = {
        'openai-api-key': $openaiApiKey,
        'voicevox-api-key': $voicevoxApiKey,
        'select-voice': $selectVoice,
        'select-language': $selectLanguage,
        'select-rate': $selectRate,
        'select-model': $selectModel
    };

    const maxChatTrun = 10;
    const recodingTimeLimit = 3600000; // 1 hour
    const endSign = '@e$n#d';
    const systemMessage = {
        'role': 'system',
        'content': `IMPORTANT: 1. Due to the use of speech recognition, transcription errors may occur. Please interpret user's intended message accordingly. 2. If the message received from the user is 'goodbye', 'see you', or other similar farewell phrases, please respond with "Goodbye! ${endSign} Goodbye! ${endSign}" in user's language. Otherwise, continue the normal conversation.`
    };
    let recorder;
    let isRecording = false;
    let canPlayAudio = true;
    let canAutoScroll = true;
    let audioChunks = [];
    let messageHistory = [systemMessage];
    let audioQueue = {};
    let openaiApiKey = '';
    let voicevoxApiKey = '';


    function playAudio() {
        const headAudio = audioQueue[Object.keys(audioQueue)[0]];
        if (!headAudio || !canPlayAudio) {
            return;
        }
        if (headAudio.paused) {
            headAudio.play();
        }
        headAudio.onended = () => {
            delete audioQueue[Object.keys(audioQueue)[0]];
            playAudio();
        };
    }

    function tts(assistantSentence, responseId, sentenceCount) {
        assistantSentence = assistantSentence.split(endSign).join('');
        const sentenceId = responseId + '-' + sentenceCount;
        audioQueue[sentenceId] = new Audio();
        switch ($selectVoice.val()) {
            case 'gtts':
                $.ajax({
                    type: 'POST',
                    url: '/gtts',
                    data: {
                        'assistantSentence': assistantSentence,
                        'sentenceId': sentenceId,
                    },
                    success: () => {
                        audioQueue[sentenceId] = new Audio(`../../audio/assistant-audio-${sentenceId}.mp3`);
                        audioQueue[sentenceId].playbackRate = $selectRate.val() * 1.4;
                        playAudio();
                    },
                });
                break;

            case 'zundamon':
                const rate = $selectRate.val() * 1.2;
                const encodedAssistantSentence = encodeURIComponent(assistantSentence);
                audioQueue[sentenceId] = new Audio(`https://deprecatedapis.tts.quest/v2/voicevox/audio/?key=${voicevoxApiKey}&speaker=3&speed=${rate}&text=${encodedAssistantSentence}`);
                playAudio();
                break;

            default:
                break;
        }
    }

    function scrollToBottom() {
        if (canAutoScroll) {
            const bottom = $(document).height() - $(window).height();
            window.scroll(0, bottom);
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
                <div class="assistant-message rounded mw-75 mb-2 p-2 pb-0 bg-white">
                    <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
                    thinking...
                </div>
            </div>
        `);
        scrollToBottom();
    }

    async function processResponse(response) {
        let assistantMessage = '';
        let assistantSentence = '';
        let sentenceCount = 0;
        let matchCount = 0;
        let jsonData = {};
        let responseId = '';

        const reader = response.body.getReader();
        const textDecoder = new TextDecoder();
        const punctuation = ['.', '?', '!', '…', '- ', '# ', '。', '？', '！', '• ', '・ ', '　'];

        canPlayAudio = true;
        $('#thinking').remove();

        while (true) {
            const { value, done } = await reader.read();

            if (done || !canPlayAudio) {
                return assistantMessage;
            }

            const buffer = textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (trimmedLine.startsWith('data:')) {
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
                        for (let i = matchCount + 1; i <= endSign.length; i++) {
                            if (assistantMessage.endsWith(endSign.slice(0, i))) {
                                matchCount = i;
                                break;
                            }
                            if (i === endSign.length) {
                                matchCount = 0;
                            }
                        }
                        if (matchCount === endSign.length) {
                            resetChat();
                        }
                        if (matchCount === 0) {
                            $('.assistant-message').last().html(marked.parse(assistantMessage));
                            scrollToBottom();
                        }
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
                'model': $selectModel.val(),
                'stream': true,
                'messages': messageHistory,
            }),
        });
        const assistantMessage = await processResponse(response);
        messageHistory.push({ 'role': 'assistant', 'content': assistantMessage });
        if (messageHistory.length > maxChatTrun * 2 + 1) {
            messageHistory.splice(1, 2);
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
        scrollToBottom();
        const language = $selectLanguage.val();
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
                scrollToBottom();
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
            positiveSpeechThreshold: 0.8,
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
        for (const audio of Object.values(audioQueue)) {
            audio.pause();
        }
        canPlayAudio = false;
        audioQueue = {};
    }

    function startRecording() {
        isRecording = true;
        pauseAssistantAudio();
        recorder.start();
        $submitButton.removeClass('bi-mic-fill btn-secondary').addClass('bi-stop-circle btn-primary');
    }

    function stopRecording() {
        isRecording = false;
        if (getCookie('continuous-recording') === 'true') {
            recorder.pause();
        } else {
            recorder.stop();
        }
        $submitButton.removeClass('bi-stop-circle btn-danger').addClass('bi-mic-fill btn-secondary');
    }

    function toggleRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
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

    function resetChat() {
        messageHistory = [systemMessage];
        if (isRecording) {
            stopRecording();
        }
        pauseAssistantAudio();
        $messages.empty();
        $.ajax({
            type: 'GET',
            url: '/reset',
        });
    }

    function unsend() {
        let $lastVisibleMessage = $messages.children().last();
        while ($lastVisibleMessage.children().is(':hidden')) {
            $lastVisibleMessage = $lastVisibleMessage.prev();
        }
        $lastVisibleMessage.children().hide();
        $lastVisibleMessage.prev().children().hide();
        messageHistory.pop();
        messageHistory.pop();
        pauseAssistantAudio();
    }

    function setMargin() {
        const footerHeight = $footer.height();
        const fontSize = getComputedStyle(document.documentElement).fontSize;
        const margin = parseFloat(fontSize);
        $messages.css("margin-bottom", footerHeight + margin + "px");
    }

    function getCookie(name) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [cookieName, cookieValue] = cookie.split('=');
            if (cookieName.trim() === name) {
                return cookieValue;
            }
        }
        return 'null';
    }

    function setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = "expires=" + date.toUTCString();
        document.cookie = name + "=" + value + ";" + expires + ";path=/";
    }

    function initApiKeys() {
        const openaiApiKeyCookie = getCookie('openaiApiKey');
        const voicevoxApiKeyCookie = getCookie('voicevoxApiKey');
        if (openaiApiKeyCookie == 'null' || openaiApiKeyCookie == '') {
            openaiApiKey = prompt('Please enter your OpenAI API key');
            setCookie('openaiApiKey', openaiApiKey, 365);
            $openaiApiKey.val(openaiApiKey);
        } else {
            openaiApiKey = openaiApiKeyCookie;
            $openaiApiKey.val(openaiApiKey);
        }
        if (voicevoxApiKeyCookie == 'null' || voicevoxApiKeyCookie == '') {
            $selectVoice.find('option').each(function () {
                if ($(this).val() === 'zundamon') {
                    $(this).hide();
                }
            });
        } else {
            voicevoxApiKey = voicevoxApiKeyCookie;
            $voicevoxApiKey.val(voicevoxApiKey);
        }
    }

    function initSettingCookie() {
        for (const [name, element] of Object.entries(settingElementsDict)) {
            const cookie = getCookie(name);
            if (cookie !== 'null') {
                element.val(cookie);
            }
        }
        if (getCookie('continuous-recording') === 'true') {
            $switchContinuous.prop('checked', true);
        } else {
            $switchContinuous.prop('checked', false);
        }
    }

    function main() {
        setMargin();
        initVADRecorder();
        initApiKeys();
        initSettingCookie();

        let scroll = 0;
        $(window).scroll(() => {
            if ($(this).scrollTop() < scroll) {
                canAutoScroll = false;
            } else {
                const distanceFromBottom = $(document).height() - $(window).height() - $(window).scrollTop();
                if (distanceFromBottom < 50) {
                    canAutoScroll = true;
                }
            }
            scroll = $(this).scrollTop();
        });

        $voicevoxApiKey.change(() => {
            voicevoxApiKey = $voicevoxApiKey.val();
            if (voicevoxApiKey === '') {
                $selectVoice.find('option').each(function () {
                    if ($(this).val() === 'zundamon') {
                        $(this).hide();
                    }
                });
            } else {
                $selectVoice.find('option').each(function () {
                    if ($(this).val() === 'zundamon') {
                        $(this).show();
                    }
                });
            }
        });

        $settingButton.click(() => {
            initSettingCookie();
        });

        $saveSettingButton.click(() => {
            for (const [name, element] of Object.entries(settingElementsDict)) {
                setCookie(name, element.val(), 365);
            }
            if ($switchContinuous.is(':checked')) {
                initVADRecorder();
                setCookie('continuous-recording', 'true', 365);
            } else {
                initRecorder();
                setCookie('continuous-recording', 'false', 365);
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
            resetChat();
        });

        $unsendButton.click(() => {
            unsend();
        });
    }

    main();
});