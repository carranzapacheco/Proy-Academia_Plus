# ACTA DE RETROSPECTIVA DEL EQUIPO (SPRINT RETROSPECTIVE)

* **Fecha de reunión:** 19 de Octubre de 2026
* **Canal oficial:** Microsoft Teams
* **Facilitador:** Villanueva Meregildo, Juan David (Líder del equipo)
* **Participantes:** Todos los integrantes del equipo de desarrollo

---

## 1. ¿Qué funcionó bien durante el Sprint?
* La arquitectura Spring Boot con Spring Data JPA y MySQL se integró con éxito y sin errores de compilación tras estabilizar el pom.xml.
* La comunicación y coordinación en el canal general de Teams permitió resolver dudas de forma rápida.
* El uso del tablero Kanban en GitHub Projects facilitó la visualización del avance real de las tareas entre columnas (Por hacer, En curso, En revisión y Hecho).

---

## 2. ¿Qué dificultades se presentaron?
* En las primeras etapas se intercambió código mediante carpetas comprimidas (ZIP) fuera del flujo de Git, lo que generó carpetas duplicadas (paquetes com y pe) y conflictos de fusión complejos.
* La falta de pruebas tempranas con la base de datos MySQL provocó advertencias de incompatibilidad de tipos de clave primaria en Hibernate.

---

## 3. Plan de Acción y Compromisos de Mejora
* **Prohibición estricta de archivos ZIP:** Todo cambio de código debe ingresar obligatoriamente a través de ramas personales o de feature y fusionarse mediante Pull Requests.
* **Cumplimiento de la Matriz de Revisión:** Respetar el plazo máximo de 24 horas para revisar los Pull Requests de los compañeros, dejando observaciones constructivas en el código antes de emitir la aprobación.
* **Regla de no autofusión:** Ningún integrante podrá aprobar o fusionar su propio Pull Request.
* **Canal único:** Toda comunicación formal se mantendrá en Microsoft Teams y los hilos de GitHub para evitar la pérdida de trazabilidad en chats privados.
