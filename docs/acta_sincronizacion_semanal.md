# ACTA DE SINCRONIZACIÓN SEMANAL DEL EQUIPO DE DESARROLLO

* **Proyecto:** Sistema de Control de Matrículas y Pensiones - Academia Plus Twenty (Trujillo 2026)
* **Canal oficial:** Microsoft Teams (Canal general del equipo)
* **Frecuencia y horario:** Lunes y Jueves (8:00 p.m. - 9:00 p.m.)
* **Docente invitado:** Ing. Segundo Edwin Cieza Mostacero

---

## 1. Asistencia del Equipo
* Villanueva Meregildo, Juan David (Líder del proyecto) - Presente
* Morales Yupanqui, Luis Antonio (Desarrollador Backend / Persistencia) - Presente
* Carranza Pacheco, Felipe Alejandro (Analista de requerimientos y validaciones) - Presente
* González Alava, Anthony Josue (Diseñador UX/UI) - Presente
* Ventura Guzman, David Alonso (Desarrollador Backend y Base de Datos) - Presente

---

## 2. Dinámica del Standup Semanal
1. **¿Qué se completó desde la última sesión?**
   - Culminación de la arquitectura del proyecto sobre Java 17 y Spring Boot en el paquete pe.plustwenty.
   - Implementación del formulario de registro y validación en tiempo real del formato numérico de DNI a 8 dígitos obligatorios.
   - Sincronización del repositorio en GitHub mediante Pull Requests revisados por pares.

2. **¿Qué se trabajará en el siguiente bloque del sprint?**
   - Consolidación del módulo de tesorería y cronograma de cuotas de pensión con comprobantes digitales.
   - Pruebas locales de arranque del servidor Tomcat en el puerto 8084 con base de datos MySQL.
   - Configuración del tablero Kanban en GitHub Projects y publicación del Release v1.0.0.

3. **¿Existen bloqueos o impedimentos técnicos?**
   - Se presentaron conflictos en dependencias duplicadas de Maven (pom.xml) y compatibilidad de tipos de ID en tablas de MySQL, los cuales fueron resueltos en equipo.

---

## 3. Acuerdos y Asignación de Compromisos
* **Luis Morales y David Ventura:** Validar la persistencia relacional JPA y mantener el script SQL limpio en `database/crear_bd.sql`.
* **Juan David Villanueva y Anthony González:** Revisar estilos CSS, consistencia de las vistas de usuario y flujo de autoservicio para padres de familia.
* **Felipe Carranza:** Documentar y actualizar el catálogo de reglas del negocio y casos de uso del módulo.
