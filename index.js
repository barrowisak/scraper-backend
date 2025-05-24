const express = require('express');
const cors = require('cors');
const runScraper = require('./apoteket');

const app = express();
const port = process.env.PORT; // 🔥 Render tilldelar detta

app.use(cors());

app.get('/run/apoteket', async (req, res) => {
  try {
    const data = await runScraper();
    res.json(data);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Servern är igång på port ${port}`);
});

// Starta servern
app.listen(PORT, () => {
  console.log(`🚀 Servern är igång på port ${PORT}`);
});
