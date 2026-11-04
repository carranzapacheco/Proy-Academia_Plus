package pe.plustwenty;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.*;
import pe.plustwenty.service.*;
import pe.plustwenty.web.AuthController;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccesoCorreoTests {
    private final UsuarioRepository usuarios = mock(UsuarioRepository.class);
    private final EstudianteRepository estudiantes = mock(EstudianteRepository.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final ObjectMapper mapper = new ObjectMapper();

    private Usuario cuenta(String id) {
        var u = new Usuario(); u.id=id; u.username="estudiante"; u.rol="user";
        u.email="alumno@example.com"; u.password=encoder.encode("ClaveSegura2026!");
        return u;
    }

    @Test void correoNormalizadoValidaClaveYConservaRol() {
        var u=cuenta("uno");
        when(usuarios.findByEmailIgnoreCase(u.email)).thenReturn(List.of(u));
        var auth=new AuthController(usuarios,estudiantes,encoder);
        var request=new MockHttpServletRequest();
        var respuesta=auth.login(new AuthController.LoginRequest(" ALUMNO@EXAMPLE.COM ","ClaveSegura2026!",null),request);
        assertEquals(200,respuesta.getStatusCode().value());
        assertEquals("user",((Usuario)respuesta.getBody().get("user")).rol);
        assertEquals("uno",request.getSession().getAttribute(SesionService.ATTR_UID));
        assertEquals(401,auth.login(new AuthController.LoginRequest(u.email,"Incorrecta",null),new MockHttpServletRequest()).getStatusCode().value());
        assertEquals(403,auth.login(new AuthController.LoginRequest(u.email,"ClaveSegura2026!","admin"),new MockHttpServletRequest()).getStatusCode().value());
    }

    @Test void correoDuplicadoUsuarioYDniNoAbrenSesion() {
        var u=cuenta("uno");
        when(usuarios.findByEmailIgnoreCase(u.email)).thenReturn(List.of(u,cuenta("dos")));
        var auth=new AuthController(usuarios,estudiantes,encoder);
        var request=new MockHttpServletRequest();
        assertEquals(401,auth.login(new AuthController.LoginRequest(u.email,"ClaveSegura2026!",null),request).getStatusCode().value());
        assertNull(request.getSession(false));
        for (String identificador : List.of(u.username,"12345678","correo@invalido")) {
            assertEquals(400,auth.login(new AuthController.LoginRequest(identificador,"ClaveSegura2026!",null),request).getStatusCode().value());
            assertNull(request.getSession(false));
        }
        verify(usuarios,never()).findByUsernameIgnoreCase(any());
        verify(estudiantes,never()).findByDni(any());
    }

    private DataService datos() {
        return new DataService(mapper,mock(CounterService.class),encoder,
            mock(ProgramaRepository.class),mock(CicloRepository.class),estudiantes,usuarios,
            mock(MatriculaRepository.class),mock(PensionRepository.class),mock(PagoRepository.class),
            mock(NotificacionRepository.class),mock(AuditoriaRepository.class),mock(ComprobantePagoRepository.class));
    }

    @Test void perfilNormalizaCorreoYRechazaFormatoInvalidoYDuplicados() {
        var u=cuenta("uno");
        when(usuarios.findById(u.id)).thenReturn(Optional.of(u));
        when(usuarios.findByEmailIgnoreCase(u.email)).thenReturn(List.of(u));
        var datos=datos();
        datos.actualizar("users",u.id,mapper.createObjectNode().put("email"," ALUMNO@EXAMPLE.COM "),u);
        assertEquals("alumno@example.com",u.email);
        assertEquals(400,assertThrows(ApiException.class,()->datos.actualizar("users",u.id,mapper.createObjectNode().put("email","incorrecto"),u)).getStatus());
        when(usuarios.findByEmailIgnoreCase("otro@example.com")).thenReturn(List.of(cuenta("dos")));
        assertEquals(409,assertThrows(ApiException.class,()->datos.actualizar("users",u.id,mapper.createObjectNode().put("email","otro@example.com"),u)).getStatus());
        verify(usuarios,times(1)).save(u);
    }

    @Test void nuevaCuentaRechazaCorreoDuplicado() {
        var admin=cuenta("admin"); admin.rol="admin";
        when(usuarios.findByEmailIgnoreCase("alumno@example.com")).thenReturn(List.of(cuenta("otro")));
        var body=mapper.createObjectNode().put("username","nuevo").put("password","ClaveSegura2026!")
            .put("rol","user").put("email","ALUMNO@example.com");
        assertEquals(409,assertThrows(ApiException.class,()->datos().insertar("users",body,admin)).getStatus());
        verify(usuarios,never()).save(any());
    }
}
