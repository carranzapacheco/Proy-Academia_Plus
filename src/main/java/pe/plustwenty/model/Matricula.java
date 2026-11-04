package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "matricula", indexes = @Index(name = "ix_matricula_estudiante", columnList = "estudiante_id"))
@JsonIgnoreProperties(ignoreUnknown = true)
public class Matricula extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(unique = true, length = 30)
    public String codigo;

    @Column(length = 64)
    public String estudianteId;

    @Column(length = 64)
    public String programaId;

    @Column(length = 64)
    public String cicloId;

    @Column(length = 30)
    public String fecha;

    @Column(precision = 12, scale = 2)
    public BigDecimal montoMatricula;

    @Column(length = 20)
    public String estado;

    @Column(columnDefinition = "TEXT")
    public String observacion;

    @Column(length = 40)
    public String fechaCreacion;

    @Column(length = 100)
    public String creadoPor;
}
