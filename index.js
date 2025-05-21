const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Scraper backend is running.");
});

app.listen(port, () => {
  console.log(`✅ Servern är igång på port ${port}`);
});
