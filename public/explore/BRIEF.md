# Veltro: brief compartido para las 3 direcciones de diseño

## El producto y el dolor real
Veltro es para alguien que dirige VARIAS empresas/proyectos a la vez (un consorcio) con equipos asignados a cada uno.
Su trabajo fluye así: **reunión (Google Calendar) o sesión con Claude → documentación → acuerdos/decisiones → tareas → hecho**.
Hoy ese flujo está roto entre Google Calendar (reuniones), Notion (docs y tareas, que no le gustan) y nada para la documentación de sesiones de Claude.

La versión anterior se descartó porque **parecía un clon de Notion** (sidebar con árbol de páginas y emojis, doc con emoji gigante + título enorme, gris neutro) pegado a una lista estilo Linear y una grilla de Google Calendar: tres apps en tres pestañas.
**Objetivo: tomar lo bueno de Monday (tareas claras), Notion (escribir bonito) y Google Calendar (tiempo), pero con una idea propia que los conecte. Otro nivel, no copia.**

## Prohibido (si lo haces, el mockup falla)
- Sidebar con árbol de páginas tipo Notion. Emojis como íconos de páginas o espacios (usa monogramas tipográficos y color).
- Página de doc estilo Notion (emoji gigante + título enorme centrado).
- Bordes laterales de color de más de 1px como acento (side-stripe) en tarjetas/filas/callouts.
- Texto con gradiente. Glassmorphism decorativo. Plantilla "número grande + label + stats" (hero metric). Grillas de tarjetas idénticas.
- Rayas largas (—, –) en los textos. Usa comas, dos puntos, puntos o paréntesis.
- `#000` o `#fff` puros: usa OKLCH con un leve tinte (hue ~165, el verde de la marca).
- Lorem ipsum. Todo el texto en español, realista, con los datos de abajo.

## Marca
- Nombre: Veltro. Color de marca Slate Green: #1a3a2e (oscuro) y #2d8a6a (medio). Puedes usarlo con más o menos protagonismo según tu dirección.
- Colores de espacios: Promoting = verde, Trade Marketing = azul, Tech Ve = violeta. Monogramas: PRO, TM, TV.
- Producto (no landing): debe sentirse como una herramienta en la que confías, familiar donde conviene, sorprendente donde importa.

## Datos (úsalos tal cual, es una demo coherente)
Ahora: **viernes 9 de octubre, 10:40**. Usuario: **Cesar Montero** (dueño de la cuenta "Consorcio Promoting").
Personas: Ana Díaz (admin), Pepito Pérez, Lucía Fernández, Diego Ramírez. Externos de Polar: María González, José Rojas.

Reuniones de HOY:
- 09:30-09:45 Daily Promoting (PRO) · Cesar, Ana, Pepito · terminó · tiene notas
- 10:30-11:15 Revisión rápida de pendientes (PRO) · Cesar, Ana · EN CURSO (Meet)
- 14:00-14:45 Retro del sprint Tech Ve (TV) · Cesar, Diego
- 16:00-16:30 Sync con Diego: integración de calendario (TV)
- Todo el día: Entrega de reportes semanales
Ayer jueves: 12:30 Almuerzo con proveedor de material POP; 15:30 Kickoff promociones Q4 (PRO, todo el equipo).
Martes: 15:00 Revisión de campaña con Polar (TM) · Cesar, Lucía, María González, José Rojas.
Miércoles: 16:00 Demo Tech Ve: dashboard de campañas (TV) · Cesar, Diego, Ana.

Decisiones/acuerdos que salieron de reuniones:
- Polar (mar): "Polar evalúa renovar el contrato en noviembre según resultados de Q4" · "Fotos semanales de exhibiciones al cliente"
- Kickoff Q4 (jue): "Tope de presupuesto POP: 4.500 USD" · "Activaciones en Caracas, Valencia y Maracaibo"
- Demo Tech Ve (mié): "Exportar a Excel por lotes de 5.000 filas"

Tareas (ref · título · estado · prioridad · responsable · fecha):
- PRO-1 Enviar propuesta de activación a Polar · en progreso · alta · Cesar · hoy (subtareas 1/3)
- PRO-5 Cerrar presupuesto de material POP · por hacer · urgente · Ana · vencida (hace 2 días) · nació del Daily
- PRO-6 Confirmar logística de impulsadoras para el fin de semana · por hacer · alta · Pepito · mañana · nació del Daily
- PRO-8 Definir calendario de promociones Q4 · en progreso · alta · Ana · martes
- TM-3 Negociar espacios en cabecera de góndola · bloqueada · urgente · Cesar · vencida (ayer)
- TM-4 Seguimiento de acuerdos con Polar · por hacer · alta · Cesar · hoy · nació de la reunión con Polar
- TM-5 Enviar fotos de exhibiciones a cliente · por hacer · media · Pepito · mañana · nació de la reunión con Polar
- TV-2 Integrar Google Calendar en Veltro · en progreso · alta · Cesar · hoy
- TV-3 Corregir error en exportación a Excel · bloqueada · urgente · Diego · vencida (ayer) · nació de la Demo
- TV-4 Revisión de seguridad de RLS · por hacer · alta · Diego · lunes · nació de una sesión con Claude
Progreso por espacio: Promoting 2 de 10 hechas · Trade Marketing 1 de 9 · Tech Ve 2 de 11.

Documentación:
- "Sesión con Claude: auditoría de políticas RLS" (TV, Cesar, hace 7 h) · generó 2 tareas
- "Sesión con Claude: migración de auth a Supabase" (TV, Diego, ayer) · 3 decisiones, 2 próximos pasos
- "Brief: promociones Q4" (PRO, Ana, hace 5 h)
- Notas: Revisión de campaña con Polar (TM, Lucía, martes)
- "Manual para impulsadoras" (PRO, Pepito)

## Capacidad nueva que debe sentirse (no solo verse)
Claude dentro de Veltro: resume una reunión al cerrarla, extrae decisiones y acciones (con responsable y fecha sugeridos), documenta sesiones de Claude Code y responde preguntas sobre un espacio ("¿qué quedó pendiente con Polar?"). Muéstralo de forma concreta y útil en tu pantalla, sin humo.

## Entregable técnico
- Un solo archivo HTML autocontenido, pantalla de escritorio 1440x900 (que no se rompa a 1280), sin scroll horizontal.
- Tailwind por CDN: `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11"></script>` (usa `<style type="text/tailwindcss">` con `@theme` para tus tokens).
- Fuentes desde Google Fonts si quieres (elige con intención; Geist está disponible en Google Fonts).
- Íconos: SVG inline (estilo lucide, trazo 1.5-2px). Sin imágenes externas.
- Interacciones mínimas con JS vanilla solo donde ayuden a entender la idea (por ejemplo cambiar de pestaña o fase).
- En la esquina inferior izquierda, un pequeño rótulo fijo con el nombre de la dirección (ej. "Dirección A · Pulso").
- NO uses el navegador ni levantes servidores: solo escribe el archivo. Revisa tu HTML con cuidado (etiquetas cerradas, sin errores de JS).
