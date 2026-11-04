package pe.plustwenty.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Auditoria;

public interface AuditoriaRepository extends JpaRepository<Auditoria, String> {

    /** Solo los 500 eventos más recientes: evita traer toda la bitácora (crece sin límite). */
    List<Auditoria> findTop500ByOrderByOrdenDesc();
}
