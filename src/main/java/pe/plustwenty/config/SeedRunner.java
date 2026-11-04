package pe.plustwenty.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import pe.plustwenty.repository.UsuarioRepository;
import pe.plustwenty.service.SeedService;

/** Al iniciar, si la base está vacía, carga los datos de demostración. */
@Component
public class SeedRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);

    private final UsuarioRepository usuarios;
    private final SeedService seed;
    private final boolean habilitado;

    public SeedRunner(UsuarioRepository usuarios, SeedService seed,
                      @Value("${plustwenty.seed.enabled:true}") boolean habilitado) {
        this.usuarios = usuarios;
        this.seed = seed;
        this.habilitado = habilitado;
    }

    @Override
    public void run(String... args) {
        if (habilitado && usuarios.count() == 0) {
            log.info("Base de datos vacía: cargando datos de demostración...");
            seed.cargar();
            log.info("Datos de demostración cargados.");
        }
    }
}
