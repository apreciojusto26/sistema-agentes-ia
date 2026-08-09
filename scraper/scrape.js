const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const CONFIG = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  locale: 'es-ES',
  viewport: { width: 1440, height: 900 },
  maxImages: 8,
  maxReviews: 30,
  // Techo de seguridad: el modal carga de a 20, así que 20 rondas ≈ 400 reseñas.
  // Evita quedarse colgado si AliExpress nunca deja de servir páginas.
  maxScrollRounds: 20,
  outputDir: './output',
  imagesDir: './output/images'
};

// Iconos de UI que viven en el mismo CDN que las fotos del producto.
// Se reconocen por el segmento de tamaño en el path: /27x27.png, /48x48.png
const ICON_PATH = /\/\d{1,2}x\d{1,2}\.(png|jpg|webp)/i;

// Sufijo de redimensionado que AliExpress agrega al final de la URL.
// Ej: "..._220x220q75.jpg_.avif"  ->  se quita para recuperar el original.
const RESIZE_SUFFIX = /_\d+x\d+[a-z0-9]*\.(jpe?g|png|webp)(_\.(avif|webp))?$/i;
const FORMAT_SUFFIX = /_\.(avif|webp)$/i;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Convierte la URL de un thumbnail en la URL de la imagen original.
 * El CDN sirve variantes por sufijo, no por query string.
 */
function toFullSize(url) {
  return url.replace(RESIZE_SUFFIX, '').replace(FORMAT_SUFFIX, '');
}

function isProductImage(url) {
  return (
    /aliexpress-media\.com|alicdn\.com/.test(url) &&
    !ICON_PATH.test(url) &&
    !/\.gif(\?|$)/i.test(url)
  );
}

function unique(arr) {
  return [...new Set(arr)];
}

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif'
};

/**
 * El CDN negocia el formato por content-type: pedir un ".jpg" puede devolver
 * WebP. Se guarda con la extensión real para no romper los consumidores.
 */
async function downloadImage(url, destinationWithoutExt) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 20000,
    headers: {
      'User-Agent': CONFIG.userAgent,
      Referer: 'https://es.aliexpress.com/'
    }
  });

  const mime = (response.headers['content-type'] || '').split(';')[0].trim();
  const extension = EXTENSION_BY_MIME[mime] || '.jpg';
  const destination = destinationWithoutExt + extension;

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destination);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return destination;
}

/** Scroll progresivo: dispara el lazy-load de galería, SKUs y reviews. */
async function autoScroll(page, steps = 14) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------------------
// EXTRACTORES
//
// Nivel 1: datos estructurados (JSON-LD). Es un contrato Schema.org, no cambia
//          cuando el equipo de AliExpress toca el CSS.
// Nivel 2: selectores con scope, matcheando por fragmento de clase. Las clases
//          llevan hash por build ("list--itemReview--d9Z9Z5Z"), así que se
//          matchea el prefijo estable, nunca la clase completa.
// ---------------------------------------------------------------------------

/** El JSON-LD anexa " - AliExpress <categoría>" al nombre. No va en la landing. */
function cleanTitle(title) {
  return (title || '').replace(/\s*-\s*AliExpress\s*\d*\s*$/i, '').trim();
}

/** Nivel 1 — title, description, rating, reviewCount, brand. */
async function extractStructuredData(page) {
  const blocks = await page.$$eval('script[type="application/ld+json"]', els =>
    els.map(e => e.textContent)
  );

  for (const raw of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    const product = nodes.find(n => n && n['@type'] === 'Product');
    if (!product) continue;

    return {
      title: cleanTitle(product.name) || null,
      description: product.description || null,
      brand: product.brand?.name || product.brand || null,
      rating: product.aggregateRating
        ? Number(product.aggregateRating.ratingValue)
        : null,
      reviewCount: product.aggregateRating
        ? Number(product.aggregateRating.reviewCount)
        : null,
      structuredImages: (product.image || []).filter(isProductImage)
    };
  }

  return null;
}

