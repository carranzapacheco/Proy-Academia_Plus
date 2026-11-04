package pe.plustwenty.repository;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.plustwenty.model.Contador;

public interface ContadorRepository extends JpaRepository<Contador, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Contador c where c.nombre = :nombre")
    Optional<Contador> bloquearPorNombre(@Param("nombre") String nombre);
}
