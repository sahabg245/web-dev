import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:8000",
        methods: ["GET", "POST"],
    },
});

app.use(express.static('public'));

const users = {}; // { socketId: username }
const connections = {}; // { socketId: PeerConnection }

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // New user joins
    socket.on('new-user-joined', (name) => {
        users[socket.id] = name;
        console.log(`${name} joined.`);
        io.emit('update-peers', users);
    });

    // Signaling messages (for WebRTC)
    socket.on('send-signal', (data) => {
        io.to(data.to).emit('receive-signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    socket.on('send-ice-candidate', (data) => {
        io.to(data.to).emit('receive-ice-candidate', {
            from: socket.id,
            candidate: data.candidate
        });
    });

    // User disconnect
    socket.on('disconnect', () => {
        const username = users[socket.id];
        console.log(`${username} disconnected.`);
        delete users[socket.id];
        io.emit('update-peers', users);
    });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
