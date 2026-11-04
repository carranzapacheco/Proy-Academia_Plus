package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
@JsonIgnoreProperties(ignoreUnknown = true)
public class Apoderado {

    @Column(name = "apoderado_nombre")
    public String nombre;

    @Column(name = "apoderado_dni", length = 20)
    public String dni;

    @Column(name = "apoderado_telefono", length = 20)
    public String telefono;

    @Column(name = "apoderado_parentesco", length = 40)
    public String parentesco;
}
