package pe.plustwenty.repository;

import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Pension;

public interface PensionRepository extends JpaRepository<Pension, String> {

    List<Pension> findByEstudianteId(String estudianteId, Sort sort);
}
