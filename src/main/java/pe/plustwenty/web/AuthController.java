package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
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
public record ResetClave(String email, String dni, String fechaNacimiento, String nueva) {
    }

    private static final int MAX_FALLOS_RESET = 5;
    private static final long VENTANA_RESET_MS = 60L * 60 * 1000;
    private final ConcurrentHashMap<String, Deque<Long>> fallosReset = new ConcurrentHashMap<>();
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
 @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Object>> restablecer(@RequestBody ResetClave req, HttpServletRequest request) {
        String email = limpio(req.email()).toLowerCase(java.util.Locale.ROOT);
        String nueva = req.nueva() == null ? "" : req.nueva();
        if (nueva.length() < 6 || nueva.getBytes(StandardCharsets.UTF_8).length > 72) {
            return fallo(HttpStatus.BAD_REQUEST, "La nueva contraseña debe tener entre 6 y 72 caracteres.");
        }
        String clave = request.getRemoteAddr() + "|" + email;
        if (bloqueado(clave)) {
            return fallo(HttpStatus.TOO_MANY_REQUESTS,
                    "Demasiados intentos fallidos. Espera una hora o comunícate con la administración.");
        }

        Usuario u = buscar(email);
        Estudiante e = (u != null && "user".equals(u.rol) && Boolean.TRUE.equals(u.activo) && u.estudianteId != null)
                ? estudiantes.findById(u.estudianteId).orElse(null) : null;
        boolean coincide = e != null && !Boolean.FALSE.equals(e.activo)
                && !limpio(e.dni).isEmpty() && limpio(e.dni).equals(limpio(req.dni()))
                && !limpio(e.fechaNacimiento).isEmpty() && limpio(e.fechaNacimiento).equals(limpio(req.fechaNacimiento()));
        if (!coincide) {
            registrarFallo(clave);
            return fallo(HttpStatus.BAD_REQUEST, "Los datos ingresados no coinciden con ningún estudiante.");
        }

        u.password = encoder.encode(nueva);
        usuarios.save(u);
        fallosReset.remove(clave);
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("ok", true);
        return ResponseEntity.ok(cuerpo);
    }

    private static String limpio(String s) {
        return s == null ? "" : s.trim();
    }

    private boolean bloqueado(String clave) {
        Deque<Long> q = fallosReset.get(clave);
        if (q == null) {
            return false;
        }
        long ahora = System.currentTimeMillis();
        synchronized (q) {
            while (!q.isEmpty() && ahora - q.peekFirst() > VENTANA_RESET_MS) {
                q.pollFirst();
            }
            return q.size() >= MAX_FALLOS_RESET;
        }
    }

    private void registrarFallo(String clave) {
        if (fallosReset.size() > 10_000) {
            fallosReset.clear();
        }
        Deque<Long> q = fallosReset.computeIfAbsent(clave, k -> new ArrayDeque<>());
        synchronized (q) {
            q.addLast(System.currentTimeMillis());
        }
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
