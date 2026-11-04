package pe.plustwenty.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Imagen del voucher (data URI) separada de la tabla pago para no cargarla en los listados. */
@Entity
@Table(name = "comprobante_pago")
public class ComprobantePago {

    @Id
    @Column(name = "pago_id", length = 64)
    public String pagoId;

    @Column(columnDefinition = "LONGTEXT")
    public String contenido;

    public ComprobantePago() {
    }

    public ComprobantePago(String pagoId, String contenido) {
        this.pagoId = pagoId;
        this.contenido = contenido;
    }
}
