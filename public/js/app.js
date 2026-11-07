(() => {
  'use strict';

  /* ===== Configuración: edite esta lista con las salas reales ===== */
  const SALAS = [
    { codigo: 'LAB-101', nombre: 'Laboratorio de Cómputo 1' },
    { codigo: 'LAB-102', nombre: 'Laboratorio de Cómputo 2' },
    { codigo: 'LAB-201', nombre: 'Laboratorio de Redes' },
    { codigo: 'AULA-301', nombre: 'Aula 301' },
    { codigo: 'AUD-1', nombre: 'Auditorio' },
    { codigo: 'SALA-REU', nombre: 'Sala de reuniones' },
  ];
  const API = '/api/v1';

  const $ = (id) => document.getElementById(id);
  const dos = (n) => String(n).padStart(2, '0');
  const fmt = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
  const fFecha = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' });
  const fHora = new Intl.DateTimeFormat('es-EC', { timeStyle: 'short', hourCycle: 'h23' });
  const estado = { pagina: 1, totalPaginas: 1, editando: null, adjuntarId: null };

  /* ---------- Listas desplegables ---------- */
  function llenarListas() {
    const opcionesSala = SALAS.map((s) => new Option(`${s.codigo} · ${s.nombre}`, s.codigo));
    $('sala').append(new Option('Seleccione una sala…', ''), ...opcionesSala);
    $('fSala').append(new Option('Todas', ''), ...SALAS.map((s) => new Option(`${s.codigo} · ${s.nombre}`, s.codigo)));
    for (const p of ['inicio', 'fin']) {
      for (let h = 0; h < 24; h++) $(`${p}Hora`).append(new Option(dos(h), dos(h), h === 8, h === 8));
      $(`${p}Min`).append(new Option('00', '00'), new Option('30', '30')); // solo :00 o :30
    }
    const hoy = new Date();
    $('fecha').min = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
  }

  /* ---------- Fechas ---------- */
  const leerMomento = (p) => { // fecha + hora + minutos -> ISO 8601 (p = 'inicio' | 'fin')
    const f = $('fecha').value;
    return f ? new Date(`${f}T${$(`${p}Hora`).value}:${$(`${p}Min`).value}`).toISOString() : null;
  };
  function escribirMomento(p, iso) {
    const d = new Date(iso);
    if (p === 'inicio') $('fecha').value = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
    $(`${p}Hora`).value = dos(d.getHours());
    $(`${p}Min`).value = dos(d.getMinutes());
  }
  // "7 nov 2026 · 14:00 – 16:00" (la fecha se muestra una sola vez)
  function textoHorario(r) {
    const i = new Date(r.inicio), f = new Date(r.fin);
    return i.toDateString() === f.toDateString()
      ? `${fFecha.format(i)} · ${fHora.format(i)} – ${fHora.format(f)}`
      : `${fmt.format(i)} → ${fmt.format(f)}`;
  }

  /* ---------- Comunicación con la API ---------- */
  async function api(ruta, opciones = {}) {
    let res;
    try { res = await fetch(API + ruta, opciones); }
    catch { throw { mensaje: 'No se pudo contactar con el servidor. ¿Está corriendo "npm start"?', detalles: [] }; }
    if (res.status === 204) return null;
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw cuerpo?.error ?? { mensaje: `Error ${res.status}`, detalles: [] };
    return cuerpo;
  }

  /* ---------- Mensajes ---------- */
  function mostrarError(el, e) {
    el.replaceChildren();
    const caja = document.createElement('div'); caja.className = 'error';
    caja.append(e.mensaje || 'Error inesperado');
    if (e.detalles?.length) {
      const ul = document.createElement('ul');
      e.detalles.forEach((d) => { const li = document.createElement('li'); li.textContent = d.mensaje; ul.append(li); });
      caja.append(ul);
    }
    el.append(caja);
  }
  function mostrarOk(el, texto) {
    el.replaceChildren();
    const d = document.createElement('div'); d.className = 'exito'; d.textContent = texto; el.append(d);
    setTimeout(() => { if (el.textContent === texto) el.replaceChildren(); }, 4000);
  }

  /* ---------- Tabla ---------- */
  const celda = (texto, clase) => { const td = document.createElement('td'); td.textContent = texto; if (clase) td.className = clase; return td; };
  const boton = (texto, fn, clase = '') => {
    const b = document.createElement('button'); b.type = 'button'; b.className = `mini ${clase}`; b.textContent = texto;
    b.addEventListener('click', fn); return b;
  };

  function filaReserva(r) {
    const tr = document.createElement('tr');
    tr.append(celda(r.sala), celda(r.solicitante), celda(r.motivo),
      celda(textoHorario(r)),
      celda(r.estado, `estado-${r.estado}`));
    const tdAdj = document.createElement('td');
    if (r.adjunto) {
      const a = document.createElement('a'); a.href = r.adjunto.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = r.adjunto.nombreOriginal; tdAdj.append(a);
    } else tdAdj.textContent = '—';
    const tdAcc = document.createElement('td'), caja = document.createElement('div'); caja.className = 'acciones';
    if (r.estado === 'activa') {
      caja.append(boton('Editar', () => editar(r)), boton('Adjuntar', () => adjuntar(r)), boton('Cancelar', () => cancelar(r), 'peligro'));
    }
    caja.append(boton('Eliminar', () => eliminar(r), 'peligro'));
    tdAcc.append(caja); tr.append(tdAdj, tdAcc);
    return tr;
  }

  async function cargar() {
    const q = new URLSearchParams({ pagina: estado.pagina, limite: 10 });
    if ($('fSala').value) q.set('sala', $('fSala').value);
    if ($('fEstado').value) q.set('estado', $('fEstado').value);
    try {
      const { datos, meta } = await api('/reservas?' + q);
      $('msgLista').replaceChildren();
      const filas = $('filas'); filas.replaceChildren();
      if (!datos.length) {
        const tr = document.createElement('tr'), td = celda('No hay reservas con esos filtros.', 'vacio'); td.colSpan = 7; tr.append(td); filas.append(tr);
      } else datos.forEach((r) => filas.append(filaReserva(r)));
      estado.totalPaginas = meta.totalPaginas;
      $('resumen').textContent = `${meta.total} reserva(s) · página ${meta.pagina} de ${meta.totalPaginas}`;
      $('ant').disabled = meta.pagina <= 1; $('sig').disabled = meta.pagina >= meta.totalPaginas;
    } catch (e) { mostrarError($('msgLista'), e); }
  }

  /* ---------- Acciones ---------- */
  function limpiarForm() {
    $('form').reset(); estado.editando = null;
    $('tituloForm').textContent = 'Nueva reserva'; $('guardar').textContent = 'Crear reserva'; $('cancelarEdicion').hidden = true;
  }
  function editar(r) {
    estado.editando = { id: r.id, version: r.version };
    if (![...$('sala').options].some((o) => o.value === r.sala)) $('sala').append(new Option(r.sala, r.sala)); // sala fuera de la lista
    $('sala').value = r.sala; $('solicitante').value = r.solicitante; $('motivo').value = r.motivo;
    escribirMomento('inicio', r.inicio); escribirMomento('fin', r.fin);
    $('tituloForm').textContent = `Editando reserva de ${r.sala}`; $('guardar').textContent = 'Guardar cambios';
    $('cancelarEdicion').hidden = false; $('msgForm').replaceChildren(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function accion(promesa, textoOk) {
    try { await promesa; mostrarOk($('msgLista'), textoOk); await cargar(); }
    catch (e) { mostrarError($('msgLista'), e); if (e.codigo === 'CONFLICTO') cargar(); }
  }
  const cancelar = (r) => confirm(`¿Cancelar la reserva de ${r.sala}? El horario quedará libre.`) &&
    accion(api(`/reservas/${r.id}/cancelar`, { method: 'PATCH' }), 'Reserva cancelada.');
  const eliminar = (r) => confirm(`¿Eliminar definitivamente la reserva de ${r.sala}?`) &&
    accion(api(`/reservas/${r.id}`, { method: 'DELETE' }), 'Reserva eliminada.').then(() => { if (estado.editando?.id === r.id) limpiarForm(); });
  const adjuntar = (r) => { estado.adjuntarId = r.id; $('archivo').value = ''; $('archivo').click(); };

  $('archivo').addEventListener('change', () => {
    const f = $('archivo').files[0]; if (!f || !estado.adjuntarId) return;
    const datos = new FormData(); datos.append('archivo', f);
    accion(api(`/reservas/${estado.adjuntarId}/adjunto`, { method: 'POST', body: datos }), 'Archivo adjuntado.');
  });

  $('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const inicio = leerMomento('inicio'), fin = leerMomento('fin');
    const faltan = [];
    if (!$('sala').value) faltan.push({ mensaje: 'Seleccione una sala.' });
    if (!inicio) faltan.push({ mensaje: 'Elija la fecha de la reserva.' });
    else if (fin <= inicio) faltan.push({ mensaje: 'La hora de fin debe ser posterior a la hora de inicio.' });
    if (faltan.length) return mostrarError($('msgForm'), { mensaje: 'Complete los datos de la reserva.', detalles: faltan });

    const cuerpo = { sala: $('sala').value, solicitante: $('solicitante').value, motivo: $('motivo').value, inicio, fin };
    const cabeceras = { 'Content-Type': 'application/json' };
    $('guardar').disabled = true;
    try {
      if (estado.editando) {
        await api(`/reservas/${estado.editando.id}`, { method: 'PUT', headers: cabeceras, body: JSON.stringify({ ...cuerpo, version: estado.editando.version }) });
        mostrarOk($('msgForm'), 'Cambios guardados.');
      } else {
        await api('/reservas', { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) });
        mostrarOk($('msgForm'), 'Reserva creada.');
      }
      limpiarForm(); await cargar();
    } catch (e) { mostrarError($('msgForm'), e); if (e.codigo === 'CONFLICTO' && estado.editando) cargar(); }
    finally { $('guardar').disabled = false; }
  });

  $('cancelarEdicion').addEventListener('click', () => { limpiarForm(); $('msgForm').replaceChildren(); });
  $('filtros').addEventListener('submit', (e) => { e.preventDefault(); estado.pagina = 1; cargar(); });
  $('limpiar').addEventListener('click', () => { $('fSala').value = ''; $('fEstado').value = ''; estado.pagina = 1; cargar(); });
  $('ant').addEventListener('click', () => { estado.pagina = Math.max(1, estado.pagina - 1); cargar(); });
  $('sig').addEventListener('click', () => { estado.pagina = Math.min(estado.totalPaginas, estado.pagina + 1); cargar(); });

  /* ---------- Tiempo real (Socket.io) ---------- */
  function conectarTiempoReal() {
    const pill = $('conexion');
    if (typeof io === 'undefined') {
      pill.textContent = 'sin tiempo real: abra esta página desde http://localhost:3000'; return;
    }
    const socket = io(); let pendiente;
    socket.on('connect', () => { pill.textContent = 'en vivo'; pill.className = 'pill on'; });
    socket.on('disconnect', () => { pill.textContent = 'desconectado'; pill.className = 'pill'; });
    socket.on('connect_error', () => { pill.textContent = 'error de conexión'; pill.className = 'pill'; });
    ['reserva:creada', 'reserva:actualizada', 'reserva:cancelada', 'reserva:eliminada', 'reserva:adjunto'].forEach((tipo) =>
      socket.on(tipo, (ev) => {
        const ul = $('eventos'); ul.querySelector('.vacio')?.remove();
        const li = document.createElement('li'), t = document.createElement('time');
        t.textContent = new Date(ev.ocurridoEn).toLocaleTimeString('es-EC');
        li.append(t, `${tipo.replace('reserva:', '')} — sala ${ev.datos.sala}`); ul.prepend(li);
        clearTimeout(pendiente); pendiente = setTimeout(cargar, 150); // refleja cambios hechos por otros usuarios
      }));
  }

  llenarListas();
  conectarTiempoReal();
  cargar();
})();
