'use strict';
/* Pruebas de la configuración de despliegue: salud, CORS y cabeceras de seguridad. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

let dependenciasOk = true;
try { require.resolve('express'); require.resolve('cors'); require.resolve('helmet'); } catch { dependenciasOk = false; }

const { crearRepositorioMemoria } = require('../src/repositories/reserva.memory');
const { crearAlmacenArchivos } = require('../src/storage/archivos');
const { crearNotificadorNulo } = require('../src/realtime/notificador');
const { AHORA } = require('./helpers/fechas');

const FRONT = 'https://mi-front.netlify.app';

describe('Configuración de despliegue', { skip: !dependenciasOk && 'ejecute npm install para correr estas pruebas' }, () => {
  let servidor; let base; let baseDatosSana = true;

  before(async () => {
    const { crearApp } = require('../src/app');
    const app = crearApp({
      repo: crearRepositorioMemoria({ reloj: () => AHORA }),
      notificador: crearNotificadorNulo(),
      almacen: crearAlmacenArchivos(path.join(os.tmpdir(), 'reservas-despliegue-test')),
      reloj: () => AHORA,
      log: { error() {}, info() {} },
      origenesPermitidos: [FRONT],
      verificarSalud: async () => baseDatosSana,
    });
    servidor = http.createServer(app);
    await new Promise((listo) => servidor.listen(0, listo));
    base = `http://127.0.0.1:${servidor.address().port}`;
  });

  after(() => new Promise((listo) => { servidor.closeAllConnections?.(); servidor.close(listo); }));

  // http.request (y no fetch) para poder enviar la cabecera Origin sin restricciones
  const pedir = (ruta, { metodo = 'GET', headers = {} } = {}) =>
    new Promise((resolver, rechazar) => {
      const req = http.request(base + ruta, { method: metodo, headers }, (res) => {
        let cuerpo = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { cuerpo += c; });
        res.on('end', () => resolver({ status: res.statusCode, headers: res.headers, cuerpo }));
      });
      req.on('error', rechazar);
      req.end();
    });

  it('GET /api/v1/salud responde 200 cuando la base de datos está disponible', async () => {
    baseDatosSana = true;
    const res = await pedir('/api/v1/salud');
    assert.equal(res.status, 200);
    const { datos } = JSON.parse(res.cuerpo);
    assert.equal(datos.estado, 'ok');
    assert.equal(datos.baseDatos, 'conectada');
  });

  it('GET /api/v1/salud responde 503 cuando la base de datos no responde', async () => {
    baseDatosSana = false;
    const res = await pedir('/api/v1/salud');
    baseDatosSana = true;
    assert.equal(res.status, 503);
    assert.equal(JSON.parse(res.cuerpo).datos.estado, 'degradado');
  });

  it('CORS: el origen autorizado recibe Access-Control-Allow-Origin', async () => {
    const res = await pedir('/api/v1/reservas', { headers: { Origin: FRONT } });
    assert.equal(res.headers['access-control-allow-origin'], FRONT);
  });

  it('CORS: un origen no autorizado no recibe la cabecera', async () => {
    const res = await pedir('/api/v1/reservas', { headers: { Origin: 'https://sitio-malicioso.example' } });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('CORS: el preflight de un PUT desde el origen autorizado se acepta', async () => {
    const res = await pedir('/api/v1/reservas/622aa413871535a3d215f2a6', {
      metodo: 'OPTIONS',
      headers: { Origin: FRONT, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
    });
    assert.equal(res.status, 204);
    assert.match(res.headers['access-control-allow-methods'], /PUT/);
  });

  it('incluye cabeceras de seguridad y oculta X-Powered-By', async () => {
    const res = await pedir('/');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
  });
});
