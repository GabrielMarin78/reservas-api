'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { crearServicioReservas } = require('./services/reserva.service');
const { crearControlador } = require('./controllers/reserva.controller');
const { crearRutasReservas } = require('./routes/reserva.routes');
const { noEncontrado, manejarErrores } = require('./middlewares/error');
const { registrarPeticiones } = require('./middlewares/registro');

/* Fábrica de la app: todas las dependencias se inyectan (facilita pruebas). */
function crearApp({
  repo, notificador, almacen, reloj, log = console,
  origenesPermitidos = [],                 // CORS: lista blanca de orígenes del front
  verificarSalud = async () => true,       // health check: ¿la base de datos responde?
  registrar = false,                       // registro de acceso (se activa en server.js)
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: origenesPermitidos,            // lista vacía = ningún origen externo
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Location'],
    maxAge: 600,
  }));
  if (registrar) app.use(registrarPeticiones(log));
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (req, res) =>
    res.json({ datos: { servicio: 'reservas-api', version: 'v1', salud: '/api/v1/salud' } }));

  app.get('/api/v1/salud', async (req, res) => {
    let baseDatos = false;
    try { baseDatos = await verificarSalud(); } catch { /* se informa como no disponible */ }
    res.status(baseDatos ? 200 : 503).json({
      datos: {
        estado: baseDatos ? 'ok' : 'degradado',
        baseDatos: baseDatos ? 'conectada' : 'sin conexión',
        uptimeSegundos: Math.round(process.uptime()),
      },
    });
  });

  const servicio = crearServicioReservas({ repo, notificador, almacen, reloj, log });
  app.use('/api/v1/reservas', crearRutasReservas(crearControlador(servicio)));

  app.use(noEncontrado);
  app.use(manejarErrores(log));
  return app;
}

module.exports = { crearApp };
