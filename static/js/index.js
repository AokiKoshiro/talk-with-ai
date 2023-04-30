$(function () {
    // Get references to HTML elements
    const $recordSubmitButton = $('#record-submit-button');
    const $messages = $('#messages');
    const $userInputText = $('#user-input-text');
    const $resetButton = $('#reset-button');
    const $selectLanguage = $('#select-language');
    const $selectRate = $('#select-rate');

    function gtts() {
        $.ajax({
            type: 'GET',
            url: '/gtts',
            success: response => {
                response_id = response;
                assistant_audio = new Audio(`../../audio/assistant_audio_${response_id}.mp3`);
                const rate = $selectRate.val();
                assistant_audio.playbackRate = rate;
                assistant_audio.play();
            }
        });
    }

    function getResponse(user_input) {
        $resetButton.show();
        $('#processing').remove();
        $messages.append(
            `<div class="d-flex flex-row-reverse">
                <div class="rounded mw-75 mb-2 p-2 text-white bg-primary">${user_input}</div>
            </div>`
        );
        $messages.append(
            `<div id="thinking" class="d-flex flex-row">
                <div class="rounded mw-75 mb-2 p-2 bg-white">
                    <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
                    thinking...
                </div>
            </div>`
        );
        $('html, body').animate({ scrollTop: 1e9 });
        $.ajax({
            type: 'POST',
            url: '/get_response',
            data: { user_input: user_input },
            success: response => {
                $('#thinking').remove();
                $messages.append(
                    `<div class="d-flex flex-row">
                        <div class="rounded mw-75 mb-2 p-2 pb-0 bg-white">${response}</div>
                    </div>`
                );
                $('pre code').each((i, block) => {
                    hljs.highlightBlock(block);
                });
                $('html, body').animate({ scrollTop: 1e9 });
                gtts();
            }
        });
    }

    function recordVoice() {
        const user_input = $userInputText.val();
        if (user_input === '') {
            if (isRecording) {
                mediaRecorder.stop();
            } else {
                mediaRecorder.start();
            }
        } else {
            getResponse(user_input);
            $userInputText.val('');
            $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
        }
    }

    let mediaRecorder;
    let assistant_audio = new Audio();
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
                    mediaRecorder.stop();
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
        assistant_audio.pause();
        recordVoice();
    });

    $(document).keypress(event => {
        if (event.which === 32) { // Spacebar
            assistant_audio.pause();
            recordVoice();
        }
    });

    $userInputText.keyup(event => {
        const user_input = $userInputText.val();
        if (user_input === '') {
            $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
        } else {
            $recordSubmitButton.removeClass('bi-mic-fill').addClass('bi-send');
            if (event.key === "Enter") {
                assistant_audio.pause();
                getResponse(user_input);
                $userInputText.val('');
                $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
            }
        }
    });

    $resetButton.click(() => {
        assistant_audio.pause();
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