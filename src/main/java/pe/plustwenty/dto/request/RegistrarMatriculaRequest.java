package pe.plustwenty.dto.request;

import java.math.BigDecimal;

public record RegistrarMatriculaRequest(
        String estudianteId,
        String cicloId,
        String programaId,
        String fecha,
        BigDecimal montoMatricula
) {
}