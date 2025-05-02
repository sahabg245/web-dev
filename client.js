const socket = io("http://localhost:8000");

const peersList = document.getElementById('active-peers');
const msgContainer = document.querySelector('.chat-container');
const form = document.getElementById('send-container');
const msgInp = document.getElementById('msginp');
const fileInp = document.getElementById('file-input');
const createGroupBtn = document.getElementById('create-group-btn');
const groupNameInput = document.getElementById('group-name-input');

let peers = {};
let currentChat = null;
let currentGroup = null;
let peerConnections = {}; // Store WebRTC PeerConnections
let dataChannels = {}; // Store WebRTC data channels

// Append messages to the chat container
const append = (message, position) => {
    const messageElement = document.createElement('div');
    messageElement.innerText = message;
    messageElement.classList.add('message', position);
    msgContainer.appendChild(messageElement);
};

// Append files to the chat container
const appendFile = (name, fileName, fileData, position) => {
    const fileElement = document.createElement('div');
    fileElement.classList.add('message', position);
    fileElement.innerHTML = `<strong>${name}:</strong> <a href="${fileData}" download="${fileName}">${fileName}</a>`;
    msgContainer.appendChild(fileElement);
};

// Join with username
const name = prompt("Enter your name");
socket.emit('new-user-joined', name);

// Update active users
socket.on('update-peers', (activeUsers) => {
    peers = activeUsers;
    updatePeersList();
});

// Update peers list UI
const updatePeersList = () => {
    peersList.innerHTML = '';
    for (const peerId in peers) {
        const listItem = document.createElement('li');
        listItem.innerText = peers[peerId];
        listItem.onclick = () => startPrivateChat(peerId);
        peersList.appendChild(listItem);
};

// Start private chat and create a WebRTC connection
const startPrivateChat = (peerId) => {
    currentChat = peerId;
    currentGroup = null;
    msgContainer.innerHTML = '';
    append(`You are chatting with ${peers[peerId]}`, 'left');
    createPeerConnection(peerId);
};

// Handle private messages
socket.on('private-message', (data) => {
    append(`Private from ${data.name}: ${data.msg}`, 'left');
});

// Handle private file sharing
socket.on('receive-file', (data) => {
    appendFile(data.name, data.fileName, data.fileData, 'left');
});

// Handle signaling data from another peer
socket.on('receive-signal', (data) => {
    const { from, signal } = data;
    handleReceivedSignal(from, signal);
});

// Handle ICE candidates from another peer
socket.on('receive-ice-candidate', (data) => {
    const { from, candidate } = data;
    handleReceivedIceCandidate(from, candidate);
});

// Create a new WebRTC PeerConnection
const createPeerConnection = (peerId) => {
    const peerConnection = new RTCPeerConnection();
    peerConnections[peerId] = peerConnection;

    const dataChannel = peerConnection.createDataChannel("chat");
    dataChannels[peerId] = dataChannel;

    // Handle incoming messages on the data channel
    dataChannel.onmessage = (event) => {
        append(`Peer: ${event.data}`, 'left');
    };

    // Send ICE candidates to the other peer
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('send-ice-candidate', {
                to: peerId,
                candidate: event.candidate
            });
        }
    };

    // Create an offer for the other peer
    peerConnection.createOffer()
        .then(offer => {
            peerConnection.setLocalDescription(offer);
            socket.emit('send-signal', {
                to: peerId,
                signal: offer
            });
        })
        .catch(error => console.error("Error creating offer:", error));
};

// Handle received signaling data
const handleReceivedSignal = (from, signal) => {
    const peerConnection = peerConnections[from];
    peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
        .then(() => {
            return peerConnection.createAnswer();
        })
        .then(answer => {
            peerConnection.setLocalDescription(answer);
            socket.emit('send-signal', {
                to: from,
                signal: answer
            });
        })
        .catch(error => console.error("Error handling signal:", error));
};

// Handle received ICE candidates
const handleReceivedIceCandidate = (from, candidate) => {
    const peerConnection = peerConnections[from];
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(error => console.error("Error adding ICE candidate:", error));
};

// Send message (private or group)
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = msgInp.value;
    if (!msg) return;

    append(`You: ${msg}`, 'right');
    if (currentChat) {
        dataChannels[currentChat].send(msg);
    }
    msgInp.value = '';
});

// Send file
fileInp.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
        if (currentChat) {
            dataChannels[currentChat].send(reader.result);
        }
    };
    reader.readAsDataURL(file);
});

// Create group
createGroupBtn.addEventListener('click', () => {
    const groupName = groupNameInput.value.trim();
    if (!groupName) return alert('Enter a valid group name.');

    currentGroup = groupName;
    append(`You created the group: ${groupName}`, 'left');
});
