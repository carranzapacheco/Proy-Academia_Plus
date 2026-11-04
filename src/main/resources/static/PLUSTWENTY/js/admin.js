/* =====================================================================
   PLUSTWENTY · admin.js
   Lógica del panel de administración (9 módulos completos SPA):
   1. Dashboard (KPIs globales, gráficos Chart.js, últimos pagos)
   2. Gestión de Matrículas (CRUD, filtros, activación/desactivación, obligaciones)
   3. Gestión de Estudiantes (CRUD sin eliminación, búsqueda, modal 360°)
   4. Gestión de Pensiones (cronogramas de pago, cuotas individuales, descuentos, vencimientos)
   5. Verificación de Pagos (aprobar, rechazar con motivo, caja en efectivo, visor)
   6. Reportes (ingresos, morosidad, matrículas; exportación Excel y print PDF)
   7. Gestión de Usuarios y Roles (creación, vinculación, reseteo de claves)
   8. Configuración Académica (ABM programas y ciclos con tarifas y cuotas)
   9. Auditoría (logs del sistema de solo lectura)
   ===================================================================== */

(function () {
  'use strict';

  const { db, finance, auth, audit, notifyEstudiante, UI, Shell, docs, fmt, validators } = window.PT;
  const admin = auth.require('admin');
  if (!admin) return;

  /* Helper para badges en sidebar y topbar */
  function updatePendingBadge() {
    const pendientes = db.where('pagos', p => p.estado === 'Pendiente').length;
    const txt = pendientes > 0 ? String(pendientes) : '';
    const elSide = document.getElementById('nav-badge-pagos');
    const elTop = document.getElementById('top-badge-pagos');
    if (elSide) elSide.textContent = txt;
    if (elTop) elTop.textContent = txt;
  }

  /* ------------------------------------------------------------------
     1. DASHBOARD
     ------------------------------------------------------------------ */
  const DashboardView = {
    title: 'Dashboard General',
    subtitle: 'Resumen financiero, métricas académicas y operaciones en curso',
    render() {
      const estudiantes = db.all('estudiantes');
      const matriculas = db.all('matriculas');
      const matriculasActivas = matriculas.filter(m => m.estado === 'Activa').length;
      const pagos = db.all('pagos');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);

      // Ingresos confirmados (pagos aprobados)
      const totalIngresos = fmt.sum(pagos.filter(p => p.estado === 'Aprobado'), p => p.monto);

      // Pagos reportados pendientes de validación
      const pagosPendientes = pagos.filter(p => p.estado === 'Pendiente');
      const totalEnRevision = fmt.sum(pagosPendientes, p => p.monto);

      // Saldo total pendiente por cobrar (según regla de negocio)
      const saldoTotalPendiente = fmt.sum(pensiones, p => {
        const inf = finance.info(p, pagos);
        return inf.saldo;
      });

      // Morosidad
      const vencidas = pensiones.map(p => finance.info(p, pagos)).filter(p => p.estado === 'Vencida');
      const montoVencido = fmt.sum(vencidas, p => p.saldo);

      // Últimos 5 pagos reportados
      const ultimosPagos = pagos.slice().sort((a, b) => b.fechaReporte.localeCompare(a.fechaReporte)).slice(0, 6);

      return `
        <div class="stagger space-y-6">
          <!-- KPIs -->
          <div class="kpi-grid">
            ${UI.kpi({ icon: 'fa-user-graduate', label: 'Estudiantes Registrados', value: estudiantes.length, hint: `${estudiantes.filter(e => e.activo).length} activos`, tone: 'navy' })}
            ${UI.kpi({ icon: 'fa-id-card-clip', label: 'Matrículas Activas', value: matriculasActivas, hint: `de ${matriculas.length} registradas`, tone: 'blue' })}
            ${UI.kpi({ icon: 'fa-circle-dollar-to-slot', label: 'Ingresos Confirmados', value: fmt.money(totalIngresos), hint: 'Pagos aprobados en caja/bancos', tone: 'green' })}
            ${UI.kpi({ icon: 'fa-hand-holding-dollar', label: 'Saldo por Cobrar', value: fmt.money(saldoTotalPendiente), hint: `${vencidas.length} cuotas vencidas (${fmt.money(montoVencido)})`, tone: 'amber' })}
          </div>

          ${pagosPendientes.length > 0 ? `
            <div class="alert alert-warning flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i class="fa-solid fa-bell text-amber-600 text-xl"></i>
                <div>
                  <p class="font-bold">Hay ${pagosPendientes.length} pago(s) reportados por Yape/Plin pendientes de revisión (${fmt.money(totalEnRevision)})</p>
                  <p class="text-xs text-amber-800">Recuerde que no reducen la deuda ni ingresan a finanzas hasta ser aprobados.</p>
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-go="pagos">Revisar ahora</button>
            </div>
          ` : ''}

          <!-- Gráficos -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="card lg:col-span-2">
              <div class="card-head">
                <div>
                  <h3 class="card-title"><i class="fa-solid fa-chart-column"></i> Recaudación por Programa Académico</h3>
                  <p class="card-sub">Comparación entre ingresos cobrados vs saldo pendiente</p>
                </div>
              </div>
              <div class="relative h-72">
                <canvas id="chart-programas"></canvas>
              </div>
            </div>

            <div class="card">
              <div class="card-head">
                <div>
                  <h3 class="card-title"><i class="fa-solid fa-chart-pie"></i> Estado de Pensiones</h3>
                  <p class="card-sub">Distribución del cronograma 2026</p>
                </div>
              </div>
              <div class="relative h-72 flex items-center justify-center">
                <canvas id="chart-estados"></canvas>
              </div>
            </div>
          </div>

          <!-- Tabla de Últimos Pagos -->
          <div class="card">
            <div class="card-head">
              <div>
                <h3 class="card-title"><i class="fa-solid fa-bolt"></i> Últimos Pagos Reportados</h3>
                <p class="card-sub">Acción rápida para auditar o verificar comprobantes</p>
              </div>
              <button class="btn btn-secondary btn-sm" data-go="pagos">Ver todos los pagos</button>
            </div>
            ${ultimosPagos.length === 0 ? UI.empty('No hay pagos registrados.') : UI.table({
              cols: [
                { label: 'Fecha' },
                { label: 'Estudiante' },
                { label: 'Método' },
                { label: 'N° Operación' },
                { label: 'Monto', cls: 'num' },
                { label: 'Estado' },
                { label: 'Acción', cls: 'nowrap text-right' }
              ],
              rows: ultimosPagos.map(p => {
                const est = db.find('estudiantes', p.estudianteId);
                return [
                  `<span class="text-xs font-semibold">${fmt.date(p.fechaPago)}</span>`,
                  `<div><p class="font-bold text-slate-800">${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</p><p class="text-xs text-slate-400">DNI ${est?.dni || ''}</p></div>`,
                  UI.method(p.metodo),
                  `<code class="text-xs bg-slate-100 px-2 py-1 rounded">${fmt.esc(p.numeroOperacion)}</code>`,
                  `<span class="font-extrabold ${p.estado === 'Aprobado' ? 'text-emerald-600' : 'text-slate-800'}">${fmt.money(p.monto)}</span>`,
                  UI.badge(p.estado),
                  `<div class="actions">
                    ${p.comprobante ? `<button class="btn btn-secondary btn-sm" data-preview-voucher="${p.id}" title="Ver voucher"><i class="fa-solid fa-image"></i></button>` : ''}
                    ${p.estado === 'Pendiente' ? `
                      <button class="btn btn-success btn-sm" data-quick-approve="${p.id}" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                      <button class="btn btn-danger btn-sm" data-quick-reject="${p.id}" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                    ` : ''}
                    ${p.estado === 'Aprobado' ? `<button class="btn btn-secondary btn-sm" data-print-recibo="${p.id}" title="Imprimir recibo"><i class="fa-solid fa-print"></i></button>` : ''}
                  </div>`
                ];
              })
            })}
          </div>
        </div>
      `;
    },
    mount(params, root) {
      // Gráfico de programas
      const programas = db.all('programas');
      const matriculas = db.all('matriculas');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);
      const pagos = db.all('pagos');

      const labels = [];
      const dataCobrado = [];
      const dataPendiente = [];

      programas.forEach(prg => {
        labels.push(prg.siglas || prg.nombre);
        const matsPrg = matriculas.filter(m => m.programaId === prg.id).map(m => m.id);
        const pensPrg = pensiones.filter(p => matsPrg.includes(p.matriculaId));
        let cobrado = 0;
        let pendiente = 0;
        pensPrg.forEach(pen => {
          const inf = finance.info(pen, pagos);
          cobrado += inf.abonado;
          pendiente += inf.saldo;
        });
        dataCobrado.push(cobrado);
        dataPendiente.push(pendiente);
      });

      Shell.chart('chart-programas', {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Cobrado (Aprobado)', data: dataCobrado, backgroundColor: '#10B981', borderRadius: 8 },
            { label: 'Saldo Pendiente', data: dataPendiente, backgroundColor: '#3B82F6', borderRadius: 8 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: v => 'S/ ' + v } }
          }
        }
      });

      // Gráfico de estado de pensiones
      const todasInfo = pensiones.map(p => finance.info(p, pagos));
      const nPagadas = todasInfo.filter(p => p.estado === 'Pagada').length;
      const nParciales = todasInfo.filter(p => p.estado === 'Parcial').length;
      const nPendientes = todasInfo.filter(p => p.estado === 'Pendiente').length;
      const nVencidas = todasInfo.filter(p => p.estado === 'Vencida').length;

      Shell.chart('chart-estados', {
        type: 'doughnut',
        data: {
          labels: ['Pagadas', 'Parciales', 'Pendientes', 'Vencidas'],
          datasets: [{
            data: [nPagadas, nParciales, nPendientes, nVencidas],
            backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          cutout: '68%'
        }
      });

      // Eventos de botones rápidos
      root.addEventListener('click', async e => {
        const btnV = e.target.closest('[data-preview-voucher]');
        if (btnV) {
          const pg = db.find('pagos', btnV.dataset.previewVoucher);
          if (pg?.comprobante) UI.viewImage(pg.comprobante, `Comprobante Op. ${pg.numeroOperacion}`);
          return;
        }
        const btnA = e.target.closest('[data-quick-approve]');
        if (btnA) {
          await Actions.aprobarPago(btnA.dataset.quickApprove);
          Shell.refresh();
          return;
        }
        const btnR = e.target.closest('[data-quick-reject]');
        if (btnR) {
          await Actions.rechazarPago(btnR.dataset.quickReject);
          Shell.refresh();
          return;
        }
        const btnP = e.target.closest('[data-print-recibo]');
        if (btnP) {
          docs.printRecibo(btnP.dataset.printRecibo);
        }
      });
    }
  };

  /* Acciones compartidas de pagos (utilizadas en Dashboard y Verificación de Pagos) */
  const Actions = {
    async aprobarPago(pagoId) {
      const pg = db.find('pagos', pagoId);
      if (!pg) return;
      const pen = db.find('pensiones', pg.pensionId);
      const est = db.find('estudiantes', pg.estudianteId);
      const ok = await UI.confirm({
        title: '¿Aprobar pago reportado?',
        html: `Se validará el abono de <b>${fmt.money(pg.monto)}</b> por método <b>${pg.metodo}</b> (Op. ${pg.numeroOperacion}) para <b>${fmt.esc(est?.nombres || '')} ${fmt.esc(est?.apellidos || '')}</b>.<br><br>Se emitirá el recibo interno y se actualizará el saldo de la obligación.`,
        confirmText: 'Sí, aprobar pago',
        icon: 'question'
      });
      if (!ok) return;

      // Una sola llamada: el servidor aprueba, emite recibo, notifica y audita en una transacción.
      const saved = window.PT.revisionPagos.aprobar(pagoId);
      UI.toast(`Pago aprobado. Recibo generado: ${saved.reciboNumero}`, 'success');
      updatePendingBadge();
    },

    async rechazarPago(pagoId) {
      const pg = db.find('pagos', pagoId);
      if (!pg) return;
      const est = db.find('estudiantes', pg.estudianteId);
      const r = await UI.reason({
        title: 'Rechazar Pago Reportado',
        text: `Indique detalladamente el motivo del rechazo del comprobante de ${fmt.money(pg.monto)} (Op: ${pg.numeroOperacion}). Este mensaje llegará al estudiante/apoderado:`,
        placeholder: 'Ejemplo: El número de operación no coincide con el voucher o el monto transferido es menor al reportado...',
        confirmText: 'Rechazar comprobante',
        danger: true,
        icon: 'warning'
      });
      if (!r || !r.motivo) return;

      // Una sola llamada: el servidor rechaza, notifica y audita en una transacción.
      window.PT.revisionPagos.rechazar(pagoId, r.motivo);
      UI.toast('Pago rechazado y notificado al estudiante', 'info');
      updatePendingBadge();
    }
  };

  /* ------------------------------------------------------------------
     2. GESTIÓN DE MATRÍCULAS
     ------------------------------------------------------------------ */
  const MatriculasView = {
    title: 'Gestión de Matrículas',
    subtitle: 'Registro de matrículas por ciclo, control de estado y generación de cronograma',
    render(params) {
      const programas = db.all('programas');
      const ciclos = db.all('ciclos');
      const matriculas = db.all('matriculas').slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      const estudiantes = db.all('estudiantes');

      const prgFiltro = params.prg || '';
      const cicFiltro = params.cic || '';
      const estFiltro = params.estado || '';
      const busqueda = (params.q || '').toLowerCase();

      const filtradas = matriculas.filter(m => {
        if (prgFiltro && m.programaId !== prgFiltro) return false;
        if (cicFiltro && m.cicloId !== cicFiltro) return false;
        if (estFiltro && m.estado !== estFiltro) return false;
        if (busqueda) {
          const est = estudiantes.find(e => e.id === m.estudianteId);
          const t = `${m.codigo} ${est?.nombres} ${est?.apellidos} ${est?.dni}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Padrón de Matrículas</h3>
              <p class="page-desc">Total registradas: ${matriculas.length} | Activas: ${matriculas.filter(m => m.estado === 'Activa').length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nueva-mat">
                <i class="fa-solid fa-plus"></i> Nueva Matrícula
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="filters" style="--fcols:3">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-mat-q" class="input" placeholder="Buscar por código, DNI o estudiante..." value="${fmt.esc(params.q || '')}">
            </div>
            <select id="filtro-mat-prg" class="select">
              <option value="">Todos los programas</option>
              ${programas.map(p => `<option value="${p.id}" ${prgFiltro === p.id ? 'selected' : ''}>${fmt.esc(p.nombre)} (${p.siglas})</option>`).join('')}
            </select>
            <select id="filtro-mat-cic" class="select">
              <option value="">Todos los ciclos</option>
              ${ciclos.map(c => `<option value="${c.id}" ${cicFiltro === c.id ? 'selected' : ''}>${fmt.esc(c.nombre)}</option>`).join('')}
            </select>
            <select id="filtro-mat-est" class="select">
              <option value="">Todos los estados</option>
              <option value="Activa" ${estFiltro === 'Activa' ? 'selected' : ''}>Activas</option>
              <option value="Inactiva" ${estFiltro === 'Inactiva' ? 'selected' : ''}>Inactivas</option>
            </select>
          </div>

          <!-- Tabla -->
          ${filtradas.length === 0 ? UI.empty('No se encontraron matrículas con los filtros aplicados.') : UI.table({
            cols: [
              { label: 'Código Matrícula' },
              { label: 'Estudiante' },
              { label: 'Programa / Ciclo' },
              { label: 'Fecha' },
              { label: 'Costo Matrícula', cls: 'num' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: filtradas.map(m => {
              const est = db.find('estudiantes', m.estudianteId);
              const cic = db.find('ciclos', m.cicloId);
              const prg = db.find('programas', m.programaId);
              const isActive = m.estado === 'Activa';

              return [
                `<span class="font-extrabold text-navy">${fmt.esc(m.codigo)}</span>`,
                `<div>
                  <a href="#estudiantes?id=${m.estudianteId}" class="font-bold text-slate-800 hover:text-brand">${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</a>
                  <p class="text-xs text-slate-400">DNI ${est?.dni || '—'}</p>
                </div>`,
                `<div>
                  <p class="font-semibold text-slate-800">${fmt.esc(prg?.nombre || '—')}</p>
                  <p class="text-xs text-slate-500">${fmt.esc(cic?.nombre || '—')} (${cic?.modalidad || ''})</p>
                </div>`,
                `<span class="text-xs font-semibold">${fmt.date(m.fecha)}</span>`,
                `<span class="font-bold">${fmt.money(m.montoMatricula)}</span>`,
                UI.badge(m.estado),
                `<div class="actions">
                  <button class="btn btn-secondary btn-sm" data-edit-mat="${m.id}" title="Editar matrícula"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="btn ${isActive ? 'btn-soft-danger' : 'btn-soft-success'} btn-sm" data-toggle-mat="${m.id}" title="${isActive ? 'Desactivar matrícula' : 'Activar matrícula'}">
                    <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i>
                    <span>${isActive ? 'Desactivar' : 'Activar'}</span>
                  </button>
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      const applyFilters = () => {
        Shell.go('matriculas', {
          q: document.getElementById('filtro-mat-q').value.trim(),
          prg: document.getElementById('filtro-mat-prg').value,
          cic: document.getElementById('filtro-mat-cic').value,
          estado: document.getElementById('filtro-mat-est').value
        });
      };

      document.getElementById('filtro-mat-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-mat-prg').addEventListener('change', applyFilters);
      document.getElementById('filtro-mat-cic').addEventListener('change', applyFilters);
      document.getElementById('filtro-mat-est').addEventListener('change', applyFilters);

      document.getElementById('btn-nueva-mat')?.addEventListener('click', () => MatriculasView.modalCrear());

      root.addEventListener('click', async e => {
        const btnEdit = e.target.closest('[data-edit-mat]');
        if (btnEdit) {
          MatrasEdit(btnEdit.dataset.editMat);
          return;
        }
        const btnToggle = e.target.closest('[data-toggle-mat]');
        if (btnToggle) {
          const mat = db.find('matriculas', btnToggle.dataset.toggleMat);
          if (!mat) return;
          const nuevoEstado = mat.estado === 'Activa' ? 'Inactiva' : 'Activa';

          const r = await UI.reason({
            title: `¿${nuevoEstado === 'Inactiva' ? 'Desactivar' : 'Activar'} matrícula ${mat.codigo}?`,
            text: `Regla de negocio: las matrículas no se eliminan para conservar la trazabilidad histórica. Ingrese el motivo de este cambio:`,
            placeholder: 'Motivo del cambio de estado (ej: Retiro voluntario, cambio de sede, reincorporación)...',
            danger: nuevoEstado === 'Inactiva',
            confirmText: `Confirmar (${nuevoEstado})`
          });
          if (!r || !r.motivo) return;

          db.update('matriculas', mat.id, {
            estado: nuevoEstado,
            observacion: r.motivo
          });

          audit(`Cambió estado de matrícula ${mat.codigo} a ${nuevoEstado}`, 'Gestión de Matrículas', `Motivo: ${r.motivo}`);
          UI.toast(`Matrícula marcada como ${nuevoEstado}`, 'success');
          Shell.refresh();
        }
      });
    },

    modalCrear() {
      const programas = db.all('programas').filter(p => p.activo);
      const ciclos = db.all('ciclos').filter(c => c.activo);
      const estudiantes = db.all('estudiantes').filter(e => e.activo);

      const html = `
        <form id="form-nueva-mat" class="space-y-4">
          <div class="field">
            <label class="label">Estudiante <span class="text-red-500">*</span></label>
            <select name="estudianteId" class="select" required>
              <option value="">Seleccione estudiante...</option>
              ${estudiantes.map(e => `<option value="${e.id}">${fmt.esc(e.nombres)} ${fmt.esc(e.apellidos)} (DNI: ${e.dni})</option>`).join('')}
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Programa Académico <span class="text-red-500">*</span></label>
              <select name="programaId" id="mat-modal-prg" class="select" required>
                <option value="">Seleccione programa...</option>
                ${programas.map(p => `<option value="${p.id}">${fmt.esc(p.nombre)} (${p.siglas})</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label">Ciclo Académico <span class="text-red-500">*</span></label>
              <select name="cicloId" id="mat-modal-cic" class="select" required>
                <option value="">Primero elija programa...</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Fecha de Matrícula</label>
              <input type="date" name="fecha" class="input" value="${fmt.today()}" required>
            </div>
            <div class="field">
              <label class="label">Monto de Matrícula (S/)</label>
              <input type="number" step="0.01" min="0" name="montoMatricula" id="mat-modal-monto" class="input" placeholder="0.00" required>
            </div>
          </div>

          <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-800 space-y-1">
            <p class="font-bold"><i class="fa-solid fa-circle-info"></i> Generación automática de obligaciones:</p>
            <p>Al confirmar la matrícula se generará automáticamente el cargo de Matrícula y el cronograma de pensiones mensuales según las cuotas definidas para el ciclo.</p>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Registrar Matrícula</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Nueva Matrícula de Estudiante',
        subtitle: 'Asignación de programa, ciclo y generación de pensiones',
        icon: 'fa-file-signature',
        body: html,
        size: 'md'
      });

      const selPrg = document.getElementById('mat-modal-prg');
      const selCic = document.getElementById('mat-modal-cic');
      const inMonto = document.getElementById('mat-modal-monto');

      selPrg.addEventListener('change', () => {
        const prgId = selPrg.value;
        const cicDisponibles = ciclos.filter(c => c.programaId === prgId);
        selCic.innerHTML = '<option value="">Seleccione ciclo...</option>' +
          cicDisponibles.map(c => `<option value="${c.id}" data-mat="${c.matricula}" data-pen="${c.pension}">${fmt.esc(c.nombre)} (${c.modalidad}) - Matrícula: S/ ${c.matricula}</option>`).join('');
      });

      selCic.addEventListener('change', () => {
        const opt = selCic.selectedOptions[0];
        if (opt && opt.dataset.mat) {
          inMonto.value = opt.dataset.mat;
        }
      });

      document.getElementById('form-nueva-mat').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const estId = fd.get('estudianteId');
        const cicloId = fd.get('cicloId');
        const programaId = fd.get('programaId');
        const fecha = fd.get('fecha');
        const monto = parseFloat(fd.get('montoMatricula')) || 0;

        const ciclo = db.find('ciclos', cicloId);
        const est = db.find('estudiantes', estId);
        if (!ciclo || !est) return;

        // Una sola llamada: el servidor crea la matrícula + cronograma, actualiza al estudiante,
        // notifica y audita en una transacción (antes eran ~6 llamadas en fila).
        const saved = window.PT.registroMatriculas.registrar({
          estudianteId: estId,
          cicloId,
          programaId,
          fecha,
          montoMatricula: monto
        });
        UI.closeModal();
        UI.toast(`Matrícula ${saved.codigo} creada exitosamente con sus pensiones`);
        Shell.refresh();
      });
    }
  };

  function MatrasEdit(matId) {
    const mat = db.find('matriculas', matId);
    if (!mat) return;
    const est = db.find('estudiantes', mat.estudianteId);
    const cic = db.find('ciclos', mat.cicloId);

    const html = `
      <form id="form-edit-mat" class="space-y-4">
        <div>
          <p class="text-sm font-bold text-slate-800">${fmt.esc(est?.nombres)} ${fmt.esc(est?.apellidos)}</p>
          <p class="text-xs text-slate-500">Matrícula: <b>${mat.codigo}</b> | Ciclo: <b>${cic?.nombre || ''}</b></p>
        </div>

        <div class="field">
          <label class="label">Fecha de Matrícula</label>
          <input type="date" name="fecha" class="input" value="${mat.fecha}" required>
        </div>

        <div class="field">
          <label class="label">Observaciones / Anotaciones</label>
          <textarea name="observacion" class="textarea" rows="3">${fmt.esc(mat.observacion || '')}</textarea>
        </div>

        <div class="modal-footer -mx-6 -mb-6 mt-6">
          <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar Cambios</button>
        </div>
      </form>
    `;

    UI.openModal({
      title: `Editar Matrícula ${mat.codigo}`,
      icon: 'fa-pen-to-square',
      body: html,
      size: 'md'
    });

    document.getElementById('form-edit-mat').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      db.update('matriculas', mat.id, {
        fecha: fd.get('fecha'),
        observacion: fd.get('observacion')
      });
      audit(`Editó matrícula ${mat.codigo}`, 'Gestión de Matrículas');
      UI.closeModal();
      UI.toast('Matrícula actualizada');
      Shell.refresh();
    });
  }

  /* ------------------------------------------------------------------
     3. GESTIÓN DE ESTUDIANTES
     ------------------------------------------------------------------ */
  const EstudiantesView = {
    title: 'Gestión de Estudiantes',
    subtitle: 'Padrón general de alumnos, expedientes académicos y resumen financiero 360°',
    render(params) {
      const estudiantes = db.all('estudiantes');
      const programas = db.all('programas');
      const ciclos = db.all('ciclos');
      const busqueda = (params.q || '').toLowerCase();
      const prgFilter = params.prg || '';
      const estadoFilter = params.estado || '';

      const filtrados = estudiantes.filter(e => {
        if (prgFilter && e.programaId !== prgFilter) return false;
        if (estadoFilter === 'activo' && !e.activo) return false;
        if (estadoFilter === 'inactivo' && e.activo) return false;
        if (busqueda) {
          const t = `${e.dni} ${e.nombres} ${e.apellidos} ${e.email} ${e.telefono} ${e.apoderado?.nombre || ''}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      filtrados.sort((a, b) => {
        const da = a.fechaRegistro ? new Date(a.fechaRegistro).getTime() : 0;
        const dbTime = b.fechaRegistro ? new Date(b.fechaRegistro).getTime() : 0;
        if (dbTime !== da) {
          return dbTime - da;
        }
        return String(b.codigo || '').localeCompare(String(a.codigo || ''));
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Padrón de Estudiantes</h3>
              <p class="page-desc">Total registrados: ${estudiantes.length} | Activos: ${estudiantes.filter(e => e.activo).length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nuevo-est">
                <i class="fa-solid fa-user-plus"></i> Registrar Estudiante
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="filters" style="--fcols:2">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-est-q" class="input" placeholder="Buscar por DNI, nombres, apellidos o apoderado..." value="${fmt.esc(params.q || '')}">
            </div>
            <select id="filtro-est-prg" class="select">
              <option value="">Todos los programas</option>
              ${programas.map(p => `<option value="${p.id}" ${prgFilter === p.id ? 'selected' : ''}>${fmt.esc(p.nombre)}</option>`).join('')}
            </select>
            <select id="filtro-est-activo" class="select">
              <option value="">Todos los estados</option>
              <option value="activo" ${estadoFilter === 'activo' ? 'selected' : ''}>Activos</option>
              <option value="inactivo" ${estadoFilter === 'inactivo' ? 'selected' : ''}>Inactivos</option>
            </select>
          </div>

          <!-- Tabla -->
          ${filtrados.length === 0 ? UI.empty('No se encontraron estudiantes.') : UI.table({
            cols: [
              { label: 'DNI / Código' },
              { label: 'Estudiante' },
              { label: 'Programa Actual' },
              { label: 'Contacto' },
              { label: 'Apoderado' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: filtrados.map(e => {
              const prg = db.find('programas', e.programaId);
              const cic = db.find('ciclos', e.cicloId);
              return [
                `<div>
                  <span class="font-extrabold text-navy font-mono">${fmt.esc(e.dni)}</span>
                  <p class="text-xs text-slate-400">${fmt.esc(e.codigo || '')}</p>
                </div>`,
                `<div>
                  <button type="button" class="font-bold text-slate-800 hover:text-brand text-left" data-view-student="${e.id}">${fmt.esc(e.nombres)} ${fmt.esc(e.apellidos)}</button>
                  <p class="text-xs text-slate-400">${fmt.esc(e.colegio || 'Sin colegio registrado')}</p>
                </div>`,
                `<div>
                  <span class="font-semibold text-slate-800">${fmt.esc(prg?.nombre || '—')}</span>
                  <p class="text-xs text-slate-500">${fmt.esc(cic?.nombre || 'Sin ciclo asignado')}</p>
                </div>`,
                `<div>
                  <p class="text-xs font-semibold text-slate-700"><i class="fa-solid fa-phone text-slate-400 mr-1"></i>${fmt.esc(e.telefono || '—')}</p>
                  <p class="text-xs text-slate-500 truncate max-w-[180px]">${fmt.esc(e.email || '—')}</p>
                </div>`,
                `<div>
                  <p class="text-xs font-semibold text-slate-800">${fmt.esc(e.apoderado?.nombre || '—')}</p>
                  <p class="text-[11px] text-slate-400">${fmt.esc(e.apoderado?.parentesco || 'Apoderado')} · Tel: ${fmt.esc(e.apoderado?.telefono || '—')}</p>
                </div>`,
                UI.badge(e.activo ? 'Activo' : 'Inactivo'),
                `<div class="actions">
                  <button class="btn btn-secondary btn-sm" data-view-student="${e.id}" title="Ver expediente y resumen financiero"><i class="fa-solid fa-folder-open"></i></button>
                  <button class="btn btn-secondary btn-sm" data-edit-student="${e.id}" title="Editar estudiante"><i class="fa-solid fa-user-pen"></i></button>
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      if (params.id) {
        setTimeout(() => EstudiantesView.modalExpediente(params.id), 100);
      }

      const applyFilters = () => {
        Shell.go('estudiantes', {
          q: document.getElementById('filtro-est-q').value.trim(),
          prg: document.getElementById('filtro-est-prg').value,
          estado: document.getElementById('filtro-est-activo').value
        });
      };

      document.getElementById('filtro-est-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-est-prg').addEventListener('change', applyFilters);
      document.getElementById('filtro-est-activo').addEventListener('change', applyFilters);

      document.getElementById('btn-nuevo-est')?.addEventListener('click', () => EstudiantesView.modalFormulario());

      root.addEventListener('click', async e => {
        const btnView = e.target.closest('[data-view-student]');
        if (btnView) {
          EstudiantesView.modalExpediente(btnView.dataset.viewStudent);
          return;
        }
        const btnEdit = e.target.closest('[data-edit-student]');
        if (btnEdit) {
          EstudiantesView.modalFormulario(btnEdit.dataset.editStudent);
          return;
        }
      });
    },

    modalFormulario(estId = null) {
      const esEdicion = !!estId;
      const est = esEdicion ? db.find('estudiantes', estId) : null;
      const programas = db.all('programas').filter(p => p.activo);
      const ciclos = db.all('ciclos').filter(c => c.activo);

      const html = `
        <form id="form-estudiante" class="space-y-4">
          <div class="section-label">Datos Personales del Estudiante</div>
          ${esEdicion ? `
            <div class="alert alert-info text-xs py-2 px-3">
              <i class="fa-solid fa-lock text-brand"></i>
              <span>Por integridad académica, el DNI, nombres completos, apellidos y fecha de nacimiento no son editables tras el registro inicial.</span>
            </div>
          ` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="field">
              <label class="label">DNI (8 dígitos) ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : '<span class="text-red-500">*</span>'}</label>
              <input type="text" name="dni" maxlength="8" class="input font-mono" value="${fmt.esc(est?.dni || '')}" ${esEdicion ? 'readonly tabindex="-1"' : 'required'} placeholder="72345678">
            </div>
            <div class="field sm:col-span-2">
              <label class="label">Nombres Completos ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : '<span class="text-red-500">*</span>'}</label>
              <input type="text" name="nombres" class="input" value="${fmt.esc(est?.nombres || '')}" ${esEdicion ? 'readonly tabindex="-1"' : 'required'} placeholder="Ej: Valeria Nicole">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Apellidos ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : '<span class="text-red-500">*</span>'}</label>
              <input type="text" name="apellidos" class="input" value="${fmt.esc(est?.apellidos || '')}" ${esEdicion ? 'readonly tabindex="-1"' : 'required'} placeholder="Ej: Quispe Huamán">
            </div>
            <div class="field">
              <label class="label">Fecha de Nacimiento ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : ''}</label>
              <input type="date" name="fechaNacimiento" class="input" value="${est?.fechaNacimiento || '2008-01-01'}" ${esEdicion ? 'readonly tabindex="-1" style="pointer-events: none;"' : ''}>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Teléfono / Celular <span class="text-red-500">*</span></label>
              <input type="tel" inputmode="numeric" maxlength="9" pattern="\\d{9}" name="telefono" class="input" value="${fmt.esc(est?.telefono || '')}" required placeholder="987654321">
            </div>
            <div class="field">
              <label class="label">Correo Electrónico <span class="text-red-500">*</span></label>
              <input type="email" name="email" class="input" value="${fmt.esc(est?.email || '')}" required placeholder="ejemplo@gmail.com">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Dirección de Residencia</label>
              <input type="text" name="direccion" class="input" value="${fmt.esc(est?.direccion || '')}" placeholder="Av. Universitaria 123">
            </div>
            <div class="field">
              <label class="label">Colegio de Procedencia</label>
              <input type="text" name="colegio" class="input" value="${fmt.esc(est?.colegio || '')}" placeholder="I.E. / Colegio">
            </div>
          </div>

          <div class="section-label mt-4">Datos del Apoderado Responsable</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre del Apoderado <span class="text-red-500">*</span></label>
              <input type="text" name="apo_nombre" class="input" value="${fmt.esc(est?.apoderado?.nombre || '')}" required placeholder="Nombre completo">
            </div>
            <div class="field">
              <label class="label">DNI Apoderado</label>
              <input type="text" name="apo_dni" maxlength="8" class="input font-mono" value="${fmt.esc(est?.apoderado?.dni || '')}" placeholder="8 dígitos">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Teléfono Apoderado <span class="text-red-500">*</span></label>
              <input type="tel" inputmode="numeric" maxlength="9" pattern="\\d{9}" name="apo_telefono" class="input" value="${fmt.esc(est?.apoderado?.telefono || '')}" required placeholder="987654321">
            </div>
            <div class="field">
              <label class="label">Parentesco</label>
              <select name="apo_parentesco" class="select">
                <option value="Madre" ${est?.apoderado?.parentesco === 'Madre' ? 'selected' : ''}>Madre</option>
                <option value="Padre" ${est?.apoderado?.parentesco === 'Padre' ? 'selected' : ''}>Padre</option>
                <option value="Tutor Legal" ${est?.apoderado?.parentesco === 'Tutor Legal' ? 'selected' : ''}>Tutor Legal</option>
                <option value="Hermano(a)" ${est?.apoderado?.parentesco === 'Hermano(a)' ? 'selected' : ''}>Hermano(a)</option>
              </select>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> ${esEdicion ? 'Actualizar Estudiante' : 'Guardar y Registrar'}</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: esEdicion ? `Editar Estudiante: ${est.nombres} ${est.apellidos}` : 'Registrar Nuevo Estudiante',
        subtitle: 'Validación de identidad por DNI único de 8 dígitos',
        icon: esEdicion ? 'fa-user-pen' : 'fa-user-plus',
        body: html,
        size: 'lg'
      });

      const formEst = document.getElementById('form-estudiante');
      formEst?.querySelectorAll('input[name="telefono"], input[name="apo_telefono"]').forEach(inp => {
        inp.addEventListener('input', e => {
          e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9);
        });
      });

      document.getElementById('form-estudiante').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const dni = fd.get('dni').trim();

        if (!validators.dni(dni)) {
          return UI.toast('El DNI debe tener exactamente 8 dígitos numéricos.', 'error');
        }

        // Validación de unicidad de DNI en creación
        if (!esEdicion) {
          const existe = db.all('estudiantes').some(x => x.dni === dni);
          if (existe) {
            return UI.alert('DNI Duplicado', `Ya existe un estudiante registrado con el DNI ${dni}.`, 'error');
          }
        }

        const data = {
          nombres: esEdicion ? est.nombres : fd.get('nombres').trim(),
          apellidos: esEdicion ? est.apellidos : fd.get('apellidos').trim(),
          fechaNacimiento: esEdicion ? est.fechaNacimiento : fd.get('fechaNacimiento'),
          telefono: fd.get('telefono').trim(),
          email: fd.get('email').trim(),
          direccion: fd.get('direccion').trim(),
          colegio: fd.get('colegio').trim(),
          apoderado: {
            nombre: fd.get('apo_nombre').trim(),
            dni: fd.get('apo_dni').trim(),
            telefono: fd.get('apo_telefono').trim(),
            parentesco: fd.get('apo_parentesco')
          }
        };

        if (!validators.phone(data.telefono) || !validators.phone(data.apoderado.telefono)) {
          return UI.alert('Teléfono inválido', 'El teléfono debe tener exactamente 9 dígitos numéricos.', 'error');
        }

        if (esEdicion) {
          db.update('estudiantes', est.id, data);
          const userEst = db.all('users').find(u => u.estudianteId === est.id);
          if (userEst && userEst.email !== data.email) {
            db.update('users', userEst.id, { email: data.email });
          }
          audit(`Actualizó datos de estudiante DNI ${est.dni}`, 'Gestión de Estudiantes');
          UI.toast('Estudiante actualizado exitosamente');
        } else {
          // Una sola llamada: el servidor crea el estudiante + su cuenta de acceso (usuario = DNI) y audita.
          window.PT.registroEstudiantes.registrar({ ...data, dni });
          UI.toast(`Estudiante registrado. Usuario de portal creado: ${dni}`);
        }

        UI.closeModal();
        Shell.refresh();
      });
    },

    modalExpediente(estId) {
      const est = db.find('estudiantes', estId);
      if (!est) return;
      const res = finance.resumen(est.id);
      const prg = db.find('programas', est.programaId);
      const cic = db.find('ciclos', est.cicloId);

      const html = `
        <div class="space-y-6">
          <!-- Cabecera Alumno -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div class="flex items-center gap-4">
              <div class="avatar avatar-lg">${fmt.initials(est.nombres + ' ' + est.apellidos)}</div>
              <div>
                <h4 class="text-xl font-extrabold text-navy">${fmt.esc(est.nombres)} ${fmt.esc(est.apellidos)}</h4>
                <p class="text-xs text-slate-500 font-mono">DNI: <b>${est.dni}</b> | Código: <b>${est.codigo}</b></p>
                <p class="text-xs text-brand font-semibold mt-1">
                  <i class="fa-solid fa-graduation-cap"></i> ${fmt.esc(prg?.nombre || 'Sin programa')} · ${fmt.esc(cic?.nombre || 'Sin ciclo')}
                </p>
              </div>
            </div>
            <div>
              ${UI.badge(est.activo ? 'Activo' : 'Inactivo')}
            </div>
          </div>

          <!-- Mini KPIs Financieros -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="mini-stat"><p class="ms-label">Total Exigible</p><p class="ms-value text-slate-800">${fmt.money(res.exigible)}</p></div>
            <div class="mini-stat"><p class="ms-label">Total Pagado</p><p class="ms-value text-emerald-600">${fmt.money(res.totalPagado)}</p></div>
            <div class="mini-stat"><p class="ms-label">Saldo Pendiente</p><p class="ms-value ${res.saldo > 0 ? 'text-amber-600' : 'text-slate-600'}">${fmt.money(res.saldo)}</p></div>
            <div class="mini-stat"><p class="ms-label">En Revisión</p><p class="ms-value text-blue-600">${fmt.money(res.enRevision)}</p></div>
          </div>

          <!-- Cronograma de Obligaciones -->
          <div>
            <h5 class="text-sm font-bold text-navy mb-3"><i class="fa-solid fa-calendar-days text-brand"></i> Cronograma de Pensiones y Matrículas</h5>
            ${res.pensiones.length === 0 ? UI.empty('No tiene obligaciones registradas.') : UI.table({
              cols: [
                { label: 'Concepto' },
                { label: 'Vencimiento' },
                { label: 'Importe', cls: 'num' },
                { label: 'Descuento', cls: 'num' },
                { label: 'Abonado', cls: 'num' },
                { label: 'Saldo', cls: 'num' },
                { label: 'Estado' }
              ],
              rows: res.pensiones.map(p => [
                `<span class="font-bold text-slate-800">${fmt.esc(p.concepto)}</span>`,
                `<span class="text-xs ${p.estado === 'Vencida' ? 'text-red-600 font-bold' : ''}">${fmt.date(p.fechaVencimiento)}</span>`,
                fmt.money(p.importe),
                p.descuento > 0 ? `<span class="text-xs text-emerald-600">-S/ ${p.descuento}</span>` : '—',
                `<span class="text-emerald-700 font-bold">${fmt.money(p.abonado)}</span>`,
                `<span class="font-extrabold ${p.saldo > 0 ? 'text-red-600' : 'text-slate-500'}">${fmt.money(p.saldo)}</span>`,
                UI.badge(p.estado)
              ])
            })}
          </div>

          <!-- Historial de Pagos y Recibos -->
          <div>
            <h5 class="text-sm font-bold text-navy mb-3"><i class="fa-solid fa-receipt text-emerald-600"></i> Pagos Registrados / Recibos Emitidos</h5>
            ${res.pagos.length === 0 ? UI.empty('No hay pagos registrados.') : UI.table({
              cols: [
                { label: 'Fecha' },
                { label: 'Método' },
                { label: 'N° Operación' },
                { label: 'Monto', cls: 'num' },
                { label: 'Estado' },
                { label: 'Recibo' }
              ],
              rows: res.pagos.map(p => [
                fmt.date(p.fechaPago),
                UI.method(p.metodo),
                `<code class="text-xs">${fmt.esc(p.numeroOperacion)}</code>`,
                `<span class="font-bold">${fmt.money(p.monto)}</span>`,
                UI.badge(p.estado),
                p.estado === 'Aprobado' ? `<button class="btn btn-secondary btn-sm" onclick="PT.docs.printRecibo('${p.id}')"><i class="fa-solid fa-print"></i> ${p.reciboNumero}</button>` : '—'
              ])
            })}
          </div>
        </div>
      `;

      UI.openModal({
        title: 'Expediente Académico-Financiero 360°',
        subtitle: `Estudiante: ${est.nombres} ${est.apellidos}`,
        icon: 'fa-id-card',
        body: html,
        size: 'lg'
      });
    }
  };

  /* ------------------------------------------------------------------
     4. GESTIÓN DE PENSIONES
     ------------------------------------------------------------------ */
  const PensionesView = {
    title: 'Gestión de Pensiones',
    subtitle: 'Cronogramas de pago, cuotas individuales, descuentos y vencimientos',
    render(params) {
      const ciclos = db.all('ciclos');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);
      const pagos = db.all('pagos');
      const cicFiltro = params.cic || '';
      const estadoFiltro = params.estado || '';
      const busqueda = (params.q || '').toLowerCase();

      const pensionesCalculadas = pensiones.map(p => {
        const inf = finance.info(p, pagos);
        const est = db.find('estudiantes', p.estudianteId);
        const cic = db.find('ciclos', p.cicloId);
        return { ...inf, est, cic };
      });

      const filtradas = pensionesCalculadas.filter(p => {
        if (cicFiltro && p.cicloId !== cicFiltro) return false;
        if (estadoFiltro && p.estado !== estadoFiltro) return false;
        if (busqueda) {
          const t = `${p.concepto} ${p.est?.nombres} ${p.est?.apellidos} ${p.est?.dni}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Cronograma de Pensiones</h3>
              <p class="page-desc">Obligaciones activas: ${pensiones.length} | Vencidas: ${filtradas.filter(p => p.estado === 'Vencida').length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nueva-obligacion">
                <i class="fa-solid fa-plus"></i> Nueva Cuota Individual
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="filters" style="--fcols:2">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-pen-q" class="input" placeholder="Buscar por alumno, DNI o concepto..." value="${fmt.esc(params.q || '')}">
            </div>
            <select id="filtro-pen-cic" class="select">
              <option value="">Todos los ciclos</option>
              ${ciclos.map(c => `<option value="${c.id}" ${cicFiltro === c.id ? 'selected' : ''}>${fmt.esc(c.nombre)}</option>`).join('')}
            </select>
            <select id="filtro-pen-est" class="select">
              <option value="">Todos los estados</option>
              <option value="Pendiente" ${estadoFiltro === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="Parcial" ${estadoFiltro === 'Parcial' ? 'selected' : ''}>Parcial</option>
              <option value="Pagada" ${estadoFiltro === 'Pagada' ? 'selected' : ''}>Pagada</option>
              <option value="Vencida" ${estadoFiltro === 'Vencida' ? 'selected' : ''}>Vencida</option>
            </select>
          </div>

          <!-- Tabla -->
          ${filtradas.length === 0 ? UI.empty('No hay pensiones que coincidan con la búsqueda.') : UI.table({
            cols: [
              { label: 'Estudiante' },
              { label: 'Ciclo' },
              { label: 'Concepto' },
              { label: 'Vencimiento' },
              { label: 'Importe', cls: 'num' },
              { label: 'Descuento', cls: 'num' },
              { label: 'Abonado', cls: 'num' },
              { label: 'Saldo', cls: 'num' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: filtradas.map(p => [
              `<div>
                <a href="#estudiantes?id=${p.estudianteId}" class="font-bold text-slate-800 hover:text-brand">${fmt.esc(p.est ? `${p.est.nombres} ${p.est.apellidos}` : '—')}</a>
                <p class="text-xs text-slate-400">DNI ${p.est?.dni || '—'}</p>
              </div>`,
              `<span class="text-xs font-semibold">${fmt.esc(p.cic?.nombre || '—')}</span>`,
              `<span class="font-semibold text-slate-800">${fmt.esc(p.concepto)}</span>`,
              `<div>
                <span class="text-xs font-semibold ${p.estado === 'Vencida' ? 'text-red-600 font-bold' : 'text-slate-600'}">${fmt.date(p.fechaVencimiento)}</span>
                ${p.diasAtraso > 0 ? `<p class="text-[10px] text-red-500 font-bold">${p.diasAtraso} días atraso</p>` : ''}
              </div>`,
              fmt.money(p.importe),
              p.descuento > 0 ? `<span class="text-xs font-bold text-emerald-600" title="${fmt.esc(p.motivoDescuento)}">-S/ ${p.descuento}</span>` : '—',
              `<span class="font-bold text-emerald-700">${fmt.money(p.abonado)}</span>`,
              `<span class="font-extrabold ${p.saldo > 0 ? 'text-red-600' : 'text-slate-400'}">${fmt.money(p.saldo)}</span>`,
              UI.badge(p.estado),
              `<div class="actions">
                <button class="btn btn-secondary btn-sm" data-pen-descuento="${p.id}" title="Aplicar / Editar Descuento"><i class="fa-solid fa-tag"></i></button>
                <button class="btn btn-secondary btn-sm" data-pen-ajuste="${p.id}" title="Ajustar fecha o importe"><i class="fa-solid fa-calendar-pen"></i></button>
              </div>`
            ])
          })}
        </div>
      `;
    },
    mount(params, root) {
      const applyFilters = () => {
        Shell.go('pensiones', {
          q: document.getElementById('filtro-pen-q').value.trim(),
          cic: document.getElementById('filtro-pen-cic').value,
          estado: document.getElementById('filtro-pen-est').value
        });
      };

      document.getElementById('filtro-pen-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-pen-cic').addEventListener('change', applyFilters);
      document.getElementById('filtro-pen-est').addEventListener('change', applyFilters);

      document.getElementById('btn-nueva-obligacion')?.addEventListener('click', () => PensionesView.modalNuevaObligacion());

      root.addEventListener('click', async e => {
        const btnD = e.target.closest('[data-pen-descuento]');
        if (btnD) {
          PensionesView.modalDescuento(btnD.dataset.penDescuento);
          return;
        }
        const btnA = e.target.closest('[data-pen-ajuste]');
        if (btnA) {
          PensionesView.modalAjuste(btnA.dataset.penAjuste);
        }
      });
    },

    modalNuevaObligacion() {
      const estudiantes = db.all('estudiantes').filter(e => e.activo);
      const ciclos = db.all('ciclos').filter(c => c.activo);

      const html = `
        <form id="form-nueva-obl" class="space-y-4">
          <div class="field">
            <label class="label">Estudiante <span class="text-red-500">*</span></label>
            <select name="estudianteId" class="select" required>
              <option value="">Seleccione estudiante...</option>
              ${estudiantes.map(e => `<option value="${e.id}">${fmt.esc(e.nombres)} ${fmt.esc(e.apellidos)} (DNI: ${e.dni})</option>`).join('')}
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Ciclo Asociado</label>
              <select name="cicloId" class="select" required>
                ${ciclos.map(c => `<option value="${c.id}">${fmt.esc(c.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label">Tipo de Obligación</label>
              <select name="tipo" class="select">
                <option value="Pensión">Pensión</option>
                <option value="Matrícula">Matrícula</option>
                <option value="Materiales">Materiales / Separatas</option>
                <option value="Simulacro Especial">Simulacro Especial</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label class="label">Concepto Descriptivo <span class="text-red-500">*</span></label>
            <input type="text" name="concepto" class="input" placeholder="Ej: Pensión Extraordinaria / Material Didáctico" required>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Importe Exigible (S/) <span class="text-red-500">*</span></label>
              <input type="number" step="0.01" min="1" name="importe" class="input" placeholder="0.00" required>
            </div>
            <div class="field">
              <label class="label">Fecha de Vencimiento <span class="text-red-500">*</span></label>
              <input type="date" name="fechaVencimiento" class="input" value="${fmt.addDays(fmt.today(), 15)}" required>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Crear Obligación</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Crear Cuota u Obligación Individual',
        subtitle: 'Generación puntual de conceptos de pago',
        icon: 'fa-receipt',
        body: html,
        size: 'md'
      });

      document.getElementById('form-nueva-obl').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const estId = fd.get('estudianteId');
        const cicloId = fd.get('cicloId');
        const est = db.find('estudiantes', estId);

        const nueva = db.insert('pensiones', {
          matriculaId: null,
          estudianteId: estId,
          cicloId,
          tipo: fd.get('tipo'),
          concepto: fd.get('concepto').trim(),
          numeroCuota: 99,
          importe: parseFloat(fd.get('importe')) || 0,
          descuento: 0,
          motivoDescuento: '',
          fechaVencimiento: fd.get('fechaVencimiento'),
          fechaCreacion: fmt.nowISO(),
          anulada: false
        }, 'pen');

        audit(`Creó obligación individual "${nueva.concepto}" para DNI ${est?.dni}`, 'Gestión de Pensiones', `Monto: S/ ${nueva.importe}`);
        UI.closeModal();
        UI.toast('Obligación creada exitosamente');
        Shell.refresh();
      });
    },

    modalDescuento(penId) {
      const pen = db.find('pensiones', penId);
      if (!pen) return;
      const est = db.find('estudiantes', pen.estudianteId);

      const html = `
        <form id="form-descuento" class="space-y-4">
          <div>
            <p class="font-bold text-slate-800">${fmt.esc(est?.nombres)} ${fmt.esc(est?.apellidos)} (DNI ${est?.dni})</p>
            <p class="text-xs text-slate-500">Concepto: <b>${fmt.esc(pen.concepto)}</b> | Importe original: <b>${fmt.money(pen.importe)}</b></p>
          </div>

          <div class="field">
            <label class="label">Monto de Descuento (S/) <span class="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0" max="${pen.importe}" name="descuento" class="input font-bold" value="${pen.descuento || 0}" required>
            <span class="hint">El saldo pendiente se recalculará automáticamente restando este descuento.</span>
          </div>

          <div class="field">
            <label class="label">Motivo o Justificación del Descuento <span class="text-red-500">*</span></label>
            <textarea name="motivoDescuento" class="textarea" rows="3" placeholder="Ej: Beca por mérito académico, convenio institucional, descuento por hermanos..." required>${fmt.esc(pen.motivoDescuento || '')}</textarea>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-check"></i> Aplicar Descuento</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Aplicar Descuento a Pensión',
        subtitle: 'Actualiza el importe exigible y saldo de la obligación',
        icon: 'fa-tag',
        body: html,
        size: 'md'
      });

      document.getElementById('form-descuento').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const desc = parseFloat(fd.get('descuento')) || 0;
        const motivo = fd.get('motivoDescuento').trim();

        db.update('pensiones', pen.id, {
          descuento: desc,
          motivoDescuento: motivo
        });

        audit(`Aplicó descuento de S/ ${desc} a pensión ${pen.concepto}`, 'Gestión de Pensiones', `Alumno DNI ${est?.dni} · Motivo: ${motivo}`);
        UI.closeModal();
        UI.toast('Descuento aplicado correctamente');
        Shell.refresh();
      });
    },

    modalAjuste(penId) {
      const pen = db.find('pensiones', penId);
      if (!pen) return;

      const html = `
        <form id="form-ajuste" class="space-y-4">
          <div class="field">
            <label class="label">Concepto</label>
            <input type="text" name="concepto" class="input" value="${fmt.esc(pen.concepto)}" required>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Importe Base (S/)</label>
              <input type="number" step="0.01" min="1" name="importe" class="input" value="${pen.importe}" required>
            </div>
            <div class="field">
              <label class="label">Fecha de Vencimiento</label>
              <input type="date" name="fechaVencimiento" class="input" value="${pen.fechaVencimiento}" required>
            </div>
          </div>
          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar Ajuste</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Ajuste de Obligación',
        icon: 'fa-calendar-pen',
        body: html,
        size: 'md'
      });

      document.getElementById('form-ajuste').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        db.update('pensiones', pen.id, {
          concepto: fd.get('concepto'),
          importe: parseFloat(fd.get('importe')) || pen.importe,
          fechaVencimiento: fd.get('fechaVencimiento')
        });
        audit(`Ajustó fecha/monto de pensión ${pen.id}`, 'Gestión de Pensiones');
        UI.closeModal();
        UI.toast('Obligación ajustada');
        Shell.refresh();
      });
    }
  };

  /* ------------------------------------------------------------------
     5. VERIFICACIÓN DE PAGOS (Módulo Crítico)
     ------------------------------------------------------------------ */
  const PagosView = {
    title: 'Verificación de Pagos',
    subtitle: 'Auditoría y conciliación de pagos reportados vía Yape, Plin y registro en efectivo',
    render(params) {
      const tab = params.tab || 'Pendiente';
      const pagos = db.all('pagos').slice().sort((a, b) => b.fechaReporte.localeCompare(a.fechaReporte));
      const estudiantes = db.all('estudiantes');

      const countPendientes = pagos.filter(p => p.estado === 'Pendiente').length;
      const countAprobados = pagos.filter(p => p.estado === 'Aprobado').length;
      const countRechazados = pagos.filter(p => p.estado === 'Rechazado').length;

      const filtrados = pagos.filter(p => {
        if (tab === 'todos') return true;
        return p.estado === tab;
      });

      return `
        <div class="card space-y-5">
          <div class="page-head">
            <div>
              <h3 class="page-title">Módulo de Verificación de Pagos</h3>
              <p class="page-desc">Valide o rechace transferencias digitales reportadas antes de su impacto financiero.</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-success" id="btn-pago-efectivo">
                <i class="fa-solid fa-cash-register"></i> Registrar Pago en Efectivo (Caja)
              </button>
            </div>
          </div>

          <!-- Pestañas de Estado -->
          <div class="tabs">
            <button class="tab ${tab === 'Pendiente' ? 'active' : ''}" data-tab="Pendiente">
              <i class="fa-solid fa-clock"></i> Pendientes de Revisión <span class="count">${countPendientes}</span>
            </button>
            <button class="tab ${tab === 'Aprobado' ? 'active' : ''}" data-tab="Aprobado">
              <i class="fa-solid fa-circle-check"></i> Aprobados <span class="count">${countAprobados}</span>
            </button>
            <button class="tab ${tab === 'Rechazado' ? 'active' : ''}" data-tab="Rechazado">
              <i class="fa-solid fa-circle-xmark"></i> Rechazados <span class="count">${countRechazados}</span>
            </button>
            <button class="tab ${tab === 'todos' ? 'active' : ''}" data-tab="todos">
              Todos los Pagos <span class="count">${pagos.length}</span>
            </button>
          </div>

          ${tab === 'Pendiente' && countPendientes > 0 ? `
            <div class="alert alert-info">
              <i class="fa-solid fa-circle-info ai"></i>
              <div>
                <b>Regla de Negocio:</b> Los pagos en estado <i>Pendiente</i> NO reducen la deuda del estudiante ni se computan como ingresos confirmados hasta que usted presione <b>Aprobar</b>.
              </div>
            </div>
          ` : ''}

          <!-- Tabla de Pagos -->
          ${filtrados.length === 0 ? UI.empty('No hay pagos en esta categoría.', 'fa-circle-check') : UI.table({
            cols: [
              { label: 'Fecha Reporte' },
              { label: 'Estudiante' },
              { label: 'Concepto / Cuota' },
              { label: 'Método' },
              { label: 'N° Operación' },
              { label: 'Comprobante' },
              { label: 'Monto Abono', cls: 'num' },
              { label: 'Estado' },
              { label: 'Acciones de Verificación', cls: 'nowrap text-right' }
            ],
            rows: filtrados.map(p => {
              const est = db.find('estudiantes', p.estudianteId);
              const pen = db.find('pensiones', p.pensionId);
              const isPend = p.estado === 'Pendiente';

              return [
                `<div>
                  <span class="text-xs font-bold text-slate-800">${fmt.date(p.fechaPago)}</span>
                  <p class="text-[11px] text-slate-400">${fmt.timeAgo(p.fechaReporte)}</p>
                </div>`,
                `<div>
                  <a href="#estudiantes?id=${p.estudianteId}" class="font-bold text-slate-800 hover:text-brand">${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</a>
                  <p class="text-xs text-slate-400">DNI ${est?.dni || '—'}</p>
                </div>`,
                `<span class="font-semibold text-slate-700">${fmt.esc(pen?.concepto || 'Cuota')}</span>`,
                UI.method(p.metodo),
                `<code class="text-xs bg-slate-100 px-2 py-1 rounded font-bold">${fmt.esc(p.numeroOperacion)}</code>`,
                p.comprobante ? `
                  <button class="flex items-center gap-2 text-xs font-semibold text-brand hover:underline" data-view-voucher="${p.id}">
                    <img src="${p.comprobante}" class="w-8 h-8 rounded object-cover border" alt="Voucher">
                    <span>Ver voucher</span>
                  </button>
                ` : '<span class="text-xs text-slate-400">Sin voucher (Efectivo)</span>',
                `<span class="font-extrabold text-base ${p.estado === 'Aprobado' ? 'text-emerald-600' : 'text-slate-900'}">${fmt.money(p.monto)}</span>`,
                `<div>
                  ${UI.badge(p.estado)}
                  ${p.motivoRechazo ? `<p class="text-[11px] text-red-500 mt-1 max-w-[160px] truncate" title="${fmt.esc(p.motivoRechazo)}">${fmt.esc(p.motivoRechazo)}</p>` : ''}
                </div>`,
                `<div class="actions">
                  ${isPend ? `
                    <button class="btn btn-success btn-sm" data-approve="${p.id}">
                      <i class="fa-solid fa-check"></i> Aprobar
                    </button>
                    <button class="btn btn-danger btn-sm" data-reject="${p.id}">
                      <i class="fa-solid fa-xmark"></i> Rechazar
                    </button>
                  ` : ''}
                  ${p.estado === 'Aprobado' ? `
                    <button class="btn btn-secondary btn-sm" data-print-recibo="${p.id}">
                      <i class="fa-solid fa-print"></i> Recibo ${p.reciboNumero || ''}
                    </button>
                  ` : ''}
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      root.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => {
          Shell.go('pagos', { tab: t.dataset.tab });
        });
      });

      document.getElementById('btn-pago-efectivo')?.addEventListener('click', () => PagosView.modalPagoEfectivo());

      root.addEventListener('click', async e => {
        const btnV = e.target.closest('[data-view-voucher]');
        if (btnV) {
          const pg = db.find('pagos', btnV.dataset.viewVoucher);
          if (pg?.comprobante) UI.viewImage(pg.comprobante, `Voucher de Operación ${pg.numeroOperacion}`);
          return;
        }
        const btnA = e.target.closest('[data-approve]');
        if (btnA) {
          await Actions.aprobarPago(btnA.dataset.approve);
          Shell.refresh();
          return;
        }
        const btnR = e.target.closest('[data-reject]');
        if (btnR) {
          await Actions.rechazarPago(btnR.dataset.reject);
          Shell.refresh();
          return;
        }
        const btnP = e.target.closest('[data-print-recibo]');
        if (btnP) {
          docs.printRecibo(btnP.dataset.printRecibo);
        }
      });
    },

    modalPagoEfectivo() {
      const estudiantes = db.all('estudiantes').filter(e => e.activo);
      const pagosAll = db.all('pagos');

      const html = `
        <form id="form-pago-efectivo" class="space-y-4">
          <div class="field">
            <label class="label">Estudiante <span class="text-red-500">*</span></label>
            <select name="estudianteId" id="ef-estudiante" class="select" required>
              <option value="">Seleccione estudiante...</option>
              ${estudiantes.map(e => `<option value="${e.id}">${fmt.esc(e.nombres)} ${fmt.esc(e.apellidos)} (DNI: ${e.dni})</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label class="label">Pensión u Obligación a Pagar <span class="text-red-500">*</span></label>
            <select name="pensionId" id="ef-pension" class="select" required>
              <option value="">Primero seleccione estudiante...</option>
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Monto Recibido en Efectivo (S/) <span class="text-red-500">*</span></label>
              <input type="number" step="0.01" min="1" name="monto" id="ef-monto" class="input font-bold" placeholder="0.00" required>
            </div>
            <div class="field">
              <label class="label">Fecha de Cobro</label>
              <input type="date" name="fechaPago" class="input" value="${fmt.today()}" required>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-success"><i class="fa-solid fa-receipt"></i> Cobrar y Emitir Recibo</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Cobro en Efectivo (Caja Academia)',
        subtitle: 'El pago se aprueba y contabiliza de inmediato emitiendo el recibo interno',
        icon: 'fa-cash-register',
        body: html,
        size: 'md'
      });

      const selE = document.getElementById('ef-estudiante');
      const selP = document.getElementById('ef-pension');
      const inM = document.getElementById('ef-monto');

      selE.addEventListener('change', () => {
        const estId = selE.value;
        if (!estId) { selP.innerHTML = '<option value="">Primero seleccione estudiante...</option>'; return; }
        const pens = finance.pensionesDe(estId, pagosAll).filter(p => !p.anulada && p.saldo > 0);
        if (pens.length === 0) {
          selP.innerHTML = '<option value="">El estudiante no tiene saldos pendientes.</option>';
          return;
        }
        selP.innerHTML = '<option value="">Seleccione cuota...</option>' +
          pens.map(p => `<option value="${p.id}" data-saldo="${p.saldo}">${fmt.esc(p.concepto)} - Saldo: S/ ${p.saldo.toFixed(2)}</option>`).join('');
      });

      selP.addEventListener('change', () => {
        const opt = selP.selectedOptions[0];
        if (opt && opt.dataset.saldo) inM.value = opt.dataset.saldo;
      });

      document.getElementById('form-pago-efectivo').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const estId = fd.get('estudianteId');
        const pensionId = fd.get('pensionId');
        const monto = parseFloat(fd.get('monto')) || 0;
        const fechaPago = fd.get('fechaPago');

        const est = db.find('estudiantes', estId);
        const pen = db.find('pensiones', pensionId);
        if (!est || !pen) return;

        // Una sola llamada: el servidor registra el pago aprobado, emite recibo, notifica y audita.
        const saved = window.PT.revisionPagos.registrarCaja({
          estudianteId: estId,
          pensionId,
          monto,
          fechaPago
        });
        UI.closeModal();
        UI.toast(`Pago registrado con Recibo ${saved.reciboNumero}`);
        docs.printRecibo(saved.id);
        Shell.refresh();
      });
    }
  };

  /* ------------------------------------------------------------------
     6. REPORTES
     ------------------------------------------------------------------ */
  const ReportesView = {
    title: 'Reportes y Estadísticas',
    subtitle: 'Generación de reportes de ingresos, morosidad y padrón con exportación a Excel y PDF',
    render(params) {
      const tipo = params.tipo || 'ingresos';
      const pagos = db.all('pagos');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);
      const matriculas = db.all('matriculas');

      const aniosSet = new Set();
      pagos.forEach(p => p.fechaPago && aniosSet.add(p.fechaPago.slice(0, 4)));
      pensiones.forEach(p => p.fechaVencimiento && aniosSet.add(p.fechaVencimiento.slice(0, 4)));
      matriculas.forEach(m => m.fecha && aniosSet.add(m.fecha.slice(0, 4)));
      const anioActual = String(new Date().getFullYear());
      aniosSet.add(anioActual);
      const anios = Array.from(aniosSet).sort().reverse();

      return `
        <div class="card space-y-5">
          <div class="page-head">
            <div>
              <h3 class="page-title">Centro de Reportes Financieros</h3>
              <p class="page-desc">Consulte métricas para auditoría contable y gestión de cobranzas</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-secondary" id="btn-export-excel" disabled>
                <i class="fa-solid fa-file-excel text-emerald-600"></i> Exportar a Excel (CSV)
              </button>
              <button class="btn btn-primary" id="btn-print-report" disabled>
                <i class="fa-solid fa-print"></i> Imprimir / Exportar a PDF
              </button>
            </div>
          </div>

          <div class="tabs">
            <button class="tab ${tipo === 'ingresos' ? 'active' : ''}" data-tipo="ingresos">
              <i class="fa-solid fa-hand-holding-dollar"></i> Recaudación e Ingresos
            </button>
            <button class="tab ${tipo === 'morosidad' ? 'active' : ''}" data-tipo="morosidad">
              <i class="fa-solid fa-triangle-exclamation"></i> Morosidad y Saldos Vencidos
            </button>
            <button class="tab ${tipo === 'matriculas' ? 'active' : ''}" data-tipo="matriculas">
              <i class="fa-solid fa-address-book"></i> Padrón de Matrículas
            </button>
          </div>

          <!-- Filtros de Periodo -->
          <div class="filters" style="--fcols:3">
            <select id="filtro-rep-mes" class="select">
              <option value="">Todos los meses</option>
              ${PT.MESES.map((m, idx) => `<option value="${fmt.pad(idx + 1, 2)}">${m}</option>`).join('')}
            </select>
            <select id="filtro-rep-anio" class="select">
              ${anios.map(a => `<option value="${a}" ${a === anioActual ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
            <button class="btn btn-primary" id="btn-generar-reporte">
              <i class="fa-solid fa-arrow-rotate-right"></i> Generar reporte
            </button>
          </div>

          <div id="report-printable-area">
            ${UI.empty('Seleccione el periodo y pulse Generar reporte', 'fa-calendar-days')}
          </div>
        </div>
      `;
    },
    mount(params, root) {
      const tipo = params.tipo || 'ingresos';
      const btnExcel = document.getElementById('btn-export-excel');
      const btnPrint = document.getElementById('btn-print-report');
      const btnGenerar = document.getElementById('btn-generar-reporte');
      const selMes = document.getElementById('filtro-rep-mes');
      const selAnio = document.getElementById('filtro-rep-anio');
      const area = document.getElementById('report-printable-area');

      let reporteGenerado = null;

      root.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => {
          Shell.go('reportes', { tipo: t.dataset.tipo });
        });
      });

      const resetReporte = () => {
        if (btnExcel) btnExcel.disabled = true;
        if (btnPrint) btnPrint.disabled = true;
        reporteGenerado = null;
        if (area) area.innerHTML = UI.empty('Seleccione el periodo y pulse Generar reporte', 'fa-calendar-days');
      };

      selMes?.addEventListener('change', resetReporte);
      selAnio?.addEventListener('change', resetReporte);

      btnGenerar?.addEventListener('click', () => {
        const mes = selMes.value;
        const anio = selAnio.value;
        const prefix = mes ? `${anio}-${mes}` : `${anio}-`;
        const periodCode = mes ? `${anio}-${mes}` : anio;
        const periodLabel = mes ? `${PT.MESES[parseInt(mes, 10) - 1]} ${anio}` : `Año ${anio}`;

        const pagos = db.all('pagos');
        const pensiones = db.all('pensiones').filter(p => !p.anulada);
        const matriculas = db.all('matriculas');

        if (tipo === 'ingresos') {
          const pagosAprobados = pagos.filter(p => p.estado === 'Aprobado' && p.fechaPago && p.fechaPago.startsWith(prefix))
            .slice().sort((a, b) => b.fechaPago.localeCompare(a.fechaPago));

          if (pagosAprobados.length === 0) {
            area.innerHTML = UI.empty('No se encontraron registros para el periodo seleccionado.', 'fa-inbox');
            btnExcel.disabled = true;
            btnPrint.disabled = true;
            reporteGenerado = null;
            return;
          }

          const total = fmt.sum(pagosAprobados, p => p.monto);
          area.innerHTML = `
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-extrabold text-navy text-lg">Reporte de Recaudación e Ingresos Confirmados</h4>
                  <p class="text-xs text-slate-500">Periodo: <b>${periodLabel}</b> · Monto total verificado: <b>${fmt.money(total)}</b> (${pagosAprobados.length} pagos)</p>
                </div>
              </div>
              ${UI.table({
                cols: [
                  { label: 'Recibo N°' },
                  { label: 'Fecha' },
                  { label: 'Estudiante / DNI' },
                  { label: 'Concepto' },
                  { label: 'Método' },
                  { label: 'N° Operación' },
                  { label: 'Importe Cobrado', cls: 'num' }
                ],
                rows: pagosAprobados.map(p => {
                  const est = db.find('estudiantes', p.estudianteId);
                  const pen = db.find('pensiones', p.pensionId);
                  return [
                    `<b>${p.reciboNumero || '—'}</b>`,
                    fmt.date(p.fechaPago),
                    `${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')} (DNI ${est?.dni || ''})`,
                    fmt.esc(pen?.concepto || 'Cuota'),
                    p.metodo,
                    fmt.esc(p.numeroOperacion),
                    `<span class="font-bold text-emerald-700">${fmt.money(p.monto)}</span>`
                  ];
                }),
                foot: `<tfoot><tr><td colspan="6" class="text-right">TOTAL GENERAL COBRADO (${periodLabel}):</td><td class="num font-extrabold text-emerald-700">${fmt.money(total)}</td></tr></tfoot>`
              })}
            </div>
          `;
          btnExcel.disabled = false;
          btnPrint.disabled = false;
          reporteGenerado = { tipo, periodCode, periodLabel, items: pagosAprobados };

        } else if (tipo === 'morosidad') {
          const todasVencidas = pensiones.map(p => finance.info(p, pagos)).filter(p => p.estado === 'Vencida');
          const vencidas = todasVencidas.filter(p => p.fechaVencimiento && p.fechaVencimiento.startsWith(prefix));

          if (vencidas.length === 0) {
            area.innerHTML = UI.empty('No se encontraron registros para el periodo seleccionado.', 'fa-circle-check');
            btnExcel.disabled = true;
            btnPrint.disabled = true;
            reporteGenerado = null;
            return;
          }

          const deudaTotal = fmt.sum(vencidas, p => p.saldo);
          area.innerHTML = `
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-extrabold text-red-600 text-lg">Reporte de Morosidad y Pensiones Vencidas</h4>
                  <p class="text-xs text-slate-500">Periodo: <b>${periodLabel}</b> · Deuda total vencida: <b>${fmt.money(deudaTotal)}</b> en ${vencidas.length} cuotas</p>
                </div>
              </div>
              ${UI.table({
                cols: [
                  { label: 'Estudiante' },
                  { label: 'DNI' },
                  { label: 'Apoderado / Teléfono' },
                  { label: 'Concepto' },
                  { label: 'Fecha Vence' },
                  { label: 'Días Atraso', cls: 'num' },
                  { label: 'Saldo Pendiente', cls: 'num' }
                ],
                rows: vencidas.map(p => {
                  const est = db.find('estudiantes', p.estudianteId);
                  return [
                    `<b>${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</b>`,
                    est?.dni || '—',
                    `${fmt.esc(est?.apoderado?.nombre || '—')} (Tel: ${est?.apoderado?.telefono || '—'})`,
                    fmt.esc(p.concepto),
                    fmt.date(p.fechaVencimiento),
                    `<span class="font-bold text-red-600">${p.diasAtraso} días</span>`,
                    `<span class="font-extrabold text-red-600">${fmt.money(p.saldo)}</span>`
                  ];
                }),
                foot: `<tfoot><tr><td colspan="6" class="text-right">TOTAL DEUDA VENCIDA (${periodLabel}):</td><td class="num font-extrabold text-red-600">${fmt.money(deudaTotal)}</td></tr></tfoot>`
              })}
            </div>
          `;
          btnExcel.disabled = false;
          btnPrint.disabled = false;
          reporteGenerado = { tipo, periodCode, periodLabel, items: vencidas };

        } else {
          const matriculasFiltradas = matriculas.filter(m => m.fecha && m.fecha.startsWith(prefix));

          if (matriculasFiltradas.length === 0) {
            area.innerHTML = UI.empty('No se encontraron registros para el periodo seleccionado.', 'fa-inbox');
            btnExcel.disabled = true;
            btnPrint.disabled = true;
            reporteGenerado = null;
            return;
          }

          area.innerHTML = `
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-extrabold text-navy text-lg">Reporte de Matrículas por Ciclo</h4>
                  <p class="text-xs text-slate-500">Periodo: <b>${periodLabel}</b> · Total matriculados: <b>${matriculasFiltradas.length}</b></p>
                </div>
              </div>
              ${UI.table({
                cols: [
                  { label: 'Código' },
                  { label: 'Estudiante' },
                  { label: 'DNI' },
                  { label: 'Programa' },
                  { label: 'Ciclo' },
                  { label: 'Fecha' },
                  { label: 'Estado' }
                ],
                rows: matriculasFiltradas.map(m => {
                  const est = db.find('estudiantes', m.estudianteId);
                  const prg = db.find('programas', m.programaId);
                  const cic = db.find('ciclos', m.cicloId);
                  return [
                    m.codigo,
                    fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—'),
                    est?.dni || '—',
                    fmt.esc(prg?.nombre || '—'),
                    fmt.esc(cic?.nombre || '—'),
                    fmt.date(m.fecha),
                    UI.badge(m.estado)
                  ];
                })
              })}
            </div>
          `;
          btnExcel.disabled = false;
          btnPrint.disabled = false;
          reporteGenerado = { tipo, periodCode, periodLabel, items: matriculasFiltradas };
        }
      });

      btnExcel?.addEventListener('click', () => {
        if (!reporteGenerado) return;
        let csvContent = '\uFEFF';
        if (reporteGenerado.tipo === 'ingresos') {
          csvContent += 'Recibo,Fecha,Estudiante,DNI,Concepto,Metodo,Operacion,Monto\n';
          reporteGenerado.items.forEach(p => {
            const est = db.find('estudiantes', p.estudianteId);
            const pen = db.find('pensiones', p.pensionId);
            csvContent += `"${p.reciboNumero || ''}","${p.fechaPago}","${est?.nombres || ''} ${est?.apellidos || ''}","${est?.dni || ''}","${pen?.concepto || ''}","${p.metodo}","${p.numeroOperacion}","${p.monto}"\n`;
          });
          UI.download(`Reporte_Ingresos_${reporteGenerado.periodCode}.csv`, csvContent, 'text/csv;charset=utf-8');
        } else if (reporteGenerado.tipo === 'morosidad') {
          csvContent += 'Estudiante,DNI,Apoderado,Telefono,Concepto,Vencimiento,DiasAtraso,Saldo\n';
          reporteGenerado.items.forEach(p => {
            const est = db.find('estudiantes', p.estudianteId);
            csvContent += `"${est?.nombres || ''} ${est?.apellidos || ''}","${est?.dni || ''}","${est?.apoderado?.nombre || ''}","${est?.apoderado?.telefono || ''}","${p.concepto}","${p.fechaVencimiento}","${p.diasAtraso}","${p.saldo}"\n`;
          });
          UI.download(`Reporte_Morosidad_${reporteGenerado.periodCode}.csv`, csvContent, 'text/csv;charset=utf-8');
        } else {
          csvContent += 'Codigo,Estudiante,DNI,Programa,Ciclo,Fecha,Estado\n';
          reporteGenerado.items.forEach(m => {
            const est = db.find('estudiantes', m.estudianteId);
            const prg = db.find('programas', m.programaId);
            const cic = db.find('ciclos', m.cicloId);
            csvContent += `"${m.codigo}","${est?.nombres || ''} ${est?.apellidos || ''}","${est?.dni || ''}","${prg?.nombre || ''}","${cic?.nombre || ''}","${m.fecha}","${m.estado}"\n`;
          });
          UI.download(`Reporte_Matriculas_${reporteGenerado.periodCode}.csv`, csvContent, 'text/csv;charset=utf-8');
        }
        UI.toast('Archivo CSV descargado para Excel');
      });

      btnPrint?.addEventListener('click', () => {
        if (!reporteGenerado) return;
        const contenidoArea = area.innerHTML;
        const titulos = { ingresos: 'Recaudación e Ingresos', morosidad: 'Morosidad y Saldos Vencidos', matriculas: 'Padrón de Matrículas' };
        const nomReporte = titulos[reporteGenerado.tipo] || 'Reporte Financiero';
        const html = `
          <div class="report-head">
            <div>
              <h2 class="text-2xl font-extrabold text-navy">PLUSTWENTY ACADEMIA PREUNIVERSITARIA</h2>
              <p class="text-xs text-slate-500">RUC ${PT.ACADEMIA.ruc} · ${PT.ACADEMIA.direccion}</p>
              <p class="text-sm font-bold text-slate-700 mt-1">Periodo: ${reporteGenerado.periodLabel}</p>
            </div>
            <div class="text-right">
              <p class="text-xs font-bold text-slate-600">Fecha de emisión: ${fmt.today()}</p>
              <p class="text-xs text-slate-400">Generado por: ${admin.nombre}</p>
            </div>
          </div>
          ${contenidoArea}
        `;
        UI.printHTML(`Reporte de ${nomReporte} (${reporteGenerado.periodLabel}) · PLUSTWENTY`, html);
      });
    }
  };

  /* ------------------------------------------------------------------
     7. GESTIÓN DE USUARIOS Y ROLES
     ------------------------------------------------------------------ */
  const UsuariosView = {
    title: 'Gestión de Usuarios y Roles',
    subtitle: 'Administración de accesos, roles de sistema y reseteo de claves',
    render() {
      const users = db.all('users');

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Cuentas de Acceso al Sistema</h3>
              <p class="page-desc">Total cuentas: ${users.length} | Administradores: ${users.filter(u => u.rol === 'admin').length} | Estudiantes/Apoderados: ${users.filter(u => u.rol === 'user').length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nuevo-usuario">
                <i class="fa-solid fa-user-plus"></i> Nueva Cuenta de Usuario
              </button>
            </div>
          </div>

          ${UI.table({
            cols: [
              { label: 'Usuario / Login' },
              { label: 'Nombre Completo' },
              { label: 'Correo' },
              { label: 'Rol' },
              { label: 'Vinculación' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: users.map(u => {
              const est = u.estudianteId ? db.find('estudiantes', u.estudianteId) : null;
              const isMe = u.id === admin.id;

              return [
                `<code class="font-bold text-navy bg-blue-50 px-2 py-1 rounded">${fmt.esc(u.username)}</code>`,
                `<b>${fmt.esc(u.nombre)}</b>`,
                `<span class="text-xs text-slate-500">${fmt.esc(u.email || '—')}</span>`,
                UI.badge(u.rol === 'admin' ? 'Administrador' : (u.tipo || 'Estudiante')),
                est ? `<a href="#estudiantes?id=${est.id}" class="text-xs text-brand hover:underline font-semibold">DNI ${est.dni} (${est.nombres.split(' ')[0]})</a>` : '<span class="text-xs text-slate-400">Cuenta Admin</span>',
                UI.badge(u.activo ? 'Activo' : 'Inactivo'),
                `<div class="actions">
                  <button class="btn btn-secondary btn-sm" data-reset-pass="${u.id}" title="Resetear contraseña"><i class="fa-solid fa-key"></i></button>
                  ${!isMe ? `
                    <button class="btn ${u.activo ? 'btn-soft-danger' : 'btn-soft-success'} btn-sm" data-toggle-user="${u.id}" title="${u.activo ? 'Desactivar acceso' : 'Activar acceso'}">
                      <i class="fa-solid ${u.activo ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                  ` : ''}
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => UsuariosView.modalCrear());

      root.addEventListener('click', async e => {
        const btnR = e.target.closest('[data-reset-pass]');
        if (btnR) {
          UsuariosView.modalReset(btnR.dataset.resetPass);
          return;
        }
        const btnT = e.target.closest('[data-toggle-user]');
        if (btnT) {
          const u = db.find('users', btnT.dataset.toggleUser);
          if (!u) return;
          const nuevo = !u.activo;
          db.update('users', u.id, { activo: nuevo });
          audit(`Cambió estado de usuario "${u.username}" a ${nuevo ? 'Activo' : 'Inactivo'}`, 'Gestión de Usuarios y Roles');
          UI.toast(`Usuario ${nuevo ? 'activado' : 'desactivado'}`);
          Shell.refresh();
        }
      });
    },

    modalCrear() {
      const estudiantes = db.all('estudiantes');

      const html = `
        <form id="form-nuevo-user" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Rol de Acceso <span class="text-red-500">*</span></label>
              <select name="rol" id="u-rol" class="select" required>
                <option value="admin">Administrador / Personal de Caja</option>
                <option value="user" selected>Estudiante / Apoderado</option>
              </select>
            </div>
            <div class="field" id="wrap-estudiante">
              <label class="label">Vincular a Estudiante</label>
              <select name="estudianteId" class="select">
                <option value="">Sin vinculación...</option>
                ${estudiantes.map(e => `<option value="${e.id}">${fmt.esc(e.nombres)} ${fmt.esc(e.apellidos)} (DNI: ${e.dni})</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre Completo <span class="text-red-500">*</span></label>
              <input type="text" name="nombre" class="input" required placeholder="Ej: Lic. Mario Vargas">
            </div>
            <div class="field">
              <label class="label">Correo Electrónico <span class="text-red-500">*</span></label>
              <input type="email" name="email" class="input" required placeholder="correo@academia.com">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre de Usuario (Login) <span class="text-red-500">*</span></label>
              <input type="text" name="username" class="input" required placeholder="usuario.login">
            </div>
            <div class="field">
              <label class="label">Contraseña Inicial <span class="text-red-500">*</span></label>
              <input type="password" name="password" class="input" required value="123456">
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Crear Cuenta</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Crear Nueva Cuenta de Usuario',
        icon: 'fa-user-gear',
        body: html,
        size: 'md'
      });

      document.getElementById('form-nuevo-user').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const username = fd.get('username').trim().toLowerCase();
        const rol = fd.get('rol');

        const existe = db.all('users').some(x => x.username.toLowerCase() === username);
        if (existe) return UI.alert('Usuario ya existe', 'El nombre de usuario ya está en uso. Elija otro.', 'error');

        db.insert('users', {
          username,
          password: fd.get('password'),
          rol,
          tipo: rol === 'admin' ? 'Administrador' : 'Estudiante',
          nombre: fd.get('nombre').trim(),
          email: fd.get('email').trim(),
          estudianteId: rol === 'admin' ? null : (fd.get('estudianteId') || null),
          activo: true,
          fechaCreacion: fmt.nowISO()
        }, 'usr');

        audit(`Creó cuenta de usuario "${username}" con rol ${rol}`, 'Gestión de Usuarios y Roles');
        UI.closeModal();
        UI.toast('Usuario creado exitosamente');
        Shell.refresh();
      });
    },

    async modalReset(userId) {
      const u = db.find('users', userId);
      if (!u) return;
      const passSugerida = fmt.randomPassword(8);

      const r = await UI.reason({
        title: `Resetear Contraseña de ${u.nombre}`,
        text: `Ingrese la nueva contraseña para el usuario <b>${u.username}</b> (Sugerencia generada: <code>${passSugerida}</code>):`,
        placeholder: passSugerida,
        confirmText: 'Actualizar Contraseña'
      });
      if (!r || !r.motivo) return;

      db.update('users', u.id, { password: r.motivo });
      audit(`Reseteó contraseña del usuario "${u.username}"`, 'Gestión de Usuarios y Roles');
      UI.alert('Contraseña Actualizada', `La nueva contraseña para <b>${u.username}</b> es:<br><br><span class="text-xl font-mono font-extrabold text-navy">${fmt.esc(r.motivo)}</span>`, 'success');
    }
  };

  /* ------------------------------------------------------------------
     8. CONFIGURACIÓN ACADÉMICA (Programas y Ciclos)
     ------------------------------------------------------------------ */
  const ConfiguracionView = {
    title: 'Configuración Académica',
    subtitle: 'Administración de la oferta formativa, programas preuniversitarios, ciclos y tarifas',
    render() {
      const programas = db.all('programas');
      const ciclos = db.all('ciclos');

      return `
        <div class="space-y-6">
          <!-- Programas -->
          <div class="card space-y-4">
            <div class="card-head">
              <div>
                <h3 class="card-title"><i class="fa-solid fa-graduation-cap"></i> Programas Académicos</h3>
                <p class="card-sub">Universidades de destino y áreas de preparación</p>
              </div>
              <button class="btn btn-primary btn-sm" id="btn-nuevo-prg">
                <i class="fa-solid fa-plus"></i> Nuevo Programa
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              ${programas.map(p => `
                <div class="prog-card" style="--pc:${p.color || '#1E3A8A'}">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-extrabold text-base text-slate-800">${fmt.esc(p.nombre)}</span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">${fmt.esc(p.siglas)}</span>
                  </div>
                  <p class="text-xs text-slate-500 line-clamp-2 mb-3">${fmt.esc(p.descripcion || '')}</p>
                  <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    ${UI.badge(p.activo ? 'Activo' : 'Inactivo')}
                    <button class="btn btn-secondary btn-sm" data-edit-prg="${p.id}"><i class="fa-solid fa-pen"></i></button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Ciclos -->
          <div class="card space-y-4">
            <div class="card-head">
              <div>
                <h3 class="card-title"><i class="fa-solid fa-calendar-week"></i> Ciclos y Tarifas</h3>
                <p class="card-sub">Costos de matrícula, cuotas de pensión y fechas de inicio/fin</p>
              </div>
              <button class="btn btn-primary btn-sm" id="btn-nuevo-cic">
                <i class="fa-solid fa-plus"></i> Nuevo Ciclo
              </button>
            </div>

            ${UI.table({
              cols: [
                { label: 'Programa' },
                { label: 'Ciclo' },
                { label: 'Modalidad' },
                { label: 'Duración' },
                { label: 'Tarifa Matrícula', cls: 'num' },
                { label: 'Pensión Mensual', cls: 'num' },
                { label: 'Cuotas', cls: 'num' },
                { label: 'Acciones', cls: 'nowrap text-right' }
              ],
              rows: ciclos.map(c => {
                const prg = db.find('programas', c.programaId);
                return [
                  `<b>${fmt.esc(prg?.nombre || '—')}</b>`,
                  `<span class="font-bold text-navy">${fmt.esc(c.nombre)}</span>`,
                  `<span class="badge badge-info">${fmt.esc(c.modalidad)}</span>`,
                  `<span class="text-xs">${fmt.date(c.fechaInicio)} al ${fmt.date(c.fechaFin)}</span>`,
                  `<span class="font-semibold">${fmt.money(c.matricula)}</span>`,
                  `<span class="font-bold text-emerald-700">${fmt.money(c.pension)}</span>`,
                  `<b>${c.cuotas} cuotas</b>`,
                  `<div class="actions">
                    <button class="btn btn-secondary btn-sm" data-edit-cic="${c.id}"><i class="fa-solid fa-pen"></i></button>
                  </div>`
                ];
              })
            })}
          </div>
        </div>
      `;
    },
    mount(params, root) {
      document.getElementById('btn-nuevo-prg')?.addEventListener('click', () => ConfiguracionView.modalPrograma());
      document.getElementById('btn-nuevo-cic')?.addEventListener('click', () => ConfiguracionView.modalCiclo());

      root.addEventListener('click', e => {
        const btnP = e.target.closest('[data-edit-prg]');
        if (btnP) ConfiguracionView.modalPrograma(btnP.dataset.editPrg);
        const btnC = e.target.closest('[data-edit-cic]');
        if (btnC) ConfiguracionView.modalCiclo(btnC.dataset.editCic);
      });
    },

    modalPrograma(prgId = null) {
      const p = prgId ? db.find('programas', prgId) : null;

      const html = `
        <form id="form-prg" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre del Programa <span class="text-red-500">*</span></label>
              <input type="text" name="nombre" class="input" value="${fmt.esc(p?.nombre || '')}" required placeholder="Ej: Universidad Nacional de Trujillo">
            </div>
            <div class="field">
              <label class="label">Siglas / Código <span class="text-red-500">*</span></label>
              <input type="text" name="siglas" class="input uppercase" value="${fmt.esc(p?.siglas || '')}" required placeholder="UNT">
            </div>
          </div>
          <div class="field">
            <label class="label">Descripción</label>
            <textarea name="descripcion" class="textarea" rows="2">${fmt.esc(p?.descripcion || '')}</textarea>
          </div>
          <div class="field">
            <label class="label">Color Distintivo</label>
            <input type="color" name="color" class="h-10 w-20 rounded cursor-pointer" value="${p?.color || '#1E3A8A'}">
          </div>
          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: p ? `Editar Programa ${p.nombre}` : 'Nuevo Programa Académico',
        icon: 'fa-graduation-cap',
        body: html,
        size: 'md'
      });

      document.getElementById('form-prg').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          nombre: fd.get('nombre').trim(),
          siglas: fd.get('siglas').trim().toUpperCase(),
          descripcion: fd.get('descripcion').trim(),
          color: fd.get('color'),
          activo: true
        };
        if (p) {
          db.update('programas', p.id, data);
          audit(`Actualizó programa académico ${data.nombre}`, 'Configuración Académica');
        } else {
          db.insert('programas', data, 'prg');
          audit(`Creó nuevo programa académico ${data.nombre}`, 'Configuración Académica');
        }
        UI.closeModal();
        UI.toast('Programa guardado');
        Shell.refresh();
      });
    },

    modalCiclo(cicId = null) {
      const c = cicId ? db.find('ciclos', cicId) : null;
      const programas = db.all('programas');

      const html = `
        <form id="form-cic" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Programa Académico <span class="text-red-500">*</span></label>
              <select name="programaId" class="select" required>
                ${programas.map(p => `<option value="${p.id}" ${c?.programaId === p.id ? 'selected' : ''}>${fmt.esc(p.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label">Nombre del Ciclo <span class="text-red-500">*</span></label>
              <input type="text" name="nombre" class="input" value="${fmt.esc(c?.nombre || '2026-II')}" required placeholder="2026-II">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="field">
              <label class="label">Modalidad</label>
              <select name="modalidad" class="select">
                <option value="Regular" ${c?.modalidad === 'Regular' ? 'selected' : ''}>Regular</option>
                <option value="Intensivo" ${c?.modalidad === 'Intensivo' ? 'selected' : ''}>Intensivo</option>
                <option value="Repaso" ${c?.modalidad === 'Repaso' ? 'selected' : ''}>Repaso</option>
                <option value="Verano" ${c?.modalidad === 'Verano' ? 'selected' : ''}>Verano</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Fecha Inicio</label>
              <input type="date" name="fechaInicio" class="input" value="${c?.fechaInicio || '2026-08-01'}" required>
            </div>
            <div class="field">
              <label class="label">Fecha Fin</label>
              <input type="date" name="fechaFin" class="input" value="${c?.fechaFin || '2026-12-15'}" required>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="field">
              <label class="label">Costo Matrícula (S/)</label>
              <input type="number" step="0.01" min="0" name="matricula" class="input" value="${c?.matricula ?? 150}" required>
            </div>
            <div class="field">
              <label class="label">Pensión Mensual (S/)</label>
              <input type="number" step="0.01" min="0" name="pension" class="input" value="${c?.pension ?? 400}" required>
            </div>
            <div class="field">
              <label class="label">N° de Pensiones</label>
              <input type="number" min="1" max="12" name="cuotas" class="input" value="${c?.cuotas ?? 4}" required>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar Ciclo</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: c ? `Editar Ciclo ${c.nombre}` : 'Nuevo Ciclo Académico y Tarifas',
        icon: 'fa-calendar-plus',
        body: html,
        size: 'lg'
      });

      document.getElementById('form-cic').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          programaId: fd.get('programaId'),
          nombre: fd.get('nombre').trim(),
          modalidad: fd.get('modalidad'),
          fechaInicio: fd.get('fechaInicio'),
          fechaFin: fd.get('fechaFin'),
          matricula: parseFloat(fd.get('matricula')) || 0,
          pension: parseFloat(fd.get('pension')) || 0,
          cuotas: parseInt(fd.get('cuotas')) || 4,
          activo: true
        };
        if (c) {
          db.update('ciclos', c.id, data);
          audit(`Actualizó ciclo ${data.nombre}`, 'Configuración Académica');
        } else {
          db.insert('ciclos', data, 'cic');
          audit(`Creó nuevo ciclo ${data.nombre}`, 'Configuración Académica');
        }
        UI.closeModal();
        UI.toast('Ciclo guardado exitosamente');
        Shell.refresh();
      });
    }
  };

  /* ------------------------------------------------------------------
     9. AUDITORÍA (Logs de Sistema de Solo Lectura)
     ------------------------------------------------------------------ */
  const AuditoriaView = {
    title: 'Auditoría del Sistema',
    subtitle: 'Registro inmutable de acciones administrativas y cambios sensibles en el sistema',
    render(params) {
      const logs = db.all('auditoria').slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      const busqueda = (params.q || '').toLowerCase();
      const modFiltro = params.mod || '';

      const modulos = Array.from(new Set(logs.map(l => l.modulo).filter(Boolean)));

      const filtrados = logs.filter(l => {
        if (modFiltro && l.modulo !== modFiltro) return false;
        if (busqueda) {
          const t = `${l.admin} ${l.accion} ${l.modulo} ${l.motivo}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Trazabilidad y Logs de Operación</h3>
              <p class="page-desc">Registros protegidos contra modificación directa: ${logs.length} eventos auditados</p>
            </div>
          </div>

          <div class="filters" style="--fcols:1">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-aud-q" class="input" placeholder="Buscar por administrador, acción o motivo..." value="${fmt.esc(params.q || '')}">
            </div>
            <select id="filtro-aud-mod" class="select">
              <option value="">Todos los módulos auditados</option>
              ${modulos.map(m => `<option value="${m}" ${modFiltro === m ? 'selected' : ''}>${fmt.esc(m)}</option>`).join('')}
            </select>
          </div>

          ${filtrados.length === 0 ? UI.empty('No se encontraron registros de auditoría.') : UI.table({
            cols: [
              { label: 'Fecha y Hora' },
              { label: 'Administrador' },
              { label: 'Módulo' },
              { label: 'Acción Ejecutada' },
              { label: 'Motivo / Detalle' }
            ],
            rows: filtrados.map(l => [
              `<span class="text-xs font-mono font-bold">${fmt.dateTime(l.fecha)}</span>`,
              `<b>${fmt.esc(l.admin)}</b>`,
              `<span class="badge badge-info">${fmt.esc(l.modulo)}</span>`,
              `<span class="font-semibold text-slate-800">${fmt.esc(l.accion)}</span>`,
              `<span class="text-xs text-slate-600">${fmt.esc(l.motivo || '—')}</span>`
            ])
          })}
        </div>
      `;
    },
    mount(params, root) {
      const applyFilters = () => {
        Shell.go('auditoria', {
          q: document.getElementById('filtro-aud-q').value.trim(),
          mod: document.getElementById('filtro-aud-mod').value
        });
      };

      document.getElementById('filtro-aud-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-aud-mod').addEventListener('change', applyFilters);
    }
  };

  /* ------------------------------------------------------------------
     Inicialización del Router y Vistas
     ------------------------------------------------------------------ */
  const views = {
    dashboard: DashboardView,
    matriculas: MatriculasView,
    estudiantes: EstudiantesView,
    pensiones: PensionesView,
    pagos: PagosView,
    reportes: ReportesView,
    usuarios: UsuariosView,
    configuracion: ConfiguracionView,
    auditoria: AuditoriaView
  };

  Shell.init({
    views,
    defaultView: 'dashboard',
    user: admin,
    onRender: () => {
      updatePendingBadge();
    }
  });

  updatePendingBadge();
})();
