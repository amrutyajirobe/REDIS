import express from 'express';
import Redis from 'ioredis';
import mongoose from 'mongoose';

const app = express();

const redis = new Redis({
    host: 'localhost',
    port: 6379,
});

app.get('/redis', async (req, res) => {
    try {
        const reply = await redis.ping();
        res.json({ redis: reply });
    } catch (error) {
        res.status(500).json({ error: 'Failed to connect to Redis' });
    }
});

app.get('/mongo', async (req, res) => {
    try {
        const url = process.env.MONGO_URL || 'mongodb://localhost:27017/mydatabase';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(url);
        }
        res.json({ mongo: 'MongoDB is working', database: mongoose.connection.name });
    } catch (error) {
        res.status(500).json({ error: 'Failed to connect to MongoDB' });
    }
});


app.listen(3000, () => {
    console.log('Server is running on port 3000');
});