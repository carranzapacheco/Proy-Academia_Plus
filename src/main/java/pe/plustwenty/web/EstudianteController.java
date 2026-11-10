package pe.plustwenty.web;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.dto.response.EstudianteBusquedaResponse;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.service.ApiException;
import pe.plustwenty.service.EstudianteService;

/**
 * Gestión de estudiantes:
 * - registro
 * - búsqueda para matrícula, pensiones y pagos
 */
@RestController
@RequestMapping("/api/estudiantes")
public class EstudianteController {

    private final EstudianteService estudiantes;

    public EstudianteController(
            EstudianteService estudiantes) {

        this.estudiantes =
                estudiantes;
    }

    /**
     * Registra un estudiante junto con su cuenta de acceso.
     */
    @PostMapping("/registrar")
    public Estudiante registrar(
            @RequestBody Estudiante body,
            HttpServletRequest request) {

        Usuario me =
                (Usuario) request.getAttribute(
                        AuthInterceptor.ATTR_ME
                );

        if (me == null
                || !"admin".equals(me.rol)) {

            throw new ApiException(
                    403,
                    "No tiene permisos para realizar esta acción."
            );
        }

        return estudiantes.registrar(
                body,
                me
        );
    }

    /**
     * Busca estudiantes activos por DNI,
     * nombre o apellido.
     */
    @GetMapping("/buscar")
    public List<EstudianteBusquedaResponse> buscar(
            @RequestParam String q,
            HttpServletRequest request) {

        Usuario me =
                (Usuario) request.getAttribute(
                        AuthInterceptor.ATTR_ME
                );

        if (me == null
                || !"admin".equals(me.rol)) {

            throw new ApiException(
                    403,
                    "No tiene permisos para buscar estudiantes."
            );
        }

        return estudiantes.buscar(q);
    }
}