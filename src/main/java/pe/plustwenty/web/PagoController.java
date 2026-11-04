package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.Pago;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.ApiException;
import pe.plustwenty.service.PagoRevisionService;
import pe.plustwenty.service.PagoRevisionService.PagoCaja;

/** Revisión de pagos en UNA sola llamada: aprobar o rechazar (transaccional). */
@RestController
@RequestMapping("/api/pagos")
public class PagoController {

    public record RechazoRequest(String motivo) {
    }

    private final PagoRevisionService revision;

    public PagoController(PagoRevisionService revision) {
        this.revision = revision;
    }

    @PostMapping("/{id}/aprobar")
    public Pago aprobar(@PathVariable String id, HttpServletRequest request) {
        return revision.aprobar(id, admin(request));
    }

    @PostMapping("/{id}/rechazar")
    public Pago rechazar(@PathVariable String id, @RequestBody(required = false) RechazoRequest body,
                         HttpServletRequest request) {
        Usuario me = admin(request);
        String motivo = (body == null || body.motivo() == null) ? "" : body.motivo().trim();
        if (motivo.length() < 5) {
            throw new ApiException(400, "Indique un motivo de rechazo (mínimo 5 caracteres).");
        }
        return revision.rechazar(id, motivo, me);
    }

    @PostMapping("/registrar-caja")
    public Pago registrarEnCaja(@RequestBody PagoCaja body, HttpServletRequest request) {
        return revision.registrarEnCaja(body, admin(request));
    }

    private Usuario admin(HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        if (me == null || !"admin".equals(me.rol)) {
            throw new ApiException(403, "No tiene permisos para realizar esta acción.");
        }
        return me;
    }
}
