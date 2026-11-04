package pe.plustwenty.repository;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.model.Notificacion;

public interface NotificacionRepository extends JpaRepository<Notificacion, String> {

    List<Notificacion> findByUserId(String userId, Sort sort);

    /** Lista paginada de las notificaciones de un usuario (para el centro de avisos). */
    List<Notificacion> findByUserId(String userId, Pageable pageable);

    /** Conteo de no leídas para el badge, resuelto en la BD (usa el índice user_id, leida). */
    long countByUserIdAndLeidaFalse(String userId);

    /** Marca como leídas todas las no leídas del usuario en un solo UPDATE (sin traerlas). */
    @Modifying
    @Transactional
    @Query("update Notificacion n set n.leida = true where n.userId = :uid and n.leida = false")
    int marcarTodasLeidas(@Param("uid") String uid);
}
