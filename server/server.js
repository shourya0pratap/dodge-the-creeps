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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// POST /api/scores - Record a score
app.post("/api/scores", (req, res) => {
  let { name, score } = req.body;

  // Validation & Sanitization
  if (typeof name !== "string" || name.trim().length === 0) {
    name = "Anonymous";
  } else {
    name = name.trim().slice(0, 16); // Enforce max 16 chars
  }

  score = parseInt(score, 10);
  if (isNaN(score) || score < 0) {
    return res.status(400).json({ error: "Invalid score" });
  }

  const insertQuery = `INSERT INTO scores (name, score) VALUES (?, ?)`;

  db.run(insertQuery, [name, score], function (err) {
    if (err) {
      console.error("Database insert error:", err.message);
      return res.status(500).json({ error: "Failed to save score" });
    }

    res.status(201).json({
      success: true,
      id: this.lastID,
      name,
      score,
    });
  });
});

app.listen(PORT, () => {
  console.log(`Leaderboard backend running on port ${PORT}`);
});
