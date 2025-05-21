/**
 * Universal website scraper that intelligently explores e-commerce sites
 * to find and extract product information starting from the homepage
 */
const { chromium } = require('playwright-chromium');
const axios = require('axios');
const cheerio = require('cheerio');

async function runScraper() {
  // Konfiguration
  const config = {
    startUrl: 'https://www.apoteket.se/kategori/',
    maxProducts: 20,
    maxCategories: 3,
    minDelay: 800,
    maxDelay: 2000,
    timeout: 20000  // Global timeout för alla operationer
  };
  
  const results = [];
  let browser = null;

  try {
    console.log(`🔍 Startar scraping från ${config.startUrl}`);
    
    // Förbereda headers för HTTP-requests
    const enhancedHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://www.google.com/',
      'Cache-Control': 'max-age=0',
      'Cookie': 'CookieConsent={stamp:%27KQ1P3iH82t0osDjZHqvMnr7VMnBXNraxWn0kpj7bEqL0lYQPW64WFQ==%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:true%2Cmarketing:true%2Cmethod:%27explicit%27%2Cver:1%2Cutc:1682608200576%2Cregion:%27se%27}'
    };
    
    // Starta Playwright med system-Chromium och no-sandbox
    console.log('🚀 Startar Playwright med system-Chromium...');
    browser = await chromium.launch({
      headless: true,
      executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: 60000
    });
    
    const context = await browser.newContext({
      userAgent: enhancedHeaders['User-Agent'],
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': enhancedHeaders['Accept-Language'],
        'Referer': enhancedHeaders['Referer']
      }
    });
    
    // Sätt cookies för att slippa cookie-banner
    await context.addCookies([
      { 
        name: 'CookieConsent', 
        value: '{stamp:%27KQ1P3iH82t0osDjZHqvMnr7VMnBXNraxWn0kpj7bEqL0lYQPW64WFQ==%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:true%2Cmarketing:true%2Cmethod:%27explicit%27%2Cver:1%2Cutc:1682608200576%2Cregion:%27se%27}', 
        domain: '.apoteket.se', 
        path: '/' 
      }
    ]);
    
    const page = await context.newPage();
    
    // Gå till startsidan och sätt max timeout
    console.log(`🔗 Går till ${config.startUrl}`);
    await page.goto(config.startUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: config.timeout 
    });
    
    // Vänta en kort tid för att JavaScript ska ladda
    await page.waitForTimeout(3000);
    
    // Hantera eventuell cookie-banner
    try {
      console.log('🍪 Kollar efter cookie-banner...');
      const acceptBtn = await page.$('button:has-text("Acceptera")');
      if (acceptBtn) {
        console.log('🍪 Klickar på cookie-banner');
        await acceptBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log('Ingen cookie-banner hittades eller kunde inte klicka');
    }
    
    // Scrolla ner på sidan för att ladda eventuellt lazy-loaded innehåll
    console.log('📜 Scrollar ner på sidan...');
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    await page.waitForTimeout(1000);
    
    // Hämta alla kategorilänkar
    console.log('🔍 Letar efter kategorilänkar...');
    let categoryLinks = [];
    try {
      // Använd querySelectorAll för att hitta alla kategorilänkar
      categoryLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href^="/kategori/"]'))
          .map(a => a.href)
          .filter(href => 
            !href.includes('#') && 
            !href.includes('?') && 
            !href.includes('/produkt/')
          );
        return [...new Set(links)]; // Ta bort dubletter
      });
      
      console.log(`📂 Hittade ${categoryLinks.length} kategorier`);
      
      if (categoryLinks.length === 0) {
        // Fallback till att titta på alla a-taggar om inga kategorier hittades
        console.log('⚠️ Inga kategorilänkar hittades med standard-selector, provar fallback...');
        categoryLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => 
              href.includes('/kategori/') && 
              !href.includes('#') && 
              !href.includes('?') && 
              !href.includes('/produkt/')
            );
        });
        console.log(`📂 Hittade ${categoryLinks.length} kategorier med fallback-metod`);
      }
      
      // Om vi fortfarande inte hittat kategorier, använd hårdkodade länkar
      if (categoryLinks.length === 0) {
        console.log('⚠️ Kunde inte hitta kategorilänkar, använder fördefinierade länkar');
        categoryLinks = [
          'https://www.apoteket.se/kategori/vard-halsa/',
          'https://www.apoteket.se/kategori/lakemedel/receptfria-lakemedel/',
          'https://www.apoteket.se/kategori/vark/'
        ];
      }
    } catch (error) {
      console.error(`❌ Fel vid sökning efter kategorier: ${error.message}`);
      // Fallback till fördefinierade länkar
      categoryLinks = [
        'https://www.apoteket.se/kategori/vard-halsa/',
        'https://www.apoteket.se/kategori/lakemedel/receptfria-lakemedel/',
        'https://www.apoteket.se/kategori/vark/'
      ];
    }
    
    // Begränsa antalet kategorier att besöka
    const categoriesToVisit = categoryLinks.slice(0, config.maxCategories);
    console.log(`📊 Kommer att besöka ${categoriesToVisit.length} kategorier`);
    
    // Gå igenom valda kategorier
    for (const categoryUrl of categoriesToVisit) {
      if (results.length >= config.maxProducts) break;
      
      console.log(`📦 Kategori: ${categoryUrl}`);
      
      try {
        // Gå till kategorisidan med timeout
        await page.goto(categoryUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: config.timeout 
        });
        
        // Vänta på JavaScript-laddning
        console.log('⏰ Väntar på JavaScript-laddning...');
        await page.waitForTimeout(3000);
        
        // Klicka bort cookie-banner igen om den dyker upp
        try {
          const acceptBtn = await page.$('button:has-text("Acceptera")');
          if (acceptBtn) {
            console.log('🍪 Klickar på cookie-banner');
            await acceptBtn.click();
            await page.waitForTimeout(1000);
          }
        } catch (e) {
          // Ignorera fel
        }
        
        // Scrolla ner för att trigga lazy loading
        console.log('📜 Scrollar för att visa produkter...');
        await page.evaluate(() => {
          window.scrollBy(0, 800);
        });
        await page.waitForTimeout(2000);
        
        // Hämta produktlänkar med timeout och backup-selektorer
        let productLinks = [];
        const selectors = [
          'a.ProductCard__link', 
          '.ProductList a[href*="/produkt/"]',
          'a[href*="/produkt/"]'
        ];
        
        for (const selector of selectors) {
          try {
            console.log(`🔍 Söker produkter med selektor: ${selector}`);
            await page.waitForSelector(selector, { timeout: 5000 })
              .catch(() => console.log(`⚠️ Timeout vid väntan på ${selector}`));
            
            const links = await page.evaluate((sel) => {
              return Array.from(document.querySelectorAll(sel))
                .map(a => a.href)
                .filter(href => href.includes('/produkt/'));
            }, selector);
            
            if (links && links.length > 0) {
              productLinks = links;
              console.log(`✅ Hittade ${links.length} produkter med ${selector}`);
              break;
            }
          } catch (e) {
            console.log(`⚠️ Kunde inte hitta produkter med ${selector}: ${e.message}`);
          }
        }
        
        if (productLinks.length === 0) {
          console.log('⚠️ Inga produkter hittades i denna kategori, går vidare...');
          continue;
        }
        
        // Begränsa antal produkter att besöka från varje kategori
        const productsToVisit = productLinks.slice(0, 5);
        console.log(`🔢 Kommer besöka ${productsToVisit.length} produkter från denna kategori`);
        
        // Besök varje produkt
        for (const productUrl of productsToVisit) {
          if (results.length >= config.maxProducts) break;
          
          try {
            console.log(`🔍 Produkt: ${productUrl}`);
            
            // Gå till produktsidan med max timeout
            await page.goto(productUrl, { 
              waitUntil: 'domcontentloaded', 
              timeout: config.timeout 
            });
            await page.waitForTimeout(2000);
            
            // Hämta produktinformation
            const productInfo = await page.evaluate(() => {
              // Produktnamn
              const name = document.querySelector('h1')?.textContent?.trim() || null;
              
              // Pris
              let price = null;
              const priceEl = document.querySelector('.ProductPrice__price');
              if (priceEl) {
                const priceText = priceEl.textContent
                  .trim()
                  .replace('kr', '')
                  .replace(',', '.')
                  .replace(/\s+/g, '');
                price = parseFloat(priceText);
              }
              
              // Bild
              const imgEl = document.querySelector('.ProductImage img, .Product img');
              const image = imgEl ? imgEl.src : null;
              
              return { name, price, image };
            });
            
            // Klicka på informationstabben om den finns för att hitta EAN
            let ean = null;
            try {
              // Söka efter knappar eller flikar som kan innehålla produktinformation
              const infoTab = await page.$('button:has-text("Information"), button:has-text("Detaljer")');
              if (infoTab) {
                await infoTab.click();
                await page.waitForTimeout(1000);
              }
              
              // Söka efter EAN i produktinformationen
              ean = await page.evaluate(() => {
                // Leta efter dt/dd element som innehåller EAN
                const dtElements = document.querySelectorAll('dt, th');
                for (const dt of dtElements) {
                  if (dt.textContent.toLowerCase().includes('ean')) {
                    // Om det är en dt, ta dd som följer
                    if (dt.tagName === 'DT') {
                      const dd = dt.nextElementSibling;
                      return dd ? dd.textContent.trim() : null;
                    }
                    // Om det är en th, hitta motsvarande td
                    else if (dt.tagName === 'TH') {
                      const index = Array.from(dt.parentElement.children).indexOf(dt);
                      const tr = dt.closest('tr').nextElementSibling;
                      if (tr) {
                        const td = tr.children[index];
                        return td ? td.textContent.trim() : null;
                      }
                    }
                  }
                }
                return null;
              });
            } catch (e) {
              console.log(`⚠️ Kunde inte hitta EAN: ${e.message}`);
            }
            
            // Skapa produkt-objekt och lägg till i resultatet
            if (productInfo.name && productInfo.price) {
              const product = {
                name: productInfo.name,
                price: productInfo.price,
                image: productInfo.image,
                ean: ean,
                url: productUrl
              };
              
              results.push(product);
              console.log(`✅ Produkt sparad: ${product.name} (${results.length}/${config.maxProducts})`);
            } else {
              console.log('⚠️ Kunde inte extrahera grundläggande produktinformation');
            }
            
            // Kort paus mellan produkter för att inte överbelasta servern
            const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;
            console.log(`⏰ Väntar ${delay}ms...`);
            await page.waitForTimeout(delay);
            
          } catch (error) {
            console.error(`❌ Fel på produktsida ${productUrl}: ${error.message}`);
          }
        }
      } catch (error) {
        console.error(`❌ Fel vid besök av kategori ${categoryUrl}: ${error.message}`);
      }
      
      // Kort paus mellan kategorier
      const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;
      console.log(`⏰ Väntar ${delay}ms mellan kategorier...`);
      await page.waitForTimeout(delay);
    }
    
  } catch (error) {
    console.error(`❌ Övergripande fel: ${error.message}`);
  } finally {
    // Stäng webbläsaren
    if (browser) {
      console.log('🏁 Stänger webbläsaren...');
      await browser.close();
    }
  }
  
  // Ta bort dubletter baserat på URL
  const uniqueResults = results.filter((product, index, self) => 
    index === self.findIndex(p => p.url === product.url)
  );
  
  console.log(`🏁 Färdig! Hämtade ${uniqueResults.length} unika produkter.`);
  return uniqueResults;
}

/**
 * Resolve relative URLs to absolute URLs
 */
function resolveUrl(relativeUrl, baseUrl) {
  if (!relativeUrl) return null;
  if (relativeUrl.startsWith('http')) return relativeUrl;
  
  if (relativeUrl.startsWith('/')) {
    const urlObj = new URL(baseUrl);
    return `${urlObj.protocol}//${urlObj.host}${relativeUrl}`;
  } else {
    let base = baseUrl;
    if (!base.endsWith('/')) {
      base = base.substring(0, base.lastIndexOf('/') + 1);
    }
    return `${base}${relativeUrl}`;
  }
}

module.exports = runScraper;
