$(function() {
    // Get references to HTML elements
    const $recordSubmitButton = $('#record-submit-button');
    const $messages = $('#messages');
    const $userInputText = $('#user-input-text');
    const $resetButton = $('#reset-button');

    function gtts() {
        $.ajax({
            type: 'GET',
            url: '/gtts',
            success: response => {
                response_id = response;
                const assistant_audio = new Audio(`../../audio/assistant_audio_${response_id}.mp3`);
                assistant_audio.playbackRate = 1.5;
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
        $('html, body').animate({scrollTop: 1e9});
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
                $('html, body').animate({scrollTop: 1e9});
                gtts();
            }
        });
    }

    $resetButton.click(() => {
        $.ajax({
            type: 'GET',
            url: '/reset',
            success: () => {
                $messages.empty();
                $resetButton.hide();
            }
        });
    });


    // transcript audio
    // Set up MediaRecorder to capture audio
    let mediaRecorder;
    let chunks = [];
    let recording = false;

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.addEventListener('dataavailable', event => {
                chunks.push(event.data);
            });

            mediaRecorder.addEventListener('stop', () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);

                // Create a new FormData object
                const formData = new FormData();

                // Add the recorded audio to the FormData object
                formData.append('audio', blob, 'audio.webm');

                // Use Ajax to send the FormData object to the Flask route
                $.ajax({
                    url: '/transcribe',
                    type: 'POST',
                    data: formData,
                    processData: false,
                    contentType: false,
                    success: response => {
                        getResponse(response);
                    }
                });
            });
        })
        .catch(error => {
            console.error('Failed to get user media', error);
        });

    // Event listener for record button
    $recordSubmitButton.click(() => {
        var user_input = $userInputText.val();
        if (user_input === '') {
            if (recording) {
                $messages.append(
                    `<div id="processing" class="d-flex flex-row-reverse">
                        <div class="rounded mw-75 mb-2 p-2 text-white bg-primary">
                            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
                            processing...
                        </div>
                    </div>`
                );
                $('html, body').animate({scrollTop: 1e9});
                mediaRecorder.stop();
                recording = false;
                $recordSubmitButton.removeClass('bi-stop-circle btn-danger').addClass('bi-mic-fill btn-secondary');
            } else {
                chunks = [];
                mediaRecorder.start();
                recording = true;
                $recordSubmitButton.removeClass('bi-mic-fill btn-secondary').addClass('bi-stop-circle btn-danger');
            }
        } else {
            getResponse(user_input);
            $userInputText.val('');
            $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
        }
    });

    // Event listener for user input text
    $userInputText.keyup(event => {
        var user_input = $userInputText.val();
        if (user_input === '') {
            $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
        } else {
            $recordSubmitButton.removeClass('bi-mic-fill').addClass('bi-send');
            if (event.key === "Enter") {
                getResponse(user_input);
                $userInputText.val('');
                $recordSubmitButton.removeClass('bi-send').addClass('bi-mic-fill');
            }
        }
    });
});