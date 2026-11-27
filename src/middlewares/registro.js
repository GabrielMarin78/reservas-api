'use strict';

/* Registro de acceso en una línea JSON por petición (Railway lo muestra en Deploy Logs). */
function registrarPeticiones(log = console) {
  return (req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      log.info?.(JSON.stringify({
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0], // sin query string
        estado: res.statusCode,
        ms: Math.round(ms * 10) / 10,
      }));
    });
    next();
  };
}

module.exports = { registrarPeticiones };
