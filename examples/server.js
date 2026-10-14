#!/usr/bin/env node
/**
 * Local test bed for Changes.
 *
 * Serves pages that change on a timer so you can exercise the whole pipeline
 * without depending on any third party site:
 *
 *   node examples/server.js
 *
 *   http://localhost:8787/          product page, price changes every ?every
 *   http://localhost:8787/json      JSON API whose value changes
 *   http://localhost:8787/slow      responds after ?delay seconds (timeouts)
 *   http://localhost:8787/boom      always 500 (error handling)
 *
 * Content is derived from a tick counter, so the same tick always produces
 * the same bytes and only changes when the tick changes.
 */
import http from 'http';

const PORT = Number(process.env.PORT || process.argv[2] || 8787);
const DEFAULT_EVERY = 20;

const PRODUCTS = [
    { name: 'AuricularesANC Pro', base: 129 },
    { name: 'Teclado mecánico TKL', base: 89 },
    { name: 'Monitor 27" 4K', base: 349 }
];

const euro = value => `${value.toFixed(2).replace('.', ',')} EUR`;

/**
 * Which "tick" are we in? Content only changes when this changes.
 * @param {number} every - seconds per tick
 * @returns {number}
 */
function tickOf(every) {
    return Math.floor(Date.now() / (every * 1000));
}

function productPage(every, tick) {
    const product = PRODUCTS[tick % PRODUCTS.length];
    // Deterministic pseudo-random walk, stable for a given tick
    const price = product.base + ((tick * 7) % 5) * 10 - 20;
    const stock = 12 - (tick % 12);

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${product.name} | Tienda de ejemplo</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 48px; background: #fafafa; color: #18181b; }
  .card { max-width: 420px; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .brand { font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: .08em; }
  .price { font-size: 40px; font-weight: 700; margin: 24px 0 8px; }
  .stock { font-size: 14px; color: ${stock > 3 ? '#059669' : '#dc2626'}; font-weight: 600; }
  .meta { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #a1a1aa; }
</style>
</head>
<body>
  <div class="card">
    <p class="brand">Tienda de ejemplo</p>
    <h1>${product.name}</h1>
    <p class="price">${euro(price)}</p>
    <p class="stock">${stock > 0 ? `${stock} unidades disponibles` : 'Agotado'}</p>
    <p class="meta">
      Tick ${tick} &middot; cambia cada ${every} s<br>
      Esta pagina es un ejemplo local para probar Changes.
    </p>
  </div>
</body>
</html>`;
}

function jsonPayload(every, tick) {
    const product = PRODUCTS[tick % PRODUCTS.length];
    return {
        product: product.name,
        price: Number((product.base + ((tick * 7) % 5) * 10 - 20).toFixed(2)),
        currency: 'EUR',
        stock: 12 - (tick % 12),
        tick,
        updatedAt: new Date().toISOString()
    };
}

function readNumber(url, key, fallback) {
    const raw = url.searchParams.get(key);
    const value = Number(raw);
    return raw !== null && Number.isFinite(value) && value > 0 ? value : fallback;
}

function send(res, status, type, body) {
    res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(body);
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const every = readNumber(url, 'every', DEFAULT_EVERY);

    if (url.pathname === '/') {
        const tick = tickOf(every);
        return send(res, 200, 'text/html; charset=utf-8', productPage(every, tick));
    }

    if (url.pathname === '/json') {
        return send(res, 200, 'application/json; charset=utf-8',
            JSON.stringify(jsonPayload(every, tickOf(every)), null, 2));
    }

    if (url.pathname === '/slow') {
        const delay = readNumber(url, 'delay', 3);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
        return send(res, 200, 'text/plain; charset=utf-8', `Respondido tras ${delay} s\n`);
    }

    if (url.pathname === '/boom') {
        return send(res, 500, 'text/plain; charset=utf-8', 'Error interno de prueba\n');
    }

    send(res, 404, 'text/plain; charset=utf-8',
        'Rutas: / · /json · /slow · /boom   (añade ?every=5 para acelerar)\n');
});

server.listen(PORT, () => {
    console.log(`Servidor de ejemplo en http://localhost:${PORT}`);
    console.log(`  /        pagina HTML, cambia cada ${DEFAULT_EVERY} s`);
    console.log(`  /json    API JSON, cambia cada ${DEFAULT_EVERY} s`);
    console.log(`  /slow    responde tarde (prueba timeouts)`);
    console.log(`  /boom    error 500 (prueba errores)`);
    console.log(`\nAcelera con ?every=3, por ejemplo http://localhost:${PORT}/?every=3`);
});