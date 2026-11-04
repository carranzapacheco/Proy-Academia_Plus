package pe.plustwenty.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
 * Registro de matrícula en UNA sola operación transaccional:
 * genera el código, crea la matrícula, calcula el cronograma (cargo de matrícula + pensiones mensuales),
 * actualiza el ciclo/programa del estudiante, notifica y audita.
 * Antes el frontend hacía ~6 llamadas en fila.
 */
@Service
public class MatriculaService {

    private static final String[] MESES = {"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"};

    private final MatriculaRepository matriculas;
    private final PensionRepository pensiones;
    private final CicloRepository ciclos;
    private final EstudianteRepository estudiantes;
    private final CounterService counters;
    private final EventoService eventos;

    public MatriculaService(MatriculaRepository matriculas, PensionRepository pensiones, CicloRepository ciclos,
                            EstudianteRepository estudiantes, CounterService counters, EventoService eventos) {
        this.matriculas = matriculas;
        this.pensiones = pensiones;
        this.ciclos = ciclos;
        this.estudiantes = estudiantes;
        this.counters = counters;
        this.eventos = eventos;
    }

    /** Datos que envía el formulario de nueva matrícula. */
    public record NuevaMatricula(String estudianteId, String cicloId, String programaId, String fecha,
                                 BigDecimal montoMatricula) {
    }

    @Transactional
    public Matricula registrar(NuevaMatricula req, Usuario admin) {
        if (req == null || req.estudianteId() == null || req.cicloId() == null || req.fecha() == null) {
            throw new ApiException(400, "Faltan datos de la matrícula.");
        }
        Ciclo ciclo = ciclos.findById(req.cicloId())
                .orElseThrow(() -> new ApiException(404, "Ciclo no encontrado."));
        Estudiante est = estudiantes.findById(req.estudianteId())
                .orElseThrow(() -> new ApiException(404, "Estudiante no encontrado."));

        BigDecimal montoMatricula = req.montoMatricula() != null ? req.montoMatricula() : ciclo.matricula;
        String anio = (ciclo.fechaInicio != null && ciclo.fechaInicio.length() >= 4)
                ? ciclo.fechaInicio.substring(0, 4) : String.valueOf(LocalDate.now().getYear());
        String codigo = "MAT-" + anio + "-" + String.format("%04d", counters.next("matricula"));

        Matricula m = new Matricula();
        m.id = nuevoId("mat");
        m.orden = counters.next("orden");
        m.codigo = codigo;
        m.estudianteId = est.id;
        m.programaId = req.programaId();
        m.cicloId = ciclo.id;
        m.fecha = req.fecha();
        m.montoMatricula = montoMatricula;
        m.estado = "Activa";
        m.observacion = "Matrícula regular";
        m.fechaCreacion = eventos.ahora();
        m.creadoPor = admin.nombre;
        matriculas.save(m);

        for (Pension p : generarCronograma(m, ciclo, montoMatricula)) {
            pensiones.save(p);
        }

        est.programaId = req.programaId();
        est.cicloId = ciclo.id;
        estudiantes.save(est);

        eventos.notificarEstudiante(est.id, "¡Matrícula Registrada!",
                "Tu matrícula al ciclo " + ciclo.nombre + " ha sido registrada con código " + codigo
                        + ". Se generó tu cronograma de pensiones.",
                "success", "matriculas");
        eventos.auditar(admin, "Registró matrícula " + codigo + " para estudiante DNI " + est.dni,
                "Gestión de Matrículas", "Programa: " + ciclo.nombre);
        return m;
    }

    /** Equivale a finance.generarObligaciones del frontend: cargo de matrícula + N pensiones mensuales (día 15). */
    private List<Pension> generarCronograma(Matricula m, Ciclo ciclo, BigDecimal montoMatricula) {
        List<Pension> out = new ArrayList<>();
        LocalDate inicio = LocalDate.parse(ciclo.fechaInicio);

        // Cargo de matrícula: vence 3 días después si la matrícula es posterior al inicio del ciclo.
        String vencMatricula = m.fecha.compareTo(ciclo.fechaInicio) > 0
                ? LocalDate.parse(m.fecha).plusDays(3).toString()
                : ciclo.fechaInicio;
        out.add(obligacion(m, ciclo, "Matrícula", "Matrícula " + ciclo.nombre, 0,
                round2(montoMatricula), vencMatricula));

        // Pensiones mensuales, siempre con vencimiento el día 15 de cada mes desde el inicio del ciclo.
        int cuotas = ciclo.cuotas != null ? ciclo.cuotas : 0;
        BigDecimal importe = round2(ciclo.pension);
        for (int i = 0; i < cuotas; i++) {
            LocalDate d = LocalDate.of(inicio.getYear(), inicio.getMonthValue(), 15).plusMonths(i);
            String concepto = "Pensión " + (i + 1) + "/" + cuotas + " · " + MESES[d.getMonthValue() - 1];
            out.add(obligacion(m, ciclo, "Pensión", concepto, i + 1, importe, d.toString()));
        }
        return out;
    }

    private Pension obligacion(Matricula m, Ciclo ciclo, String tipo, String concepto, int numeroCuota,
                               BigDecimal importe, String fechaVencimiento) {
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
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP);
    }

    private String nuevoId(String prefijo) {
        return prefijo + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
}
