package pe.plustwenty.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.plustwenty.dto.request.RegistrarMatriculaRequest;
import pe.plustwenty.dto.response.RegistrarMatriculaResponse;
import pe.plustwenty.model.Ciclo;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Matricula;
import pe.plustwenty.model.Pension;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.CicloRepository;
import pe.plustwenty.repository.EstudianteRepository;
import pe.plustwenty.repository.MatriculaRepository;
import pe.plustwenty.repository.PensionRepository;

/**
 * Servicio encargado del registro de matrículas.
 *
 * La operación se ejecuta dentro de una única transacción:
 * - valida los datos
 * - evita matrículas duplicadas
 * - crea la matrícula
 * - genera el cronograma de pensiones
 * - actualiza al estudiante
 * - genera notificación
 * - registra auditoría
 */
@Service
public class MatriculaService {

    private static final String[] MESES = {
            "Enero", "Febrero", "Marzo", "Abril",
            "Mayo", "Junio", "Julio", "Agosto",
            "Septiembre", "Octubre", "Noviembre", "Diciembre"
    };

    private final MatriculaRepository matriculas;
    private final PensionRepository pensiones;
    private final CicloRepository ciclos;
    private final EstudianteRepository estudiantes;
    private final CounterService counters;
    private final EventoService eventos;

    public MatriculaService(
            MatriculaRepository matriculas,
            PensionRepository pensiones,
            CicloRepository ciclos,
            EstudianteRepository estudiantes,
            CounterService counters,
            EventoService eventos) {

        this.matriculas = matriculas;
        this.pensiones = pensiones;
        this.ciclos = ciclos;
        this.estudiantes = estudiantes;
        this.counters = counters;
        this.eventos = eventos;
    }

    @Transactional
    public RegistrarMatriculaResponse registrar(
            RegistrarMatriculaRequest req,
            Usuario admin) {

        // --------------------------------------------------------
        // 1. Validaciones básicas
        // --------------------------------------------------------

        if (req == null
                || vacio(req.estudianteId())
                || vacio(req.cicloId())
                || vacio(req.programaId())
                || vacio(req.fecha())) {

            throw new ApiException(
                    400,
                    "Faltan datos obligatorios de la matrícula."
            );
        }

        // --------------------------------------------------------
        // 2. Buscar ciclo
        // --------------------------------------------------------

        Ciclo ciclo = ciclos.findById(req.cicloId())
                .orElseThrow(() ->
                        new ApiException(
                                404,
                                "Ciclo no encontrado."
                        ));

        // --------------------------------------------------------
        // 3. Buscar estudiante
        // --------------------------------------------------------

        Estudiante est = estudiantes.findById(req.estudianteId())
                .orElseThrow(() ->
                        new ApiException(
                                404,
                                "Estudiante no encontrado."
                        ));

        // --------------------------------------------------------
        // 4. Evitar matrícula duplicada
        // --------------------------------------------------------

        boolean existe = matriculas
                .existsByEstudianteIdAndProgramaIdAndCicloId(
                        req.estudianteId(),
                        req.programaId(),
                        req.cicloId()
                );

        if (existe) {
            throw new ApiException(
                    409,
                    "El estudiante ya tiene una matrícula registrada "
                            + "en este programa y ciclo."
            );
        }

        // --------------------------------------------------------
        // 5. Validar fecha
        // --------------------------------------------------------

        LocalDate fechaMatricula;

        try {
            fechaMatricula = LocalDate.parse(req.fecha());
        } catch (DateTimeParseException ex) {
            throw new ApiException(
                    400,
                    "La fecha de matrícula no es válida."
            );
        }

        if (fechaMatricula.isAfter(LocalDate.now())) {
            throw new ApiException(
                    400,
                    "La fecha de matrícula no puede ser posterior "
                            + "a la fecha actual."
            );
        }

        // --------------------------------------------------------
        // 6. Determinar monto de matrícula
        // --------------------------------------------------------

        BigDecimal montoMatricula = req.montoMatricula() != null
                ? req.montoMatricula()
                : ciclo.matricula;

        if (montoMatricula == null) {
            throw new ApiException(
                    400,
                    "No se ha definido el monto de matrícula."
            );
        }

        if (montoMatricula.compareTo(BigDecimal.ZERO) < 0) {
            throw new ApiException(
                    400,
                    "El monto de matrícula no puede ser negativo."
            );
        }

        // --------------------------------------------------------
        // 7. Generar código
        // --------------------------------------------------------

        String anio =
                ciclo.fechaInicio != null
                        && ciclo.fechaInicio.length() >= 4
                        ? ciclo.fechaInicio.substring(0, 4)
                        : String.valueOf(LocalDate.now().getYear());

        String codigo =
                "MAT-"
                        + anio
                        + "-"
                        + String.format(
                                "%04d",
                                counters.next("matricula")
                        );

        // --------------------------------------------------------
        // 8. Crear matrícula
        // --------------------------------------------------------

        Matricula m = new Matricula();

        m.id = nuevoId("mat");
        m.orden = counters.next("orden");
        m.codigo = codigo;
        m.estudianteId = est.id;
        m.programaId = req.programaId();
        m.cicloId = ciclo.id;
        m.fecha = fechaMatricula.toString();
        m.montoMatricula = round2(montoMatricula);
        m.estado = "Activa";
        m.observacion = "Matrícula regular";
        m.fechaCreacion = eventos.ahora();
        m.creadoPor = admin.nombre;

        matriculas.save(m);

        // --------------------------------------------------------
        // 9. Generar pensiones
        // --------------------------------------------------------

        List<Pension> cronograma =
                generarCronograma(
                        m,
                        ciclo,
                        montoMatricula
                );

        List<Pension> pensionesGuardadas =
                pensiones.saveAll(cronograma);

        // --------------------------------------------------------
        // 10. Actualizar estudiante
        // --------------------------------------------------------

        est.programaId = req.programaId();
        est.cicloId = ciclo.id;

        estudiantes.save(est);

        // --------------------------------------------------------
        // 11. Notificación
        // --------------------------------------------------------

        eventos.notificarEstudiante(
                est.id,
                "¡Matrícula Registrada!",
                "Tu matrícula al ciclo "
                        + ciclo.nombre
                        + " ha sido registrada con código "
                        + codigo
                        + ". Se generó tu cronograma de pensiones.",
                "success",
                "matriculas"
        );

        // --------------------------------------------------------
        // 12. Auditoría
        // --------------------------------------------------------

        eventos.auditar(
                admin,
                "Registró matrícula "
                        + codigo
                        + " para estudiante DNI "
                        + est.dni,
                "Gestión de Matrículas",
                "Ciclo: " + ciclo.nombre
        );

        // --------------------------------------------------------
        // 13. Respuesta
        // --------------------------------------------------------

        return new RegistrarMatriculaResponse(
                m,
                est,
                pensionesGuardadas
        );
    }

