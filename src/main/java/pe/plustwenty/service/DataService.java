package pe.plustwenty.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.model.Apoderado;
import pe.plustwenty.model.ComprobantePago;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Notificacion;
import pe.plustwenty.model.Ordenable;
import pe.plustwenty.model.Pago;
import pe.plustwenty.model.Pension;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.model.Auditoria;
import pe.plustwenty.model.Ciclo;
import pe.plustwenty.model.Matricula;
import pe.plustwenty.model.Programa;
import pe.plustwenty.repository.AuditoriaRepository;
import pe.plustwenty.repository.CicloRepository;
import pe.plustwenty.repository.ComprobantePagoRepository;
import pe.plustwenty.repository.EstudianteRepository;
import pe.plustwenty.repository.MatriculaRepository;
import pe.plustwenty.repository.NotificacionRepository;
import pe.plustwenty.repository.PagoRepository;
import pe.plustwenty.repository.PensionRepository;
import pe.plustwenty.repository.ProgramaRepository;
import pe.plustwenty.repository.UsuarioRepository;

/**
 * Acceso a datos con las mismas "colecciones" que usa el frontend
 * (programas, ciclos, estudiantes, users, matriculas, pensiones, pagos, notificaciones, auditoria).
 * Aquí viven la autorización por rol y las validaciones del servidor.
 */
@Service
public class DataService {

    public static final List<String> COLECCIONES = List.of(
            "programas", "ciclos", "estudiantes", "users", "matriculas",
            "pensiones", "pagos", "notificaciones", "auditoria");

    private static final Sort ORDEN = Sort.by("orden");
    private static final Pattern RE_DNI = Pattern.compile("^\\d{8}$");
    private static final Pattern RE_TELEFONO = Pattern.compile("^\\d{9}$");
    private static final Pattern RE_OPERACION = Pattern.compile("^\\d{6}$");
    private static final Pattern RE_CAJA = Pattern.compile("^CAJA-\\d{5,}$");
    private static final String SIN_PERMISO = "No tiene permisos para realizar esta acción.";

    private final ObjectMapper mapper;
    private final CounterService counters;
    private final PasswordEncoder encoder;
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

    public DataService(ObjectMapper mapper, CounterService counters, PasswordEncoder encoder,
                       ProgramaRepository programas, CicloRepository ciclos,
                       EstudianteRepository estudiantes, UsuarioRepository usuarios,
                       MatriculaRepository matriculas, PensionRepository pensiones,
                       PagoRepository pagos, NotificacionRepository notificaciones,
                       AuditoriaRepository auditorias, ComprobantePagoRepository comprobantes) {
        this.mapper = mapper;
        this.counters = counters;
        this.encoder = encoder;
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
    }

    // ------------------------------------------------------------------
    // Lectura
    // ------------------------------------------------------------------

    /** Datos que el usuario puede ver: el administrador todo; el estudiante/apoderado solo lo suyo. */
    @Transactional(readOnly = true)
    public Map<String, Object> bootstrap(Usuario me) {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> data = new LinkedHashMap<>();
        if (me != null) {
            for (String col : COLECCIONES) {
                // Las notificaciones NO se cargan en bloque: con muchas filas tumban la app.
                // El badge usa un COUNT y la lista se pide paginada (NotificacionController).
                if ("notificaciones".equals(col)) {
                    continue;
                }
                data.put(col, leer(col, me));
            }
        }
        out.put("me", me);
        out.put("data", data);
        out.put("unreadCount", me == null ? 0L : notificaciones.countByUserIdAndLeidaFalse(me.id));
        return out;
    }

