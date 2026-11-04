package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.ApiException;
import pe.plustwenty.service.CounterService;

/** Correlativos atómicos (recibos, matrículas, estudiantes, operaciones de caja). */
@RestController
@RequestMapping("/api/counters")
public class CounterController {

    private static final Pattern NOMBRE = Pattern.compile("^[a-z_]{1,40}$");

    private final CounterService counters;

    public CounterController(CounterService counters) {
        this.counters = counters;
    }

    @PostMapping("/{nombre}/next")
    public Map<String, Object> siguiente(@PathVariable String nombre, HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        if (!"admin".equals(me.rol)) {
            throw new ApiException(403, "No tiene permisos para realizar esta acción.");
        }
        if (!NOMBRE.matcher(nombre).matches() || "orden".equals(nombre)) {
            throw new ApiException(400, "Nombre de correlativo no válido.");
        }
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("value", counters.next(nombre));
        return cuerpo;
    }
}
