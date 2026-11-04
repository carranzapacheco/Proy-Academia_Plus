# Plus Twenty — Demo empresarial

Demo local de matrículas y pensiones para Matemática, Oratoria, Locución y Podcast.

## Iniciar

Requiere Java 21. Desde la raíz del proyecto:

```powershell
.\mvnw.cmd spring-boot:run
```

Abrir http://127.0.0.1:8080/login. El servidor está limitado a esta computadora.
La página de entrada para futuros estudiantes está en http://127.0.0.1:8080/ y también en `/cursos`.
La primera ejecución con Maven necesita acceso a internet para sus dependencias.
Los estilos y el logo están incluidos; las pantallas no dependen de CDN.

Para preparar un ejecutable antes de la presentación:

```powershell
.\mvnw.cmd clean package
java -jar target/plus-twenty-academic-0.0.1-SNAPSHOT.jar
```

Ejecutar siempre desde la misma carpeta del proyecto para usar la misma base local.
No ejecutar dos instancias a la vez sobre la misma base.

## Accesos de demostración

Las cuentas de acceso se entregan en `CREDENCIALES.md`, un archivo local excluido de Git y de las pantallas de la aplicación.

Las cuentas de familia están vinculadas exclusivamente a María Fernández Quispe, DNI ficticio 72834912. Las inscripciones nuevas crean cuentas propias; estas dos cuentas de demostración conservan su vinculación original. No hay todavía gestión de apoderados ni vinculación manual de matrículas anteriores. Las credenciales son públicas de demostración; no usar estas cuentas para un despliegue real.

## Recorrido para presentar (5–8 minutos)

Para probar admisión: abrir `/cursos` sin iniciar sesión, elegir un grupo y enviar una solicitud desde «Quiero matricularme». Se solicita nombre y DNI del estudiante, turno preferido y nombre/teléfono de contacto (apoderado si es menor). La autorización de contacto es obligatoria. Al enviar se crea una cuenta de estudiante con el usuario y la contraseña elegidos. La contraseña se guarda con BCrypt. No se generan matrícula ni cuotas hasta la confirmación. Si ya tiene cuenta, debe iniciar sesión antes de enviar otra solicitud; se reutiliza la misma cuenta.

En administración, abrir «Solicitudes de matrícula» (o el contador del resumen), contactar a la familia y revisar el grupo, turno y tarifa mostrados. «Confirmar matrícula» crea la matrícula y su cronograma en una sola transacción. Una solicitud confirmada no se puede confirmar de nuevo; un DNI ya matriculado en el grupo tampoco puede generar otra matrícula. La tarifa usada es la vigente del programa al confirmar. Las llamadas o mensajes los realiza el personal fuera del sistema: no se envían notificaciones automáticas. La cuenta permite entrar en `/login` y ver en `/portal` sus solicitudes y las matrículas confirmadas vinculadas a ellas. Las cuentas, solicitudes y matrículas persisten en la base local al reiniciar. El portal no vincula datos solo por coincidencia de DNI. Las solicitudes anteriores sin cuenta y las matrículas creadas directamente por administración no se asignan automáticamente a cuentas nuevas. Este primer flujo no incluye edición, rechazo o cancelación de solicitudes, recuperación de contraseña ni gestión de apoderados.

1. Ingresar como administrador y mostrar el panel con matrículas, cobros y deuda vencida.
2. Abrir Cursos y grupos. Mostrar las cuatro ofertas, sus contenidos y horarios de ejemplo. Se pueden registrar nuevos grupos con una cantidad de cuotas y una pensión.
3. Registrar una matrícula: seleccionar curso y grupo, DNI ficticio, nombre, turno y fecha. La aplicación genera el cronograma automáticamente según la tarifa del grupo.
4. Abrir Pensiones y pagos y seleccionar al estudiante. Mostrar montos, vencimientos y saldos.
5. Registrar un abono de S/ 100 sobre una cuota de S/ 350: el saldo queda en S/ 250 y el estado cambia a PARCIAL. Completar el saldo para mostrar PAGADA. Yape, Plin y transferencia requieren número de operación.
6. Mostrar el historial y el número de constancia interna. Los pagos son registros manuales; no se realizan transacciones bancarias ni se verifican operaciones con proveedores.
7. Cerrar sesión e ingresar como padre o estudiante para consultar el curso, horario, cuotas y pagos de María.
8. Mostrar que los datos se conservan después de reiniciar.

Los contenidos, grupos, horarios, precios y estudiantes iniciales son ficticios y deben ajustarse a la oferta real de la academia. Hay un estudiante adicional llamado Alejandro Mendoza Torres usado para verificar el flujo de Podcast.

## Persistencia

Los datos se guardan en `data/academia.mv.db`. El archivo está excluido de Git.
Para respaldar, cerrar la aplicación y copiar la carpeta `data` completa.
Los ejemplos se cargan solo cuando no hay matrículas; reiniciar no borra registros.
Las pruebas usan bases en memoria separadas y no modifican el demo.

## Alcance y límites

- Administración de matrículas, registro de cursos/grupos, cronogramas y cobros manuales.
- Pagos parciales, deuda vencida, validación de saldo e historial conservado.
- Una matrícula con cuotas no se elimina: se da de baja para conservar el historial.
- Un estudiante puede matricularse en distintos cursos/grupos; se impide duplicar su DNI dentro del mismo grupo.
- Acceso con roles y protección CSRF. Las familias no pueden abrir las funciones administrativas.
- Portal con solicitudes y matrículas de cada cuenta nueva. Las cuentas de familia de demostración conservan un alumno ficticio vinculado; falta la gestión de apoderados y vinculación manual de registros anteriores.
- El contenido del curso se registra como descripción; no hay aún catálogo independiente de sesiones/docentes, cupos, asistencia ni control de choques de horario.
- No incluye pasarela de pago, facturación tributaria, emisión de comprobantes fiscales, carga de vouchers, notificaciones, descuentos ni anulaciones/reversiones de pagos.
- Las constancias son referencias internas en el historial; aún no hay descarga PDF.
- Los vencimientos se generan al cierre del mes de matrícula y los meses siguientes. Los cambios posteriores de fecha/estado no recalculan deudas.
- Antes de producción: cuentas propias, vinculación real de familias, políticas de cobranza, respaldo, despliegue y revisión de seguridad.

## Validación

```powershell
.\mvnw.cmd test
```

Las pruebas cubren generación de cuotas, abonos parciales, cancelación, rechazo de sobrepagos y valores inválidos, autenticación, permisos por rol, CSRF y renderizado de las pantallas principales.
También cubren inscripción pública, validación de DNI, autorización de contacto y contraseñas, hash BCrypt, autenticación con cuentas persistidas, aislamiento entre cuentas, nuevas solicitudes con la misma cuenta, separación entre solicitud y matrícula y confirmación única con generación de cuotas.
