/* =====================================================================
   PLUSTWENTY · app.js
   Núcleo compartido del sistema:
   - Acceso a datos mediante la API REST de Spring Boot (MySQL) con caché en memoria
   - Autenticación con sesión del servidor y control de roles
   - Reglas financieras (saldo = exigible - (abonos aprobados + descuentos))
   - Auditoría y notificaciones
   - Utilidades de UI: toasts, confirmaciones, modales, tablas, router SPA
   ===================================================================== */
(function (global) {
  'use strict';

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ACADEMIA = {
    nombre: 'Academia Preuniversitaria PLUSTWENTY',
    ruc: '20605478912',
    direccion: 'Av. Universitaria 1801, San Miguel · Lima',
    telefono: '(01) 480-2020',
    yape: '987 654 321',
    plin: '912 345 678',
    titular: 'PLUSTWENTY S.A.C.'
  };

  /* ------------------------------------------------------------------
     Utilidades generales
     ------------------------------------------------------------------ */
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = v => {
    if (!v) return null;
    if (v instanceof Date) return new Date(v.getTime());
    return String(v).length === 10 ? new Date(v + 'T00:00:00') : new Date(v);
  };
  const today = () => toISO(new Date());
  const nowISO = () => new Date().toISOString();
  const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const sum = (arr, fn = x => x) => round2(arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0));
  const moneyFmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
  const money = n => moneyFmt.format(Number(n) || 0);
  const fmtDate = v => {
    const d = parseDate(v);
    return d && !isNaN(d) ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  };
  const fmtDateTime = v => {
    const d = parseDate(v);
    return d && !isNaN(d) ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  };
  const timeAgo = v => {
    const d = parseDate(v);
    if (!d) return '';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 0) return fmtDate(v);
    if (s < 60) return 'hace un momento';
    const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
    const dd = Math.floor(h / 24); if (dd < 30) return `hace ${dd} día${dd > 1 ? 's' : ''}`;
    return fmtDate(v);
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = name => (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const randomPassword = (len = 8) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const validators = {
    dni: v => /^\d{8}$/.test(String(v || '').trim()),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()),
    phone: v => /^\d{9}$/.test(String(v || '').replace(/\s/g, '')),
    username: v => /^[a-z0-9._]{3,24}$/.test(String(v || '')),
    operacion: v => /^\d{6}$/.test(String(v || '').trim())
  };

  /* ------------------------------------------------------------------
     Acceso a datos: API REST (Spring Boot + MySQL) con caché en memoria
     ------------------------------------------------------------------ */
  class ApiError extends Error {
    constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status || 0; }
  }

  // Todas las llamadas son síncronas (XHR bloqueante) para conservar tal cual la
  // lógica de las vistas, que lee y escribe datos de forma inmediata.
  const http = {
    async callAsync(method, url, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, {
          method, credentials: 'same-origin', signal: controller.signal,
          headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        const data = await response.json().catch(() => null);
        return { status: response.status, ok: response.ok, data };
      } catch (e) {
        throw new ApiError(e.name === 'AbortError'
          ? 'El servidor está tardando demasiado. Espera un momento e intenta nuevamente.'
          : 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.', 0);
      } finally { clearTimeout(timer); }
    },
    call(method, url, body) {
      const x = new XMLHttpRequest();
      x.open(method, url, false);
      x.setRequestHeader('Accept', 'application/json');
      if (body !== undefined) x.setRequestHeader('Content-Type', 'application/json');
      try { x.send(body === undefined ? null : JSON.stringify(body)); }
      catch (e) { throw new ApiError('No se pudo conectar con el servidor. Verifique que la aplicación esté en ejecución.', 0); }
      if (x.status === 0) throw new ApiError('No se pudo conectar con el servidor. Verifique que la aplicación esté en ejecución.', 0);
      let data = null;
      try { data = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { data = null; }
      return { status: x.status, ok: x.status >= 200 && x.status < 300, data };
    },
    must(method, url, body, fallback) {
      const r = this.call(method, url, body);
      if (!r.ok) throw new ApiError((r.data && (r.data.message || r.data.error)) || fallback || 'No se pudo completar la operación.', r.status);
      return r.data;
    }
  };

  const COLECCIONES = ['programas', 'ciclos', 'estudiantes', 'users', 'matriculas', 'pensiones', 'pagos', 'notificaciones', 'auditoria'];
  const cache = {};
  let ME = null; // usuario autenticado (sesión del servidor)
  let UNREAD = 0; // nº de notificaciones no leídas (COUNT del servidor; no se bajan todas)

  /** Carga desde el servidor los datos que el usuario actual tiene permitido ver. */
  function hydrate() {
    let r;
    try { r = http.call('GET', '/api/bootstrap'); } catch (e) { r = { ok: false, data: null }; }
    const d = r.ok && r.data ? r.data : { me: null, data: {} };
    ME = d.me || null;
    UNREAD = d.unreadCount || 0;
    COLECCIONES.forEach(c => { cache[c] = (d.data && d.data[c]) || []; });
    return r.ok;
  }

  const db = {
    all(col) { return cache[col] || (cache[col] = []); },
    find(col, id) { return this.all(col).find(x => x.id === id) || null; },
    where(col, fn) { return this.all(col).filter(fn); },
    insert(col, obj, prefix) {
      const item = { id: obj.id || uid(prefix || col.slice(0, 3)), ...obj };
      const saved = http.must('POST', `/api/data/${col}`, item, 'No se pudo guardar el registro.');
      cache[col] = this.all(col).concat([saved]);
      return saved;
    },
    insertMany(col, items) {
      if (!items.length) return [];
      const saved = http.must('POST', `/api/data/${col}/batch`, items, 'No se pudieron guardar los registros.');
      cache[col] = this.all(col).concat(saved);
      return saved;
    },
    update(col, id, patch) {
      const arr = this.all(col).slice();
      const i = arr.findIndex(x => x.id === id);
      if (i < 0) return null;
      const saved = http.must('PATCH', `/api/data/${col}/${encodeURIComponent(id)}`, patch, 'No se pudo actualizar el registro.');
      arr[i] = saved;
      cache[col] = arr;
      return saved;
    },
    reload: hydrate,
    clearCache: hydrate
  };

  /* Notificaciones: el badge usa un COUNT y la lista se pide paginada (nunca se bajan todas). */
  const notificaciones = {
    count() {
      const r = http.call('GET', '/api/notificaciones/unread-count');
      if (r.ok && r.data) UNREAD = r.data.count || 0;
      return UNREAD;
    },
    cachedCount() { return UNREAD; },
    list(page = 0, size = 20) {
      const r = http.call('GET', `/api/notificaciones?page=${page}&size=${size}`);
      return r.ok && Array.isArray(r.data) ? r.data : [];
    },
    marcarLeida(id) {
      http.must('PATCH', `/api/data/notificaciones/${encodeURIComponent(id)}`, { leida: true }, 'No se pudo marcar la notificación.');
      return this.count();
    },
    marcarTodas() {
      http.must('POST', '/api/notificaciones/mark-all-read', {}, 'No se pudieron marcar las notificaciones.');
      return this.count();
    }
  };

  /* Revisión de pagos: una sola llamada transaccional (aprobar/rechazar) en vez de 4-5. */
  function guardarPagoEnCache(saved) {
    const arr = db.all('pagos').slice();
    const i = arr.findIndex(x => x.id === saved.id);
    if (i >= 0) arr[i] = saved; else arr.push(saved);
    cache.pagos = arr;
    return saved;
  }
  const revisionPagos = {
    aprobar(id) {
      return guardarPagoEnCache(http.must('POST', `/api/pagos/${encodeURIComponent(id)}/aprobar`, {}, 'No se pudo aprobar el pago.'));
    },
    rechazar(id, motivo) {
      return guardarPagoEnCache(http.must('POST', `/api/pagos/${encodeURIComponent(id)}/rechazar`, { motivo }, 'No se pudo rechazar el pago.'));
    },
    registrarCaja(datos) {
      return guardarPagoEnCache(http.must('POST', '/api/pagos/registrar-caja', datos, 'No se pudo registrar el pago en caja.'));
    }
  };

  /* Registro de matrícula: una sola llamada; luego refresca la caché (cambiaron varias colecciones). */
  const registroMatriculas = {
    registrar(datos) {
      const saved = http.must('POST', '/api/matriculas/registrar', datos, 'No se pudo registrar la matrícula.');
      hydrate();
      return saved;
    }
  };

  /* Registro de estudiante: una sola llamada (crea ficha + cuenta); luego refresca la caché. */
  const registroEstudiantes = {
    registrar(datos) {
      const saved = http.must('POST', '/api/estudiantes/registrar', datos, 'No se pudo registrar el estudiante.');
      hydrate();
      return saved;
    }
  };

  const nextCounter = name =>
    http.must('POST', `/api/counters/${encodeURIComponent(name)}/next`, undefined, 'No se pudo generar el correlativo.').value;

  /* ------------------------------------------------------------------
     Comprobante simulado (SVG) para los datos semilla
     ------------------------------------------------------------------ */
  function fakeVoucher(metodo, monto, op, fecha, nombre) {
    const color = metodo === 'Yape' ? '#742284' : metodo === 'Plin' ? '#00A9B5' : '#1E3A8A';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560">
<rect width="360" height="560" rx="26" fill="#ffffff"/>
<path d="M0 26A26 26 0 0 1 26 0h308a26 26 0 0 1 26 26v150H0z" fill="${color}"/>
<text x="180" y="72" font-family="Arial,Helvetica" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">${esc(metodo)}</text>
<text x="180" y="108" font-family="Arial,Helvetica" font-size="15" fill="#fff" fill-opacity=".85" text-anchor="middle">¡Pago realizado con éxito!</text>
<circle cx="180" cy="176" r="36" fill="#10B981" stroke="#fff" stroke-width="6"/>
<path d="M163 177l12 12 22-24" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="180" y="270" font-family="Arial,Helvetica" font-size="42" font-weight="700" fill="#0F172A" text-anchor="middle">S/ ${Number(monto).toFixed(2)}</text>
<text x="180" y="300" font-family="Arial,Helvetica" font-size="14" fill="#64748B" text-anchor="middle">Destino: ${esc(ACADEMIA.titular)}</text>
<line x1="30" y1="330" x2="330" y2="330" stroke="#E2E8F0" stroke-dasharray="6 6"/>
<text x="30" y="368" font-family="Arial,Helvetica" font-size="14" fill="#64748B">Nº de operación</text>
<text x="330" y="368" font-family="Arial,Helvetica" font-size="14" font-weight="700" fill="#0F172A" text-anchor="end">${esc(op)}</text>
<text x="30" y="404" font-family="Arial,Helvetica" font-size="14" fill="#64748B">Fecha</text>
<text x="330" y="404" font-family="Arial,Helvetica" font-size="14" font-weight="700" fill="#0F172A" text-anchor="end">${esc(fecha)}</text>
<text x="30" y="440" font-family="Arial,Helvetica" font-size="14" fill="#64748B">Enviado por</text>
<text x="330" y="440" font-family="Arial,Helvetica" font-size="14" font-weight="700" fill="#0F172A" text-anchor="end">${esc(nombre)}</text>
<rect x="30" y="476" width="300" height="50" rx="14" fill="#F1F5F9"/>
<text x="180" y="507" font-family="Arial,Helvetica" font-size="13" fill="#475569" text-anchor="middle">Constancia digital · Comprobante simulado</text>
</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ------------------------------------------------------------------
     Reglas financieras
     ------------------------------------------------------------------ */
  const finance = {
    /** Información calculada de una obligación (pensión / matrícula). */
    info(p, pagosAll) {
      const pagos = (pagosAll || db.all('pagos')).filter(x => x.pensionId === p.id);
      const abonado = sum(pagos.filter(x => x.estado === 'Aprobado'), x => x.monto);
      const enRevision = sum(pagos.filter(x => x.estado === 'Pendiente'), x => x.monto);
      const descuento = round2(p.descuento || 0);
      const exigible = round2(Math.max(0, p.importe - descuento));
      // Saldo pendiente = Importe exigible - (Abonos aprobados + Descuentos)
      const saldo = round2(Math.max(0, p.importe - (abonado + descuento)));
      let estado;
      if (p.anulada) estado = 'Anulada';
      else if (saldo <= 0) estado = 'Pagada';
      else if (p.fechaVencimiento < today()) estado = 'Vencida';
      else if (abonado > 0) estado = 'Parcial';
      else estado = 'Pendiente';
      const disponible = p.anulada ? 0 : round2(Math.max(0, saldo - enRevision));
      const diasAtraso = estado === 'Vencida' ? daysBetween(p.fechaVencimiento, today()) : 0;
      return { ...p, abonado, enRevision, descuento, exigible, saldo, disponible, estado, diasAtraso, nPagos: pagos.length };
    },
    pensionesDe(estId, pagosAll) {
      const pagos = pagosAll || db.all('pagos');
      return db.where('pensiones', p => p.estudianteId === estId)
        .map(p => finance.info(p, pagos))
        .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || (a.numeroCuota || 0) - (b.numeroCuota || 0));
    },
    resumen(estId) {
      const pagosAll = db.all('pagos');
      const pens = finance.pensionesDe(estId, pagosAll).filter(p => !p.anulada);
      const pagos = pagosAll.filter(p => p.estudianteId === estId);
      const t = today();
      const mats = db.where('matriculas', m => m.estudianteId === estId).sort((a, b) => b.fecha.localeCompare(a.fecha));
      return {
        pensiones: pens,
        pagos,
        totalPagado: sum(pagos.filter(p => p.estado === 'Aprobado'), p => p.monto),
        enRevision: sum(pagos.filter(p => p.estado === 'Pendiente'), p => p.monto),
        exigible: sum(pens, p => p.exigible),
        saldo: sum(pens, p => p.saldo),
        vencidas: pens.filter(p => p.estado === 'Vencida'),
        montoVencido: sum(pens.filter(p => p.estado === 'Vencida'), p => p.saldo),
        proximo: pens.filter(p => p.saldo > 0 && p.fechaVencimiento >= t)[0] || null,
        cuotasPagadas: pens.filter(p => p.estado === 'Pagada').length,
        cuotasTotal: pens.length,
        matriculaActiva: mats.find(m => m.estado === 'Activa') || null,
        matriculas: mats
      };
    },
    /** Genera las obligaciones de una matrícula: concepto matrícula + cronograma de pensiones. */
    generarObligaciones(mat, ciclo, opts = {}) {
      const out = [];
      const start = parseDate(ciclo.fechaInicio);
      const base = { matriculaId: mat.id, estudianteId: mat.estudianteId, cicloId: ciclo.id, descuento: 0, motivoDescuento: '', fechaCreacion: nowISO(), anulada: false };
      if (opts.matricula !== false) {
        const venc = mat.fecha > ciclo.fechaInicio ? addDays(mat.fecha, 3) : ciclo.fechaInicio;
        out.push({ id: uid('pen'), ...base, tipo: 'Matrícula', concepto: `Matrícula ${ciclo.nombre}`, numeroCuota: 0, importe: round2(mat.montoMatricula ?? ciclo.matricula), fechaVencimiento: venc });
      }
      if (opts.pensiones !== false) {
        const cuotas = Number(opts.cuotas || ciclo.cuotas);
        const dia = Math.min(28, Math.max(1, Number(opts.dia || 15)));
        const importe = round2(opts.importe ?? ciclo.pension);
        for (let i = 0; i < cuotas; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, dia);
          out.push({ id: uid('pen'), ...base, tipo: 'Pensión', concepto: `Pensión ${i + 1}/${cuotas} · ${MESES[d.getMonth()]}`, numeroCuota: i + 1, importe, fechaVencimiento: toISO(d) });
        }
      }
      return out;
    },
    nuevoRecibo: () => 'R-' + pad(nextCounter('recibo'), 6)
  };

  /* ------------------------------------------------------------------
     Datos de demostración (los carga el servidor desde seed/seed.json)
     ------------------------------------------------------------------ */
  function resetDemo() {
    http.must('POST', '/api/demo/reset', undefined, 'No se pudieron restablecer los datos de demostración.');
    hydrate();
  }

  /* ------------------------------------------------------------------
     Autenticación (sesión del servidor) y control de roles
     ------------------------------------------------------------------ */
  const auth = {
    async login(username, password, rolEsperado) {
      let r;
      try { r = await http.callAsync('POST', '/api/auth/login', { username, password, rol: rolEsperado || null }); }
      catch (e) { return { ok: false, error: e.message }; }
      if (r.ok && r.data && r.data.ok) { ME = r.data.user; return { ok: true, user: r.data.user }; }
      return { ok: false, error: (r.data && (r.data.error || r.data.message)) || 'No se pudo iniciar sesión.' };
    },
    changePassword(actual, nueva) {
      let r;
      try { r = http.call('POST', '/api/auth/change-password', { actual, nueva }); }
      catch (e) { return { ok: false, error: e.message }; }
      if (r.ok && r.data && r.data.ok) return { ok: true };
      return { ok: false, error: (r.data && (r.data.error || r.data.message)) || 'No se pudo cambiar la contraseña.' };
    },
    current() { return ME && ME.activo !== false ? ME : null; },
    logout() {
      try { http.call('POST', '/api/auth/logout'); } catch (e) { /* sin conexión: se cierra igual en el cliente */ }
      ME = null;
      location.href = 'index.html';
    },
    home: u => (u.rol === 'admin' ? 'admin.html' : 'usuario.html'),
    require(rol) {
      const u = this.current();
      if (!u) { location.replace('index.html'); return null; }
      if (u.rol !== rol) { location.replace(this.home(u)); return null; }
      return u;
    }
  };

  /* ------------------------------------------------------------------
     Auditoría y notificaciones
     ------------------------------------------------------------------ */
  function audit(accion, modulo, motivo = '') {
    const u = auth.current();
    db.insert('auditoria', { fecha: nowISO(), adminId: u?.id || null, admin: u?.nombre || 'Sistema', accion, modulo, motivo }, 'aud');
  }
  function notify(userId, { titulo, mensaje, tipo = 'info', link = '', ref = '' }) {
    return db.insert('notificaciones', { userId, titulo, mensaje, tipo, fecha: nowISO(), leida: false, link, ref }, 'ntf');
  }
  function notifyEstudiante(estudianteId, payload) {
    db.where('users', u => u.rol === 'user' && u.estudianteId === estudianteId).forEach(u => notify(u.id, payload));
  }

  /* ------------------------------------------------------------------
     UI: toasts, diálogos, modales, componentes
     ------------------------------------------------------------------ */
  const SWAL_CLASSES = { popup: 'pt-swal', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-secondary', denyButton: 'btn btn-danger', actions: 'pt-swal-actions' };
  const BADGES = {
    Activa: ['success', 'fa-circle-check'], Activo: ['success', 'fa-circle-check'], Pagada: ['success', 'fa-circle-check'], Aprobado: ['success', 'fa-circle-check'],
    Inactiva: ['neutral', 'fa-circle-minus'], Inactivo: ['neutral', 'fa-circle-minus'], Anulada: ['neutral', 'fa-ban'],
    Pendiente: ['warning', 'fa-clock'], Parcial: ['info', 'fa-circle-half-stroke'], Vencida: ['danger', 'fa-triangle-exclamation'],
    Rechazado: ['danger', 'fa-circle-xmark'], 'En revisión': ['info', 'fa-hourglass-half'],
    Administrador: ['primary', 'fa-user-shield'], Estudiante: ['info', 'fa-user-graduate'], Apoderado: ['violet', 'fa-people-roof']
  };

  const UI = {
    toast(msg, icon = 'success') {
      if (!global.Swal) return alert(msg);
      Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3200, timerProgressBar: true, customClass: { popup: 'pt-toast' } })
        .fire({ icon, title: msg });
    },
    alert(title, text = '', icon = 'info', html) {
      return Swal.fire({ title, text, html, icon, confirmButtonText: 'Entendido', buttonsStyling: false, customClass: SWAL_CLASSES });
    },
    async confirm({ title, text = '', html, icon = 'question', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
      const r = await Swal.fire({
        title, text, html, icon, showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: cancelText,
        reverseButtons: true, buttonsStyling: false, focusCancel: danger,
        customClass: { ...SWAL_CLASSES, confirmButton: danger ? 'btn btn-danger' : 'btn btn-primary' }
      });
      return r.isConfirmed;
    },
    /** Diálogo con motivo obligatorio (y checkbox opcional). Devuelve {motivo, checked} o null. */
    async reason({ title, text = '', placeholder = 'Describa el motivo…', confirmText = 'Confirmar', danger = false, icon = 'warning', checkbox = null }) {
      const r = await Swal.fire({
        title, icon,
        html: `${text ? `<p class="swal-text">${text}</p>` : ''}<textarea id="sw-reason" class="textarea" rows="3" placeholder="${esc(placeholder)}"></textarea>
               ${checkbox ? `<label class="check mt-3" style="justify-content:flex-start;text-align:left"><input type="checkbox" id="sw-check" ${checkbox.checked ? 'checked' : ''}><span>${checkbox.label}</span></label>` : ''}`,
        showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'Cancelar', reverseButtons: true,
        buttonsStyling: false, focusConfirm: false,
        customClass: { ...SWAL_CLASSES, confirmButton: danger ? 'btn btn-danger' : 'btn btn-primary' },
        didOpen: () => document.getElementById('sw-reason').focus(),
        preConfirm: () => {
          const v = document.getElementById('sw-reason').value.trim();
          if (v.length < 5) { Swal.showValidationMessage('Ingrese un motivo válido (mínimo 5 caracteres).'); return false; }
          return { motivo: v, checked: !!document.getElementById('sw-check')?.checked };
        }
      });
      return r.isConfirmed ? r.value : null;
    },
    openModal({ title, subtitle = '', icon = 'fa-pen-to-square', body = '', footer = '', size = 'md' }) {
      UI.closeModal(true);
      const root = document.createElement('div');
      root.id = 'pt-modal';
      root.className = 'modal-overlay';
      root.innerHTML = `
        <div class="modal-panel modal-${size}" role="dialog" aria-modal="true" aria-labelledby="pt-modal-title">
          <div class="modal-header">
            <div class="flex items-center gap-3 min-w-0">
              <div class="modal-icon"><i class="fa-solid ${icon}"></i></div>
              <div class="min-w-0"><h3 id="pt-modal-title" class="modal-title">${title}</h3>${subtitle ? `<p class="modal-subtitle truncate">${subtitle}</p>` : ''}</div>
            </div>
            <button class="btn-icon" data-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>`;
      document.body.appendChild(root);
      document.body.classList.add('modal-open');
      requestAnimationFrame(() => root.classList.add('show'));
      root.addEventListener('mousedown', e => { if (e.target === root) UI.closeModal(); });
      root.addEventListener('click', e => { if (e.target.closest('[data-close]')) UI.closeModal(); });
      setTimeout(() => root.querySelector('.modal-body input:not([type=hidden]):not([readonly]):not([disabled]), .modal-body select:not([disabled])')?.focus(), 80);
      return root;
    },
    closeModal(immediate = false) {
      const m = document.getElementById('pt-modal');
      if (!m) return;
      document.body.classList.remove('modal-open');
      if (immediate) { m.remove(); return; }
      m.classList.remove('show');
      setTimeout(() => m.remove(), 200);
    },
    badge(estado, label) {
      const [t, i] = BADGES[estado] || ['neutral', 'fa-circle'];
      return `<span class="badge badge-${t}"><i class="fa-solid ${i}"></i>${esc(label || estado)}</span>`;
    },
    method(metodo) {
      const cls = { Yape: 'yape', Plin: 'plin', Efectivo: 'efectivo', Transferencia: 'transfer' }[metodo] || 'transfer';
      const ic = { Yape: 'Y', Plin: 'P', Efectivo: '<i class="fa-solid fa-money-bill-wave"></i>', Transferencia: '<i class="fa-solid fa-building-columns"></i>' }[metodo] || '•';
      return `<span class="method-chip"><span class="method-dot ${cls}">${ic}</span>${esc(metodo)}</span>`;
    },
    empty(msg = 'No hay registros para mostrar.', icon = 'fa-inbox', action = '') {
      return `<div class="empty"><div class="empty-icon"><i class="fa-solid ${icon}"></i></div><p class="font-semibold text-slate-700">${msg}</p>${action ? `<div class="mt-4">${action}</div>` : ''}</div>`;
    },
    kpi({ icon, label, value, hint = '', tone = 'navy' }) {
      return `<div class="kpi kpi-${tone}"><div class="kpi-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="min-w-0 flex-1"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p>${hint ? `<p class="kpi-hint">${hint}</p>` : ''}</div></div>`;
    },
    pageHeader(title, desc = '', actions = '') {
      return `<div class="page-head"><div><h2 class="page-title">${title}</h2>${desc ? `<p class="page-desc">${desc}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
    },
    /** Tabla responsive: en móvil se transforma en tarjetas usando data-label. */
    table({ cols, rows, foot = '', cls = '' }) {
      const strip = s => String(s).replace(/<[^>]*>/g, '').trim();
      return `<div class="table-wrap"><table class="table table-responsive ${cls}">
        <thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${c.label}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => {
          const cells = Array.isArray(r) ? r : r.cells;
          return `<tr ${Array.isArray(r) ? '' : (r.attrs || '')}>${cells.map((cell, i) => `<td data-label="${esc(strip(cols[i]?.label || ''))}" class="${cols[i]?.cls || ''}">${cell}</td>`).join('')}</tr>`;
        }).join('')}</tbody>${foot}</table></div>`;
    },
    progress(pct) { const p = Math.max(0, Math.min(100, Math.round(pct || 0))); return `<div class="progress"><span style="width:${p}%"></span></div>`; },
    /** Convierte una imagen a base64 comprimida para reducir el tamaño de la subida. */
    fileToDataURL(file, maxW = 1000, quality = 0.72) {
      return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return reject(new Error('El archivo debe ser una imagen (JPG, PNG o WEBP).'));
        if (file.size > 6 * 1024 * 1024) return reject(new Error('La imagen supera el tamaño máximo de 6 MB.'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.onload = () => {
          if (file.type === 'image/svg+xml' || file.type === 'image/gif') return resolve(reader.result);
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, maxW / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => reject(new Error('La imagen no es válida.'));
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },
    viewImage(src, title = 'Comprobante') {
      Swal.fire({ title, imageUrl: src, imageAlt: title, showCloseButton: true, showConfirmButton: false, customClass: { popup: 'pt-swal pt-swal-image' } });
    },
    download(filename, content, mime = 'text/plain;charset=utf-8') {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    printHTML(title, html) {
      const w = window.open('', '_blank', 'width=820,height=900');
      if (!w) return UI.toast('Habilite las ventanas emergentes para imprimir.', 'warning');
      const css = new URL('css/styles.css', location.href).href;
      w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
        <link rel="stylesheet" href="${css}"></head><body class="print-body">${html}
        <script>window.onload=function(){setTimeout(function(){window.print();},450);};<\/script></body></html>`);
      w.document.close();
    }
  };

  /* ------------------------------------------------------------------
     Documentos: recibo interno (no tributario)
     ------------------------------------------------------------------ */
  const docs = {
    recibo(pagoId) {
      const pg = db.find('pagos', pagoId);
      if (!pg) return '';
      const pen = db.find('pensiones', pg.pensionId);
      const est = db.find('estudiantes', pg.estudianteId);
      const c = pen && db.find('ciclos', pen.cicloId);
      const pr = c && db.find('programas', c.programaId);
      const row = (k, v) => `<div class="receipt-row"><span>${k}</span><span>${v}</span></div>`;
      return `<div class="receipt">
        <div class="receipt-head">
          <div class="flex items-center gap-3">${LOGO_SVG(44, 'rcp')}<div><p class="font-extrabold text-lg leading-tight">PLUSTWENTY</p><p class="text-xs opacity-80">${esc(ACADEMIA.direccion)}</p></div></div>
          <div class="text-right"><p class="text-[11px] uppercase tracking-widest opacity-80">Recibo interno</p><p class="font-extrabold text-xl">${esc(pg.reciboNumero || '—')}</p></div>
        </div>
        <div class="receipt-body">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div><p class="text-xs uppercase tracking-wider text-slate-500 font-bold">Recibido de</p><p class="font-bold text-base">${esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</p><p class="text-sm text-slate-500">DNI ${esc(est?.dni || '—')} · ${esc(est?.codigo || '')}</p></div>
            <span class="stamp">PAGADO</span>
          </div>
          ${row('Programa / Ciclo', esc(pr ? `${pr.nombre} (${pr.siglas}) · ${c.nombre}` : '—'))}
          ${row('Concepto', esc(pen?.concepto || '—'))}
          ${row('Método de pago', esc(pg.metodo))}
          ${row('N° de operación', esc(pg.numeroOperacion))}
          ${row('Fecha de pago', fmtDate(pg.fechaPago))}
          ${row('Verificado por', esc(pg.revisadoPor || '—'))}
          ${row('Fecha de verificación', fmtDateTime(pg.fechaRevision))}
          <div class="receipt-total"><span>Total recibido</span><span>${money(pg.monto)}</span></div>
        </div>
        <div class="receipt-foot">Documento interno de control — <strong>no constituye comprobante de pago tributario</strong> (SUNAT).<br>${esc(ACADEMIA.nombre)} · RUC ${ACADEMIA.ruc} · ${esc(ACADEMIA.telefono)}</div>
      </div>`;
    },
    printRecibo(pagoId) {
      const pg = db.find('pagos', pagoId);
      UI.printHTML(`Recibo ${pg?.reciboNumero || ''}`, docs.recibo(pagoId));
    }
  };

  const LOGO_SVG = (size = 40) => `<img src="images/logo.png" alt="Plus Twenty · Academia Preuniversitaria" style="height:${size}px;width:auto;display:block;border-radius:${Math.max(4, Math.round(size * 0.08))}px" />`;

  /* ------------------------------------------------------------------
     Shell SPA (sidebar + router por hash)
     ------------------------------------------------------------------ */
  const Shell = {
    views: {}, current: null, charts: [], defaultView: null, onRender: null,
    init({ views, defaultView, user, onRender }) {
      this.views = views; this.defaultView = defaultView; this.onRender = onRender;
      const roleLabel = user.rol === 'admin' ? 'Administrador' : (user.tipo || 'Estudiante');
      document.querySelectorAll('[data-user-name]').forEach(el => (el.textContent = user.nombre));
      document.querySelectorAll('[data-user-initials]').forEach(el => (el.textContent = initials(user.nombre)));
      document.querySelectorAll('[data-user-role]').forEach(el => (el.textContent = roleLabel));
      document.querySelectorAll('[data-today]').forEach(el => (el.textContent = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
      document.querySelectorAll('[data-logo]').forEach((el, i) => (el.innerHTML = LOGO_SVG(+el.dataset.logo || 40, 'sh' + i)));

      document.addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (go) {
          e.preventDefault();
          const [v, q] = go.dataset.go.split('?');
          this.go(v, Object.fromEntries(new URLSearchParams(q || '')));
          return;
        }
        if (e.target.closest('[data-logout]')) {
          e.preventDefault();
          UI.confirm({ title: '¿Cerrar sesión?', text: 'Saldrá del sistema PLUSTWENTY.', icon: 'question', confirmText: 'Sí, salir' })
            .then(ok => ok && auth.logout());
        }
        if (e.target.closest('[data-sidebar-toggle]')) this.toggleSidebar();
        if (e.target.closest('#sidebar-overlay')) this.closeSidebar();
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { UI.closeModal(); this.closeSidebar(); } });
      window.addEventListener('hashchange', () => {
        // Antes se hacía hydrate() (bootstrap completo) en CADA cambio de pestaña: lento y pesado.
        // Ahora solo re-renderizamos desde la caché, que ya se mantiene al día con las escrituras
        // del propio usuario. Para ver cambios hechos por otros, recargar la página.
        if (!ME) { location.replace('index.html'); return; }
        this.render();
      });
      if (global.Chart) {
        Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
        Chart.defaults.color = '#64748B';
      }
      this.render();
    },
    parse() {
      const h = location.hash.replace(/^#\/?/, '');
      const [v, q] = h.split('?');
      return { view: this.views[v] ? v : this.defaultView, params: Object.fromEntries(new URLSearchParams(q || '')) };
    },
    go(view, params = {}) {
      const q = new URLSearchParams(params).toString();
      const h = '#' + view + (q ? '?' + q : '');
      if (location.hash === h) this.render(); else location.hash = h;
    },
    render() {
      const { view, params } = this.parse();
      const v = this.views[view];
      this.destroyCharts();
      UI.closeModal(true);
      this.current = view;
      document.querySelectorAll('[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
      const t = document.getElementById('page-title'); if (t) t.textContent = v.title;
      const s = document.getElementById('page-subtitle'); if (s) s.textContent = v.subtitle || '';
      document.title = `${v.title} · PLUSTWENTY`;
      const root = document.getElementById('view-root');
      try {
        root.innerHTML = `<div class="view-enter">${v.render(params)}</div>`;
        v.mount && v.mount(params, root);
      } catch (err) {
        console.error(err);
        root.innerHTML = UI.empty('Ocurrió un error al cargar esta sección.', 'fa-bug');
      }
      this.closeSidebar();
      window.scrollTo(0, 0);
      this.onRender && this.onRender(view);
    },
    refresh() {
      const y = window.scrollY;
      this.render();
      window.scrollTo(0, y);
    },
    chart(id, cfg) {
      const el = document.getElementById(id);
      if (!el || !global.Chart) return null;
      const c = new Chart(el, cfg);
      this.charts.push(c);
      return c;
    },
    destroyCharts() { this.charts.forEach(c => c.destroy()); this.charts = []; },
    toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); document.getElementById('sidebar-overlay')?.classList.toggle('show'); },
    closeSidebar() { document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebar-overlay')?.classList.remove('show'); }
  };

  /* ------------------------------------------------------------------
     Inicialización y API pública
     ------------------------------------------------------------------ */
  // Errores de la API: se muestran en una alerta (o se redirige al login si la sesión expiró)
  const mostrarErrorApi = err => {
    if (!(err instanceof ApiError)) return false;
    const enLogin = !!document.getElementById('login-form');
    if (err.status === 401 && !enLogin) { location.replace('index.html'); return true; }
    if (global.Swal) Swal.fire({ icon: 'error', title: 'No se pudo completar la operación', text: err.message, confirmButtonText: 'Entendido' });
    else alert(err.message);
    return true;
  };
  window.addEventListener('error', e => { if (mostrarErrorApi(e.error)) e.preventDefault(); });
  window.addEventListener('unhandledrejection', e => { if (mostrarErrorApi(e.reason)) e.preventDefault(); });

  // La pantalla de acceso no necesita descargar las colecciones antes de entrar.
  if (!document.getElementById('login-form')) hydrate();

  global.PT = {
    ACADEMIA, MESES, LOGO_SVG,
    db, finance, auth, audit, notify, notifyEstudiante, nextCounter, notificaciones, revisionPagos, registroMatriculas, registroEstudiantes,
    UI, Shell, docs, validators, resetDemo, fakeVoucher,
    fmt: { money, date: fmtDate, dateTime: fmtDateTime, timeAgo, esc, initials, today, nowISO, addDays, daysBetween, round2, sum, parseDate, toISO, pad, norm, debounce, uid, randomPassword, MESES }
  };
})(window);
