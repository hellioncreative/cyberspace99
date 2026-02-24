import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Explicitly serve editor HTML route FIRST
app.get('/editor.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/editor.html'));
});

// Serve static Vite build
app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.static(path.join(__dirname, '../'))); // fallback for assets if needed
app.use(express.json());

app.get('/api/maps', async (req, res) => {
    const { data, error } = await supabase
        .from('maps')
        .select('id, name')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching maps list:", error);
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
});

app.get('/api/maps/:id', async (req, res) => {
    const { data: mapData, error } = await supabase
        .from('maps')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (error || !mapData) {
        // Fallback to a hardcoded response for the base level if not in DB yet
        return res.json({
            id: req.params.id,
            name: "Default Room",
            spawn: { x: 0, z: 2 },
            objects: [
                { type: "wall", x: -2, z: -2, texture: "ground.png" },
                { type: "wall", x: -2, z: -1, texture: "ground.png" },
                { type: "wall", x: -2, z: 0, texture: "ground.png" },
                { type: "wall", x: -2, z: 1, texture: "ground.png" },
                { type: "wall", x: -2, z: 2, texture: "ground.png" },
                { type: "wall", x: 2, z: -2, texture: "ground.png" },
                { type: "wall", x: 2, z: -1, texture: "ground.png" },
                { type: "wall", x: 2, z: 0, texture: "ground.png" },
                { type: "wall", x: 2, z: 1, texture: "ground.png" },
                { type: "wall", x: 2, z: 2, texture: "ground.png" },
                { type: "npc", x: 0, z: -1, name: "Spidey", dialog: "Welcome to the new JSON map room!" }
            ]
        });
    }

    res.json(mapData);
});

app.post('/api/maps/save', async (req, res) => {
    try {
        const { id, name, spawn, objects } = req.body;

        let result;
        if (id) {
            result = await supabase
                .from('maps')
                .update({ name, data: { spawn, objects } })
                .eq('id', id)
                .select();
        } else {
            result = await supabase
                .from('maps')
                .insert([{ name, data: { spawn, objects } }])
                .select();
        }

        const { data, error } = result;

        if (error) {
            console.error("Error saving map:", error);
            return res.status(500).json({ error: error.message });
        }

        res.json({ success: true, map: data[0] });
    } catch (err) {
        console.error("Save error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Update World Graph Node Positions
app.post('/api/maps/saveLayout', async (req, res) => {
    try {
        const { id, x, y } = req.body;
        if (!id) return res.status(400).json({ error: "Missing ID" });

        const result = await supabase
            .from('maps')
            .update({ graph_x: x, graph_y: y })
            .eq('id', id);

        if (result.error) {
            console.error("Error saving layout:", result.error);
            return res.status(500).json({ error: result.error.message });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Layout Save error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.delete('/api/maps/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: "Missing ID" });

        const { error } = await supabase
            .from('maps')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Error deleting map:", error);
            return res.status(500).json({ error: error.message });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const players = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join', async (name) => {
        players[socket.id] = {
            id: socket.id,
            name: name,
            pos: [0, 0, 0],
            rot: [0, 0, 0, 1]
        };

        // Tell the new player about all existing players
        socket.emit('currentPlayers', players);

        // Tell everyone else about the new player
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // Fetch and send last 50 chat messages
        const { data: messages, error } = await supabase
            .from('messages')
            .select('name, text')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && messages) {
            // Reverse so chronological order
            socket.emit('chatHistory', messages.reverse());
        }
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].pos = data.pos;
            players[socket.id].rot = data.rot;
            // Blast out movement to everyone else
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('chatMessage', async (msg) => {
        if (players[socket.id]) {
            const playerName = players[socket.id].name;

            // Broadcast immediately for low latency feeling
            io.emit('chatMessage', { name: playerName, text: msg });

            // Persist to DB
            await supabase.from('messages').insert([
                { name: playerName, text: msg }
            ]);
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Socket.io Server listening on port ${PORT}`);
});
