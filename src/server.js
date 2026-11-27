'use strict';
require('dotenv').config({ quiet: true }); // carga .env solo si existe; en producción mandan las variables de la plataforma
const http = require('node:http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const config = require('./config');
const { crearApp } = require('./app');
const Reserva = require('./models/reserva.model');
const { crearRepositorioMongo } = require('./repositories/reserva.mongo');
const { crearAlmacenArchivos } = require('./storage/archivos');
const { crearNotificadorSocket, configurarSocket } = require('./realtime/notificador');

async function main() {
  // Falla rápido (10 s) si Atlas no es alcanzable, para que la plataforma reinicie el servicio
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  await Reserva.init(); // asegura el índice único parcial antes de aceptar tráfico
  console.log('Conectado a MongoDB');

  if (config.esProduccion && config.origenesPermitidos.length === 0) {
    console.warn('CORS_ORIGINS no está definida: ningún navegador externo podrá usar la API');
  }

  let app;
  const servidor = http.createServer((req, res) => app(req, res));
  const io = new Server(servidor, { cors: { origin: config.origenesPermitidos } });
  configurarSocket(io);

  app = crearApp({
    repo: crearRepositorioMongo(Reserva),
    notificador: crearNotificadorSocket(io),
    almacen: crearAlmacenArchivos(config.directorioArchivos),
    origenesPermitidos: config.origenesPermitidos,
    verificarSalud: async () => mongoose.connection.readyState === 1,
    registrar: true,
  });
  servidor.listen(config.puerto, () =>
    console.log(`API escuchando en el puerto ${config.puerto} (${config.entorno})`));

  const cerrar = async () => {
    io.close();
    servidor.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((e) => { console.error('Error al iniciar:', e); process.exit(1); });
