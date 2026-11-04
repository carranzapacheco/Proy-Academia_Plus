package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/** Obligación de pago: matrícula, pensión o cobro individual. */
@Entity
@Table(name = "pension", indexes = {
        @Index(name = "ix_pension_estudiante", columnList = "estudiante_id"),
        @Index(name = "ix_pension_matricula", columnList = "matricula_id")
})
@JsonIgnoreProperties(ignoreUnknown = true)
public class Pension extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(length = 64)
    public String matriculaId;

    @Column(length = 64)
    public String estudianteId;

    @Column(length = 64)
    public String cicloId;

    @Column(length = 30)
    public String tipo;

    public String concepto;

    public Integer numeroCuota;

    @Column(precision = 12, scale = 2)
    public BigDecimal importe;

    @Column(precision = 12, scale = 2)
    public BigDecimal descuento;

    @Column(columnDefinition = "TEXT")
    public String motivoDescuento;

    @Column(length = 30)
    public String fechaVencimiento;

    @Column(length = 40)
    public String fechaCreacion;

    public Boolean anulada = false;

    public Boolean anuladaPorBaja;
}
