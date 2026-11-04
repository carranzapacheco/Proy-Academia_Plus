package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.ApiException;
import pe.plustwenty.service.EstudianteService;

/** Registro de estudiante en UNA sola llamada (ficha + cuenta de acceso + auditoría). */
@RestController
@RequestMapping("/api/estudiantes")
public class EstudianteController {

    private final EstudianteService estudiantes;

    public EstudianteController(EstudianteService estudiantes) {
        this.estudiantes = estudiantes;
    }

    @PostMapping("/registrar")
    public Estudiante registrar(@RequestBody Estudiante body, HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        if (me == null || !"admin".equals(me.rol)) {
            throw new ApiException(403, "No tiene permisos para realizar esta acción.");
        }
        return estudiantes.registrar(body, me);
    }
}
