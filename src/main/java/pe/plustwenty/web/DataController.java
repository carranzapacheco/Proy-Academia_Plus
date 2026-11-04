package pe.plustwenty.web;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.DataService;
import pe.plustwenty.service.SesionService;

@RestController
@RequestMapping("/api")
public class DataController {

    private final DataService data;
    private final SesionService sesiones;

    public DataController(DataService data, SesionService sesiones) {
        this.data = data;
        this.sesiones = sesiones;
    }

    /** Sesión actual + todas las colecciones que ese usuario puede ver. Sin sesión: me = null. */
    @GetMapping("/bootstrap")
    public Map<String, Object> bootstrap(HttpServletRequest request) {
        return data.bootstrap(sesiones.actual(request));
    }

    @PostMapping("/data/{col}")
    public Object insertar(@PathVariable String col, @RequestBody JsonNode body, HttpServletRequest request) {
        return data.insertar(col, body, yo(request));
    }

    @PostMapping("/data/{col}/batch")
    public List<Object> insertarVarios(@PathVariable String col, @RequestBody JsonNode body,
                                       HttpServletRequest request) {
        return data.insertarVarios(col, body, yo(request));
    }

    @PatchMapping("/data/{col}/{id}")
    public Object actualizar(@PathVariable String col, @PathVariable String id,
                             @RequestBody JsonNode body, HttpServletRequest request) {
        return data.actualizar(col, id, body, yo(request));
    }

    private Usuario yo(HttpServletRequest request) {
        return (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
    }
}