    private List<?> leer(String col, Usuario me) {
        boolean admin = esAdmin(me);
        String est = me.estudianteId;
        switch (col) {
            case "programas":
                return programas.findAll(ORDEN);
            case "ciclos":
                return ciclos.findAll(ORDEN);
            case "estudiantes":
                if (admin) {
                    return estudiantes.findAll(ORDEN);
                }
                List<Estudiante> propios = new ArrayList<>();
                if (est != null) {
                    estudiantes.findById(est).ifPresent(propios::add);
                }
                return propios;
            case "users":
                if (admin) {
                    return usuarios.findAll(ORDEN);
                }
                List<Usuario> yo = new ArrayList<>();
                yo.add(me);
                return yo;
            case "matriculas":
                return admin ? matriculas.findAll(ORDEN)
                        : (est == null ? new ArrayList<Matricula>() : matriculas.findByEstudianteId(est, ORDEN));
            case "pensiones":
                return admin ? pensiones.findAll(ORDEN)
                        : (est == null ? new ArrayList<Pension>() : pensiones.findByEstudianteId(est, ORDEN));
            case "pagos":
                return admin ? pagos.findAll(ORDEN)
                        : (est == null ? new ArrayList<Pago>() : pagos.findByEstudianteId(est, ORDEN));
            case "notificaciones":
                return admin ? notificaciones.findAll(ORDEN) : notificaciones.findByUserId(me.id, ORDEN);
            case "auditoria":
                // Solo los más recientes: la bitácora crece sin límite y no debe traerse entera.
                return admin ? auditorias.findTop500ByOrderByOrdenDesc() : new ArrayList<Auditoria>();
            default:
                throw new ApiException(404, "Colección desconocida: " + col);
        }
    }

    // ------------------------------------------------------------------
    // Escritura
    // ------------------------------------------------------------------

    @Transactional
    public Object insertar(String col, JsonNode body, Usuario me) {
        autorizarInsercion(col, me);
        Object entidad = convertir(col, body);
        validarInsercion(col, entidad, me);
        return persistir(col, entidad);
    }

    @Transactional
    public List<Object> insertarVarios(String col, JsonNode lista, Usuario me) {
        if (lista == null || !lista.isArray()) {
            throw new ApiException(400, "Se esperaba una lista de registros.");
        }
        autorizarInsercion(col, me);
        List<Object> guardados = new ArrayList<>();
        for (JsonNode item : lista) {
            Object entidad = convertir(col, item);
            validarInsercion(col, entidad, me);
            guardados.add(persistir(col, entidad));
        }
        return guardados;
    }

    /** Carga de datos semilla: sin validaciones de negocio ni permisos. */
    @Transactional
    public Object importar(String col, JsonNode item) {
        return persistir(col, convertir(col, item));
    }

    @Transactional
    @SuppressWarnings({"rawtypes"})
    public Object actualizar(String col, String id, JsonNode cambios, Usuario me) {
        if (cambios == null || !cambios.isObject()) {
            throw new ApiException(400, "El cuerpo de la solicitud debe ser un objeto JSON.");
        }
        JpaRepository repo = repo(col);
        Optional<?> encontrado = repo.findById(id);
        if (encontrado.isEmpty()) {
            throw new ApiException(404, "Registro no encontrado.");
        }
        Object actual = encontrado.get();

        ObjectNode patch = cambios.deepCopy();
        patch.remove("id");
        patch.remove("orden");
        autorizarActualizacion(col, id, actual, patch, me);

        String nuevaClave = null;
        if ("users".equals(col) && patch.hasNonNull("password")) {
            nuevaClave = patch.get("password").asText();
        }
        patch.remove("password");

        try {
            mapper.readerForUpdating(actual).readValue(patch);
        } catch (IOException ex) {
            throw new ApiException(400, "Los datos enviados no son válidos.");
        }

        if (actual instanceof Usuario) {
            Usuario u = (Usuario) actual;
            validarCorreoUsuario(u);
            if (nuevaClave != null) {
                if (nuevaClave.isBlank()) {
                    throw new ApiException(400, "La contraseña no puede estar vacía.");
                }
                u.password = encoder.encode(nuevaClave);
            }
            if (!"admin".equals(u.rol) && !"user".equals(u.rol)) {
                throw new ApiException(400, "Rol de usuario no válido.");
            }
        } else if (actual instanceof Estudiante) {
            validarEstudiante((Estudiante) actual);
        }
        return repo.save(actual);
    }

    // ------------------------------------------------------------------
    // Autorización por rol
    // ------------------------------------------------------------------

    private boolean esAdmin(Usuario me) {
        return me != null && "admin".equals(me.rol);
    }

    private void autorizarInsercion(String col, Usuario me) {
        if (esAdmin(me)) {
            return;
        }
        // El estudiante/apoderado solo puede reportar pagos y generar sus propias notificaciones.
        if (!("pagos".equals(col) || "notificaciones".equals(col))) {
            throw new ApiException(403, SIN_PERMISO);
        }
    }

