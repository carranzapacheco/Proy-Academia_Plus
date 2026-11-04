package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.model.Matricula;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.ApiException;
import pe.plustwenty.service.MatriculaService;
import pe.plustwenty.service.MatriculaService.NuevaMatricula;

/** Registro de matrícula en UNA sola llamada (matrícula + cronograma + notificación + auditoría). */
@RestController
@RequestMapping("/api/matriculas")
public class MatriculaController {

    private final MatriculaService matriculas;

    public MatriculaController(MatriculaService matriculas) {
        this.matriculas = matriculas;
    }

    @PostMapping("/registrar")
    public Matricula registrar(@RequestBody NuevaMatricula body, HttpServletRequest request) {
        Usuario me = (Usuario) request.getAttribute(AuthInterceptor.ATTR_ME);
        if (me == null || !"admin".equals(me.rol)) {
            throw new ApiException(403, "No tiene permisos para realizar esta acción.");
        }
        return matriculas.registrar(body, me);
    }
}
