package pe.plustwenty.repository;

import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Pago;

public interface PagoRepository extends JpaRepository<Pago, String> {

    List<Pago> findByEstudianteId(String estudianteId, Sort sort);
}
