package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "auditoria", indexes = @Index(name = "ix_auditoria_orden", columnList = "orden"))
@JsonIgnoreProperties(ignoreUnknown = true)
public class Auditoria extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(length = 40)
    public String fecha;

    @Column(length = 64)
    public String adminId;

    @Column(name = "admin_nombre", length = 120)
    public String admin;

    @Column(columnDefinition = "TEXT")
    public String accion;

    @Column(length = 100)
    public String modulo;

    @Column(columnDefinition = "TEXT")
    public String motivo;
}
