import express from 'express';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 100, 2000),
});

let redisReady = false;

function otpKey(phoneNumber) {
    return `otp:${phoneNumber}`;
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            ...options,
            stdio: 'pipe',
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(stderr.trim() || `Command failed with code ${code}`));
            }
        });
    });
}

async function startRedisContainerIfNeeded() {
    const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker';

    try {
        await runCommand(dockerCommand, ['version']);
    } catch {
        return false;
    }

    try {
        console.log('Redis is not reachable yet. Trying to start the Docker Redis container...');
        await runCommand(dockerCommand, ['compose', 'up', '-d', 'redis'], { cwd: projectRoot });
        return true;
    } catch (error) {
        console.warn('Docker Redis startup failed:', error.message);
        return false;
    }
}

async function ensureRedisConnection() {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        try {
            await redis.ping();
            redisReady = true;
            console.log('Redis connected successfully');
            return true;
        } catch (error) {
            if (attempt === 10) {
                console.warn(`Redis unavailable after ${attempt} attempts: ${error.message}`);
                return false;
            }

            await startRedisContainerIfNeeded();
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    return false;
}

function withRedis(handler) {
    return async (req, res) => {
        if (!redisReady) {
            const connected = await ensureRedisConnection();
            if (!connected) {
                return res.status(503).json({
                    message: 'Redis is unavailable. Make sure Docker is running or set REDIS_URL.',
                });
            }
        }

        return handler(req, res);
    };
}

app.get('/', (req, res) => {
    res.json({
        message: 'OTP service is running.',
        endpoints: {
            postOtp: 'POST /otp',
            verifyOtp: 'POST /otp/verify',
            getTtl: 'GET /otp/:phoneNumber/ttl',
        },
    });
});

app.post('/otp', withRedis(async (req, res) => {
    const { phoneNumber } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await redis.set(otpKey(phoneNumber), otp, 'EX', 30);
    res.json({ message: `OTP sent to ${phoneNumber}`, otp });
}));

app.post('/otp/verify', withRedis(async (req, res) => {
    const { phoneNumber, otp } = req.body;
    const storedOtp = await redis.get(otpKey(phoneNumber));

    if (!storedOtp) {
        return res.status(400).json({ message: 'OTP has expired or does not exist' });
    }
    if (storedOtp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP' });
    }

    await redis.del(otpKey(phoneNumber));
    res.json({ message: 'OTP verified successfully' });
}));

app.get('/otp/:phoneNumber/ttl', withRedis(async (req, res) => {
    const ttl = await redis.ttl(otpKey(req.params.phoneNumber));
    res.json({ ttl });
}));

app.listen(3000, async () => {
    console.log('Server is running on http://localhost:3000');
    await ensureRedisConnection();
});
