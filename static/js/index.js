$(function () {
    // Get references to HTML elements
    const $recordSubmitButton = $('#record-submit-button');
    const $messages = $('#messages');
    const $userInputText = $('#user-input-text');
    const $resetButton = $('#reset-button');
    const $selectLanguage = $('#select-language');
    const $selectRate = $('#select-rate');

    function gtts(assistantSentence, responseId, sentenceCount) {
        const sentenceId = responseId + '-' + sentenceCount;
        $.ajax({
            type: 'GET',
            url: '/gtts',
            data: {
                'assistantSentence': assistantSentence,
                'sentenceId': sentenceId,
            },
            success: () => {
                const assistantAudio = new Audio(`../../audio/assistant_audio_${sentenceId}.mp3`);
                const rate = $selectRate.val();
                assistantAudio.playbackRate = rate;
                if (sentenceCount === 0) {
                    assistantAudioDict.responseId = [assistantAudio];
                    assistantAudioDict.responseId[0].play();
                } else {
                    assistantAudioDict.responseId.push(assistantAudio);
                    assistantAudioDict.responseId[sentenceCount - 1].addEventListener('ended', () => {
                        assistantAudioDict.responseId[sentenceCount].play();
                    });
                }
            }
        });
    }

    function assistantAudioPause() {
        if (Object.keys(assistantAudioDict).length !== 0) {
            const lastResponseId = Object.keys(assistantAudioDict).pop();
            assistantAudioDict[lastResponseId].forEach(assistantAudio => {
                assistantAudio.pause();
            });
        }
    }

    async function getResponse(userInput) {
        $resetButton.show();
        $('#processing').remove();
        $messages.append(
            `<div class="d-flex flex-row-reverse">
                <div class="rounded mw-75 mb-2 p-2 text-white bg-primary">${userInput}</div>
            </div>`
        );
        $('html, body').animate({ scrollTop: 1e9 });
        messageHistory.push({ 'role': 'user', 'content': userInput });
        const maxMessages = 10;
        let assistantMessage = '';
        let assistantSentence = '';
        let sentenceCount = 0;
        const url = 'https://api.openai.com/v1/chat/completions';
        const apiKey = await fetch('/api_key').then(response => response.text());
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey,
            },
            body: JSON.stringify({
                'model': 'gpt-3.5-turbo',
                'stream': true,
                'messages': messageHistory,
            }),
        });
        const reader = response.body.getReader();
        const textDecoder = new TextDecoder();
        let buffer = '';
        $messages.append(
            `<div class="d-flex flex-row">
                <div class="assistant-message rounded mw-75 mb-2 p-2 pb-0 bg-white"></div>
            </div>`
        );
        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            buffer += textDecoder.decode(value, { stream: true });

            while (true) {
                const newlineIndex = buffer.indexOf('\n');
                if (newlineIndex === -1) {
                    break;
                }

                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);

                if (line.startsWith('data:')) {
                    const jsonData = JSON.parse(line.slice(5));
                    const responseId = jsonData.id;

                    if (line.includes('[DONE]')) {
                        $('pre code').each((i, block) => {
                            hljs.highlightBlock(block);
                        });
                        messageHistory.push({ 'role': 'assistant', 'content': assistantMessage });
                        if (messageHistory.length > 2 * maxMessages) {
                            messageHistory = messageHistory.slice(-maxMessages * 2);
                        }
                        if (assistantSentence !== '') {
                            gtts(assistantSentence, responseId, sentenceCount);
                        }
                        assistantAudioDict = {};
                        return;
                    }

                    if (jsonData.choices && jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                        const assistantToken = jsonData.choices[0].delta.content;
                        const punctuation = ['.', '?', '!', '…', ' ', '。', '？', '！', '　'];
                        assistantMessage += assistantToken;
                        assistantSentence += assistantToken;
                        if (punctuation.includes(assistantToken.slice(-1)) && assistantSentence.length >= 5) {
                            gtts(assistantSentence, responseId, sentenceCount);
                            assistantSentence = '';
                            sentenceCount++;
                        }
                        $('.assistant-message').last().html(marked.parse(assistantMessage));
                        $('html, body').animate({ scrollTop: 1e9 });
                    }
                }
            }
        }
    }

    function recordVoice() {
        const userInput = $userInputText.val();
        if (userInput === '') {
            if (isRecording) {
                mediaRecorder.stop();
            } else {
                mediaRecorder.start();
            }
        } else {
            getResponse(userInput);
            $userInputText.val('');
            $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
        }
    }

    let messageHistory = [];
    let mediaRecorder;
    let assistantAudioDict = {};
    let isRecording = false;
    const recodingTimeLimit = 30000;

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            let audioChunks = [];

            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener('start', () => {
                isRecording = true;
                $recordSubmitButton.removeClass('bi-mic-fill btn-secondary').addClass('bi-stop-circle btn-danger');
                audioChunks = [];

                // Stop recording after a certain amount of silence
                setTimeout(() => {
                    if (isRecording) {
                        mediaRecorder.stop();
                    }
                }, recodingTimeLimit);
            });

            mediaRecorder.addEventListener('stop', () => {
                isRecording = false;
                $recordSubmitButton.removeClass('bi-stop-circle btn-danger').addClass('bi-mic-fill btn-secondary');
                $messages.append(
                    `<div id="processing" class="d-flex flex-row-reverse">
                        <div class="rounded mw-75 mb-2 p-2 text-white bg-primary">
                            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
                            processing...
                        </div>
                    </div>`
                );
                $('html, body').animate({ scrollTop: 1e9 });

                // Send audio to server for transcription and response
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
                        getResponse(transcript);
                    }
                });
            });
        })
        .catch(error => {
            console.error('Failed to get user media', error);
        });

    $recordSubmitButton.click(() => {
        assistantAudioPause();
        recordVoice();
    });

    $(document).keypress(event => {
        if (event.which === 32) { // Spacebar
            assistantAudioPause();
            recordVoice();
        }
    });

    $userInputText.keyup(event => {
        const userInput = $userInputText.val();
        if (userInput === '') {
            $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
        } else {
            $recordSubmitButton.removeClass('bi-mic-fill').addClass('bi-send');
            if (event.key === "Enter") {
                assistantAudioPause();
                getResponse(userInput);
                $userInputText.val('');
                $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
            }
        }
    });

    $resetButton.click(() => {
        messageHistory = [];
        assistantAudioDict = [];
        mediaRecorder.stop();
        assistantAudioPause();
        $.ajax({
            type: 'GET',
            url: '/reset',
            success: () => {
                $messages.empty();
                $resetButton.hide();
            }
        });
    });
});