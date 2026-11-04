package pe.plustwenty.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import pe.plustwenty.model.Auditoria;
import pe.plustwenty.model.Notificacion;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.AuditoriaRepository;
import pe.plustwenty.repository.NotificacionRepository;
import pe.plustwenty.repository.UsuarioRepository;

/**
 * Efectos secundarios comunes de las acciones administrativas: notificar al estudiante y auditar.
 * Lo usan tanto la revisión de pagos como el registro de matrículas (evita duplicar el código).
 */
@Service
public class EventoService {

    private final UsuarioRepository usuarios;
    private final NotificacionRepository notificaciones;
    private final AuditoriaRepository auditorias;
    private final CounterService counters;

    public EventoService(UsuarioRepository usuarios, NotificacionRepository notificaciones,
                         AuditoriaRepository auditorias, CounterService counters) {
        this.usuarios = usuarios;
        this.notificaciones = notificaciones;
        this.auditorias = auditorias;
        this.counters = counters;
    }

    /** Notifica a todas las cuentas (estudiante/apoderado) vinculadas al expediente. */
    public void notificarEstudiante(String estudianteId, String titulo, String mensaje, String tipo, String link) {
        if (estudianteId == null) {
            return;
        }
        for (Usuario u : usuarios.findByEstudianteId(estudianteId)) {
            if (!"user".equals(u.rol)) {
                continue;
            }
            Notificacion n = new Notificacion();
            n.id = nuevoId("ntf");
            n.orden = counters.next("orden");
            n.userId = u.id;
            n.titulo = titulo;
            n.mensaje = mensaje;
            n.tipo = tipo;
            n.fecha = ahora();
            n.leida = false;
            n.link = link;
            n.ref = "";
            notificaciones.save(n);
        }
    }

    public void auditar(Usuario admin, String accion, String modulo, String motivo) {
        Auditoria a = new Auditoria();
        a.id = nuevoId("aud");
        a.orden = counters.next("orden");
        a.fecha = ahora();
        a.adminId = admin.id;
        a.admin = admin.nombre;
        a.accion = accion;
        a.modulo = modulo;
        a.motivo = motivo;
        auditorias.save(a);
    }

    /** Fecha/hora actual en ISO con milisegundos (igual que el frontend). */
    public String ahora() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
    }

    /** Genera un id corto y único con prefijo (p. ej. "ntf_...", "pag_..."). */
    public String nuevoId(String prefijo) {
        return prefijo + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
}
