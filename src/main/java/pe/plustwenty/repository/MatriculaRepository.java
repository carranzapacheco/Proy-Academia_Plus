package pe.plustwenty.repository;

import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Matricula;

public interface MatriculaRepository extends JpaRepository<Matricula, String> {

    List<Matricula> findByEstudianteId(String estudianteId, Sort sort);
}
