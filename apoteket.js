const { chromium } = require('playwright-core');

async function runScraper() {
  const results = [];
  const config = {
    startUrl: 'https://www.apoteket.se/kategori/',
    maxProducts: 20,
    maxCategories: 3,
    timeout: 30000
  };

  let browser;

  try {
    console.log('🟡 Startar Playwright...');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log(`🌐 Navigerar till startsidan: ${config.startUrl}`);
    await page.goto(config.startUrl, { timeout: config.timeout });
    await page.waitForTimeout(2000);

    console.log('🔍 Letar efter kategorilänkar...');
    let categoryLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/kategori/"]'))
        .map(a => a.href)
        .filter(href => !href.includes('/produkt/'));
    });

    categoryLinks = [...new Set(categoryLinks)].slice(0, config.maxCategories);
    console.log(`📁 Hittade ${categoryLinks.length} kategorier`);

    for (const category of categoryLinks) {
      if (results.length >= config.maxProducts) break;
      console.log(`➡️ Besöker kategori: ${category}`);
      await page.goto(category, { timeout: config.timeout });
      await page.waitForTimeout(2000);

      console.log('📦 Letar efter produkter...');
      const productLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/produkt/"]'))
          .map(a => a.href);
      });

      const limited = productLinks.slice(0, 5);
      console.log(`🔗 Hittade ${limited.length} produkter`);

      for (const link of limited) {
        if (results.length >= config.maxProducts) break;
        try {
          console.log(`🛒 Går till produkt: ${link}`);
          await page.goto(link, { timeout: config.timeout });
          await page.waitForTimeout(1500);

          const product = await page.evaluate(() => {
            const name = document.querySelector('h1')?.textContent?.trim() || null;
            const priceText = document.querySelector('[class*="Price"]')?.textContent || '';
            const price = parseFloat(priceText.replace(/[^0-9,]/g, '').replace(',', '.')) || null;
            const image = document.querySelector('img')?.src || null;
            return { name, price, image };
          });

          product.url = link;
          product.ean = null; // placeholder tills vi får EAN
          if (product.name && product.price) {
            results.push(product);
            console.log(`✅ Sparad produkt: ${product.name}`);
          } else {
            console.log('⚠️ Kunde inte extrahera info');
          }
        } catch (e) {
          console.error(`❌ Fel på produktsida: ${link}`, e);
        }
      }
    }
  } catch (err) {
    console.error('💥 Övergripande fel:', err);
  } finally {
    if (browser) await browser.close();
  }

  return results;
}

module.exports = runScraper;