    private void autorizarActualizacion(String col, String id, Object actual, ObjectNode patch, Usuario me) {
        if (esAdmin(me)) {
            return;
        }
        ObjectNode permitido = mapper.createObjectNode();
        switch (col) {
            case "estudiantes": {
                if (me.estudianteId == null || !me.estudianteId.equals(id)) {
                    throw new ApiException(403, SIN_PERMISO);
                }
                for (String campo : List.of("telefono", "email", "direccion")) {
                    if (patch.has(campo)) {
                        permitido.set(campo, patch.get(campo));
                    }
                }
                JsonNode apo = patch.get("apoderado");
                if (apo != null && apo.has("telefono")) {
                    Estudiante est = (Estudiante) actual;
                    ObjectNode merged = est.apoderado == null
                            ? mapper.createObjectNode()
                            : mapper.valueToTree(est.apoderado);
                    merged.set("telefono", apo.get("telefono"));
                    permitido.set("apoderado", merged);
                }
                break;
            }
            case "users": {
                if (!id.equals(me.id)) {
                    throw new ApiException(403, SIN_PERMISO);
                }
                if (patch.has("email")) {
                    permitido.set("email", patch.get("email"));
                }
                break;
            }
            case "notificaciones": {
                Notificacion n = (Notificacion) actual;
                if (!me.id.equals(n.userId)) {
                    throw new ApiException(403, SIN_PERMISO);
                }
                if (patch.has("leida")) {
                    permitido.set("leida", patch.get("leida"));
                }
                break;
            }
            default:
                throw new ApiException(403, SIN_PERMISO);
        }
        patch.removeAll();
        patch.setAll(permitido);
    }

    // ------------------------------------------------------------------
    // Validaciones de negocio
    // ------------------------------------------------------------------

    private void validarInsercion(String col, Object entidad, Usuario me) {
        switch (col) {
            case "estudiantes": {
                Estudiante e = (Estudiante) entidad;
                validarEstudiante(e);
                if (estudiantes.existsByDni(e.dni)) {
                    throw new ApiException(409, "Ya existe un estudiante registrado con el DNI " + e.dni + ".");
                }
                break;
            }
            case "users": {
                Usuario u = (Usuario) entidad;
                validarCorreoUsuario(u);
                if (esVacio(u.username)) {
                    throw new ApiException(400, "El nombre de usuario es obligatorio.");
                }
                if (usuarios.existsByUsernameIgnoreCase(u.username)) {
                    throw new ApiException(409, "El nombre de usuario \"" + u.username + "\" ya existe.");
                }
                if (esVacio(u.password)) {
                    throw new ApiException(400, "La contraseña es obligatoria.");
                }
                if (!"admin".equals(u.rol) && !"user".equals(u.rol)) {
                    throw new ApiException(400, "Rol de usuario no válido.");
                }
                break;
            }
            case "pagos":
                validarPago((Pago) entidad, me);
                break;
            case "notificaciones": {
                Notificacion n = (Notificacion) entidad;
                if (!esAdmin(me) && !me.id.equals(n.userId)) {
                    throw new ApiException(403, SIN_PERMISO);
                }
                break;
            }
            default:
                break;
        }
    }

