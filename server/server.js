const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for web builds (itch.io, Netlify, localhost)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json());

// Persistent SQLite database file
const dbPath = path.resolve(__dirname, "leaderboard.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to open database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// Create table and an index for fast score sorting
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS scores (
      player_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC)`);
});

// GET /api/scores?limit=10 - Fetch Top N
app.get("/api/scores", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Cap at 50 to avoid scraping

  const query = `
    SELECT name, score 
    FROM scores 
    ORDER BY score DESC, created_at ASC 
    LIMIT ?
  `;

  db.all(query, [limit], (err, rows) => {
    if (err) {
      console.error("Database query error:", err.message);
      return res.status(500).json({ error: "Failed to retrieve scores" });
    }
    res.json(rows);
  });
});

app.post("/api/scores", (req, res) => {
  let { player_id, name, score } = req.body;

  if (!player_id || typeof player_id !== "string") {
    return res.status(400).json({ error: "Missing player_id" });
  }

  name =
    typeof name === "string" && name.trim().length > 0
      ? name.trim().slice(0, 16)
      : "Anonymous";

  score = parseInt(score, 10);
  if (isNaN(score) || score < 0) {
    return res.status(400).json({ error: "Invalid score" });
  }

  // Atomic UPSERT keyed by player_id
  const query = `
    INSERT INTO scores (player_id, name, score, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(player_id) DO UPDATE SET
      score = MAX(scores.score, excluded.score),
      name = excluded.name,
      updated_at = CASE 
        WHEN excluded.score > scores.score THEN CURRENT_TIMESTAMP 
        ELSE scores.updated_at 
      END
  `;

  db.run(query, [player_id, name, score], function (err) {
    if (err) {
      console.error("Database UPSERT error:", err.message);
      return res.status(500).json({ error: "Failed to record score" });
    }
    res.status(200).json({ success: true, player_id, name, score });
  });
});
app.listen(PORT, () => {
  console.log(`Leaderboard backend running on port ${PORT}`);
});
