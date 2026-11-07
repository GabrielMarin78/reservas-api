'use strict';
/** Pruebas de integración HTTP + Socket.io. Requieren `npm install` (express, socket.io, etc.). */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let dependenciasOk = true;
try { require.resolve('express'); require.resolve('socket.io-client'); } catch { dependenciasOk = false; }
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Server } = dependenciasOk ? require('socket.io') : {};
const { io: conectar } = dependenciasOk ? require('socket.io-client') : {};
const { crearApp } = dependenciasOk ? require('../src/app') : {};
const { crearRepositorioMemoria } = require('../src/repositories/reserva.memory');
const { crearAlmacenArchivos } = require('../src/storage/archivos');
const { crearNotificadorSocket } = require('../src/realtime/notificador');
const { AHORA, en, entradaValida } = require('./helpers/fechas');

describe('API de reservas (HTTP + tiempo real)', { skip: !dependenciasOk && 'ejecute npm install para correr estas pruebas' }, () => {
  let servidor; let io; let base; let dir;
  const silencio = { error() {}, info() {} };

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-'));
    let app;
    const servidor = http.createServer((req, res) => app(req, res));
    io = new Server(servidor);
    app = crearApp({
      repo: crearRepositorioMemoria({ reloj: () => AHORA }),
      notificador: crearNotificadorSocket(io, () => AHORA),
      almacen: crearAlmacenArchivos(dir),
      reloj: () => AHORA, log: silencio,
    });
    await new Promise((ok) => servidor.listen(0, ok));
    base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
  });
    after(async () => {
    servidor?.closeAllConnections?.();
    try { await io?.close(); } catch { /* Socket.io cierra también el servidor HTTP asociado */ }
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  const pedir = (ruta, { metodo = 'GET', cuerpo, formulario } = {}) =>
    fetch(`${base}${ruta}`, {
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: formulario ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
    });
  const crear = async (extra) => (await (await pedir('/reservas', { metodo: 'POST', cuerpo: entradaValida(extra) })).json()).datos;

  it('POST crea (201), devuelve Location y el recurso', async () => {
    const res = await pedir('/reservas', { metodo: 'POST', cuerpo: entradaValida({ sala: 'api-1' }) });
    assert.equal(res.status, 201);
    const { datos } = await res.json();
    assert.equal(res.headers.get('location'), `/api/v1/reservas/${datos.id}`);
    assert.equal(datos.sala, 'API-1');
  });

  it('GET por id (200) y 404 con formato uniforme de error', async () => {
    const r = await crear({ sala: 'api-2' });
    assert.equal((await pedir(`/reservas/${r.id}`)).status, 200);
    const res = await pedir(`/reservas/${'0'.repeat(24)}`);
    assert.equal(res.status, 404);
    const { error } = await res.json();
    assert.deepEqual(Object.keys(error).sort(), ['codigo', 'detalles', 'marcaTiempo', 'mensaje', 'ruta']);
    assert.equal(error.codigo, 'NO_ENCONTRADO');
  });

  it('400 por validación, con detalle por campo', async () => {
    const res = await pedir('/reservas', { metodo: 'POST', cuerpo: { sala: 'x', inicio: 'ayer' } });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.equal(error.codigo, 'VALIDACION');
    assert.ok(error.detalles.some((d) => d.campo === 'sala'));
    assert.ok(error.detalles.some((d) => d.campo === 'inicio'));
  });

  it('400 ante JSON malformado e id inválido', async () => {
    const mal = await fetch(`${base}/reservas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{roto' });
    assert.equal(mal.status, 400);
    assert.equal((await mal.json()).error.codigo, 'JSON_INVALIDO');
    assert.equal((await pedir('/reservas/abc')).status, 400);
  });

  it('422 por regla de negocio (fecha pasada)', async () => {
    const res = await pedir('/reservas', { metodo: 'POST', cuerpo: entradaValida({ sala: 'api-3', inicio: en(-5), fin: en(-3) }) });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error.codigo, 'REGLA_NEGOCIO');
  });

  it('409 por solapamiento', async () => {
    await crear({ sala: 'api-4' });
    const res = await pedir('/reservas', { metodo: 'POST', cuerpo: entradaValida({ sala: 'api-4', inicio: en(3), fin: en(5) }) });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'CONFLICTO');
  });

  it('PUT: 200 con versión correcta y 409 con versión desactualizada', async () => {
    const r = await crear({ sala: 'api-5' });
    const ok = await pedir(`/reservas/${r.id}`, { metodo: 'PUT', cuerpo: { ...entradaValida({ sala: 'api-5', motivo: 'Cambio' }), version: r.version } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).datos.version, 2);
    const viejo = await pedir(`/reservas/${r.id}`, { metodo: 'PUT', cuerpo: { ...entradaValida({ sala: 'api-5' }), version: 1 } });
    assert.equal(viejo.status, 409);
    const sinVersion = await pedir(`/reservas/${r.id}`, { metodo: 'PUT', cuerpo: entradaValida({ sala: 'api-5' }) });
    assert.equal(sinVersion.status, 400);
  });

  it('GET lista con filtros y rechaza parámetros maliciosos', async () => {
    await crear({ sala: 'api-6' });
    const ok = await (await pedir('/reservas?sala=api-6&limite=5')).json();
    assert.equal(ok.meta.total, 1);
    assert.equal((await pedir('/reservas?sala[$ne]=x')).status, 400);
    assert.equal((await pedir('/reservas?limite=1000')).status, 400);
  });

  it('PATCH cancelar (200) y DELETE (204, luego 404)', async () => {
    const r = await crear({ sala: 'api-7' });
    const c = await pedir(`/reservas/${r.id}/cancelar`, { metodo: 'PATCH' });
    assert.equal((await c.json()).datos.estado, 'cancelada');
    assert.equal((await pedir(`/reservas/${r.id}`, { metodo: 'DELETE' })).status, 204);
    assert.equal((await pedir(`/reservas/${r.id}`)).status, 404);
  });

  it('adjunto: sube PDF, lo descarga; rechaza texto (415) y falta de archivo (400)', async () => {
    const r = await crear({ sala: 'api-8' });
    const f = new FormData();
    f.append('archivo', new Blob([Buffer.from('%PDF-1.4 oficio')], { type: 'application/pdf' }), 'oficio.pdf');
    const sube = await pedir(`/reservas/${r.id}/adjunto`, { metodo: 'POST', formulario: f });
    assert.equal(sube.status, 200);
    assert.equal((await sube.json()).datos.adjunto.mime, 'application/pdf');
    const baja = await pedir(`/reservas/${r.id}/adjunto`);
    assert.equal(baja.status, 200);
    assert.equal(baja.headers.get('content-type').startsWith('application/pdf'), true);
    assert.equal(await baja.text(), '%PDF-1.4 oficio');

    const malo = new FormData();
    malo.append('archivo', new Blob(['hola'], { type: 'application/pdf' }), 'falso.pdf');
    assert.equal((await pedir(`/reservas/${r.id}/adjunto`, { metodo: 'POST', formulario: malo })).status, 415);
    assert.equal((await pedir(`/reservas/${r.id}/adjunto`, { metodo: 'POST', cuerpo: {} })).status, 400);

    const grande = new FormData();
    grande.append('archivo', new Blob([Buffer.alloc(3 * 1024 * 1024, 1)]), 'grande.pdf');
    assert.equal((await pedir(`/reservas/${r.id}/adjunto`, { metodo: 'POST', formulario: grande })).status, 413);
  });

  it('ruta inexistente responde 404 JSON', async () => {
    const res = await pedir('/nada');
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'NO_ENCONTRADO');
  });

  it('tiempo real: los clientes reciben reserva:creada y reserva:cancelada', async () => {
    const cliente = conectar(base.replace('/api/v1', ''), { transports: ['websocket'] });
    await new Promise((ok) => cliente.on('connect', ok));
    const recibido = (tipo) => new Promise((ok) => cliente.once(tipo, ok));
    const creada = recibido('reserva:creada');
    const r = await crear({ sala: 'rt-1' });
    const ev = await creada;
    assert.equal(ev.tipo, 'reserva:creada');
    assert.equal(ev.datos.id, r.id);
    const cancelada = recibido('reserva:cancelada');
    await pedir(`/reservas/${r.id}/cancelar`, { metodo: 'PATCH' });
    assert.equal((await cancelada).datos.estado, 'cancelada');
    cliente.close();
  });
});
