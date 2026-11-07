'use strict';
/** Almacén de archivos en disco (E/S aislada). Nombres aleatorios: sin sobrescritura ni path traversal. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function crearAlmacenArchivos(directorio) {
  const ruta = (nombre) => path.join(directorio, path.basename(nombre));
  return {
    async guardar(buffer, extension) {
      await fs.mkdir(directorio, { recursive: true });
      const nombre = `${randomUUID()}${extension}`;
      await fs.writeFile(ruta(nombre), buffer, { flag: 'wx' });
      return nombre;
    },
    async eliminar(nombre) {
      try { await fs.unlink(ruta(nombre)); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    },
    ruta,
  };
}

module.exports = { crearAlmacenArchivos };
