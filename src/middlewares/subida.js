'use strict';
const multer = require('multer');

// Memoria + límite de 2 MB: el contenido se valida (magic bytes) antes de tocar disco.
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
module.exports = { subirArchivo: subida.single('archivo') };