    private void validarCorreoUsuario(Usuario u) {
        if (u.email == null || u.email.isBlank()) {
            u.email = null;
            return;
        }
        u.email = u.email.trim().toLowerCase(java.util.Locale.ROOT);
        if (u.email.length() > 254 || !u.email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}")) {
            throw new ApiException(400, "Indica un correo electrónico válido.");
        }
        if (usuarios.findByEmailIgnoreCase(u.email).stream().anyMatch(otra -> !java.util.Objects.equals(otra.id, u.id))) {
            throw new ApiException(409, "Este correo ya está asociado a otra cuenta.");
        }
    }

    private void validarEstudiante(Estudiante e) {
        if (e.dni == null || !RE_DNI.matcher(e.dni.trim()).matches()) {
            throw new ApiException(400, "El DNI debe tener exactamente 8 dígitos.");
        }
        if (!esVacio(e.telefono) && !RE_TELEFONO.matcher(e.telefono.trim()).matches()) {
            throw new ApiException(400, "El teléfono debe tener exactamente 9 dígitos numéricos.");
        }
        Apoderado a = e.apoderado;
        if (a != null && !esVacio(a.telefono) && !RE_TELEFONO.matcher(a.telefono.trim()).matches()) {
            throw new ApiException(400, "El teléfono del apoderado debe tener exactamente 9 dígitos numéricos.");
        }
    }

    private void validarPago(Pago p, Usuario me) {
        if (p.monto == null || p.monto.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(400, "El monto del pago debe ser mayor a cero.");
        }
        if (!esAdmin(me)) {
            // Pago reportado desde el portal: siempre queda "Pendiente" y a nombre del propio expediente.
            if (me.estudianteId == null) {
                throw new ApiException(403, SIN_PERMISO);
            }
            Pension pension = p.pensionId == null ? null : pensiones.findById(p.pensionId).orElse(null);
            if (pension == null || !me.estudianteId.equals(pension.estudianteId)) {
                throw new ApiException(403, "La cuota seleccionada no pertenece a su expediente.");
            }
            p.estudianteId = me.estudianteId;
            p.estado = "Pendiente";
            p.registradoPor = "usuario";
            p.revisadoPor = null;
            p.fechaRevision = null;
            p.reciboNumero = null;
            p.motivoRechazo = "";
            if (!"Yape".equals(p.metodo) && !"Plin".equals(p.metodo)) {
                throw new ApiException(400, "Método de pago no válido.");
            }
        }
        String op = p.numeroOperacion == null ? "" : p.numeroOperacion.trim();
        if ("Efectivo".equals(p.metodo)) {
            if (!RE_CAJA.matcher(op).matches()) {
                throw new ApiException(400, "El número de operación de caja no es válido.");
            }
        } else if (!RE_OPERACION.matcher(op).matches()) {
            throw new ApiException(400, "El número de operación debe tener exactamente 6 dígitos numéricos.");
        }
    }

    private boolean esVacio(String s) {
        return s == null || s.isBlank();
    }

    // ------------------------------------------------------------------
    // Persistencia
    // ------------------------------------------------------------------

    private Object convertir(String col, JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ApiException(400, "El cuerpo de la solicitud debe ser un objeto JSON.");
        }
        ObjectNode nodo = body.deepCopy();
        if (!nodo.hasNonNull("id") || nodo.get("id").asText().isBlank()) {
            nodo.put("id", col.substring(0, 3) + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        }
        String id = nodo.get("id").asText();
        if (repo(col).existsById(id)) {
            throw new ApiException(409, "Ya existe un registro con el identificador " + id + ".");
        }
        try {
            return mapper.treeToValue(nodo, tipo(col));
        } catch (JsonProcessingException ex) {
            throw new ApiException(400, "Los datos enviados no son válidos.");
        }
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object persistir(String col, Object entidad) {
        ((Ordenable) entidad).orden = counters.next("orden");
        if (entidad instanceof Usuario) {
            Usuario u = (Usuario) entidad;
            if (u.password != null) {
                u.password = encoder.encode(u.password);
            }
        }
        if (entidad instanceof Pago) {
            guardarComprobante((Pago) entidad);
        }
        JpaRepository repo = repo(col);
        return repo.save(entidad);
    }

    /** Separa la imagen del voucher (data URI) a su propia tabla y deja en el pago solo la ruta. */
    private void guardarComprobante(Pago p) {
        String c = p.comprobante;
        if (c != null && c.startsWith("data:")) {
            comprobantes.save(new ComprobantePago(p.id, c));
            p.comprobante = "/api/pagos/" + p.id + "/comprobante";
        } else if (c != null && !c.startsWith("/api/pagos/")) {
            p.comprobante = null;
        }
    }

    private Class<?> tipo(String col) {
        switch (col) {
            case "programas": return Programa.class;
            case "ciclos": return Ciclo.class;
            case "estudiantes": return Estudiante.class;
            case "users": return Usuario.class;
            case "matriculas": return Matricula.class;
            case "pensiones": return Pension.class;
            case "pagos": return Pago.class;
            case "notificaciones": return Notificacion.class;
            case "auditoria": return Auditoria.class;
            default: throw new ApiException(404, "Colección desconocida: " + col);
        }
    }

    @SuppressWarnings({"rawtypes"})
    private JpaRepository repo(String col) {
        switch (col) {
            case "programas": return programas;
            case "ciclos": return ciclos;
            case "estudiantes": return estudiantes;
            case "users": return usuarios;
            case "matriculas": return matriculas;
            case "pensiones": return pensiones;
            case "pagos": return pagos;
            case "notificaciones": return notificaciones;
            case "auditoria": return auditorias;
            default: throw new ApiException(404, "Colección desconocida: " + col);
        }
    }
}
