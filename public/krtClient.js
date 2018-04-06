$(document).ready(function() {

    var ws = new WebSocket('wss://localhost:8443/broadcast');
    var video;
    var webRtcPeer;
    var roomId;
    var countNumberViewer;
    (function init() {
        onOpen();
        onListen();
        onMessage();
        onBeforeUnload();
    })();

    function onListen() {

        video = document.getElementById('videoMedia');
        roomId = document.getElementById('inpRoomId');
        $('#numberViewer').hide();
        $('#videoMedia').hide()
        $('#btnOpenRoom').click(function() {
            openRoom();
            //var roomid = $("#ipnOpenRoom").val();

        });

        // $('#btnJoinRoom').click(function() {
        //     joinRoom();
        // });

        $('#btnStop').click(function() {
            stop();
        });

        $('#ulUser').on('click', 'li', function() {
            // alert($(this).text());
            var id = $(this).text().split(' ')[0];
            document.getElementById('inpRoomId').value = id;
            joinRoom();
        });

    }


    function onBeforeUnload() {
        window.onbeforeunload = function() {
            ws.close();
        }
    }


    function onOpen() {
        ws.onopen = function(event) {
            requestListRoom();
            keepConnect();
        }
    }

    function requestListRoom() {
        var message = {
            id: 'requestlistroom'
        }
        sendMessage(message);
    };

    function keepConnect() {
        var message = {
            id: 'ping'
        }
        sendMessage(message);
    }

    function onMessage() {
        ws.onmessage = function(message) {
            var parsedMessage = JSON.parse(message.data);
            console.info('Received message: ' + message.data);

            switch (parsedMessage.id) {
                case 'openRoomResponse':
                    openRoomResponse(parsedMessage);
                    break;

                case 'joinRoomResponse':
                    joinRoomResponse(parsedMessage);
                    break;

                case 'stopCommunication':
                    dispose();
                    alert("Room has stopped working");
                    break;

                case 'iceCandidate':
                    webRtcPeer.addIceCandidate(parsedMessage.candidate);
                    break;

                case 'roomidNotAvaiable':
                    dispose();
                    alert('Room ' + parsedMessage.roomid + ' not Avaiable!');
                    break;

                case 'listroomOnload':
                    $('#ulUser').empty();
                    parsedMessage.listroom.forEach(function(room) {
                        appendRoom(room);
                    });
                    break;

                case 'listroomPresenter':
                    $('#ulUser').empty();
                    parsedMessage.listroom.forEach(function(room) {
                        appendRoom(room);
                    });
                    break;

                case 'listroomAllClient':
                    $('#ulUser').empty();
                    parsedMessage.listroom.forEach(function(room) {
                        appendRoom(room);
                    });
                    break;

                case 'listroomDetele':
                    $('#ulUser').empty();
                    parsedMessage.listroom.forEach(function(room) {
                        appendRoom(room);
                    });
                    break;

                case 'listRoomViewer':
                    $('#ulUser').empty();
                    parsedMessage.listroom.forEach(function(room) {
                        appendRoom(room);
                    });
                    break;

                case 'listRoomViewerLeave':
                    $('#ulUser').empty();
                    parsedMessage.listroom.forEach(function(room) {
                        appendRoom(room);
                    });
                    break;
                case 'listroomPresenterDelete':
                    $('#ulUser').empty();
                    parsedMessage.listroom.forEach(function(room) {
                        appendRoom(room);
                    });
                    break;

                case 'checkNumberViewer':
                    $('#numberViewer').show();
                    countNumberViewer = parsedMessage.numberviewer;
                    document.getElementById('txtNumberViews').innerHTML = countNumberViewer;
                    break;
                case 'notifyNumberViewer':
                    $('#numberViewer').show();
                    countNumberViewer = parsedMessage.numberviewer;
                    document.getElementById('txtNumberViews').innerHTML = countNumberViewer;
                    break;

                case 'pong':
                    setTimeout(keepConnect, 30000);
                    //keepConnect();
                    break;

                default:
                    console.error('Unrecognized message', parsedMessage);
            }
        }
    }


    function appendRoom(room) {
        var { roomid, numberViewer } = room;
        $('#ulUser').append(`<li class="list-group-item list-group-item-info d-flex justify-content-between align-items-center">${roomid} <span class="badge progress-bar-danger">${numberViewer}</span></li>`);
    }

    function openRoom() {
        navigator.getUserMedia = navigator.getUserMedia ||
            navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia;

        navigator.getUserMedia({ video: true, audio: true }, function() {
            if (!webRtcPeer) {
                showSpinner(video);
                $('#videoMedia').show();
                var options = {
                    localVideo: video,
                    onicecandidate: onIceCandidate,
                    configuration: {
                        iceServers: [
                            { "urls": "stun:stun.l.google.com:19302" },
                            {
                                "urls": "turn:w3.xirsys.com:3478?transport=tcp",
                                "username": "98eaf0f8-eaeb-11e7-acb3-d10a7902822f",
                                "credential": "98eaf1ca-eaeb-11e7-9760-a27d2eefa3b6"
                            }
                        ]
                    }
                }

                webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
                    if (error) return onError(error);

                    this.generateOffer(onOfferOpenRoom);
                });
            }
        }, function() {
            return alert("You must have camera and microphone! Try again later!");
        });

    }


    function onOfferOpenRoom(error, offerSdp) {
        var roomId = document.getElementById('inpRoomId');
        if (roomId.value.trim() == '') {
            roomId.value = Math.random().toString(36).slice(2);
        }
        roomId = roomId.value;

        if (error) return onError(error);

        var message = {
            id: 'openroom',
            roomid: roomId,
            sdpOffer: offerSdp
        };
        sendMessage(message);
    }

    function openRoomResponse(message) {
        if (message.response != 'accepted') {
            var errorMsg = message.message ? message.message : 'Unknow error';
            console.warn('Openroom not accepted: ' + errorMsg);
            dispose();
        } else {
            webRtcPeer.processAnswer(message.sdpAnswer);
            roomId.style.background = "#55ff5b";
            roomId.disabled = true;
            document.getElementById("btnOpenRoom").disabled = true;
        }
    }

    function joinRoom() {
        if (!webRtcPeer) {
            showSpinner(video);
            $('#videoMedia').show();
            var options = {
                remoteVideo: video,
                onicecandidate: onIceCandidate,
                configuration: {
                    iceServers: [
                        { "urls": "stun:stun.l.google.com:19302" },
                        {
                            "urls": "turn:w3.xirsys.com:3478?transport=tcp",
                            "username": "98eaf0f8-eaeb-11e7-acb3-d10a7902822f",
                            "credential": "98eaf1ca-eaeb-11e7-9760-a27d2eefa3b6"
                        }
                    ]
                }
            }

            webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
                if (error) return onError(error);
                this.generateOffer(onOfferJoinRoom);
            });
        }
    }

    function onOfferJoinRoom(error, offerSdp) {
        var roomId = document.getElementById('inpRoomId').value;
        if (error) return onError(error);

        var message = {
            id: 'joinroom',
            roomid: roomId,
            sdpOffer: offerSdp
        };
        sendMessage(message);
    }


    function joinRoomResponse(message) {
        if (message.response != 'accepted') {
            var errorMsg = message.message ? message.message : 'Unknow error';
            console.warn('Joinroom not accepted: ' + errorMsg);
            dispose();
        } else {
            webRtcPeer.processAnswer(message.sdpAnswer);
            roomId.style.background = "#55ff5b";
            roomId.disabled = true;
            document.getElementById("btnOpenRoom").disabled = true;
        }
    }

    function onIceCandidate(candidate) {
        console.log('Local candidate' + JSON.stringify(candidate));
        var message = {
            id: 'onIceCandidate',
            candidate: candidate
        }
        sendMessage(message);
    }

    function stop() {
        if (webRtcPeer) {
            var message = {
                id: 'stop'
            }
            sendMessage(message);
            dispose();
        }
    }

    function dispose() {
        if (webRtcPeer) {
            webRtcPeer.dispose();
            webRtcPeer = null;
        }
        $('#numberViewer').hide();
        $('#videoMedia').hide()
        roomId.style.background = "#ffffff"
        roomId.value = "";
        roomId.disabled = false;
        document.getElementById("btnOpenRoom").disabled = false;
    }

    function sendMessage(message) {
        var jsonMessage = JSON.stringify(message);
        console.log('Sending message: ' + jsonMessage);
        ws.send(jsonMessage);
    }

    function showSpinner() {
        for (var i = 0; i < arguments.length; i++) {
            arguments[i].style.background = 'center transparent url("./img/cube.gif") no-repeat';
        }
    }

    function onError(e) {
        console.log(e);
    }

});