    /**
     * Genera:
     * - cargo por matrícula
     * - pensiones mensuales
     */
    private List<Pension> generarCronograma(
            Matricula m,
            Ciclo ciclo,
            BigDecimal montoMatricula) {

        List<Pension> out = new ArrayList<>();

        LocalDate inicio =
                LocalDate.parse(ciclo.fechaInicio);

        // Cargo de matrícula.
        String vencMatricula =
                m.fecha.compareTo(ciclo.fechaInicio) > 0
                        ? LocalDate.parse(m.fecha)
                                .plusDays(3)
                                .toString()
                        : ciclo.fechaInicio;

        out.add(
                obligacion(
                        m,
                        ciclo,
                        "Matrícula",
                        "Matrícula " + ciclo.nombre,
                        0,
                        round2(montoMatricula),
                        vencMatricula
                )
        );

        // Pensiones mensuales.
        int cuotas =
                ciclo.cuotas != null
                        ? ciclo.cuotas
                        : 0;

        BigDecimal importe =
                round2(ciclo.pension);

        for (int i = 0; i < cuotas; i++) {

            LocalDate d =
                    LocalDate.of(
                            inicio.getYear(),
                            inicio.getMonthValue(),
                            15
                    ).plusMonths(i);

            String concepto =
                    "Pensión "
                            + (i + 1)
                            + "/"
                            + cuotas
                            + " · "
                            + MESES[d.getMonthValue() - 1];

            out.add(
                    obligacion(
                            m,
                            ciclo,
                            "Pensión",
                            concepto,
                            i + 1,
                            importe,
                            d.toString()
                    )
            );
        }

        return out;
    }

    private Pension obligacion(
            Matricula m,
            Ciclo ciclo,
            String tipo,
            String concepto,
            int numeroCuota,
            BigDecimal importe,
            String fechaVencimiento) {

        Pension p = new Pension();

        p.id = nuevoId("pen");
        p.orden = counters.next("orden");
        p.matriculaId = m.id;
        p.estudianteId = m.estudianteId;
        p.cicloId = ciclo.id;
        p.tipo = tipo;
        p.concepto = concepto;
        p.numeroCuota = numeroCuota;
        p.importe = importe;
        p.descuento = BigDecimal.ZERO;
        p.motivoDescuento = "";
        p.fechaVencimiento = fechaVencimiento;
        p.fechaCreacion = eventos.ahora();
        p.anulada = false;

        return p;
    }

    private BigDecimal round2(BigDecimal v) {
        return (
                v == null
                        ? BigDecimal.ZERO
                        : v
        ).setScale(
                2,
                RoundingMode.HALF_UP
        );
    }

    private boolean vacio(String valor) {
        return valor == null
                || valor.trim().isEmpty();
    }

    private String nuevoId(String prefijo) {
        return prefijo
                + "_"
                + UUID.randomUUID()
                        .toString()
                        .replace("-", "")
                        .substring(0, 12);
    }
}