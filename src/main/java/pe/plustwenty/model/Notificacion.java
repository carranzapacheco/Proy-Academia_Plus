package pe.plustwenty.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "notificacion", indexes = {
        @Index(name = "ix_notif_user", columnList = "user_id"),
        @Index(name = "ix_notif_user_leida", columnList = "user_id, leida")
})
@JsonIgnoreProperties(ignoreUnknown = true)
public class Notificacion extends Ordenable {

    @Id
    @Column(length = 64)
    public String id;

    @Column(length = 64)
    public String userId;

    public String titulo;

    @Column(columnDefinition = "TEXT")
    public String mensaje;

    @Column(length = 20)
    public String tipo;

    @Column(length = 40)
    public String fecha;

    public Boolean leida = false;

    @Column(name = "enlace", length = 60)
    public String link;

    @Column(name = "referencia", length = 100)
    public String ref;
}
