package pe.plustwenty.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.model.Contador;
import pe.plustwenty.repository.ContadorRepository;

@Service
public class CounterService {

    private final ContadorRepository repo;

    public CounterService(ContadorRepository repo) {
        this.repo = repo;
    }

    /** Incrementa y devuelve el siguiente valor del correlativo (con bloqueo de fila). */
    @Transactional
    public long next(String nombre) {
        Contador c = repo.bloquearPorNombre(nombre).orElse(null);
        if (c == null) {
            c = new Contador();
            c.nombre = nombre;
            c.valor = 0L;
        }
        c.valor = c.valor + 1;
        repo.saveAndFlush(c);
        return c.valor;
    }

    @Transactional
    public void set(String nombre, long valor) {
        Contador c = repo.bloquearPorNombre(nombre).orElse(null);
        if (c == null) {
            c = new Contador();
            c.nombre = nombre;
        }
        c.valor = valor;
        repo.saveAndFlush(c);
    }
}
