package pe.plustwenty.web;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.dto.request.RegistrarMatriculaRequest;
import pe.plustwenty.dto.response.RegistrarMatriculaResponse;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.ApiException;
import pe.plustwenty.service.MatriculaService;

/**
 * Registro de matrícula en una sola llamada:
 * matrícula + cronograma + notificación + auditoría.
 */
@RestController
@RequestMapping("/api/matriculas")
public class MatriculaController {

    private final MatriculaService matriculas;

    public MatriculaController(MatriculaService matriculas) {
        this.matriculas = matriculas;
    }

    @PostMapping("/registrar")
    public RegistrarMatriculaResponse registrar(
            @RequestBody RegistrarMatriculaRequest body,
            HttpServletRequest request) {

        Usuario me =
                (Usuario) request.getAttribute(
                        AuthInterceptor.ATTR_ME
                );

        if (me == null || !"admin".equals(me.rol)) {
            throw new ApiException(
                    403,
                    "No tiene permisos para registrar matrículas."
            );
        }

        return matriculas.registrar(body, me);
    }
}