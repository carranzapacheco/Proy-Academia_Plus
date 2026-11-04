package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;

/**
 * Conserva el orden de inserción de los registros (el frontend depende de él).
 * No se expone en el JSON.
 */
@MappedSuperclass
public abstract class Ordenable {

    @JsonIgnore
    @Column(name = "orden")
    public Long orden;
}
