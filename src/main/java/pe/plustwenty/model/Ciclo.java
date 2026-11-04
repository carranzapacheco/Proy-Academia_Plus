package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "ciclo")
@JsonIgnoreProperties(ignoreUnknown = true)
public class Ciclo extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(length = 64)
    public String programaId;

    @Column(length = 40)
    public String nombre;

    @Column(length = 40)
    public String modalidad;

    @Column(length = 30)
    public String fechaInicio;

    @Column(length = 30)
    public String fechaFin;

    @Column(name = "costo_matricula", precision = 12, scale = 2)
    public BigDecimal matricula;

    @Column(name = "costo_pension", precision = 12, scale = 2)
    public BigDecimal pension;

    public Integer cuotas;

    public Boolean activo = true;
}
