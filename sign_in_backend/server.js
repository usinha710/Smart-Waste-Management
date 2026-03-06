const PORT = process.env.PORT || 5000;
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const database = require('./db'); 
require('dotenv').config();
const app = express();

app.use(cors({
    origin: "http://127.0.0.1:5500",
    credentials: true
}));

app.use(express.json()); 

app.use('/api', require('./authRoutes')); 
app.use('/api', require('./predictionRoutes'));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://127.0.0.1:5500", 
        methods: ["GET", "POST"]
    }
});

const chatRooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('announce_report_to_admin', (report) => {
        io.emit('announce_report_to_admin', report);
    });

    socket.on('join_report_chat', (reportId) => {
        socket.join(`report_${reportId}`);
        if (!chatRooms.has(reportId)) chatRooms.set(reportId, new Set());
        chatRooms.get(reportId).add(socket.id);
    });

    socket.on('send_message', (data) => {
        io.to(`report_${data.reportId}`).emit('receive_message', data);
    });

    socket.on('status_changed', (data) => {
        io.to(`report_${data.reportId}`).emit('status_changed', data);
    });

    socket.on('disconnect', () => {
        chatRooms.forEach((participants, reportId) => {
            if (participants.has(socket.id)) participants.delete(socket.id);
            if (participants.size === 0) chatRooms.delete(reportId);
        });
    });
});

app.get("/", (req, res) => {
    res.send("Backend is running");
})

database().then(() => {
    server.listen(PORT, () => {
        console.log(`API + Sockets running on port ${PORT}`);
    });
});