package pe.plustwenty.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Correlativos atómicos: recibos, matrículas, estudiantes, caja y orden de inserción. */
@Entity
@Table(name = "contador")
public class Contador {

    @Id
    @Column(length = 60)
    public String nombre;

    @Column(nullable = false)
    public Long valor = 0L;
}
