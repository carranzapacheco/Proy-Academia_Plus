package pe.plustwenty.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import pe.plustwenty.model.Estudiante;

public interface EstudianteRepository
        extends JpaRepository<Estudiante, String> {

    /**
     * Verifica si ya existe un estudiante registrado con el DNI indicado.
     */
    boolean existsByDni(String dni);

    /**
     * Busca un estudiante de manera exacta por DNI.
     * El DNI es único dentro del sistema.
     */
    Optional<Estudiante> findByDni(String dni);

    /**
     * Busca estudiantes activos por:
     * - DNI parcial
     * - nombres
     * - apellidos
     * - nombre completo
     *
     * La cantidad de resultados se limita mediante Pageable.
     */
    @Query("""
        SELECT e
        FROM Estudiante e
        WHERE e.activo = true
          AND (
                e.dni LIKE CONCAT(CONCAT('%', :q), '%')
             OR LOWER(e.nombres)
                  LIKE LOWER(CONCAT(CONCAT('%', :q), '%'))
             OR LOWER(e.apellidos)
                  LIKE LOWER(CONCAT(CONCAT('%', :q), '%'))
             OR LOWER(CONCAT(CONCAT(e.nombres, ' '), e.apellidos))
                  LIKE LOWER(CONCAT(CONCAT('%', :q), '%'))
          )
        ORDER BY e.apellidos, e.nombres
        """)
    List<Estudiante> buscarActivos(
            @Param("q") String q,
            Pageable pageable
    );
}