package pe.plustwenty.service;

/** Error de negocio con código HTTP; el frontend muestra su mensaje en una alerta. */
public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
