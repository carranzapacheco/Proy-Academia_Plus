package pe.plustwenty.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Usuario;

public interface UsuarioRepository extends JpaRepository<Usuario, String> {

    Optional<Usuario> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    java.util.List<Usuario> findByEmailIgnoreCase(String email);

    Optional<Usuario> findFirstByEstudianteIdOrderByOrdenAsc(String estudianteId);

    java.util.List<Usuario> findByEstudianteId(String estudianteId);
}
