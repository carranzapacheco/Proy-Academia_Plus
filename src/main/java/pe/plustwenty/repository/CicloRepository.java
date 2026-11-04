package pe.plustwenty.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Ciclo;

public interface CicloRepository extends JpaRepository<Ciclo, String> {
}
