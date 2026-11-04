package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "programa")
@JsonIgnoreProperties(ignoreUnknown = true)
public class Programa extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(nullable = false)
    public String nombre;

    @Column(length = 30)
    public String siglas;

    @Column(columnDefinition = "TEXT")
    public String descripcion;

    @Column(length = 20)
    public String color;

    public Boolean activo = true;
}
