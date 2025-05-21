const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');

async function runScraper() {
  const config = {
    startUrl: 'https://www.apoteket.se/kategori/',
    maxProducts: 20,
    maxCategories: 3,
    minDelay: 800,
    maxDelay: 2000,
    timeout: 20000
  };

  const results = [];
  let browser;

  try {
    console.log(`🔍 Startar scraping från ${config.startUrl}`);
    console.log('🚀 Startar Playwright...');
    
    browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  executablePath: require('chromium').executablePath
});

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    await page.goto(config.startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeout
    });

    await page.waitForTimeout(3000);

    // Klicka på cookie-banner om den syns
    try {
      const acceptBtn = await page.$('button:has-text("Acceptera")');
      if (acceptBtn) {
        await acceptBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log('🍪 Ingen cookie-banner att klicka på');
    }

    // Hämta kategori-länkar
    let categoryLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href^="/kategori/"]'))
        .map(a => a.href)
        .filter(href =>
          !href.includes('/produkt/') &&
          !href.includes('?') &&
          !href.includes('#')
        );
    });

    categoryLinks = [...new Set(categoryLinks)];
    console.log(`📂 Hittade ${categoryLinks.length} kategorier`);

    const categoriesToVisit = categoryLinks.slice(0, config.maxCategories);

    for (const categoryUrl of categoriesToVisit) {
      if (results.length >= config.maxProducts) break;

      console.log(`📦 Besöker kategori: ${categoryUrl}`);
      await page.goto(categoryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeout
      });
      await page.waitForTimeout(3000);

      // Scrolla ner
      await page.evaluate(() => {
        window.scrollBy(0, 800);
      });
      await page.waitForTimeout(1000);

      let productLinks = [];

      try {
        const selectors = [
          'a.ProductCard__link',
          '.ProductList a[href*="/produkt/"]',
          'a[href*="/produkt/"]'
        ];

        for (const selector of selectors) {
          await page.waitForSelector(selector, { timeout: 3000 }).catch(() => {});
          productLinks = await page.$$eval(selector, links =>
            links.map(link => link.href).filter(href => href.includes('/produkt/'))
          );
          if (productLinks.length) break;
        }
      } catch (err) {
        console.warn(`⚠️ Inga produkter hittade i ${categoryUrl}`);
        continue;
      }

      const toVisit = productLinks.slice(0, 5);

      for (const productUrl of toVisit) {
        if (results.length >= config.maxProducts) break;

        try {
          console.log(`🔍 Går till produkt: ${productUrl}`);
          await page.goto(productUrl, {
            waitUntil: 'domcontentloaded',
            timeout: config.timeout
          });
          await page.waitForTimeout(2000);

          const product = await page.evaluate(() => {
            const name = document.querySelector('h1')?.textContent?.trim() || null;
            const priceEl = document.querySelector('.ProductPrice__price');
            const price = priceEl
              ? parseFloat(priceEl.textContent.replace(/[^\d,]/g, '').replace(',', '.'))
              : null;
            const image = document.querySelector('img')?.src || null;
            return { name, price, image };
          });

          let ean = null;
          try {
            const infoTab = await page.$('button:has-text("Information")');
            if (infoTab) {
              await infoTab.click();
              await page.waitForTimeout(1000);
            }

            ean = await page.evaluate(() => {
              const dtElements = document.querySelectorAll('dt, th');
              for (const dt of dtElements) {
                if (dt.textContent.toLowerCase().includes('ean')) {
                  if (dt.tagName === 'DT') {
                    return dt.nextElementSibling?.textContent?.trim() || null;
                  }
                }
              }
              return null;
            });
          } catch (e) {
            console.log('⚠️ EAN hittades ej');
          }

          if (product.name && product.price && product.image) {
            results.push({
              ...product,
              ean,
              url: productUrl
            });
            console.log(`✅ Sparad: ${product.name}`);
          }
        } catch (err) {
          console.error(`❌ Fel på ${productUrl}: ${err.message}`);
        }

        const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;
        await page.waitForTimeout(delay);
      }
    }
  } catch (error) {
    console.error(`❌ Övergripande fel: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const uniqueResults = results.filter((item, index, arr) => {
    return index === arr.findIndex(p => p.url === item.url);
  });

  console.log(`🏁 Färdig! Hämtade ${uniqueResults.length} unika produkter.`);
  return uniqueResults;
}

module.exports = runScraper;
