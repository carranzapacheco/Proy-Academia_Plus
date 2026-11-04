package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.service.ApiException;
import pe.plustwenty.service.SeedService;

/** "Restablecer datos demo" del login: borra la base y recarga los datos de ejemplo (solo desde localhost). */
@RestController
@RequestMapping("/api/demo")
public class DemoController {

    private final SeedService seed;
    private final boolean habilitado;

    public DemoController(SeedService seed, @Value("${plustwenty.demo.reset-enabled:true}") boolean habilitado) {
        this.seed = seed;
        this.habilitado = habilitado;
    }

    @PostMapping("/reset")
    public Map<String, Object> reiniciar(HttpServletRequest request) {
        if (!habilitado) {
            throw new ApiException(403, "El restablecimiento de datos de demostración está deshabilitado.");
        }
        if (!esLocal(request.getRemoteAddr())) {
            throw new ApiException(403, "Los datos de demostración solo pueden restablecerse desde el servidor (localhost).");
        }
        seed.reiniciar();
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("ok", true);
        return cuerpo;
    }

    private boolean esLocal(String direccion) {
        try {
            return InetAddress.getByName(direccion).isLoopbackAddress();
        } catch (UnknownHostException ex) {
            return false;
        }
    }
}
