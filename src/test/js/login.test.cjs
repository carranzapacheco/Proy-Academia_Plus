const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../main/resources/static/PLUSTWENTY');

function cargar(fetch, timers = {}) {
  const window = { addEventListener() {} };
  const context = vm.createContext({ window, document: { getElementById: () => ({}) },
    fetch, AbortController, setTimeout, clearTimeout, ...timers });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), context);
  return window.PT;
}

test('el login no hace solicitudes previas y espera sin bloquear', async () => {
  let resolver;
  let llamadas = 0;
  const pt = cargar((url, options) => {
    llamadas++;
    assert.equal(url, '/api/auth/login');
    assert.equal(JSON.parse(options.body).username, 'alumno@example.com');
    return new Promise(resolve => { resolver = resolve; });
  });
  assert.equal(llamadas, 0);
  let termino = false;
  const pendiente = pt.auth.login('alumno@example.com', 'clave').then(r => { termino = true; return r; });
  assert.equal(termino, false);
  resolver({ ok: true, status: 200, json: async () => ({ ok: true, user: { rol: 'user', activo: true } }) });
  assert.equal((await pendiente).ok, true);
  assert.equal(pt.auth.current().rol, 'user');
});

test('la espera termina a los 20 segundos y permite informar el error', async () => {
  let vencer;
  let limpiado = false;
  const pt = cargar((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })));
  }), { setTimeout(fn, ms) { assert.equal(ms, 20000); vencer = fn; return 1; },
    clearTimeout() { limpiado = true; } });
  const pendiente = pt.auth.login('alumno@example.com', 'clave');
  vencer();
  const resultado = await pendiente;
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /tardando demasiado/);
  assert.equal(limpiado, true);
});

test('un fallo de red se muestra como error de acceso', async () => {
  const pt = cargar(async () => { throw new Error('sin conexión'); });
  const resultado = await pt.auth.login('alumno@example.com', 'clave');
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /No se pudo conectar/);
});

test('el script del formulario tiene sintaxis válida', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});
