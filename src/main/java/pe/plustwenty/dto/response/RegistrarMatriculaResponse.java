package pe.plustwenty.dto.response;

import java.util.List;

import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Matricula;
import pe.plustwenty.model.Pension;

public record RegistrarMatriculaResponse(
        Matricula matricula,
        Estudiante estudiante,
        List<Pension> pensiones
) {
}