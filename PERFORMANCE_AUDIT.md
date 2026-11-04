# Auditoria rapida de rendimiento - PlusTwenty

## Lo que NO esta causando la lentitud

- El repositorio completo ronda ~1 MB sin `target`.
- El logo pesa ~138 KB y el seed ~124 KB; no explican esperas de varios segundos o un minuto.

## Causas principales detectadas

### 1. Render Free se duerme
El servicio gratuito de Render entra en reposo despues de un periodo sin trafico. El primer acceso debe arrancar JVM + Spring Boot + conexion a la base, por lo que puede sentirse muy lento.

### 2. Base remota en otra region
El proyecto usa MySQL remoto (documentacion: Aiven). Cada consulta cruza internet. Si Render y la base estan en regiones alejadas, la latencia se suma.

### 3. XHR sincrono en `app.js`
`http.call()` usa `XMLHttpRequest(..., false)`. Mientras espera al backend, el hilo de la interfaz del navegador queda bloqueado. No necesariamente hace mas lenta la consulta, pero hace que el usuario perciba la pagina como congelada.

### 4. Bootstrap inicial grande
`GET /api/bootstrap` carga para administracion programas, ciclos, estudiantes, usuarios, matriculas, pensiones, pagos y hasta 500 eventos de auditoria. Para el volumen actual es razonable, pero no escala bien a miles de filas.

### 5. Dependencias de CDN
Las paginas cargan Google Fonts, Font Awesome, Tailwind CDN, SweetAlert2 y Chart.js desde terceros. Tailwind CDN compila estilos en el navegador y es mas apropiado para desarrollo que para una version optimizada de produccion.

## Mejoras aplicadas en la variante Vercel

- `Dockerfile.vercel` con mejor aprovechamiento de cache de Maven.
- `vercel.json` para Container Runtime.
- Sesiones JDBC para un runtime stateless.
- Pool Hikari reducido y parametrizable para bases gratuitas.
- `.dockerignore` para enviar menos archivos al build.

## Mejoras recomendadas para una segunda iteracion

1. Cambiar XHR sincrono por `fetch` asincrono. Requiere tocar los flujos de lectura/escritura del SPA y debe hacerse con pruebas.
2. Separar `/api/bootstrap` en endpoints por vista o paginar estudiantes/matriculas/pensiones/pagos.
3. No incluir auditoria en bootstrap; cargarla solo al abrir Auditoria.
4. Precompilar Tailwind y servir CSS local en vez de `cdn.tailwindcss.com`.
5. Empaquetar Chart.js/SweetAlert2/Font Awesome localmente o medir si el CDN realmente es cuello de botella.
6. Agregar metricas de tiempo por endpoint para distinguir latencia de JVM, SQL y red.
