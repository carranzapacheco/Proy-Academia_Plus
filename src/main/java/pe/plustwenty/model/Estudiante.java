package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "estudiante")
@JsonIgnoreProperties(ignoreUnknown = true)
public class Estudiante extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(unique = true, length = 30)
    public String codigo;

    @Column(unique = true, nullable = false, length = 8)
    public String dni;

    public String nombres;
    public String apellidos;

    @Column(length = 30)
    public String fechaNacimiento;

    @Column(length = 20)
    public String telefono;

    public String email;
    public String direccion;
    public String colegio;

    @Embedded
    public Apoderado apoderado;

    @Column(length = 64)
    public String programaId;

    @Column(length = 64)
    public String cicloId;

    public Boolean activo = true;

    @Column(length = 40)
    public String fechaRegistro;
}
