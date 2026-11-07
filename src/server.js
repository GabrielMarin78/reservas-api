'use strict';
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
  await mongoose.connect(config.mongoUri);
  await Reserva.init(); // asegura el índice único parcial antes de aceptar tráfico
  console.log('Conectado a MongoDB');

  let app;
  const servidor = http.createServer((req, res) => app(req, res));
  const io = new Server(servidor);
  configurarSocket(io);

  app = crearApp({
    repo: crearRepositorioMongo(Reserva),
    notificador: crearNotificadorSocket(io),
    almacen: crearAlmacenArchivos(config.directorioArchivos),
  });
  servidor.listen(config.puerto, () => console.log(`API en http://localhost:${config.puerto}`));

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
