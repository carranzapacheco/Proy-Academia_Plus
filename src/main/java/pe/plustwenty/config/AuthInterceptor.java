package pe.plustwenty.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.SesionService;

/** Exige sesión iniciada para toda la API, salvo login, logout, bootstrap y reinicio de demo. */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String ATTR_ME = "me";

    private static final Set<String> PUBLICAS = Set.of(
            "/api/auth/login", "/api/auth/logout", "/api/bootstrap", "/api/demo/reset");

    private final SesionService sesiones;

    public AuthInterceptor(SesionService sesiones) {
        this.sesiones = sesiones;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        if ("OPTIONS".equals(request.getMethod()) || PUBLICAS.contains(request.getRequestURI())) {
            return true;
        }
        Usuario me = sesiones.actual(request);
        if (me == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"message\":\"Su sesión no es válida o ha expirado. Inicie sesión nuevamente.\"}");
            return false;
        }
        request.setAttribute(ATTR_ME, me);
        return true;
    }
}
