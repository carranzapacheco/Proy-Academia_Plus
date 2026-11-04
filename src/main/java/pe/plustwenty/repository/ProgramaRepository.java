package pe.plustwenty.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Programa;

public interface ProgramaRepository extends JpaRepository<Programa, String> {
}
