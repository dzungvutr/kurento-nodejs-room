var path = require('path');
var url = require('url');
var express = require('express');
var minimist = require('minimist');
var ws = require('ws');
var kurento = require('kurento-client');
var fs = require('fs');
var https = require('https');

var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'https://localhost:8443/',
        ws_uri: 'ws://localhost:8888/kurento'
    }
});


var options = {
    key: fs.readFileSync('keys/server.key'),
    cert: fs.readFileSync('keys/server.crt')
};
var app = express();

var numberViewer = 0;
var candidatesQueue = {};
var kurentoClient = null;
var listRoom = [];
var room = {};
var users = {};


var asUrl = url.parse(argv.as_uri);
var port = process.env.PORT || asUrl.port;
var server = https.createServer(options, app).listen(port, function() {
    console.log(url.format(asUrl) + ' is running');
});

var wss = new ws.Server({
    server: server,
    path: '/broadcast'
});

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static('public'));

app.get('/', function (req, res) {
    res.render("index");
});

/*
 * Management Websocket
 */
wss.on('connection', function(ws) {

    var sessionId = Math.random().toString(36).slice(2);

    users[sessionId] = {
        id: sessionId,
        roomid: null,
        isBroadcastInitiator: false,
        webRtcEndpoint: null,
        ws: ws
    }

    console.log('Connection received with sessionId ' + sessionId);
    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        if (users[sessionId]) {
            console.log(sessionId)
            stop(sessionId);
        }
    });


    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        if (users[sessionId]) {
            console.log(sessionId)
            stop(sessionId);
        }
    });

    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
            case 'openroom':
                if (users[message.roomid] && users[message.roomid].isBroadcastInitiator === true) {
                    return ws.send(JSON.stringify({
                        id: 'roomidNotAvaiable',
                        roomid: message.roomid
                    }));
                }

                delete users[sessionId];
                sessionId = message.roomid;

                startOpenRoom(sessionId, ws, message.sdpOffer, message.roomid, numberViewer, function(error, sdpAnswer) {
                    if (error) {
                        return ws.send(JSON.stringify({
                            id: 'openRoomResponse',
                            response: 'rejected',
                            message: error
                        }));
                    }

                    ws.send(JSON.stringify({
                        id: 'openRoomResponse',
                        response: 'accepted',
                        sdpAnswer: sdpAnswer
                    }));
                });
                break;

            case 'joinroom':
                startJoinRoom(sessionId, ws, message.sdpOffer, message.roomid, numberViewer, function(error, sdpAnswer) {
                    if (error) {
                        return ws.send(JSON.stringify({
                            id: 'joinRoomResponse',
                            response: 'rejected',
                            message: error
                        }));
                    }

                    ws.send(JSON.stringify({
                        id: 'joinRoomResponse',
                        response: 'accepted',
                        sdpAnswer: sdpAnswer
                    }));
                });
                break;

            case 'stop':
                stopClick(sessionId);
                break;

            case 'onIceCandidate':
                onIceCandidate(sessionId, message.candidate);
                break;

            case 'requestlistroom':
                ws.send(JSON.stringify({
                    id: 'listroomOnload',
                    listroom: listRoom
                }))
                break;

            default:
                ws.send(JSON.stringify({
                    id: 'error',
                    message: 'Invalid message ' + message
                }));
                break;
        }
    });
});


/*
 * Definition functions
 */

