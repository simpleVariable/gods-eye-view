export const DEFAULT_LOCALE = 'es';
const LANGUAGE_STORAGE_KEY = 'gev-language';

const translations = new Map(Object.entries({
  'GOD\'S EYE VIEW': 'VISTA DE DIOS',
  'NO PLACE LEFT BEHIND': 'NINGÚN LUGAR SE QUEDA ATRÁS',
  'ACTIVE STYLE': 'ESTILO ACTIVO',
  'Globe actions': 'Acciones del globo',
  'Clear selected data layers': 'Desactivar las capas seleccionadas',
  'Turn off all selected data layers': 'Desactivar todas las capas seleccionadas',
  'Copy share link': 'Copiar enlace para compartir',
  'Reset to full globe view': 'Volver a la vista global',
  'Reset camera and return to full globe view': 'Restablecer la cámara y volver a la vista global',
  'Account and subscription': 'Cuenta y suscripción',
  'Sign in or subscribe': 'Inicia sesión o suscríbete',
  'LOADING LIVE DATA': 'CARGANDO DATOS EN VIVO',
  'syncing road network': 'sincronizando red vial',
  'loading frames': 'cargando imágenes',
  'GEV ACCOUNT': 'CUENTA GEV',
  'Access the full globe': 'Accede al globo completo',
  'Close account dialog': 'Cerrar ventana de cuenta',
  'Close': 'Cerrar',
  'Account action': 'Acción de cuenta',
  'Sign in': 'Iniciar sesión',
  'Create account': 'Crear cuenta',
  'Email': 'Correo electrónico',
  'Password': 'Contraseña',
  'Email me a sign-in link': 'Enviarme un enlace de acceso',
  'Signed in as': 'Sesión iniciada como',
  'Verify your email using the link we sent before subscribing.': 'Verifica tu correo con el enlace que te enviamos antes de suscribirte.',
  'Billing': 'Facturación',
  'Monthly': 'Mensual',
  'Annual': 'Anual',
  'Subscribe': 'Suscribirse',
  'Manage subscription': 'Administrar suscripción',
  'Sign out': 'Cerrar sesión',
  'Free access for everyone': 'Acceso gratuito para todos',
  'Payment received. Your subscription will activate shortly.': 'Pago recibido. Tu suscripción se activará en breve.',
  'Checkout was cancelled.': 'Se canceló el pago.',
  'Check your inbox to verify your email.': 'Revisa tu bandeja de entrada para verificar tu correo.',
  'If that address has an account, a sign-in link is on its way.': 'Si esa dirección tiene una cuenta, recibirás un enlace de acceso.',
  'Language': 'Idioma',
  'DISPLAY': 'PANTALLA',
  'Layout': 'Diseño',
  'Tactical': 'Táctico',
  'Operator': 'Operador',
  'Minimal': 'Mínimo',
  'Render': 'Renderizado',
  'Render quality': 'Calidad de renderizado',
  'Auto': 'Automática',
  'Low': 'Baja',
  'Medium': 'Media',
  'High': 'Alta',
  'Ultra': 'Ultra',
  'DETECT': 'DETECCIÓN',
  'Detection overlay': 'Superposición de detección',
  'Density': 'Densidad',
  'Detection label density': 'Densidad de etiquetas de detección',
  'Allocation': 'Distribución',
  'Detection label allocation': 'Distribución de etiquetas de detección',
  'Elastic': 'Elástica',
  'WEIGHTED': 'PONDERADA',
  'Fade': 'Desvanecimiento',
  'Detection fade distance': 'Distancia de desvanecimiento de detección',
  'VISUAL PRESETS': 'AJUSTES VISUALES',
  'Expand Visual Presets': 'Expandir ajustes visuales',
  'Pin visual presets': 'Fijar ajustes visuales',
  'Keep visual presets open': 'Mantener abiertos los ajustes visuales',
  'Normal': 'Normal',
  'MAP SOURCE': 'FUENTE DEL MAPA',
  'Map source': 'Fuente del mapa',
  'Style': 'Estilo',
  'LOCATION': 'UBICACIÓN',
  'Collapse panel': 'Contraer panel',
  'Pin location tray': 'Fijar panel de ubicación',
  'Keep location tray open': 'Mantener abierto el panel de ubicación',
  'Search any location': 'Buscar una ubicación',
  'Search any location...': 'Buscar cualquier ubicación...',
  'DATA LAYERS': 'CAPAS DE DATOS',
  'FLIGHT SIM': 'SIMULADOR DE VUELO',
  'fly a 747 yourself': 'pilota un 747',
  'CCTV feed frame': 'Imagen de cámara CCTV',
  'SOURCE · UNKNOWN': 'FUENTE · DESCONOCIDA',
  'Enable CCTV to load camera intersections': 'Activa CCTV para cargar cámaras de tráfico',
  'CCTV OFF': 'CCTV DESACTIVADO',
  'NEAREST': 'MÁS CERCANA',
  'PREV': 'ANTERIOR',
  'NEXT': 'SIGUIENTE',
  'FOCUS': 'ENFOCAR',
  'COVERAGE OFF': 'COBERTURA DESACTIVADA',
  'AUTO HOP OFF': 'SALTO AUTOMÁTICO DESACTIVADO',
  'PROJECTION ON': 'PROYECCIÓN ACTIVADA',
  'CALIBRATION': 'CALIBRACIÓN',
  'ADJUST': 'AJUSTAR',
  'SAVE CAL': 'GUARDAR CAL.',
  'RESET CAL': 'RESTABLECER CAL.',
  'SCENE SUMMARY': 'RESUMEN DE ESCENA',
  'Enable CCTV to start camera-linked intelligence summaries.': 'Activa CCTV para iniciar resúmenes de inteligencia vinculados a cámaras.',
  'Scene summary': 'Resumen de escena',
  'CCTV camera': 'Cámara CCTV',
  'Camera pose — click a value to type': 'Orientación de cámara; selecciona un valor para editarlo',
  'Map source': 'Fuente del mapa',
  'Bing Aerial': 'Bing Aéreo',
  'Bing Labels': 'Bing con etiquetas',
  'OSM': 'OSM',
  'Google 3D': 'Google 3D',
  'Flights': 'Vuelos',
  'Military Flights': 'Vuelos militares',
  'Earthquakes': 'Terremotos',
  'Satellites': 'Satélites',
  'Space Missions': 'Misiones espaciales',
  'Traffic': 'Tráfico',
  'Bikeshare': 'Bicicletas compartidas',
  'Ships': 'Embarcaciones',
  'Vessels': 'Embarcaciones',
  'Active Fires': 'Incendios activos',
  'Datacenters': 'Centros de datos',
  'Dams': 'Presas',
  'Submarine Cables': 'Cables submarinos',
  'Location: --': 'Ubicación: --',
  'Landmark: --': 'Punto de interés: --',
  'RESET': 'RESTABLECER',
  'EXIT COCKPIT': 'SALIR DE CABINA',
  'EXIT CLEAN VIEW': 'SALIR DE VISTA LIMPIA',
  'Clean UI': 'Interfaz limpia',
  'Bloom': 'Resplandor',
  'Sharpen': 'Nitidez',
  'Scope': 'Visor',
  'Feather': 'Suavizado',
  'Celestial': 'Celeste',
  'Models': 'Modelos',
  'Proximity': 'Proximidad',
  'All': 'Todos',
  'VOLUME': 'VOLUMEN',
  'Expand Cockpit display options': 'Mostrar opciones de pantalla de cabina',
  'Expand Cockpit Radio controls': 'Mostrar controles de radio de cabina',
  'Cockpit display options': 'Opciones de pantalla de cabina',
  'Cockpit compact Radio controls': 'Controles compactos de radio de cabina',
  'Cockpit display and Radio controls': 'Controles de pantalla y radio de cabina',
  'Enable': 'Activar',
  'ENABLE': 'ACTIVAR',
  'Previous filtered radio station': 'Emisora filtrada anterior',
  'Play selected radio station': 'Reproducir emisora seleccionada',
  'Next filtered radio station': 'Siguiente emisora filtrada',
  'Cockpit Radio volume': 'Volumen de radio de cabina',
  'Show Live Signals': 'Mostrar señales en vivo',
  'Show Regional News': 'Mostrar noticias regionales',
  'Show Local Info': 'Mostrar información local',
  'Live Signals': 'Señales en vivo',
  'Regional News': 'Noticias regionales',
  'Local Info': 'Información local',
  'Cockpit briefing pages': 'Secciones del informe de cabina',
  'View switcher': 'Selector de vista',
  'Visible map targets': 'Objetivos visibles del mapa',
  'Navigation, voice, and visual preset controls': 'Controles de navegación, voz y ajustes visuales',
  'MISSION CONTROL · FIRST LAUNCH': 'CONTROL DE MISIONES · PRIMER INICIO',
  'Choose your first view': 'Elige tu primera vista',
  'It feels like a forbidden cockpit—then you realize the sources are public and the data is real.': 'Parece una cabina restringida; luego descubres que las fuentes son públicas y los datos son reales.',
  'LIVE CONTACTS': 'CONTACTOS EN VIVO',
  'Aircraft, vessels and nearby intelligence': 'Aeronaves, embarcaciones e información cercana',
  'SPACE MISSIONS': 'MISIONES ESPACIALES',
  'Launches, spacecraft and orbital context': 'Lanzamientos, naves espaciales y contexto orbital',
  'ENVIRONMENTAL': 'MEDIO AMBIENTE',
  'Live earthquakes and active fires, from USGS and NASA': 'Terremotos en vivo e incendios activos de USGS y NASA',
  'EXPLORE MANUALLY': 'EXPLORAR MANUALMENTE',
  'Begin with a clean globe': 'Comienza con el globo despejado',
  "Don't show this again": 'No volver a mostrar',
  'ESC to dismiss': 'ESC para cerrar',
  'Tip: the GEV MIC button in the dock lets you talk to the map.': 'Consejo: el botón GEV MIC del panel te permite hablar con el mapa.',
  'Starting live contacts…': 'Iniciando contactos en vivo…',
  'Opening space missions…': 'Abriendo misiones espaciales…',
  'Scanning active events…': 'Buscando eventos activos…',
  'Account': 'Cuenta',
  'GLOBE ACTIONS': 'ACCIONES DEL GLOBO',
  'Expand PANTALLA': 'Expandir PANTALLA',
  'Expand AJUSTES VISUALES': 'Expandir AJUSTES VISUALES',
  'Pin location tray': 'Fijar panel de ubicación',
  'Airports': 'Aeropuertos',
  'FIRMS Active Fires': 'Incendios activos FIRMS',
  'FIRMS Active Fires: OFF': 'Incendios activos FIRMS: DESACTIVADOS',
  'Earthquakes (24h)': 'Terremotos (24 h)',
  'Earthquakes (24h): OFF': 'Terremotos (24 h): DESACTIVADOS',
  'Airports: OFF': 'Aeropuertos: DESACTIVADOS',
  'Bikeshare: OFF': 'Bicicletas compartidas: DESACTIVADAS',
  'Dams: OFF': 'Presas: DESACTIVADAS',
  'Datacenters: OFF': 'Centros de datos: DESACTIVADOS',
  'Flights: OFF': 'Vuelos: DESACTIVADOS',
  'Military Flights: OFF': 'Vuelos militares: DESACTIVADOS',
  'Satellites: OFF': 'Satélites: DESACTIVADOS',
  'Traffic: OFF': 'Tráfico: DESACTIVADO',
  'CCTV: OFF': 'CCTV: DESACTIVADO',
  'Expand Radio section': 'Expandir sección de radio',
  'Expand CONTEXT': 'Expandir CONTEXTO',
  'Expand SCENES': 'Expandir ESCENAS',
  'Expand Radio': 'Expandir radio',
  'Collapse briefing panel': 'Contraer panel de informe',
  'Collapse cockpit briefing panel': 'Contraer informe de cabina',
  'Collapse contact panel': 'Contraer panel de contactos',
  'Collapse Contact panel': 'Contraer panel de contactos',
  'Cockpit briefing carousel': 'Carrusel de informes de cabina',
  'Cockpit briefing controls': 'Controles de informes de cabina',
  'Cockpit current conditions:': 'Condiciones actuales de cabina:',
  'Cockpit place context:': 'Contexto del lugar en cabina:',
  'Cockpit regional headlines:': 'Titulares regionales en cabina:',
  'Latest regional news': 'Últimas noticias regionales',
  'Aircraft cockpit view': 'Vista de cabina de aeronave',
  'Estimated destination direction': 'Dirección estimada del destino',
  'Estimated flight plan': 'Plan de vuelo estimado',
  'Current aircraft heading': 'Rumbo actual de la aeronave',
  'Current aircraft heading': 'Rumbo actual de la aeronave',
  'Current cockpit vision style: NORMAL. Activate for next style.': 'Estilo visual actual de cabina: NORMAL. Activa para cambiar.',
  'Current style: NORMAL — click for next': 'Estilo actual: NORMAL; selecciona para cambiar',
  'Previous cockpit vision style': 'Estilo visual de cabina anterior',
  'Next cockpit vision style': 'Siguiente estilo visual de cabina',
  'GROUND SPEED': 'VELOCIDAD SOBRE EL SUELO',
  'GROUND SPEED · KTS': 'VELOCIDAD SOBRE EL SUELO · NUDOS',
  'ALTITUDE': 'ALTITUD',
  'ALTITUDE · FT': 'ALTITUD · PIES',
  'FIRST PERSON': 'PRIMERA PERSONA',
  'LIVE TRACK · COURSE ALIGNED': 'SEGUIMIENTO EN VIVO · RUMBO ALINEADO',
  'OPTICAL PLANE · 01': 'AVIÓN ÓPTICO · 01',
  'VISOR LOCK · ACTIVE': 'BLOQUEO DE VISOR · ACTIVO',
  'CONTACT': 'CONTACTO',
  'CONTACTS · 250 KM': 'CONTACTOS · 250 KM',
  'CONTACTS — nearest planes · vessels · sites': 'CONTACTOS — aeronaves, embarcaciones y sitios cercanos',
  'CONTACTS CONTEXT OFF': 'CONTEXTO DE CONTACTOS DESACTIVADO',
  'CONTEXT ONLY': 'SOLO CONTEXTO',
  'Contact cockpit summary': 'Resumen de contacto en cabina',
  'Contact Context actions': 'Acciones de contexto de contacto',
  'Contact navigation': 'Navegación de contactos',
  'Nearby cohort counts': 'Recuento de elementos cercanos',
  'Previous — prior visited contact in the 250 km window': 'Anterior: contacto visitado previamente en un radio de 250 km',
  'Next — nearest unvisited contact in the 250 km window': 'Siguiente: contacto no visitado más cercano en un radio de 250 km',
  'Reset cockpit to full globe view': 'Restablecer cabina a la vista global',
  'Exit cockpit and return to full globe view': 'Salir de cabina y volver a la vista global',
  'Exit cockpit view': 'Salir de la vista de cabina',
  'Exit cockpit view': 'Salir de la vista de cabina',
  'Expand Cockpit display options': 'Mostrar opciones de pantalla de cabina',
  'Expand Cockpit Radio controls': 'Mostrar controles de radio de cabina',
  'Previous briefing page': 'Página anterior del informe',
  'Next briefing page': 'Página siguiente del informe',
  'Close compact Radio controls': 'Cerrar controles compactos de radio',
  'Close forecast': 'Cerrar pronóstico',
  'Close incident details': 'Cerrar detalles del incidente',
  'Filter stations by station tag': 'Filtrar emisoras por etiqueta',
  'Enable Radio': 'Activar radio',
  'Hold Space to speak · click mic to toggle voice': 'Mantén Espacio para hablar · pulsa el micrófono para activar la voz',
  'Check microphone permission and network access, then try again.': 'Comprueba el permiso del micrófono y el acceso a la red; luego vuelve a intentarlo.',
  'Choose a globe marker or use next.': 'Elige un marcador del globo o pulsa siguiente.',
  'AVAILABLE MISSIONS': 'MISIONES DISPONIBLES',
  'Available Space Missions': 'Misiones espaciales disponibles',
  'AVAILABLE INPUTS ONLY · NOT AN ALL-CLEAR': 'SOLO ENTRADAS DISPONIBLES · NO INDICA AUSENCIA DE RIESGO',
  'Data attribution': 'Atribución de datos',
  'Data provided by:': 'Datos proporcionados por:',
  'CAPTURE SHOT': 'CAPTURAR IMAGEN',
  'COPY IMAGE': 'COPIAR IMAGEN',
  'EXPORT PRESETS': 'EXPORTAR AJUSTES',
  'Don\'t show this again': 'No volver a mostrar',
  'Begin with a clean globe': 'Comienza con el globo despejado',
  'Map source': 'Fuente del mapa',
  'Global Flights Radar': 'Radar global de vuelos',
  'Internet radio companion': 'Asistente de radio por internet',
  'GROUND START': 'INICIO EN TIERRA',
  'AIR START': 'INICIO EN VUELO',
  'EXIT SIM': 'SALIR DEL SIMULADOR',
  'AVAILABLE': 'DISPONIBLE',
  'CANCEL': 'CANCELAR',
  'DISMISS': 'CERRAR',
  'CLOSE': 'CERRAR',
  'CLOSE (Esc)': 'CERRAR (Esc)',
  'COPY IMAGE': 'COPIAR IMAGEN',
  'IMPORT': 'IMPORTAR',
  'DEL': 'ELIMINAR',
  'FROM': 'DESDE',
  'FROM — TAP A CITY': 'DESDE — ELIGE UNA CIUDAD',
  'DRAG look around · SCROLL zoom': 'ARRASTRA para mirar · RUEDA para acercar',
  '＋ OR TAP ANYWHERE ON THE GLOBE': '＋ O PULSA EN CUALQUIER PUNTO DEL GLOBO',
  'ESC EXIT · C TOGGLE': 'ESC SALIR · C CAMBIAR',
  'ESC EXIT': 'ESC SALIR',
  'H toggles this · ESC exits': 'H activa esto · ESC sale',
  'Hold Space to speak · click mic to toggle voice': 'Mantén Espacio para hablar · pulsa el micrófono para activar la voz',
  'CONTROLS': 'CONTROLES',
  'DIRECTORY BAND': 'BANDA DEL DIRECTORIO',
  'DIRECTORY: RADIO BROWSER': 'DIRECTORIO: RADIO BROWSER',
  'EYES & EARS': 'OJOS Y OÍDOS',
  'INFRASTRUCTURE': 'INFRAESTRUCTURA',
  'ENVIRONMENTAL': 'MEDIO AMBIENTE',
  'SOURCES · LIVE': 'FUENTES · EN VIVO',
  'SOURCE-BACKED EVENTS · NO SYNTHETIC NEWS': 'EVENTOS CON FUENTES · SIN NOTICIAS SINTÉTICAS',
  'ACQUIRING REGIONAL NEWS': 'OBTENIENDO NOTICIAS REGIONALES',
  'AIRCRAFT DOWN': 'AERONAVE EN TIERRA',
  'AVAILABLE INPUTS ONLY · NOT AN ALL-CLEAR': 'SOLO ENTRADAS DISPONIBLES · NO INDICA AUSENCIA DE RIESGO',
}));

