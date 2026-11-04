package pe.plustwenty.service;

import java.util.regex.Pattern;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.EstudianteRepository;
import pe.plustwenty.repository.UsuarioRepository;

/**
 * Registro de un estudiante en UNA sola operación transaccional: crea su ficha y, automáticamente,
 * su cuenta de acceso al portal (usuario = DNI, contraseña = DNI). Luego audita.
 * Antes el frontend hacía ~4 llamadas en fila.
 */
@Service
public class EstudianteService {

    private static final Pattern RE_DNI = Pattern.compile("^\\d{8}$");
    private static final Pattern RE_TELEFONO = Pattern.compile("^\\d{9}$");

    private final EstudianteRepository estudiantes;
    private final UsuarioRepository usuarios;
    private final CounterService counters;
    private final PasswordEncoder encoder;
    private final EventoService eventos;

    public EstudianteService(EstudianteRepository estudiantes, UsuarioRepository usuarios, CounterService counters,
                             PasswordEncoder encoder, EventoService eventos) {
        this.estudiantes = estudiantes;
        this.usuarios = usuarios;
        this.counters = counters;
        this.encoder = encoder;
        this.eventos = eventos;
    }

    @Transactional
    public Estudiante registrar(Estudiante datos, Usuario admin) {
        if (datos == null) {
            throw new ApiException(400, "Faltan los datos del estudiante.");
        }
        String dni = datos.dni == null ? "" : datos.dni.trim();
        if (!RE_DNI.matcher(dni).matches()) {
            throw new ApiException(400, "El DNI debe tener exactamente 8 dígitos.");
        }
        if (estudiantes.existsByDni(dni)) {
            throw new ApiException(409, "Ya existe un estudiante registrado con el DNI " + dni + ".");
        }
        if (usuarios.existsByUsernameIgnoreCase(dni)) {
            throw new ApiException(409, "Ya existe una cuenta con el usuario " + dni + ".");
        }
        if (datos.telefono != null && !datos.telefono.isBlank() && !RE_TELEFONO.matcher(datos.telefono.trim()).matches()) {
            throw new ApiException(400, "El teléfono debe tener exactamente 9 dígitos.");
        }

        // Campos controlados por el servidor (el cliente no los decide).
        datos.id = eventos.nuevoId("est");
        datos.orden = counters.next("orden");
        datos.dni = dni;
        datos.codigo = "PT-2026-" + String.format("%03d", counters.next("estudiante"));
        datos.programaId = null;
        datos.cicloId = null;
        datos.activo = true;
        datos.fechaRegistro = eventos.ahora();
        estudiantes.save(datos);

        // Cuenta de acceso al portal del estudiante.
        Usuario cuenta = new Usuario();
        cuenta.id = eventos.nuevoId("usr");
        cuenta.orden = counters.next("orden");
        cuenta.username = dni;
        cuenta.password = encoder.encode(dni);
        cuenta.rol = "user";
        cuenta.tipo = "Estudiante";
        cuenta.nombre = (nz(datos.nombres) + " " + nz(datos.apellidos)).trim();
        cuenta.email = datos.email;
        cuenta.estudianteId = datos.id;
        cuenta.activo = true;
        cuenta.fechaCreacion = eventos.ahora();
        usuarios.save(cuenta);

        eventos.auditar(admin, "Registró nuevo estudiante DNI " + dni + " (" + cuenta.nombre + ")",
                "Gestión de Estudiantes", "");
        return datos;
    }

    private String nz(String s) {
        return s == null ? "" : s;
    }
}
