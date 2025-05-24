const { chromium } = require('playwright-core');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/run/apoteket', async (req, res) => {
  const startUrl = 'https://www.apoteket.se/kategori/';
  const products = [];

  console.log(`🔍 Startar scraping från ${startUrl}`);
  console.log(`🚀 Startar Playwright...`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium', // ← Render's preinstalled Chromium
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    const categoryLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="/kategori/"]'))
        .map((a) => a.href)
        .filter((href) => !href.includes('/produkt/'))
    );

    const categoriesToVisit = categoryLinks.slice(0, 2); // Besök max 2 kategorier

    for (const categoryUrl of categoriesToVisit) {
      await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      const productLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/produkt/"]'))
          .map((a) => a.href)
          .filter((v, i, self) => self.indexOf(v) === i) // remove duplicates
      );

      for (const productUrl of productLinks.slice(0, 3)) {
        try {
          await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(1500);

          const product = await page.evaluate(() => {
            const name = document.querySelector('h1')?.textContent?.trim();
            const priceText = document.querySelector('.ProductPrice__price')?.textContent || '';
            const image = document.querySelector('.ProductImage img')?.src || null;

            const price = parseFloat(
              priceText.replace('kr', '').replace(',', '.').replace(/\s/g, '')
            );

            return { name, price, image };
          });

          product.url = productUrl;

          if (product.name && product.price) {
            products.push(product);
            console.log(`✅ Sparade produkt: ${product.name}`);
          }
        } catch (error) {
          console.log(`⚠️ Fel vid produkt: ${productUrl} – ${error.message}`);
        }
      }
    }

    res.json(products);
  } catch (err) {
    console.error('❌ Övergripande fel:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
    console.log('🏁 Färdig! Hämtade', products.length, 'produkter.');
  }
});

app.listen(PORT, () => {
  console.log(`Servern är igång på port ${PORT}`);
});