const inverseTranslations = new Map([...translations].map(([english, spanish]) => [spanish, english]));
const textState = new WeakMap();
const attributeState = new WeakMap();
let currentLocale = DEFAULT_LOCALE;
let observer;

export function normalizeLocale(locale) {
  return locale === 'en' ? 'en' : 'es';
}

function canonicalText(value) {
  return inverseTranslations.get(value.trim()) || value.trim();
}

function localizedText(value, locale) {
  const trimmed = value.trim();
  const translated = locale === 'es'
    ? translations.get(trimmed)
    : inverseTranslations.get(trimmed);
  if (!translated) return value;
  const start = value.indexOf(trimmed);
  return `${value.slice(0, start)}${translated}${value.slice(start + trimmed.length)}`;
}

export function translateText(value, locale = DEFAULT_LOCALE) {
  return localizedText(String(value), normalizeLocale(locale));
}

function translateTextNode(node) {
  const value = node.nodeValue;
  const previous = textState.get(node);
  if (previous && value === previous.output && previous.locale === currentLocale) return;
  const source = canonicalText(previous && value === previous.output ? previous.source : value);
  const output = localizedText(source, currentLocale);
  textState.set(node, { source, output, locale: currentLocale });
  if (value !== output) node.nodeValue = output;
}

function translateAttribute(element, name) {
  const value = element.getAttribute(name);
  if (value === null) return;
  let values = attributeState.get(element);
  if (!values) {
    values = new Map();
    attributeState.set(element, values);
  }
  const previous = values.get(name);
  if (previous && value === previous.output && previous.locale === currentLocale) return;
  const source = canonicalText(previous && value === previous.output ? previous.source : value);
  const output = localizedText(source, currentLocale);
  values.set(name, { source, output, locale: currentLocale });
  if (value !== output) element.setAttribute(name, output);
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) translateAttribute(node, attribute);
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let child = walker.currentNode;
  while (child) {
    if (child.nodeType === Node.TEXT_NODE) translateTextNode(child);
    else for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) translateAttribute(child, attribute);
    child = walker.nextNode();
  }
}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale, { persist = true } = {}) {
  currentLocale = normalizeLocale(locale);
  document.documentElement.lang = currentLocale;
  if (persist) {
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLocale); } catch { /* storage may be unavailable */ }
  }
  const selector = document.getElementById('language-select');
  if (selector) selector.value = currentLocale;
  translateNode(document.body);
  window.dispatchEvent(new CustomEvent('gev:language-changed', { detail: { locale: currentLocale } }));
}

export function initI18n() {
  let saved = DEFAULT_LOCALE;
  try { saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LOCALE; } catch { /* storage may be unavailable */ }
  currentLocale = normalizeLocale(saved);
  setLocale(currentLocale, { persist: false });
  document.getElementById('language-select')?.addEventListener('change', (event) => {
    setLocale(event.currentTarget.value);
  });
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translateTextNode(record.target);
      else if (record.type === 'attributes') translateAttribute(record.target, record.attributeName);
      else for (const node of record.addedNodes) translateNode(node);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label', 'placeholder', 'alt'],
  });
}
