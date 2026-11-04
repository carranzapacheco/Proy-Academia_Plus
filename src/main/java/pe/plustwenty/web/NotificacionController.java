package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.Notificacion;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.NotificacionRepository;

/** Notificaciones del usuario actual: conteo de no leídas (badge) y lista paginada. */
@RestController
@RequestMapping("/api/notificaciones")
public class NotificacionController {

    private static final Sort RECIENTES = Sort.by(Sort.Direction.DESC, "orden");

    private final NotificacionRepository notificaciones;

    public NotificacionController(NotificacionRepository notificaciones) {
        this.notificaciones = notificaciones;
    }

    @GetMapping("/unread-count")
    public Map<String, Object> noLeidas(HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("count", notificaciones.countByUserIdAndLeidaFalse(me.id));
        return cuerpo;
    }

    @GetMapping
    public List<Notificacion> lista(@RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "20") int size,
                                    HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        int limite = Math.min(Math.max(size, 1), 100);
        return notificaciones.findByUserId(me.id, PageRequest.of(Math.max(page, 0), limite, RECIENTES));
    }

    @PostMapping("/mark-all-read")
    public Map<String, Object> marcarTodas(HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        int actualizadas = notificaciones.marcarTodasLeidas(me.id);
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("updated", actualizadas);
        return cuerpo;
    }
}
