package pe.plustwenty.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.ComprobantePago;

public interface ComprobantePagoRepository extends JpaRepository<ComprobantePago, String> {
}
