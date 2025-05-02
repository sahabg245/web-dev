const socket = io("http://localhost:8000");

const peersList = document.getElementById("active-peers");
const msgContainer = document.querySelector(".chat-container");
const form = document.getElementById("send-container");
const msgInp = document.getElementById("msginp");

let peers = {}; // List of connected peers
let peerConnections = {}; // Map of peerId -> RTCPeerConnection
let dataChannels = {}; // Map of peerId -> DataChannel
let currentChat = null; // Track current peer for chat

// Append messages to the chat container
const append = (message, position) => {
    const messageElement = document.createElement("div");
    messageElement.innerText = message;
    messageElement.classList.add("message", position);
    msgContainer.appendChild(messageElement);
};

// Prompt for username
const name = prompt("Enter your name");
socket.emit("new-user-joined", name);

// Update active peers
socket.on("update-peers", (activeUsers) => {
    peers = activeUsers;
    updatePeersList();
});

// Update peers list UI
const updatePeersList = () => {
    peersList.innerHTML = "";
    for (const peerId in peers) {
        if (peerId === socket.id) continue; // Don't include self
        const listItem = document.createElement("li");
        listItem.innerText = peers[peerId];
        listItem.onclick = () => startChatWithPeer(peerId);
        peersList.appendChild(listItem);
    }
};

// Start chat with a peer
const startChatWithPeer = (peerId) => {
    currentChat = peerId;
    msgContainer.innerHTML = "";
    append(`You are chatting with ${peers[peerId]}`, "left");

    if (!peerConnections[peerId]) {
        createConnection(peerId);
    }
};

// Create a WebRTC connection with a peer
const createConnection = (peerId) => {
    const peerConnection = new RTCPeerConnection();
    peerConnections[peerId] = peerConnection;

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("send-ice-candidate", {
                to: peerId,
                candidate: event.candidate,
            });
        }
    };

    // Handle DataChannel events
    peerConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.onmessage = (e) => {
            append(`Peer: ${e.data}`, "left");
        };
        dataChannels[peerId] = receiveChannel;
    };

    // Create and store DataChannel for sending messages
    const dataChannel = peerConnection.createDataChannel("chat");
    dataChannels[peerId] = dataChannel;

    // Send messages received on the DataChannel
    dataChannel.onmessage = (e) => {
        append(`Peer: ${e.data}`, "left");
    };

    // Create an offer
    peerConnection.createOffer().then((offer) => {
        return peerConnection.setLocalDescription(offer);
    }).then(() => {
        socket.emit("send-signal", {
            to: peerId,
            signal: peerConnection.localDescription,
        });
    });
};

// Handle received signaling messages
socket.on("receive-signal", (data) => {
    const { from, signal } = data;

    if (!peerConnections[from]) {
        createConnection(from);
    }

    const peerConnection = peerConnections[from];
    peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
        .then(() => {
            if (signal.type === "offer") {
                return peerConnection.createAnswer();
            }
        })
        .then((answer) => {
            if (answer) {
                return peerConnection.setLocalDescription(answer);
            }
        })
        .then(() => {
            if (peerConnection.localDescription) {
                socket.emit("send-signal", {
                    to: from,
                    signal: peerConnection.localDescription,
                });
            }
        });
});

// Handle received ICE candidates
socket.on("receive-ice-candidate", (data) => {
    const { from, candidate } = data;
    const peerConnection = peerConnections[from];
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// Send message
form.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = msgInp.value;
    if (!msg) return;

    append(`You: ${msg}`, "right");

    if (currentChat && dataChannels[currentChat]) {
        dataChannels[currentChat].send(msg);
    }
    msgInp.value = "";
});
