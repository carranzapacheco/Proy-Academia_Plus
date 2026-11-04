package pe.plustwenty.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Pago;
import pe.plustwenty.model.Pension;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.EstudianteRepository;
import pe.plustwenty.repository.PagoRepository;
import pe.plustwenty.repository.PensionRepository;

/**
 * Revisión y registro de pagos en UNA sola operación transaccional:
 * - aprobar / rechazar un pago reportado por el estudiante,
 * - registrar un pago cobrado en caja (efectivo).
 * En cada caso: actualiza/crea el pago, emite el recibo si corresponde, notifica y audita.
 * Antes el frontend hacía 4-5 llamadas en fila (lento con XHR síncrono + latencia de red).
 */
@Service
public class PagoRevisionService {

    private final PagoRepository pagos;
    private final PensionRepository pensiones;
    private final EstudianteRepository estudiantes;
    private final CounterService counters;
    private final EventoService eventos;

    public PagoRevisionService(PagoRepository pagos, PensionRepository pensiones, EstudianteRepository estudiantes,
                               CounterService counters, EventoService eventos) {
        this.pagos = pagos;
        this.pensiones = pensiones;
        this.estudiantes = estudiantes;
        this.counters = counters;
        this.eventos = eventos;
    }

    /** Datos del cobro en ventanilla (efectivo). */
    public record PagoCaja(String estudianteId, String pensionId, BigDecimal monto, String fechaPago) {
    }

    @Transactional
    public Pago aprobar(String pagoId, Usuario admin) {
        Pago p = cargarPendiente(pagoId);
        String recibo = "R-" + String.format("%06d", counters.next("recibo"));
        p.estado = "Aprobado";
        p.revisadoPor = admin.nombre;
        p.fechaRevision = eventos.ahora();
        p.reciboNumero = recibo;
        pagos.save(p);

        eventos.notificarEstudiante(p.estudianteId, "¡Pago Aprobado!",
                "Tu abono de " + money(p.monto) + " por \"" + conceptoDe(p)
                        + "\" ha sido verificado con éxito. Recibo interno " + recibo + ".",
                "success", "historial");
        eventos.auditar(admin, "Aprobó pago " + recibo + " de " + money(p.monto),
                "Verificación de Pagos", "Op: " + texto(p.numeroOperacion));
        return p;
    }

    @Transactional
    public Pago rechazar(String pagoId, String motivo, Usuario admin) {
        Pago p = cargarPendiente(pagoId);
        p.estado = "Rechazado";
        p.motivoRechazo = motivo;
        p.revisadoPor = admin.nombre;
        p.fechaRevision = eventos.ahora();
        pagos.save(p);

        eventos.notificarEstudiante(p.estudianteId, "Pago Observado / Rechazado",
                "Tu reporte de pago de " + money(p.monto) + " fue rechazado por administración: \""
                        + motivo + "\". Por favor, revisa el voucher y vuelve a reportarlo.",
                "danger", "reportar");
        eventos.auditar(admin, "Rechazó pago Op. " + texto(p.numeroOperacion),
                "Verificación de Pagos", "Motivo: " + motivo);
        return p;
    }

    /** Cobro en caja (efectivo): queda aprobado al instante, con su número de operación y recibo. */
    @Transactional
    public Pago registrarEnCaja(PagoCaja req, Usuario admin) {
        if (req == null || req.estudianteId() == null || req.pensionId() == null) {
            throw new ApiException(400, "Faltan datos del pago.");
        }
        if (req.monto() == null || req.monto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(400, "El monto del pago debe ser mayor a cero.");
        }
        Pension pen = pensiones.findById(req.pensionId())
                .orElseThrow(() -> new ApiException(404, "Cuota no encontrada."));
        if (!req.estudianteId().equals(pen.estudianteId)) {
            throw new ApiException(400, "La cuota seleccionada no pertenece al estudiante.");
        }
        String numOp = "CAJA-" + String.format("%05d", counters.next("operacion_caja"));
        String recibo = "R-" + String.format("%06d", counters.next("recibo"));

        Pago p = new Pago();
        p.id = eventos.nuevoId("pag");
        p.orden = counters.next("orden");
        p.pensionId = pen.id;
        p.estudianteId = req.estudianteId();
        p.monto = req.monto();
        p.metodo = "Efectivo";
        p.numeroOperacion = numOp;
        p.fechaPago = req.fechaPago();
        p.comprobante = null;
        p.estado = "Aprobado";
        p.motivoRechazo = "";
        p.observacion = "Cobro en ventanilla de caja";
        p.fechaReporte = eventos.ahora();
        p.registradoPor = "admin";
        p.revisadoPor = admin.nombre;
        p.fechaRevision = eventos.ahora();
        p.reciboNumero = recibo;
        pagos.save(p);

        String concepto = pen.concepto != null ? pen.concepto : "Pensión";
        Estudiante est = estudiantes.findById(req.estudianteId()).orElse(null);
        String dni = est != null && est.dni != null ? est.dni : "—";
        eventos.notificarEstudiante(req.estudianteId(), "Pago en Efectivo Registrado",
                "Se registró tu pago en caja de " + money(p.monto) + " por \"" + concepto
                        + "\". Recibo interno " + recibo + ".",
                "success", "historial");
        eventos.auditar(admin, "Cobró en caja " + money(p.monto) + " en efectivo (Recibo " + recibo + ")",
                "Verificación de Pagos", "Estudiante DNI " + dni + " · " + concepto);
        return p;
    }

    private Pago cargarPendiente(String pagoId) {
        Pago p = pagos.findById(pagoId).orElseThrow(() -> new ApiException(404, "Pago no encontrado."));
        if (!"Pendiente".equals(p.estado)) {
            throw new ApiException(409, "Este pago ya fue revisado.");
        }
        return p;
    }

    private String conceptoDe(Pago p) {
        if (p.pensionId == null) {
            return "Pensión";
        }
        Pension pen = pensiones.findById(p.pensionId).orElse(null);
        return pen != null && pen.concepto != null ? pen.concepto : "Pensión";
    }

    private String money(BigDecimal m) {
        return "S/ " + (m == null ? BigDecimal.ZERO : m).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String texto(String s) {
        return s == null ? "—" : s;
    }
}
