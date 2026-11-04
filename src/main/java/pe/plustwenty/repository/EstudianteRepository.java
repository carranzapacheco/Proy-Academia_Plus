package pe.plustwenty.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Estudiante;

public interface EstudianteRepository extends JpaRepository<Estudiante, String> {

    boolean existsByDni(String dni);

    Optional<Estudiante> findByDni(String dni);
}
