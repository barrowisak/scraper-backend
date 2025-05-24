const express = require('express');
const cors = require('cors');
const runScraper = require('./apoteket');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());

// Endpoint för att köra apoteket-scraper
app.get('/run/apoteket', async (req, res) => {
  try {
    console.log("🔁 Förfrågan mottagen, startar scraping...");
    const data = await runScraper();
    res.json(data);
  } catch (err) {
    console.error("❌ Fel vid scraping:", err);
    res.status(500).json({ error: err.message });
  }
});

// Starta servern
app.listen(PORT, () => {
  console.log(`🚀 Servern är igång på port ${PORT}`);
});
