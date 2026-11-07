'use strict';
// Reloj fijo: las pruebas son deterministas.
const AHORA = new Date('2030-01-15T10:00:00.000Z');
const en = (horas) => new Date(AHORA.getTime() + horas * 3600 * 1000).toISOString();
const entradaValida = (extra = {}) => ({
  sala: 'lab-101', solicitante: 'Ana Pérez', motivo: 'Práctica de redes',
  inicio: en(2), fin: en(4), ...extra,
});
module.exports = { AHORA, en, entradaValida };
