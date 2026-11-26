/*!
 * Burbuja de Veltro: cargar tareas y solicitudes en Veltro desde cualquier plataforma (OP, CUBE…).
 *
 *   <script src="https://<web de Veltro>/burbuja.js" data-plataforma="OP" async></script>
 *
 * Opcional, para decirle qué está viendo la persona (llamarlo cada vez que cambia):
 *
 *   window.VeltroBurbuja.contexto({ registro: { id: '3212-12-46139-EA', titulo: 'OP Farmatodo' }, texto: 'Revisar tarifa' })
 *   window.VeltroBurbuja.abrir()  /  .cerrar()
 *
 * Atributos del <script>: data-plataforma (nombre que se guarda como origen), data-posicion ("derecha" o
 * "izquierda"), data-oculta ("1": sin botón flotante, se abre con VeltroBurbuja.abrir()).
 * La página no ve nada de Veltro: el panel es un iframe de la web de Veltro con su propia sesión.
 */
;(function () {
  'use strict'
  if (window.VeltroBurbuja && window.VeltroBurbuja.__listo) return

  var script = document.currentScript
  var base = new URL(script && script.src ? script.src : location.href).origin
  var plataforma = (script && script.getAttribute('data-plataforma')) || document.title || location.hostname
  var izquierda = script && script.getAttribute('data-posicion') === 'izquierda'
  var oculta = script && script.getAttribute('data-oculta') === '1'
  var PREFIJO = 'veltro-burbuja:'
  var estado = { registro: null, texto: null }
  var abierta = false
  var panelListo = false

  // ── estilos y piezas (en un shadow root: ni la página los pisa ni ellos a la página) ──
  var anfitrion = document.createElement('div')
  anfitrion.setAttribute('data-veltro-burbuja', '')
  var raiz = anfitrion.attachShadow ? anfitrion.attachShadow({ mode: 'open' }) : anfitrion
  var lado = izquierda ? 'left' : 'right'
  raiz.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.boton{position:fixed;bottom:24px;' + lado + ':24px;z-index:2147483646;width:64px;height:64px;border-radius:50%;border:0;cursor:pointer;' +
    'background:linear-gradient(135deg,#5B1F7A 0%,#A3195B 70%,#E0546B 100%);box-shadow:0 8px 24px rgba(70,15,96,.35),0 2px 6px rgba(70,15,96,.25);' +
    'display:flex;align-items:center;justify-content:center;transition:transform .18s cubic-bezier(.2,0,0,1),box-shadow .18s;padding:0}' +
    '.boton:hover{transform:scale(1.06);box-shadow:0 10px 28px rgba(70,15,96,.42),0 2px 6px rgba(70,15,96,.25)}' +
    '.boton:active{transform:scale(.96)}' +
    '.boton:focus-visible{outline:3px solid #C9A6E4;outline-offset:3px}' +
    '.boton svg{width:34px;height:34px}' +
    '.boton.abierta .logo{opacity:0;transform:rotate(-45deg) scale(.6)}.boton .x{position:absolute;opacity:0;transform:rotate(45deg) scale(.6)}' +
    '.boton.abierta .x{opacity:1;transform:none}.logo,.x{transition:opacity .18s,transform .18s}' +
    '.panel{position:fixed;bottom:98px;' + lado + ':24px;z-index:2147483647;width:420px;height:min(700px,calc(100vh - 122px));border:0;border-radius:16px;' +
    'background:#fff;box-shadow:0 24px 64px rgba(30,10,45,.28),0 4px 14px rgba(30,10,45,.14);opacity:0;transform:translateY(12px) scale(.98);' +
    'transform-origin:bottom ' + lado + ';pointer-events:none;transition:opacity .2s cubic-bezier(.2,0,0,1),transform .2s cubic-bezier(.2,0,0,1);overflow:hidden}' +
    '.panel.abierta{opacity:1;transform:none;pointer-events:auto}' +
    '.oculta{display:none}' +
    '@media (max-width:480px){.panel{bottom:0;' + lado + ':0;width:100vw;height:100dvh;border-radius:0}.panel.abierta~.boton{display:none}}' +
    '@media (prefers-reduced-motion:reduce){.boton,.panel,.logo,.x{transition:none}}' +
    '</style>' +
    '<iframe class="panel" title="Veltro" allow="clipboard-write" loading="lazy"></iframe>' +
    '<button class="boton' + (oculta ? ' oculta' : '') + '" type="button" aria-label="Abrir Veltro" aria-expanded="false">' +
    '<svg class="logo" viewBox="150 23.3 724.3 851" aria-hidden="true">' +
    '<path fill="#fff" d="M670.8 188.9A360 360 0 1 0 770.4 261.3L483.6 758L305.6 530.1L371.6 415.8L468.4 539.6Z"/>' +
    '<path fill="#F7A8C4" d="M686.2 162.4L765.4 25.2L871.4 86.4L786.2 233.9A390.6 390.6 0 0 0 686.2 162.4Z"/></svg>' +
    '<svg class="x" viewBox="0 0 24 24" aria-hidden="true" style="width:28px;height:28px"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>' +
    '</button>'

  var iframe = raiz.querySelector('.panel')
  var boton = raiz.querySelector('.boton')

  function enviar(msg) {
    if (iframe.contentWindow) iframe.contentWindow.postMessage(msg, base)
  }

  function contextoActual() {
    return {
      type: PREFIJO + 'contexto',
      platform: plataforma,
      url: location.href,
      host: location.host,
      record: estado.registro || undefined,
      text: estado.texto || undefined,
    }
  }

  function abrir() {
    if (!iframe.src) iframe.src = base + '/burbuja?plataforma=' + encodeURIComponent(plataforma)
    abierta = true
    iframe.classList.add('abierta')
    boton.classList.add('abierta')
    boton.setAttribute('aria-expanded', 'true')
    boton.setAttribute('aria-label', 'Cerrar Veltro')
    if (panelListo) enviar(contextoActual())
  }

  function cerrar() {
    abierta = false
    iframe.classList.remove('abierta')
    boton.classList.remove('abierta')
    boton.setAttribute('aria-expanded', 'false')
    boton.setAttribute('aria-label', 'Abrir Veltro')
  }

  // Captura de la pestaña: el navegador pregunta qué compartir (sugiere esta pestaña). Mientras, el panel se
  // esconde para que no salga en la foto. Sin librerías: getDisplayMedia + un cuadro del video.
  function capturar() {
    var md = navigator.mediaDevices
    if (!md || !md.getDisplayMedia) return enviar({ type: PREFIJO + 'captura', error: 'unsupported' })
    iframe.style.visibility = 'hidden'
    md.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' })
      .then(function (stream) {
        var video = document.createElement('video')
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        return video.play().then(function () {
          // un respiro: que el aviso de «compartiendo» del navegador se vaya y el panel ya no esté
          return new Promise(function (ok) { setTimeout(ok, 350) })
        }).then(function () {
          var w = video.videoWidth, h = video.videoHeight
          var escala = Math.min(1, 1920 / w)
          var lienzo = document.createElement('canvas')
          lienzo.width = Math.round(w * escala)
          lienzo.height = Math.round(h * escala)
          lienzo.getContext('2d').drawImage(video, 0, 0, lienzo.width, lienzo.height)
          stream.getTracks().forEach(function (t) { t.stop() })
          return new Promise(function (ok) { lienzo.toBlob(ok, 'image/png') })
        })
      })
      .then(function (blob) {
        iframe.style.visibility = ''
        enviar(blob ? { type: PREFIJO + 'captura', blob: blob } : { type: PREFIJO + 'captura', error: 'failed' })
      })
      .catch(function () {
        iframe.style.visibility = ''
        enviar({ type: PREFIJO + 'captura', error: 'failed' })
      })
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== base || e.source !== iframe.contentWindow) return
    var d = e.data || {}
    if (d.type === PREFIJO + 'listo') {
      panelListo = true
      enviar(contextoActual())
    } else if (d.type === PREFIJO + 'capturar') capturar()
    else if (d.type === PREFIJO + 'cerrar') cerrar()
  })

  boton.addEventListener('click', function () {
    abierta ? cerrar() : abrir()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && abierta) cerrar()
  })

  window.VeltroBurbuja = {
    __listo: true,
    abrir: abrir,
    cerrar: cerrar,
    /** Lo que está viendo la persona: { registro: { id, titulo }, texto, plataforma } */
    contexto: function (c) {
      c = c || {}
      if (c.plataforma) plataforma = String(c.plataforma)
      if ('registro' in c) estado.registro = c.registro ? { id: c.registro.id != null ? String(c.registro.id) : undefined, title: c.registro.titulo || c.registro.title } : null
      if ('texto' in c) estado.texto = c.texto ? String(c.texto) : null
      if (panelListo) enviar(contextoActual())
    },
  }

  function montar() {
    document.body.appendChild(anfitrion)
  }
  if (document.body) montar()
  else document.addEventListener('DOMContentLoaded', montar)
})()
