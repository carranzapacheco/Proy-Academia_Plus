package pe.plustwenty.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.repository.AuditoriaRepository;
import pe.plustwenty.repository.CicloRepository;
import pe.plustwenty.repository.ComprobantePagoRepository;
import pe.plustwenty.repository.ContadorRepository;
import pe.plustwenty.repository.EstudianteRepository;
import pe.plustwenty.repository.MatriculaRepository;
import pe.plustwenty.repository.NotificacionRepository;
import pe.plustwenty.repository.PagoRepository;
import pe.plustwenty.repository.PensionRepository;
import pe.plustwenty.repository.ProgramaRepository;
import pe.plustwenty.repository.UsuarioRepository;

/** Carga y reinicio de los datos de demostración (src/main/resources/seed/seed.json). */
@Service
public class SeedService {

    private final ObjectMapper mapper;
    private final DataService data;
    private final CounterService counters;
    private final ProgramaRepository programas;
    private final CicloRepository ciclos;
    private final EstudianteRepository estudiantes;
    private final UsuarioRepository usuarios;
    private final MatriculaRepository matriculas;
    private final PensionRepository pensiones;
    private final PagoRepository pagos;
    private final NotificacionRepository notificaciones;
    private final AuditoriaRepository auditorias;
    private final ComprobantePagoRepository comprobantes;
    private final ContadorRepository contadores;

    public SeedService(ObjectMapper mapper, DataService data, CounterService counters,
                       ProgramaRepository programas, CicloRepository ciclos,
                       EstudianteRepository estudiantes, UsuarioRepository usuarios,
                       MatriculaRepository matriculas, PensionRepository pensiones,
                       PagoRepository pagos, NotificacionRepository notificaciones,
                       AuditoriaRepository auditorias, ComprobantePagoRepository comprobantes,
                       ContadorRepository contadores) {
        this.mapper = mapper;
        this.data = data;
        this.counters = counters;
        this.programas = programas;
        this.ciclos = ciclos;
        this.estudiantes = estudiantes;
        this.usuarios = usuarios;
        this.matriculas = matriculas;
        this.pensiones = pensiones;
        this.pagos = pagos;
        this.notificaciones = notificaciones;
        this.auditorias = auditorias;
        this.comprobantes = comprobantes;
        this.contadores = contadores;
    }

    @Transactional
    public void cargar() {
        JsonNode raiz;
        try (InputStream in = new ClassPathResource("seed/seed.json").getInputStream()) {
            raiz = mapper.readTree(in);
        } catch (IOException ex) {
            throw new IllegalStateException("No se pudo leer seed/seed.json", ex);
        }
        for (String col : DataService.COLECCIONES) {
            for (JsonNode item : raiz.path(col)) {
                data.importar(col, item);
            }
        }
        Iterator<Map.Entry<String, JsonNode>> it = raiz.path("counters").fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            counters.set(e.getKey(), e.getValue().asLong());
        }
    }

    /** Borra todo y vuelve a cargar los datos de ejemplo. */
    @Transactional
    public void reiniciar() {
        comprobantes.deleteAllInBatch();
        pagos.deleteAllInBatch();
        pensiones.deleteAllInBatch();
        matriculas.deleteAllInBatch();
        notificaciones.deleteAllInBatch();
        auditorias.deleteAllInBatch();
        usuarios.deleteAllInBatch();
        estudiantes.deleteAllInBatch();
        ciclos.deleteAllInBatch();
        programas.deleteAllInBatch();
        contadores.deleteAllInBatch();
        cargar();
    }
}
