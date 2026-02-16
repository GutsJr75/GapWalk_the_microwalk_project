export type AppLanguage = 'en' | 'es';

const esExact: Record<string, string> = {
  // Global/common
  'Back': 'Atras',
  'Cancel': 'Cancelar',
  'Save': 'Guardar',
  'Done': 'Listo',
  'Continue': 'Continuar',
  'Close': 'Cerrar',
  'Yes': 'Si',
  'No': 'No',
  'Today': 'Hoy',
  'Options': 'Opciones',
  'Settings': 'Configuracion',
  'Appearance': 'Apariencia',
  'Language': 'Idioma',
  'Dark': 'Oscuro',
  'Light': 'Claro',
  'English': 'Ingles',
  'Espa\u00F1ol': 'Espanol',
  'Change language?': 'Cambiar idioma?',
  'Yes, change': 'Si, cambiar',
  'Are you sure you want to switch the app language to Spanish?':
    'Seguro que deseas cambiar el idioma de la aplicacion a Espanol?',
  'Are you sure you want to switch the app language to English?':
    'Seguro que deseas cambiar el idioma de la aplicacion a Ingles?',

  // Intro
  'Why it works': 'Por que funciona',
  'Fits real gaps': 'Se adapta a huecos reales',
  'Small walks add up': 'Las caminatas cortas suman',
  'Smart reminders': 'Recordatorios inteligentes',
  'How it works': 'Como funciona',
  'Go to Dashboard': 'Ir al Panel',
  'Get Started': 'Comenzar',
  'Busy schedule? No time to exercise? Turn your daily schedule gaps into short, realistic walks.':
    'Agenda ocupada? Sin tiempo para ejercitarte? Convierte tus huecos diarios en caminatas cortas y realistas.',
  'GapWalk only sends you notifications during schedule gaps that actually exist between your commitments.':
    'GapWalk solo te envia notificaciones durante huecos reales entre tus compromisos.',
  'Micro-walks throughout the day contribute to your health without the pressure of long workouts.':
    'Las microcaminatas durante el dia ayudan a tu salud sin la presion de entrenamientos largos.',
  'Get gentle notifications at the right moments - never during class, meetings, or quiet hours.':
    'Recibe notificaciones en el momento correcto, nunca durante clases, reuniones o horas de silencio.',
  'Add your weekly schedule or import a calendar file.':
    'Agrega tu horario semanal o importa un archivo de calendario.',
  'GapWalk finds free gaps between your events.':
    'GapWalk encuentra huecos libres entre tus eventos.',
  'You get notified at the right moments for a quick walk.':
    'Recibes notificaciones en el momento correcto para una caminata rapida.',
  'No account needed - 100% free - Your data stays on device.':
    'No se necesita cuenta - 100% gratis - Tus datos se quedan en el dispositivo.',

  // Settings
  'Tweak how GapWalk looks and speaks.': 'Ajusta como se ve y se comunica GapWalk.',

  // Schedule setup/overview
  'Manage your schedule': 'Administra tu horario',
  'Set up your schedule': 'Configura tu horario',
  'Change your schedule source or update existing schedule data.':
    'Cambia la fuente de tu horario o actualiza los datos existentes.',
  'Choose how GapWalk should read your schedule': 'Elige como GapWalk debe leer tu horario',
  'Choose how to add your schedule': 'Elige como agregar tu horario',
  'Link Google Calendar': 'Vincular Google Calendar',
  'Upcoming feature': 'Proxima funcion',
  'Import': 'Importar',
  'Input manually': 'Ingresar manualmente',
  'Input Manually': 'Ingresar manualmente',
  'Build your weekly schedule and one-time events on a simple calendar.':
    'Crea tu horario semanal y eventos unicos en un calendario simple.',
  'Build your weekly schedule on a simple calendar.':
    'Crea tu horario semanal en un calendario simple.',
  'Manage Schedule': 'Administrar horario',
  'Current source': 'Fuente actual',
  'How This Works': 'Como funciona',
  'Choose an action below. Your schedule updates are applied only after you save.':
    'Elige una accion abajo. Los cambios del horario se aplican solo despues de guardar.',
  'Change Schedule Source': 'Cambiar fuente del horario',
  'Change schedule source': 'Cambiar fuente del horario',
  'Switch how GapWalk reads your schedule, such as manual entry or calendar import.':
    'Cambia como GapWalk lee tu horario, como entrada manual o importacion de calendario.',
  'Update and sync opportunities': 'Actualizar y sincronizar oportunidades',
  'Update and Sync Opportunities': 'Actualizar y sincronizar oportunidades',
  "Save your changes to refresh today's walking opportunities automatically.":
    'Guarda tus cambios para actualizar automaticamente las oportunidades de caminata de hoy.',
  'Tip: If you open this screen and make no changes, you can cancel safely.':
    'Consejo: Si abres esta pantalla y no haces cambios, puedes cancelar con seguridad.',
  'Update current schedule': 'Actualizar horario actual',
  'Update imported schedule': 'Actualizar horario importado',
  'Your schedule stays private. Privacy is our utmost importance.':
    'Tu horario se mantiene privado. La privacidad es nuestra maxima prioridad.',
  'Your schedule stays private. Privacy is our top priority.':
    'Tu horario se mantiene privado. La privacidad es nuestra maxima prioridad.',
  'Manual schedule': 'Horario manual',
  'Google Calendar': 'Google Calendar',
  'Calendar file (.ics)': 'Archivo de calendario (.ics)',
  'Not set yet': 'Aun no configurado',
  'File: ': 'Archivo: ',
  'ICS file: ': 'Archivo ICS: ',
  'Sun': 'Dom',
  'Mon': 'Lun',
  'Tue': 'Mar',
  'Wed': 'Mie',
  'Thu': 'Jue',
  'Fri': 'Vie',
  'Sat': 'Sab',

  // Dashboard
  'Get started': 'Comenzar',
  'Set up your preferences so GapWalk can find the best walking windows in your schedule.':
    'Configura tus preferencias para que GapWalk encuentre las mejores ventanas para caminar en tu horario.',
  'Set up preferences': 'Configurar preferencias',
  'Set Up Preferences': 'Configurar preferencias',
  'Goal Achieved!': 'Meta alcanzada!',
  'Great job!': 'Buen trabajo!',
  'Ready to walk?': 'Listo para caminar?',
  'Ready to start? Your first walk is just a tap away!':
    'Listo para comenzar? Tu primera caminata esta a un toque.',
  'No streak yet': 'Aun no hay racha',
  'Keep it going!': 'Sigue asi!',
  'Start a walk today to begin your streak.': 'Comienza una caminata hoy para iniciar tu racha.',
  'Quick Status': 'Estado rapido',
  'Daily Target': 'Meta diaria',
  'Notification Count': 'Conteo de notificaciones',
  'This Week': 'Esta semana',
  'Minutes': 'Minutos',
  'Walks': 'Caminatas',
  'Active Days': 'Dias activos',
  'Walking Opportunities': 'Oportunidades para caminar',
  'See exactly when to walk and when GapWalk will notify you.':
    'Mira exactamente cuando caminar y cuando GapWalk te notificara.',
  'Goal reached for today': 'Meta alcanzada por hoy',
  'Nice work. Extra walks are still tracked, but reminders pause until tomorrow.':
    'Buen trabajo. Las caminatas extra se siguen registrando, pero los recordatorios se pausan hasta manana.',
  'No opportunities yet': 'Aun no hay oportunidades',
  'No suitable gaps were found right now. Pull to refresh, or start a manual walk below.':
    'No se encontraron huecos adecuados ahora. Desliza para actualizar o inicia una caminata manual abajo.',
  'Other preferences': 'Otras preferencias',
  'Buffer time': 'Tiempo de margen',
  'Quiet hours': 'Horas de silencio',
  'Notify me': 'Notificarme',
  'Immediately': 'Inmediatamente',
  'Next gap': 'Siguiente hueco',
  'Minimum reminder gap': 'Intervalo minimo entre recordatorios',
  'Start Manual Walk': 'Iniciar caminata manual',
  'Visit / Update your schedule': 'Visitar / Actualizar tu horario',
  'Manage schedule': 'Administrar horario',
  'Edit your choices': 'Editar tus opciones',
  'Edit your Choices': 'Editar tus opciones',
  'Log out': 'Cerrar sesion',
  'Back to Home Screen': 'Volver a inicio',
  'No gaps found for today': 'No se encontraron huecos para hoy',
  'No gaps are found for today.': 'No se encontraron huecos para hoy.',
  'Could not cancel opportunity': 'No se pudo cancelar la oportunidad',
  'Please try again.': 'Por favor, intenta de nuevo.',
  'Cancel this walk opportunity?': 'Cancelar esta oportunidad de caminata?',
  'If you cancel, GapWalk will try to use your next best available gap today.':
    'Si cancelas, GapWalk intentara usar tu siguiente mejor hueco disponible hoy.',
  'Yes, cancel': 'Si, cancelar',
  'Not Connected': 'No conectado',
  "You haven't linked a Google Calendar yet. Go to Schedule Setup to connect.":
    'Aun no vinculaste Google Calendar. Ve a Configurar horario para conectarlo.',
  'Go to Setup': 'Ir a configuracion',
  'Session Expired': 'Sesion expirada',
  'Your Google session has expired. Please re-link your calendar.':
    'Tu sesion de Google expiro. Vuelve a vincular tu calendario.',
  'Re-link': 'Vincular de nuevo',
  'Syncing...': 'Sincronizando...',
  'Fetching latest events from Google Calendar.':
    'Obteniendo eventos mas recientes de Google Calendar.',
  'Synced': 'Sincronizado',
  'Sync Failed': 'Sincronizacion fallida',
  'Could not refresh calendar events. Please try again.':
    'No se pudieron actualizar los eventos del calendario. Intentalo de nuevo.',

  // Preferences
  'Preferences': 'Preferencias',
  'Review your choices and save when ready.': 'Revisa tus opciones y guarda cuando estes listo.',
  'You can change this anytime.': 'Puedes cambiar esto cuando quieras.',
  'Walking Goals': 'Objetivos de caminata',
  'Target, buffer & reminders': 'Objetivo, margen y recordatorios',
  'Walking Goal': 'Objetivo de caminata',
  'Buffer': 'Margen',
  'Reminders': 'Recordatorios',
  'per day': 'por dia',
  'Notifications are limited in Expo Go.': 'Las notificaciones estan limitadas en Expo Go.',
  'Other Settings': 'Otros ajustes',
  'Notifications & quiet hours': 'Notificaciones y horas de silencio',
  'When to notify': 'Cuando notificar',
  'Minimum time between reminders': 'Tiempo minimo entre recordatorios',
  'Quiet Hours': 'Horas de silencio',
  'Tap to edit': 'Tocar para editar',
  'Use Recommended Settings?': 'Usar ajustes recomendados?',
  'If you skip, GapWalk will use these recommended defaults:':
    'Si omites, GapWalk usara estos valores recomendados:',
  'Walking goal: ': 'Objetivo de caminata: ',
  'Reminder spacing: ': 'Intervalo de recordatorios: ',
  'Notify: ': 'Notificar: ',
  'You can change these anytime in Preferences.':
    'Puedes cambiar esto cuando quieras en Preferencias.',
  'Select the time frame when GapWalk will not send you notifications.':
    'Selecciona el periodo en que GapWalk no enviara notificaciones.',
  'Start': 'Inicio',
  'End': 'Fin',
  'Use Recommended': 'Usar recomendado',
  'Skip': 'Omitir',
  'If you cancel now, your unsaved changes will be discarded. Do you want to continue?':
    'Si cancelas ahora, tus cambios no guardados se descartaran. Quieres continuar?',
  'Do you want to save these preference changes?':
    'Quieres guardar estos cambios de preferencias?',

  // Manual schedule
  'Update your schedule': 'Actualiza tu horario',
  'Edit and save to refresh walking opportunities.':
    'Edita y guarda para actualizar oportunidades de caminata.',
  'Build your weekly schedule': 'Crea tu horario semanal',
  'Frequency': 'Frecuencia',
  'Repeats weekly': 'Se repite semanalmente',
  'One-time event': 'Evento unico',
  'Event date': 'Fecha del evento',
  'This event repeats every week on the selected days.':
    'Este evento se repite cada semana en los dias seleccionados.',
  'This event is used once on the selected date only.':
    'Este evento se usa una sola vez en la fecha seleccionada.',
  'Select date': 'Selecciona una fecha',
  'Choose a date for this one-time event.':
    'Elige una fecha para este evento unico.',
  'Enter month, day, and year.': 'Ingresa mes, dia y ano.',
  'Month must be between 1 and 12.': 'El mes debe estar entre 1 y 12.',
  'Year must be between 1900 and 2100.': 'El ano debe estar entre 1900 y 2100.',
  'Day is not valid for this month.': 'El dia no es valido para este mes.',
  'One-time event date must be today or later.':
    'La fecha del evento unico debe ser hoy o posterior.',
  'Title': 'Titulo',
  'Days (select one or more)': 'Dias (selecciona uno o mas)',
  'Description (optional)': 'Descripcion (opcional)',
  'Add Event': 'Agregar evento',
  'Edit Event': 'Editar evento',
  'Delete event': 'Eliminar evento',
  'No changes': 'Sin cambios',
  'No changes were detected. Your existing imported schedule is already active.':
    'No se detectaron cambios. Tu horario importado actual ya esta activo.',
  'No changes were detected. Your existing schedule is already active.':
    'No se detectaron cambios. Tu horario actual ya esta activo.',
  'Save schedule?': 'Guardar horario?',
  'Save this schedule and refresh walking opportunities?':
    'Guardar este horario y actualizar oportunidades de caminata?',
  'Schedule saved': 'Horario guardado',
  'Your schedule was updated and walking opportunities were synced.':
    'Tu horario fue actualizado y las oportunidades de caminata fueron sincronizadas.',
  'Empty': 'Vacio',
  'Add at least one event.': 'Agrega al menos un evento.',
  'Discard changes?': 'Descartar cambios?',
  'Discard unsaved schedule changes?': 'Descartar cambios de horario no guardados?',
  'Keep editing': 'Seguir editando',
  'Discard': 'Descartar',
  'Remove this event?': 'Eliminar este evento?',

  // Walking
  'Paused': 'Pausado',
  'Walking': 'Caminando',
  'Tap Resume to continue your walk.': 'Toca Reanudar para continuar tu caminata.',
  'Keep going! Every step counts.': 'Sigue! Cada paso cuenta.',
  'Time remaining': 'Tiempo restante',
  'Active time': 'Tiempo activo',
  'Keep moving! 🚶': 'Sigue moviendote! 🚶',
  'Distance': 'Distancia',
  'Calories': 'Calorias',
  'Your gap is almost over. Consider heading back.':
    'Tu hueco casi termina. Considera regresar.',
  'End Walk': 'Terminar caminata',
  'Resume': 'Reanudar',
  'Pause': 'Pausar',
  'Enable Location?': 'Activar ubicacion?',
  'Allow location to track your route and estimate distance. You can still track time without this.':
    'Permite la ubicacion para rastrear tu ruta y estimar distancia. Puedes seguir registrando tiempo sin esto.',
  'Not now': 'Ahora no',
  'Allow': 'Permitir',
  'End Walk?': 'Terminar caminata?',
  'Are you sure you want to end this walk session?':
    'Seguro que quieres terminar esta sesion de caminata?',
  'Yes, end': 'Si, terminar',
  'Walk Complete!': 'Caminata completada!',
  'Great progress!': 'Gran progreso!',
  '\uD83C\uDF89 Goal achieved!': '\uD83C\uDF89 Meta alcanzada!',

  // Setup/import status
  'Opening file picker...': 'Abriendo selector de archivos...',
  'Parsing calendar...': 'Analizando calendario...',
  'Import Warning': 'Aviso de importacion',
  'No Events': 'Sin eventos',
  'No events found in the ICS file.': 'No se encontraron eventos en el archivo ICS.',
  'Import Failed': 'Importacion fallida',
  'Schedule Updated': 'Horario actualizado',
  'Import Note': 'Nota de importacion',
  'The ICS file was imported, but no timed events were available for the weekly grid preview.':
    'El archivo ICS se importo, pero no habia eventos con hora para la vista semanal.',
  'Calendar Linked': 'Calendario vinculado',
  'No Events Found': 'No se encontraron eventos',
  'Your Google Calendar has no events in the next 14 days. You can add events manually instead.':
    'Tu Google Calendar no tiene eventos en los proximos 14 dias. Puedes agregarlos manualmente.',
  'One-time setup': 'Configuracion inicial',
  'Opening Google sign-in...': 'Abriendo inicio de sesion de Google...',
  'Sign-in Failed': 'Error al iniciar sesion',
  'Could not sign in with Google.': 'No se pudo iniciar sesion con Google.',
  'Link Google Calendar will be available in a future update. Use Import or Input manually for now.':
    'Vincular Google Calendar estara disponible en una futura actualizacion. Por ahora usa Importar o Ingreso manual.',
  'Do you want to save these changes?': 'Quieres guardar estos cambios?',
};

