package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.EstudianteRepository;
import pe.plustwenty.repository.UsuarioRepository;
import pe.plustwenty.service.SesionService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record LoginRequest(String username, String password, String rol) {
    }

    public record CambioClave(String actual, String nueva) {
    }

    private final UsuarioRepository usuarios;
    private final EstudianteRepository estudiantes;
    private final PasswordEncoder encoder;

    public AuthController(UsuarioRepository usuarios, EstudianteRepository estudiantes, PasswordEncoder encoder) {
        this.usuarios = usuarios;
        this.estudiantes = estudiantes;
        this.encoder = encoder;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest req, HttpServletRequest request) {
        String termino = req.username() == null ? "" : req.username().trim().toLowerCase(java.util.Locale.ROOT);
        if (termino.length() > 254 || !termino.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}")) {
            return fallo(HttpStatus.BAD_REQUEST, "Ingresa el correo electrónico de tu cuenta.");
        }
        Usuario u = buscar(termino);
        if (u == null || req.password() == null || u.password == null
                || !encoder.matches(req.password(), u.password)) {
            return fallo(HttpStatus.UNAUTHORIZED, "Correo o contraseña incorrectos.");
        }
        if (!Boolean.TRUE.equals(u.activo)) {
            return fallo(HttpStatus.FORBIDDEN, "La cuenta está desactivada. Comuníquese con la administración.");
        }
        String rolEsperado = req.rol();
        if (rolEsperado != null && !rolEsperado.isBlank() && !rolEsperado.equals(u.rol)) {
            return fallo(HttpStatus.FORBIDDEN, "admin".equals(rolEsperado)
                    ? "Esta cuenta no tiene permisos de administrador."
                    : "Esta cuenta es de administrador.");
        }
        if ("user".equals(u.rol) && u.estudianteId != null) {
            Estudiante e = estudiantes.findById(u.estudianteId).orElse(null);
            if (e != null && Boolean.FALSE.equals(e.activo)) {
                return fallo(HttpStatus.FORBIDDEN, "El estudiante vinculado a esta cuenta se encuentra inactivo.");
            }
        }

        u.ultimoAcceso = Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
        usuarios.save(u);

        HttpSession anterior = request.getSession(false);
        if (anterior != null) {
            anterior.invalidate();
        }
        HttpSession sesion = request.getSession(true);
        sesion.setAttribute(SesionService.ATTR_UID, u.id);

        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("ok", true);
        cuerpo.put("user", u);
        return ResponseEntity.ok(cuerpo);
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(HttpServletRequest request) {
        HttpSession sesion = request.getSession(false);
        if (sesion != null) {
            sesion.invalidate();
        }
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("ok", true);
        return ResponseEntity.ok(cuerpo);
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, Object>> cambiarClave(@RequestBody CambioClave req, HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        if (req.actual() == null || me.password == null || !encoder.matches(req.actual(), me.password)) {
            return fallo(HttpStatus.BAD_REQUEST, "La contraseña actual ingresada no coincide.");
        }
        if (req.nueva() == null || req.nueva().length() < 6) {
            return fallo(HttpStatus.BAD_REQUEST, "La nueva contraseña debe tener al menos 6 caracteres.");
        }
        me.password = encoder.encode(req.nueva());
        usuarios.save(me);
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("ok", true);
        return ResponseEntity.ok(cuerpo);
    }

    /** El acceso solo admite el correo de una única cuenta. */
    private Usuario buscar(String termino) {
        var coincidencias = usuarios.findByEmailIgnoreCase(termino);
        return coincidencias.size() == 1 ? coincidencias.get(0) : null;
    }

    private ResponseEntity<Map<String, Object>> fallo(HttpStatus status, String mensaje) {
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("ok", false);
        cuerpo.put("error", mensaje);
        return ResponseEntity.status(status).body(cuerpo);
    }
}
