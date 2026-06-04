import express from 'express';
import Redis from 'ioredis';

const app = express();
app.use(express.json());

const redis = new Redis(process.env.Redis_URL || 'redis://localhost:6379');
const BANNER_KEY = "app:banner";


// Root endpoint to check if the API is working
app.get("/", (req, res) => {
    res.json({ message: "Welcome to Site Banner API" });
});

app.post("/banner", async (req, res) => {
    await redis.set(BANNER_KEY, req.body.message || "Welcome to my Redis website!");
    res.json({ status: "True" });
});

app.get("/banner", async (req, res) => {
    const banner = await redis.get(BANNER_KEY);
    res.json({ banner });
});

app.delete("/banner", async (req, res) => {
    await redis.del(BANNER_KEY);
    res.json({ status: "Deleted" });
});

app.get("/banner/exists", async (req, res) => {
    const exists = await redis.exists(BANNER_KEY);
    res.json({ exists: Boolean(exists) });
});

app.listen(3000, () => {
    console.log("Server is running on http://localhost: 3000");
});