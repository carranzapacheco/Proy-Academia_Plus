package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "pago", indexes = {
        @Index(name = "ix_pago_estudiante", columnList = "estudiante_id"),
        @Index(name = "ix_pago_pension", columnList = "pension_id")
})
@JsonIgnoreProperties(ignoreUnknown = true)
public class Pago extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(length = 64)
    public String pensionId;

    @Column(length = 64)
    public String estudianteId;

    @Column(precision = 12, scale = 2)
    public BigDecimal monto;

    @Column(length = 30)
    public String metodo;

    @Column(length = 60)
    public String numeroOperacion;

    @Column(length = 30)
    public String fechaPago;

    /** Ruta del voucher (/api/pagos/{id}/comprobante). La imagen se guarda en comprobante_pago. */
    @Column(length = 255)
    public String comprobante;

    @Column(length = 20)
    public String estado;

    @Column(columnDefinition = "TEXT")
    public String motivoRechazo;

    @Column(columnDefinition = "TEXT")
    public String observacion;

    @Column(length = 40)
    public String fechaReporte;

    @Column(length = 60)
    public String registradoPor;

    @Column(length = 100)
    public String revisadoPor;

    @Column(length = 40)
    public String fechaRevision;

    @Column(unique = true, length = 20)
    public String reciboNumero;
}
