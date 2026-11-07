'use strict';
const path = require('node:path');
const express = require('express');
const { crearServicioReservas } = require('./services/reserva.service');
const { crearControlador } = require('./controllers/reserva.controller');
const { crearRutasReservas } = require('./routes/reserva.routes');
const { noEncontrado, manejarErrores } = require('./middlewares/error');

/** Fábrica de la app: todas las dependencias se inyectan (facilita pruebas). */
function crearApp({ repo, notificador, almacen, reloj, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/v1/salud', (req, res) => res.json({ datos: { estado: 'ok' } }));

  const servicio = crearServicioReservas({ repo, notificador, almacen, reloj, log });
  app.use('/api/v1/reservas', crearRutasReservas(crearControlador(servicio)));

  app.use(noEncontrado);
  app.use(manejarErrores(log));
  return app;
}

module.exports = { crearApp };
