package pe.plustwenty.dto.response;

public record EstudianteBusquedaResponse(
        String id,
        String codigo,
        String dni,
        String nombres,
        String apellidos
) {
}