/** Nivel 2 — galería principal, con scope en el slider. */
async function extractGallery(page) {
  const urls = await page.evaluate(() => {
    const scopes = [
      '[class*="slider--item"] img',
      '[class*="image-view"] img'
    ];
    for (const selector of scopes) {
      const found = [...document.querySelectorAll(selector)].map(i => i.src);
      if (found.length) return found;
    }
    return [];
  });

  return unique(urls.filter(isProductImage).map(toFullSize));
}

/**
 * La página solo pinta 3 reseñas. El botón "Ver más" del bloque de reseñas abre
 * un modal que carga de a 20 por scroll infinito.
 *
 * Ojo: hay seis botones "Ver más" en la página (specs, descripción, Q&A...).
 * Hay que agarrar el que vive dentro de [class*="review--wrap"], no el primero.
 */
async function openReviewsModal(page) {
  const opened = await page.evaluate(() => {
    const wrap = document.querySelector('[class*="review--wrap"]');
    if (!wrap) return false;

    const button = [...wrap.querySelectorAll('button')].find(b =>
      /ver m[aá]s|view more|see more/i.test(b.innerText || '')
    );
    if (!button) return false;

    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  });

  if (!opened) return false;

  try {
    await page.waitForSelector('[class*="comet-v2-modal-content"]', { timeout: 15000 });
    await page.waitForTimeout(2500);
    return true;
  } catch {
    return false;
  }
}

const countReviews = page =>
  page.evaluate(() => document.querySelectorAll('[class*="itemReview"]').length);

/** Scroll infinito dentro del modal hasta juntar `target` reseñas. */
async function loadMoreReviews(page, target, maxRounds) {
  let previous = -1;

  for (let round = 0; round < maxRounds; round++) {
    const count = await countReviews(page);

    // Se llegó al objetivo, o AliExpress dejó de servir páginas.
    if (count >= target || count === previous) return count;
    previous = count;

    // El modal no tiene scroll propio: lo que dispara la carga es que el
    // último item entre en viewport.
    await page.evaluate(() => {
      const items = document.querySelectorAll('[class*="itemReview"]');
      items[items.length - 1]?.scrollIntoView({ block: 'end' });
    });
    await page.waitForTimeout(2200);
  }

  return countReviews(page);
}

/** Nivel 2 — reseñas reales, con autor, fecha, estrellas y variante. */
async function extractReviews(page, limit) {
  return page.evaluate(max => {
    const items = [...document.querySelectorAll('[class*="itemReview"]')];

    return items
      .map(node => {
        // El texto de la reseña vive anidado; autor y fecha están en la tarjeta
        // contenedora ("list--itemBox"), varios niveles más arriba.
        const card =
          node.closest('[class*="list--itemBox"]') ||
          node.closest('[class*="list--itemContent"]') ||
          node.parentElement;
        const cardText = card?.innerText || '';

        const starBox = card?.querySelector('[class*="stars--box"]');
        const filled = starBox
          ? starBox.querySelectorAll('[class*="starreviewfilled"]').length
          : 0;

        // "Anónimo | 25 AGO 2025"
        const meta = cardText.match(/^(.+?)\s*\|\s*(\d{1,2}\s+\w+\.?\s+\d{4})$/m);

        return {
          text: (node.innerText || '').trim(),
          rating: filled ? Math.min(filled, 5) : null,
          author: meta ? meta[1].trim() : null,
          date: meta ? meta[2].trim() : null,
          variant:
            card
              ?.querySelector('[class*="itemSku"]')
              ?.innerText.trim() || null
        };
      })
      // Las 3 reseñas de la página siguen en el DOM detrás del modal, así que
      // aparecen duplicadas. Se deduplica por texto.
      .filter(r => r.text.length > 0)
      .filter((r, i, all) => all.findIndex(o => o.text === r.text) === i)
      .slice(0, max);
  }, limit);
}