function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(argv.ws_uri, function(error, _kurentoClient) {
        if (error) {
            console.log("Can't find media server " + argv.ws_uri);
            return callback("Can't find media server " + argv.ws_uri +
                ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function startOpenRoom(sessionId, ws, sdpOffer, roomid, numberViewer, callback) {

    clearCandidatesQueue(sessionId);
    numberViewer = 0;

    if (users[sessionId]) {
        stop(sessionId);
        return callback("Room " + roomid + " is running . Try again later !");
    }

    room[roomid] = {
        roomid: roomid,
        numberViewer: numberViewer
    }

    listRoom.push(room[roomid]);

    users[sessionId] = {
        id: sessionId,
        roomid: roomid,
        isBroadcastInitiator: false,
        numberViewer: numberViewer,
        pipeline: null,
        webRtcEndpoint: null,
        ws: ws

    }


    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            //stop(sessionId);
            if (users[sessionId]) {
                console.log(sessionId)
                stop(sessionId);
            }
            return callback(error);
        }

        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                if (users[sessionId]) {
                    console.log(sessionId)
                    stop(sessionId);
                }
                //stop(sessionId);
                return callback(error);
            }


            users[sessionId].pipeline = pipeline;
            pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
                if (error) {
                    if (users[sessionId]) {
                        console.log(sessionId)
                        stop(sessionId);
                    }
                    return callback(error);
                }

                users[sessionId].isBroadcastInitiator = true;
                users[sessionId].webRtcEndpoint = webRtcEndpoint;

                if (candidatesQueue[sessionId]) {
                    while (candidatesQueue[sessionId].length) {
                        var candidate = candidatesQueue[sessionId].shift();
                        webRtcEndpoint.addIceCandidate(candidate);
                    }
                }

                webRtcEndpoint.on('OnIceCandidate', function(event) {
                    var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                    ws.send(JSON.stringify({
                        id: 'iceCandidate',
                        candidate: candidate
                    }));
                });

                webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
                    if (error) {
                        if (users[sessionId]) {
                            console.log(sessionId)
                            stop(sessionId);
                        }
                        return callback(error);
                    }

                    //SEND LISTROOM

                    ws.send(JSON.stringify({
                        id: 'listroomPresenter',
                        listroom: listRoom
                    }));

                    for (var i in users) {
                        if (users[i] !== users[sessionId]) {
                            users[i].ws.send(JSON.stringify({
                                id: 'listroomAllClient',
                                listroom: listRoom
                            }));
                        }
                    }


                    callback(null, sdpAnswer);
                });

                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        if (users[sessionId]) {
                            console.log(sessionId)
                            stop(sessionId);
                        }
                        return callback(error);
                    }
                });
            });
        });
    });
}

function startJoinRoom(sessionId, ws, sdpOffer, roomid, numberViewer, callback) {
    clearCandidatesQueue(sessionId);

    if (!users[roomid]) {
        console.log("Room " + roomid + " is not exist");
        return callback("Room is not already. Try again later!");
    }

    users[roomid].pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
        if (error) {
            if (users[sessionId]) {
                console.log(sessionId)
                stop(sessionId);
            }
            return callback(error);
        }

        users[sessionId] = {
            id: sessionId,
            roomid: roomid,
            isBroadcastInitiator: false,
            webRtcEndpoint: webRtcEndpoint,
            ws: ws
        }

        if (candidatesQueue[sessionId]) {
            while (candidatesQueue[sessionId].length) {
                var candidate = candidatesQueue[sessionId].shift();
                webRtcEndpoint.addIceCandidate(candidate);
            }
        }

        webRtcEndpoint.on('OnIceCandidate', function(event) {
            var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
            ws.send(JSON.stringify({
                id: 'iceCandidate',
                candidate: candidate
            }));
        });

        webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
            if (error) {
                if (users[sessionId]) {
                    console.log(sessionId)
                    stop(sessionId);
                }
                return callback(error);
            }

            users[roomid].webRtcEndpoint.connect(webRtcEndpoint, function(error) {
                if (error) {
                    if (users[sessionId]) {
                        console.log(sessionId)
                        stop(sessionId);
                    }
                    return callback(error);
                }

                users[roomid].numberViewer++;
                room[roomid].numberViewer++;
                var countViewer = users[roomid].numberViewer;
                for (var i in users) {
                    if (users[i] && users[i].roomid === roomid) {
                        users[i].ws.send(JSON.stringify({
                            id: 'checkNumberViewer',
                            numberviewer: countViewer
                        }));
                    }

                    users[i].ws.send(JSON.stringify({
                        id: 'listRoomViewer',
                        listroom: listRoom
                    }));
                }

                callback(null, sdpAnswer);
                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        if (users[sessionId]) {
                            console.log(sessionId)
                            stop(sessionId);
                        }
                        return callback(error);
                    }
                });
            });
        });
    });
}

function clearCandidatesQueue(sessionId) {
    if (candidatesQueue[sessionId]) {
        delete candidatesQueue[sessionId];
    }
}

