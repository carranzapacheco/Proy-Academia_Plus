# Despliegue de PlusTwenty en Vercel

Esta variante mantiene el backend Spring Boot y la base relacional. No requiere reescribir el proyecto en Node, Firebase o Supabase.

## 1. Base de datos

### Opcion A - conservar Aiven MySQL
Usa las credenciales de Aiven y define en Vercel:

- `DB_URL`: JDBC URL de Aiven. Asegurate de usar TLS, por ejemplo con `sslMode=REQUIRED` segun los datos que entregue Aiven.
- `DB_USER`
- `DB_PASSWORD`

La cuenta Free de Aiven no permite elegir region, por lo que si la base queda lejos de Vercel puede existir latencia.

### Opcion B - TiDB Cloud Starter (MySQL compatible)
Es la opcion sugerida para probar otra base gratuita sin reescribir JPA. Crea una instancia MySQL-compatible y copia los datos JDBC que muestra TiDB Cloud.

Para menor latencia, elige una region y luego configura la region de Functions de Vercel lo mas cerca posible de esa base.

> TiDB es compatible con el protocolo MySQL, pero no es MySQL puro. Prueba el proyecto completo antes de reemplazar la base definitiva.

## 2. Variables de entorno en Vercel

En Project -> Settings -> Environment Variables agrega:

```text
DB_URL=jdbc:mysql://HOST:PUERTO/BASE?...parametros SSL...
DB_USER=usuario
DB_PASSWORD=clave
DEMO_RESET_ENABLED=false
SESSION_COOKIE_SECURE=true
DB_POOL_MAX=4
```

Opcionales:

```text
SEED_ENABLED=true
JPA_DDL_AUTO=update
DB_POOL_MIN=0
DB_CONNECTION_TIMEOUT_MS=10000
DB_IDLE_TIMEOUT_MS=60000
DB_MAX_LIFETIME_MS=240000
```

Cuando el esquema ya este estable, puedes cambiar `JPA_DDL_AUTO=validate` para evitar cambios de esquema en arranques futuros.

## 3. Importar el repositorio

1. Sube esta version a GitHub.
2. En Vercel selecciona **Add New -> Project**.
3. Importa el repositorio.
4. El archivo `vercel.json` fuerza el preset **Container** y `Dockerfile.vercel` empaqueta Spring Boot.
5. Agrega las variables de entorno.
6. En **Settings -> Functions**, elige una region cercana a la base de datos.
7. Despliega.

## 4. Por que se agrego Spring Session JDBC

Vercel ejecuta contenedores HTTP como Functions y las instancias son stateless. La aplicacion original guarda el identificador de usuario en `HttpSession`, que normalmente vive en memoria del servidor. En Vercel esa sesion puede perderse si otra instancia atiende la siguiente peticion.

El perfil `vercel` agrega `spring-boot-starter-session-jdbc`, por lo que las sesiones se guardan en tablas `SPRING_SESSION` dentro de la misma base relacional. Se incluye un esquema MySQL idempotente (`src/main/resources/session/schema-mysql.sql`) para que varios arranques no fallen si las tablas ya existen.

## 5. Comprobacion minima despues del deploy

1. Abrir el login.
2. Iniciar sesion.
3. Navegar por varias vistas y recargar la pagina: la sesion debe mantenerse.
4. Crear/editar un registro de prueba.
5. Cerrar sesion e ingresar de nuevo.
6. Revisar logs de Vercel si alguna peticion supera varios segundos.

## 6. Si sigues con Render

El `Dockerfile` original no fue modificado. Render puede seguir usando esa ruta. El perfil JDBC de sesiones solo entra al empaquetar `Dockerfile.vercel` con `-Pvercel`.