/** Nivel 2 — variantes / SKU (Color, Talla, etc.). */
async function extractVariants(page) {
  return page.evaluate(() => {
    const properties = [...document.querySelectorAll('[class*="sku-item--property"]')];

    return properties.map(prop => {
      const heading =
        prop.querySelector('[class*="sku-item--title"]')?.innerText ||
        prop.querySelector('[class*="title"]')?.innerText ||
        '';

      // El heading viene como "Color: Plastic 1Pcs Black" (propiedad: seleccionado)
      const [name, selected] = heading.split(':').map(s => s?.trim());

      const options = [
        ...prop.querySelectorAll(
          '[class*="sku-item--image"], [class*="sku-item--text"], [class*="sku-item--box"]'
        )
      ]
        .map(opt => {
          const img = opt.querySelector('img');
          return (
            opt.innerText?.trim() ||
            img?.alt?.trim() ||
            img?.getAttribute('title')?.trim() ||
            null
          );
        })
        .filter(Boolean);

      return {
        name: name || null,
        selected: selected || null,
        options: [...new Set(options)]
      };
    });
  });
}

// ---------------------------------------------------------------------------
// PIPELINE
// ---------------------------------------------------------------------------

async function scrapeAliExpress(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: CONFIG.userAgent,
    locale: CONFIG.locale,
    viewport: CONFIG.viewport
  });
  const page = await context.newPage();

  try {
    console.log('🚀 Abriendo producto...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('h1', { timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('📜 Cargando contenido diferido...');
    await autoScroll(page);

    console.log('📦 Leyendo datos estructurados...');
    const structured = await extractStructuredData(page);
    if (!structured) {
      throw new Error(
        'No se encontró JSON-LD de tipo Product. La página cambió de formato ' +
        'o se sirvió un captcha. Revisá con headless:false.'
      );
    }

    console.log('🖼  Extrayendo galería...');
    const gallery = await extractGallery(page);
    const images = unique([
      ...structured.structuredImages.map(toFullSize),
      ...gallery
    ]).slice(0, CONFIG.maxImages);

    // Las variantes se leen ANTES de abrir el modal: una vez abierto, tapa el
    // selector de SKU y los nodos dejan de ser accesibles de forma confiable.
    console.log('🎨 Extrayendo variantes...');
    const variants = await extractVariants(page);

    console.log('💬 Expandiendo reseñas...');
    const modalOpen = await openReviewsModal(page);
    if (modalOpen) {
      const loaded = await loadMoreReviews(
        page,
        CONFIG.maxReviews,
        CONFIG.maxScrollRounds
      );
      console.log(`   ${loaded} reseñas cargadas en el DOM`);
    } else {
      console.log('   ⚠️  no se pudo abrir el modal, uso las visibles en la página');
    }

    const reviews = await extractReviews(page, CONFIG.maxReviews);

    // --- descarga de imágenes
    fs.mkdirSync(CONFIG.imagesDir, { recursive: true });
    console.log(`⬇️  Descargando ${images.length} imágenes...`);

    const localImages = [];
    for (const [index, imageUrl] of images.entries()) {
      const base = path.join(CONFIG.imagesDir, `img_${index}`);
      try {
        const saved = await downloadImage(imageUrl, base);
        localImages.push(saved);
        console.log('  ✔', path.basename(saved));
      } catch {
        console.log('  ❌ falló', imageUrl.slice(0, 80));
      }
    }

    const product = {
      sourceUrl: url,
      scrapedAt: new Date().toISOString(),
      title: structured.title,
      description: structured.description,
      brand: structured.brand,
      rating: structured.rating,
      reviewCount: structured.reviewCount,
      variants,
      images,
      localImages,
      reviews
    };

    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    const outputPath = path.join(CONFIG.outputDir, 'product.json');
    fs.writeFileSync(outputPath, JSON.stringify(product, null, 2));

    console.log('\n🔥 RESULTADO\n');
    console.log(
      JSON.stringify(
        {
          ...product,
          images: `${images.length} urls`,
          localImages: `${localImages.length} archivos`,
          reviews: `${reviews.length} reseñas (ver product.json)`
        },
        null,
        2
      )
    );
    console.log(`\n💾 Guardado en ${outputPath}`);

    return product;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------

const targetUrl = process.argv[2] || 'https://es.aliexpress.com/item/1005007502111078.html';

scrapeAliExpress(targetUrl).catch(err => {
  console.error('\n💥', err.message);
  process.exit(1);
});