function stopClick(sessionId) {

    try {
        if (users[sessionId] !== null && users[sessionId].roomid === sessionId) {
            for (var i in users) {
                if (users[i].isBroadcastInitiator === false && users[i].roomid === sessionId) {
                    users[i].ws.send(JSON.stringify({
                        id: 'stopCommunication'
                    }));
                }
            }

            var index = listRoom.indexOf(room[users[sessionId].roomid]);
            listRoom.splice(index, 1);

            users[sessionId].ws.send(JSON.stringify({
                id: 'listroomPresenterDelete',
                listroom: listRoom
            }));

            for (var i in users) {
                if (users[i] !== users[sessionId]) {
                    users[i].ws.send(JSON.stringify({
                        id: 'listroomDetele',
                        listroom: listRoom
                    }));
                }
            }

            users[sessionId].pipeline.release();
            for (var i in users) {
                if (users[i] !== users[sessionId] && users[i].roomid === sessionId) {
                    users[i].webRtcEndpoint = null;
                }
            }

            users[sessionId].roomid = null;
            users[sessionId].webRtcEndpoint = null;
            users[sessionId].isBroadcastInitiator = false;

        } else if (users[sessionId].isBroadcastInitiator === false) {
            if (users[users[sessionId].roomid] && users[sessionId].roomid !== null) {
                users[users[sessionId].roomid].numberViewer--;
                room[users[sessionId].roomid].numberViewer--;

                var countViewer = users[users[sessionId].roomid].numberViewer;
                for (var i in users) {
                    if (users[i] !== users[sessionId] && users[i].roomid === users[users[sessionId].roomid].roomid) {
                        users[i].ws.send(JSON.stringify({
                            id: 'notifyNumberViewer',
                            numberviewer: countViewer
                        }));
                    }

                    users[i].ws.send(JSON.stringify({
                        id: 'listRoomViewerLeave',
                        listroom: listRoom
                    }));
                }
            }

            users[sessionId].webRtcEndpoint = null;
            users[sessionId].roomid = null;
        }

        clearCandidatesQueue(sessionId);

    } catch (e) {
        console.log(e);
    }

}


function stop(sessionId) {

    try {
        if (users[sessionId] !== null && users[sessionId].roomid === sessionId) {
            for (var i in users) {
                if (users[i].isBroadcastInitiator === false && users[i].roomid === sessionId) {
                    users[i].ws.send(JSON.stringify({
                        id: 'stopCommunication'
                    }));
                }
            }

            var index = listRoom.indexOf(room[users[sessionId].roomid]);
            listRoom.splice(index, 1);

            for (var i in users) {
                if (users[i] !== users[sessionId]) {
                    users[i].ws.send(JSON.stringify({
                        id: 'listroomDetele',
                        listroom: listRoom
                    }));
                }
            }

            users[sessionId].pipeline.release();
            delete users[sessionId];

            for (var i in users) {
                if (users[i] !== users[sessionId] && users[i].roomid === sessionId) {
                    users[i].webRtcEndpoint = null;
                }
            }

        } else if (users[sessionId].isBroadcastInitiator === false) {
            if (users[users[sessionId].roomid] && users[sessionId].roomid !== null) {
                users[users[sessionId].roomid].numberViewer--;
                room[users[sessionId].roomid].numberViewer--;

                var countViewer = users[users[sessionId].roomid].numberViewer;
     
                for (var i in users) {
                    if (users[i] !== users[sessionId] && users[i].roomid === users[users[sessionId].roomid].roomid) {
                        users[i].ws.send(JSON.stringify({
                            id: 'notifyNumberViewer',
                            numberviewer: countViewer
                        }));
                    }

                    if (users[i] !== users[sessionId]) {
                        users[i].ws.send(JSON.stringify({
                            id: 'listRoomViewerLeave',
                            listroom: listRoom
                        }));
                    }
                }
            }

            if (users[sessionId].webRtcEndpoint !== null) {
                users[sessionId].webRtcEndpoint.release();
            }
            delete users[sessionId];
        }

        clearCandidatesQueue(sessionId);

    } catch (e) {
        console.log(e);
    }

}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    if (users[sessionId] && users[sessionId].id === users[sessionId].roomid && users[sessionId].webRtcEndpoint) {
        console.info('Sending presenter candidate');
        users[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    } else if (users[sessionId] && users[sessionId].id !== users[sessionId].roomid && users[sessionId].webRtcEndpoint) {
        console.info('Sending viewer candidate');
        users[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    } else {
        console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}