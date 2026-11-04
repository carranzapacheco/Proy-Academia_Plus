package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.ComprobantePago;
import pe.plustwenty.model.Pago;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.ComprobantePagoRepository;
import pe.plustwenty.repository.PagoRepository;
import pe.plustwenty.service.ApiException;

/** Entrega la imagen del voucher de un pago (solo administrador o dueño del pago). */
@RestController
public class VoucherController {

    private final PagoRepository pagos;
    private final ComprobantePagoRepository comprobantes;

    public VoucherController(PagoRepository pagos, ComprobantePagoRepository comprobantes) {
        this.pagos = pagos;
        this.comprobantes = comprobantes;
    }

    @GetMapping("/api/pagos/{id}/comprobante")
    public ResponseEntity<byte[]> comprobante(@PathVariable String id, HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        Pago pago = pagos.findById(id).orElseThrow(() -> new ApiException(404, "Pago no encontrado."));
        boolean admin = "admin".equals(me.rol);
        if (!admin && (me.estudianteId == null || !me.estudianteId.equals(pago.estudianteId))) {
            throw new ApiException(403, "No tiene permisos para ver este comprobante.");
        }
        ComprobantePago c = comprobantes.findById(id)
                .orElseThrow(() -> new ApiException(404, "El pago no tiene comprobante."));

        String uri = c.contenido;
        int coma = uri.indexOf(',');
        if (!uri.startsWith("data:") || coma < 0) {
            throw new ApiException(404, "Comprobante no válido.");
        }
        String meta = uri.substring(5, coma);
        String carga = uri.substring(coma + 1);
        boolean base64 = meta.contains(";base64");
        byte[] bytes = base64
                ? Base64.getMimeDecoder().decode(carga)
                : URLDecoder.decode(carga, StandardCharsets.UTF_8).getBytes(StandardCharsets.UTF_8);
        String mime = meta.split(";")[0];
        MediaType tipo;
        try {
            tipo = MediaType.parseMediaType(mime);
        } catch (Exception ex) {
            tipo = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .contentType(tipo)
                .cacheControl(CacheControl.noCache().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox")
                .body(bytes);
    }
}