type PatternTranslator = {
  re: RegExp;
  toEs: (match: RegExpMatchArray) => string;
};

const patterns: PatternTranslator[] = [
  {
    re: /^(\d+)\smin planned$/,
    toEs: (m) => `${m[1]} min planificados`,
  },
  {
    re: /^(\d+)\/(\d+)\smin completed$/,
    toEs: (m) => `${m[1]}/${m[2]} min completados`,
  },
  {
    re: /^Completion:\s(\d+)\s(minutes|times)\/(\d+)\s(minutes|times)$/,
    toEs: (m) => {
      const u1 = m[2] === 'minutes' ? 'minutos' : 'veces';
      const u2 = m[4] === 'minutes' ? 'minutos' : 'veces';
      return `Completado: ${m[1]} ${u1}/${m[3]} ${u2}`;
    },
  },
  {
    re: /^File:\s(.+)$/,
    toEs: (m) => `Archivo: ${m[1]}`,
  },
  {
    re: /^ICS file:\s(.+)$/,
    toEs: (m) => `Archivo ICS: ${m[1]}`,
  },
  {
    re: /^Walk time:\s(.+)\s-\s(.+)$/,
    toEs: (m) => `Tiempo de caminata: ${m[1]} - ${m[2]}`,
  },
  {
    re: /^Notification time:\s(.+)$/,
    toEs: (m) => `Hora de notificacion: ${m[1]}`,
  },
  {
    re: /^(\d+)\smin before$/,
    toEs: (m) => `${m[1]} min antes`,
  },
  {
    re: /^(\d+)\sDay(?:s)?\sStreak$/,
    toEs: (m) => `Racha de ${m[1]} dias`,
  },
  {
    re: /^Longest:\s(\d+)\sdays$/,
    toEs: (m) => `Maximo: ${m[1]} dias`,
  },
  {
    re: /^(\d+)-day streak!$/,
    toEs: (m) => `Racha de ${m[1]} dias!`,
  },
  {
    re: /^(\d+)\sminutes • (\d+)\scalories(.*)$/,
    toEs: (m) => `${m[1]} minutos • ${m[2]} calorias${m[3] ?? ''}`,
  },
  {
    re: /^One-time • (.+)$/,
    toEs: (m) => `Evento unico • ${m[1]}`,
  },
];

export const translateLiteral = (input: string, language: AppLanguage): string => {
  if (language === 'en') return input;
  const exact = esExact[input];
  if (exact) return exact;

  for (const pattern of patterns) {
    const match = input.match(pattern.re);
    if (match) return pattern.toEs(match);
  }

  return input;
};
