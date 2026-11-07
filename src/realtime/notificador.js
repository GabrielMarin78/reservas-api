'use strict';
/** Puerto de notificaciones: el servicio solo conoce `publicar(tipo, datos)`. */

function crearNotificadorSocket(io, reloj = () => new Date()) {
  return {
    publicar(tipo, datos) {
      io.emit(tipo, { tipo, ocurridoEn: reloj().toISOString(), datos });
    },
  };
}

function configurarSocket(io, log = console) {
  io.on('connection', (socket) => {
    log.info?.(`Socket conectado: ${socket.id}`);
    socket.emit('bienvenida', { mensaje: 'Conectado al canal de reservas' });
    socket.on('disconnect', () => log.info?.(`Socket desconectado: ${socket.id}`));
  });
}

const crearNotificadorNulo = () => ({ publicar() {} });

module.exports = { crearNotificadorSocket, configurarSocket, crearNotificadorNulo };
