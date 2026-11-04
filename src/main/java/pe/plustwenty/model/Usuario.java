package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "usuario")
@JsonIgnoreProperties(ignoreUnknown = true)
public class Usuario extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(unique = true, nullable = false, length = 100)
    public String username;

    /** Hash BCrypt. Solo se acepta al recibir datos: nunca se envía al navegador. */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(name = "password_hash", length = 100)
    public String password;

    @Column(length = 20)
    public String rol;

    @Column(length = 30)
    public String tipo;

    public String nombre;
    public String email;

    @Column(length = 64)
    public String estudianteId;

    public Boolean activo = true;

    @Column(length = 40)
    public String fechaCreacion;

    @Column(length = 40)
    public String ultimoAcceso;
}
