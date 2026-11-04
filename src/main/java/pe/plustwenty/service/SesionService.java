package pe.plustwenty.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Service;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.UsuarioRepository;

@Service
public class SesionService {

    public static final String ATTR_UID = "uid";

    private final UsuarioRepository usuarios;

    public SesionService(UsuarioRepository usuarios) {
        this.usuarios = usuarios;
    }

    /** Usuario de la sesión actual, o null si no hay sesión válida o la cuenta fue desactivada. */
    public Usuario actual(HttpServletRequest request) {
        HttpSession sesion = request.getSession(false);
        if (sesion == null) {
            return null;
        }
        Object uid = sesion.getAttribute(ATTR_UID);
        if (!(uid instanceof String)) {
            return null;
        }
        Usuario u = usuarios.findById((String) uid).orElse(null);
        if (u == null || !Boolean.TRUE.equals(u.activo)) {
            return null;
        }
        return u;
    }
}
