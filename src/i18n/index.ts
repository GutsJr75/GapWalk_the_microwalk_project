export type AppLanguage = 'en' | 'es';

const esExact: Record<string, string> = {
  // Global/common
  'Back': 'Atras',
  'Cancel': 'Cancelar',
  'Change': 'Cambiar',
  'Change Option': 'Cambiar opcion',
  'Update': 'Actualizar',
  'Save': 'Guardar',
  'Yes, Save': 'Si, guardar',
  'Yes, Update': 'Si, actualizar',
  'Done': 'Listo',
  'Continue': 'Continuar',
  'Next': 'Siguiente',
  'Close': 'Cerrar',
  'Yes': 'Si',
  'No': 'No',
  'Today': 'Hoy',
  'Options': 'Opciones',
  'Weekly Data': 'Datos semanales',
  'Achievements': 'Logros',
  'See all badges and what you need to do to unlock each one.':
    'Mira todas las insignias y que necesitas hacer para desbloquear cada una.',
  'Unlocked and locked achievements are listed below.':
    'Los logros desbloqueados y bloqueados aparecen abajo.',
  'Unlocked': 'Desbloqueado',
  'Locked': 'Bloqueado',
  'No unlocked achievements yet.': 'Aun no hay logros desbloqueados.',
  'No locked achievements left.': 'Ya no quedan logros bloqueados.',
  'Loading achievements...': 'Cargando logros...',
  'Could not load achievements': 'No se pudieron cargar los logros',
  'Your progress, identity, and quick actions in one place.':
    'Tu progreso, identidad y accesos rapidos en un solo lugar.',
  'Name must be 2 to 32 characters.': 'El nombre debe tener entre 2 y 32 caracteres.',
  'Progress Snapshot': 'Resumen de progreso',
  'Current Streak': 'Racha actual',
  'Total Walks': 'Caminatas totales',
  'Total Minutes': 'Minutos totales',
  'Active Days This Week': 'Dias activos esta semana',
  'View all': 'Ver todo',
  'Quick Actions': 'Acciones rapidas',
  'Loading profile...': 'Cargando perfil...',
  'Could not load profile': 'No se pudo cargar el perfil',
  'Try again': 'Intentar de nuevo',
  'No achievements unlocked yet.': 'Aun no hay logros desbloqueados.',
  'Saving...': 'Guardando...',
  'Review your weekly walking totals and trends.':
    'Revisa tus totales y tendencias semanales de caminata.',
  'No weekly data yet': 'Aun no hay datos semanales',
  'Complete a walk to start building weekly history.':
    'Completa una caminata para comenzar a crear historial semanal.',
  'Week of': 'Semana del',
  'Settings': 'Configuracion',
  'Viewer Settings': 'Configuracion de vista',
  'Appearance': 'Apariencia',
  'Language': 'Idioma',
  'Dark': 'Oscuro',
  'Light': 'Claro',
  'English': 'Ingl\u00E9s',
  'Espa\u00F1ol': 'Espa\u00F1ol',
  'Change language?': 'Cambiar idioma?',
  'Yes, change': 'Si, cambiar',
  'Are you sure you want to switch the app language to Spanish?':
    'Seguro que deseas cambiar el idioma de la aplicaci\u00F3n a Espa\u00F1ol?',
  'Are you sure you want to switch the app language to English?':
    'Seguro que deseas cambiar el idioma de la aplicaci\u00F3n a Ingl\u00E9s?',

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
  'Choose how GapWalk looks and which language it uses.':
    'Elige como se ve GapWalk y que idioma usa.',

  // Schedule setup/overview
  'Manage your schedule': 'Administra tu horario',
  'Set up your schedule': 'Configura tu horario',
  'Change your schedule source or update existing schedule data.':
    'Cambia la fuente de tu horario o actualiza los datos existentes.',
  'If you want, you can finish this part later from Dashboard -> Manage Schedule -> Change Option':
    'Si quieres, puedes terminar esta parte despues desde Panel -> Administrar horario -> Cambiar opcion.',
  'Cancel schedule update?': 'Cancelar actualizacion del horario?',
  'Update schedule source?': 'Actualizar fuente del horario?',
  'No changes to update': 'No hay cambios para actualizar',
  'Your unsaved schedule source change will be lost. Do you want to leave this screen?':
    'Se perdera tu cambio no guardado de la fuente del horario. Quieres salir de esta pantalla?',
  'Choose how GapWalk should read your schedule': 'Elige como GapWalk debe leer tu horario',
  'Choose how to add your schedule': 'Elige como agregar tu horario',
  'Link Google Calendar': 'Vincular Google Calendar',
  'Upcoming feature': 'Proxima funcion',
  'Import': 'Importar',
  'Input manually': 'Ingresar manualmente',
  'Input Manually': 'Ingresar manualmente',
  'Enter manually': 'Ingresar manualmente',
  'Build your weekly schedule and one-time events on a simple calendar.':
    'Crea tu horario semanal y eventos unicos en un calendario simple.',
  'Build your weekly schedule and one-time events with a simple calendar.':
    'Crea tu horario semanal y eventos unicos con un calendario simple.',
  'Sign in with Google to detect your busy times and find the best walking windows.':
    'Inicia sesion con Google para detectar tus horas ocupadas y encontrar las mejores ventanas para caminar.',
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
  'Calendar file: ': 'Archivo de calendario: ',
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
  'Daily goal achieved': 'Meta diaria alcanzada',
  'Great job!': 'Buen trabajo!',
  'Excellent work today.': 'Excelente trabajo hoy.',
  'Ready to walk?': 'Listo para caminar?',
  'Daily goal reached. Additional walks are optional.':
    'Meta diaria alcanzada. Las caminatas adicionales son opcionales.',
  'Ready to start? Your first walk is just a tap away!':
    'Listo para comenzar? Tu primera caminata esta a un toque.',
  'About & Help': 'Acerca de y ayuda',
  'What GapWalk does, how to use it well, and how to reach the people behind it.':
    'Que hace GapWalk, como usarlo bien y como contactar a las personas detras de la app.',
  'Why GapWalk exists': 'Por que existe GapWalk',
  'GapWalk is built for people whose day already feels full. Instead of asking you to create extra workout time, it looks for short openings that already exist between classes, work, errands, and quiet hours.':
    'GapWalk esta hecha para personas cuyo dia ya se siente lleno. En lugar de pedirte que saques tiempo extra para ejercitarte, busca pequenos espacios que ya existen entre clases, trabajo, mandados y horas de silencio.',
  'Set your schedule once, tune your walking preferences, and GapWalk turns free gaps into realistic walk opportunities you can actually follow.':
    'Configura tu horario una vez, ajusta tus preferencias para caminar y GapWalk convierte tus espacios libres en oportunidades realistas para caminar que de verdad puedes seguir.',
  'Bring in your schedule with a calendar file or enter it manually.':
    'Trae tu horario con un archivo de calendario o ingresalo manualmente.',
  'Choose when you want reminders and when you want to be left alone.':
    'Elige cuando quieres recordatorios y cuando prefieres que la app no te moleste.',
  'GapWalk scans your week for openings that fit your routine instead of interrupting it.':
    'GapWalk revisa tu semana para encontrar espacios que encajen con tu rutina en lugar de interrumpirla.',
  'Start a walk when you are ready and track your minutes, steps, and distance.':
    'Empieza una caminata cuando estes listo y registra tus minutos, pasos y distancia.',
  'FAQ': 'Preguntas frecuentes',
  'What is an ICS file?': 'Que es un archivo ICS?',
  'An ICS file is a standard calendar export used by Google Calendar, Apple Calendar, Outlook, and similar apps. Importing it lets GapWalk rebuild your weekly schedule for you instead of making you enter everything by hand.':
    'Un archivo ICS es una exportacion estandar de calendario usada por Google Calendar, Apple Calendar, Outlook y apps similares. Importarlo permite que GapWalk reconstruya tu horario semanal por ti en lugar de obligarte a escribir todo a mano.',
  'What is a calendar file?': 'Que es un archivo de calendario?',
  'A calendar file (.ics) is a standard export used by Google Calendar, Apple Calendar, Outlook, and similar apps. Importing it lets GapWalk rebuild your weekly schedule so you do not have to enter everything by hand.':
    'Un archivo de calendario (.ics) es una exportacion estandar usada por Google Calendar, Apple Calendar, Outlook y apps similares. Importarlo permite que GapWalk reconstruya tu horario semanal para que no tengas que escribir todo a mano.',
  'Why does GapWalk ask for location?':
    'Por que GapWalk solicita ubicacion?',
  'Location is used for distance tracking during walks. If your device supports step counting, steps can still be tracked separately, but distance becomes less reliable without location access.':
    'La ubicacion se usa para medir la distancia durante las caminatas. Si tu dispositivo admite conteo de pasos, los pasos aun pueden registrarse por separado, pero la distancia se vuelve menos confiable sin acceso a la ubicacion.',
  'Can I use GapWalk without signing in?':
    'Puedo usar GapWalk sin iniciar sesion?',
  'Yes. You can use GapWalk locally without an account. Signing in only matters if you want your data synced across devices later.':
    'Si. Puedes usar GapWalk localmente sin una cuenta. Iniciar sesion solo importa si despues quieres sincronizar tus datos entre dispositivos.',
  'What does no-excuses mode do?':
    'Que hace el modo sin excusas?',
  'No-excuses mode uses firmer reminders and a stricter tone, so the app pushes harder when you are close to skipping your goal.':
    'El modo sin excusas usa recordatorios mas firmes y un tono mas estricto, para que la app te empuje mas cuando estes cerca de saltarte tu meta.',
  'Contributors': 'Colaboradores',
  'Questions, bug reports, or feedback worth sending? Reach the contributors directly.':
    'Preguntas, reportes de errores o comentarios que valga la pena enviar? Contacta directamente a quienes contribuyen a la app.',
  'Email': 'Correo',
  'Unable to open email': 'No se pudo abrir el correo',
  'Please copy the email address and contact us from your email app.':
    'Copia la direccion de correo y contactanos desde tu app de email.',
  'Your health and privacy are our utmost priority.':
    'Tu salud y privacidad son nuestra maxima prioridad.',
  'No streak yet': 'Aun no hay racha',
  'Keep it going!': 'Sigue asi!',
  'You are building great consistency.': 'Estas construyendo una gran constancia.',
  'Start a walk today to begin your streak.': 'Comienza una caminata hoy para iniciar tu racha.',
  'Quick Status': 'Estado rapido',
  'Daily Target': 'Meta diaria',
  'Notification Count': 'Conteo de notificaciones',
  'Step Goal': 'Meta de pasos',
  'This Week': 'Esta semana',
  'Minutes': 'Minutos',
  'Total Steps': 'Pasos totales',
  'Walks': 'Caminatas',
  'Active Days': 'Dias activos',
  'Walking Opportunities': 'Oportunidades para caminar',
  'See your next walk windows and reminder times.':
    'Mira tus proximas ventanas de caminata y horarios de recordatorio.',
  'Add a MicroWalk': 'Agregar una MicroCaminata',
  "Pick a time and duration. You'll get a notification when it's time.":
    'Elige una hora y duracion. Recibiras una notificacion cuando sea el momento.',
  'Walk time': 'Hora de caminata',
  'Personally scheduled walk': 'Caminata programada personalmente',
  'Save anyway': 'Guardar de todos modos',
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
  'Your privacy matters. So does your health.':
    'Tu privacidad importa. Tu salud tambien.',
  'Visit / Update your schedule': 'Visitar / Actualizar tu horario',
  'Manage schedule': 'Administrar horario',
  'Manage schedule now': 'Administrar horario ahora',
  'Manage Schedule Now': 'Administrar horario ahora',
  'Finish your schedule setup for smarter reminder timing.':
    'Termina tu configuracion de horario para mejorar el momento de los recordatorios.',
  'Edit/View preferences': 'Editar/Ver preferencias',
  'Edit your choices': 'Editar tus opciones',
  'Edit your Choices': 'Editar tus opciones',
  'Log out': 'Cerrar sesion',
  'Back to Home Screen': 'Volver a inicio',
  'Back to Home': 'Volver a inicio',
  'Import .ics file': 'Importar archivo .ics',
  'View and edit your weekly schedule. Import or clear as needed.': 'Ve y edita tu horario semanal. Importa o limpia segun sea necesario.',
  'Choose your schedule source, then proceed to edit.': 'Elige tu fuente de horario, luego procede a editar.',
  'Choose your schedule source, then continue to edit.': 'Elige tu fuente de horario, luego continua para editar.',
  'Choose your schedule source, then select Next to edit.':
    'Elige tu fuente de horario y luego selecciona Siguiente para editar.',
  'Edit your schedule and save when ready.': 'Edita tu horario y guarda cuando estes listo.',
  'How should GapWalk read your schedule?': 'Como deberia GapWalk leer tu horario?',
  'Build your weekly schedule with a calendar grid.': 'Construye tu horario semanal con una cuadricula de calendario.',
  'Upload a calendar file to populate the grid.': 'Sube un archivo de calendario para rellenar la cuadricula.',
  'Proceed': 'Continuar',
  'Appearance & Language': 'Apariencia e idioma',
  'Theme & language': 'Tema e idioma',
  'No gaps found for today': 'No se encontraron huecos para hoy',
  'No gaps are found for today.': 'No se encontraron huecos para hoy.',
  'Could not cancel opportunity': 'No se pudo cancelar la oportunidad',
  'Could not update walk window': 'No se pudo actualizar la ventana de caminata',
  'Update this walk?': 'Actualizar esta caminata?',
  'Are you sure you want to update this walk time and duration?':
    'Seguro que deseas actualizar la hora y duracion de esta caminata?',
  'Cancel this update?': 'Cancelar esta actualizacion?',
  'Your unsaved walk updates will be lost. Do you want to close this editor?':
    'Se perderan los cambios no guardados de esta caminata. Quieres cerrar este editor?',
  'Cancel this walk setup?': 'Cancelar la configuracion de esta caminata?',
  'Your unsaved walk details will be lost. Do you want to close this form?':
    'Se perderan los detalles no guardados de la caminata. Quieres cerrar este formulario?',
  'Please try again.': 'Por favor, intenta de nuevo.',
  'Cancel this walk opportunity?': 'Cancelar esta oportunidad de caminata?',
  'Cancel this walk window': 'Cancelar esta ventana de caminata',
  'If you cancel, GapWalk will try to use your next best available gap today.':
    'Si cancelas, GapWalk intentara usar tu siguiente mejor hueco disponible hoy.',
  'If you cancel, GapWalk will move to the next best walk window today.':
    'Si cancelas, GapWalk pasara a la siguiente mejor ventana para caminar hoy.',
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
  'Notifications, quiet hours & preferred periods': 'Notificaciones, horas de silencio y periodos preferidos',
  'When to notify': 'Cuando notificar',
  'Minimum time between reminders': 'Tiempo minimo entre recordatorios',
  'Strictness': 'Nivel de exigencia',
  'Easygoing': 'Flexible',
  'No Excuses': 'Sin excusas',
  'No Excuses enforces step-goal checks. Easygoing keeps walk timing flexible.':
    'Sin excusas aplica controles por meta de pasos. Flexible mantiene el tiempo de caminata mas libre.',
  'Step goal is required in No Excuses mode.': 'La meta de pasos es obligatoria en modo Sin excusas.',
  'Easygoing keeps your step goal optional.': 'El modo Flexible mantiene la meta de pasos opcional.',
  'Recommended: 1000 steps. Range: 500 to 6000.': 'Recomendado: 1000 pasos. Rango: 500 a 6000.',
  'On': 'Encendido',
  'Off': 'Apagado',
  'steps': 'pasos',
  'Recommended: 1000 steps': 'Recomendado: 1000 pasos',
  'Step goal is currently off.': 'La meta de pasos esta desactivada.',
  'Set a step goal between 500 and 6000.': 'Define una meta entre 500 y 6000 pasos.',
  'Quiet Hours': 'Horas de silencio',
  'Tap to edit': 'Tocar para editar',
  'Preferred walking periods (optional)': 'Periodos preferidos para caminar (opcional)',
  'Pick up to 5 preferred time windows for walks. GapWalk will only suggest opportunities inside these windows when this is enabled.':
    'Elige hasta 5 franjas horarias preferidas para caminar. Cuando esto este activado, GapWalk solo sugerira caminatas dentro de esas franjas.',
  'Tap to edit periods': 'Toca para editar periodos',
  'No preferred period selected.': 'No hay periodos preferidos seleccionados.',
  'Preferred Walking Periods': 'Periodos preferidos para caminar',
  'Add 1 to 5 preferred time periods. GapWalk will suggest walks only in these windows when enabled.':
    'Agrega entre 1 y 5 periodos de tiempo preferidos. Cuando esta opcion este activada, GapWalk sugerira caminatas solo dentro de esas ventanas.',
  'Remove': 'Eliminar',
  '+ Add period': '+ Agregar periodo',
  'Save periods': 'Guardar periodos',
  'Add at least one preferred walking period.': 'Agrega al menos un periodo preferido para caminar.',
  'You can add up to 5 preferred periods.': 'Puedes agregar hasta 5 periodos preferidos.',
  'Each preferred period needs a valid start and end time.':
    'Cada periodo preferido necesita una hora de inicio y fin validas.',
  'Enter valid start and end times for each period.':
    'Ingresa horas de inicio y fin validas para cada periodo.',
  'Start and end times cannot be the same.':
    'Las horas de inicio y fin no pueden ser iguales.',
  'Preferred periods': 'Periodos preferidos',
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
  'Update preferences?': 'Actualizar preferencias?',
  'Do you want to update these preference changes?':
    'Quieres actualizar estos cambios de preferencias?',
  'Cancel preference update?': 'Cancelar actualizacion de preferencias?',
  'Your unsaved preference changes will be lost. Do you want to leave this screen?':
    'Se perderan tus cambios de preferencias no guardados. Quieres salir de esta pantalla?',

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
  'Cancel schedule editing?': 'Cancelar edicion del horario?',
  'Your imported schedule has not been saved yet. Do you want to leave without saving?':
    'El horario importado aun no se guardo. Quieres salir sin guardar?',
  'Your unsaved schedule changes will be lost. Do you want to leave this screen?':
    'Se perderan tus cambios de horario no guardados. Quieres salir de esta pantalla?',
  'Update schedule?': 'Actualizar horario?',
  'Do you want to update this schedule?':
    'Quieres actualizar este horario?',
  'Your unsaved source selection will be lost. Do you want to leave this screen?':
    'Se perdera tu seleccion de fuente no guardada. Quieres salir de esta pantalla?',
  'Your unsaved settings changes will be lost. Do you want to go back?':
    'Se perderan tus cambios de configuracion no guardados. Quieres volver?',
  'Keep editing': 'Seguir editando',
  'Discard': 'Descartar',
  'Remove this event?': 'Eliminar este evento?',

  // Walking
  'Paused': 'Pausado',
  'Walking': 'Caminando',
  'Tap Resume to continue your walk.': 'Toca Reanudar para continuar tu caminata.',
  'Keep going! Every step counts.': 'Sigue! Cada paso cuenta.',
  'Time remaining': 'Tiempo restante',
  'Remaining Time': 'Tiempo restante',
  'Session Time': 'Tiempo de sesion',
  'Active time': 'Tiempo activo',
  'Keep moving! 🚶': 'Sigue moviendote! 🚶',
  'Distance': 'Distancia',
  'Step Counter': 'Contador de pasos',
  'Calories': 'Calorias',
  'Location off': 'Ubicacion desactivada',
  'Walking now': 'Caminando ahora',
  'Not moving yet': 'Sin movimiento aun',
  'Locating': 'Buscando ubicacion',
  'Your gap is almost over. Consider heading back.':
    'Tu hueco casi termina. Considera regresar.',
  'End Walk': 'Terminar caminata',
  'Resume': 'Reanudar',
  'Pause': 'Pausar',
  'Enable Location?': 'Activar ubicacion?',
  'Allow location to track your route and estimate distance. You can still track time without this.':
    'Permite la ubicacion para rastrear tu ruta y estimar distancia. Puedes seguir registrando tiempo sin esto.',
  'Enable location to show live route and step count.':
    'Activa la ubicacion para mostrar ruta en vivo y conteo de pasos.',
  'No walking detected': 'No se detecta caminata',
  'Not walking detected': 'No se detecta caminata',
  'You are not walking right now. You can continue this session later.':
    'No estas caminando ahora. Puedes continuar esta sesion mas tarde.',
  'You are not walking right now, want to do this session later':
    'No estas caminando ahora, quieres hacer esta sesion mas tarde',
  'No, Continue': 'No, continuar',
  'No, Change': 'No, cambiar',
  'Yes, later': 'Si, mas tarde',
  'Change walk window': 'Cambiar ventana de caminata',
  'Set your preferred start time and walk duration.':
    'Define tu hora de inicio preferida y la duracion de caminata.',
  'Start time': 'Hora de inicio',
  'Walk minutes': 'Minutos de caminata',
  'Save this change': 'Guardar este cambio',
  'Are you sure you want to update this walk time and duration':
    'Seguro que deseas actualizar esta hora y duracion de caminata',
  'Please enter a valid start time.': 'Ingresa una hora de inicio valida.',
  'Set duration between 1 and 180 minutes.': 'Define una duracion entre 1 y 180 minutos.',
  'Choose a future time for this walk.': 'Elige una hora futura para esta caminata.',
  'Not now': 'Ahora no',
  'Allow': 'Permitir',
  'Enable': 'Activar',
  'End Walk?': 'Terminar caminata?',
  'End this walk?': 'Terminar esta caminata?',
  'Are you sure you want to end this walk session?':
    'Seguro que quieres terminar esta sesion de caminata?',
  'Your walk progress will be saved to today stats.':
    'El progreso de tu caminata se guardara en las estadisticas de hoy.',
  'Keep Walking': 'Seguir caminando',
  'Yes, end': 'Si, terminar',
  'Yes, End': 'Si, terminar',
  'Walk Complete!': 'Caminata completada!',
  'Walk complete': 'Caminata completada',
  'Walk completed': 'Caminata completada',
  'Every step added up. Well done.': 'Cada paso sumo. Bien hecho.',
  'You made time for yourself today.': 'Hoy hiciste tiempo para ti.',
  'Consistent effort builds lasting change.': 'El esfuerzo constante genera cambios duraderos.',
  'Another walk in the books.': 'Otra caminata registrada.',
  'Progress, one walk at a time.': 'Progreso, una caminata a la vez.',
  'Your future self will thank you.': 'Tu yo del futuro te lo agradecera.',
  'Great progress!': 'Gran progreso!',
  '\uD83C\uDF89 Goal achieved!': '\uD83C\uDF89 Meta alcanzada!',
  'Map is available on mobile app': 'El mapa esta disponible en la app movil',
  'Map view is unavailable on web preview.': 'La vista de mapa no esta disponible en la vista web.',
  'Web preview supports timer flow, but live map and movement tracking run on Android/iOS builds.':
    'La vista web soporta el temporizador, pero el mapa en vivo y el seguimiento de movimiento funcionan en Android/iOS.',

  // Setup/import status
  'Opening file picker...': 'Abriendo selector de archivos...',
  'Parsing calendar...': 'Analizando calendario...',
  'Import Warning': 'Aviso de importacion',
  'No Events': 'Sin eventos',
  'No events found in the ICS file.': 'No se encontraron eventos en el archivo ICS.',
  'No events found in the calendar file.': 'No se encontraron eventos en el archivo de calendario.',
  'Import Failed': 'Importacion fallida',
  'Schedule Updated': 'Horario actualizado',
  'Import Note': 'Nota de importacion',
  'The ICS file was imported, but no timed events were available for the weekly grid preview.':
    'El archivo ICS se importo, pero no habia eventos con hora para la vista semanal.',
  'The calendar file was imported, but no timed events were available for the weekly grid preview.':
    'Se importo el archivo de calendario, pero no habia eventos con hora para la vista semanal.',
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

const enFriendly: Record<string, string> = {
  'Tweak how GapWalk looks and speaks.': 'Choose how GapWalk looks and which language it uses.',
  'Review your choices and save when ready.': 'Review your settings and save when you are ready.',
  'You can change this anytime.': 'You can update this anytime.',
  'Target, buffer & reminders': 'Goal, buffer, and reminders',
  'Notifications & quiet hours': 'Reminders and quiet hours',
  'Notifications, quiet hours & preferred periods': 'Reminders, quiet hours, and preferred periods',
  'When to notify': 'When to send reminders',
  'No Excuses enforces step-goal checks. Easygoing keeps walk timing flexible.':
    'No Excuses checks your step goal. Easygoing gives you more flexibility.',
  'Easygoing keeps your step goal optional.': 'In Easygoing mode, step goal is optional.',
  'Step goal is currently off.': 'Step goal is off right now.',
  'Preferred walking periods (optional)': 'Preferred walking periods (optional)',
  'Pick up to 5 preferred time windows for walks. GapWalk will only suggest opportunities inside these windows when this is enabled.':
    'Pick up to 5 preferred time windows for walks. GapWalk will only suggest opportunities inside these windows when this is enabled.',
  'Tap to edit periods': 'Tap to edit periods',
  'No preferred period selected.': 'No preferred period selected.',
  'Preferred Walking Periods': 'Preferred walking periods',
  'Add 1 to 5 preferred time periods. GapWalk will suggest walks only in these windows when enabled.':
    'Add 1 to 5 preferred time periods. GapWalk will suggest walks only in these windows when enabled.',
  'Remove': 'Remove',
  '+ Add period': '+ Add period',
  'Save periods': 'Save periods',
  'Add at least one preferred walking period.': 'Add at least one preferred walking period.',
  'You can add up to 5 preferred periods.': 'You can add up to 5 preferred periods.',
  'Each preferred period needs a valid start and end time.':
    'Each preferred period needs a valid start and end time.',
  'Enter valid start and end times for each period.':
    'Enter valid start and end times for each period.',
  'Start and end times cannot be the same.':
    'Start and end times cannot be the same.',
  'Preferred periods': 'Preferred periods',
  'Select the time frame when GapWalk will not send you notifications.':
    'Choose when GapWalk should stay quiet.',
  'Set up your preferences so GapWalk can find the best walking windows in your schedule.':
    'Set your preferences so GapWalk can find the best walk windows in your schedule.',
  'Ready to walk?': 'Ready for a walk',
  'See exactly when to walk and when GapWalk will notify you.':
    'See your next walk windows and reminder times.',
  'Goal reached for today': "You reached today's goal",
  'No opportunities yet': 'No walk windows right now',
  'No suitable gaps were found right now. Pull to refresh, or start a manual walk below.':
    'No good walk windows were found right now. Pull to refresh or start a manual walk.',
  'Other preferences': 'Other settings',
  'Notify me': 'Remind me',
  'Start Manual Walk': 'Start manual walk',
  'Edit your choices': 'Edit preferences',
  'Map is available on mobile app': 'Map is available in the mobile app',
  'Map view is unavailable on web preview.': 'Map view is not available in web preview.',
  'Web preview supports timer flow, but live map and movement tracking run on Android/iOS builds.':
    'Web preview supports the timer only. Live map and movement tracking work on Android and iOS.',
  'Enable location to show live route and step count.':
    'Turn on location to show your live route and step count.',
  'No walking detected': 'No walking detected',
  'Not walking detected': 'No walking detected',
  'You are not walking right now. You can continue this session later.':
    'You are not walking right now. You can continue this session later.',
  'You are not walking right now, want to do this session later':
    'You are not walking right now. You can continue this session later.',
  'No, Continue': 'No, continue',
  'Yes, later': 'Yes, do it later',
  'Your walk progress will be saved to today stats.':
    "Your walk progress will be saved to today's stats.",
  'Complete a walk to start building weekly history.':
    'Finish a walk to start your weekly history.',
  'Change your schedule source or update existing schedule data.':
    'Change your schedule source or update your current schedule data.',
  'Choose how GapWalk should read your schedule': 'Choose how GapWalk reads your schedule',
  'Input manually': 'Enter manually',
  'Upcoming feature': 'Coming soon',
  'Link Google Calendar will be available in a future update. Use Import or Input manually for now.':
    'Google Calendar linking is coming soon. For now, use Import or Enter manually.',
  'No account needed - 100% free - Your data stays on device.':
    'No account needed. Free to use. Your data stays on your device.',
  'Get gentle notifications at the right moments - never during class, meetings, or quiet hours.':
    'Get gentle reminders at the right moments, never during class, meetings, or quiet hours.',
  'Use Recommended Settings?': 'Use recommended settings',
  'If you skip, GapWalk will use these recommended defaults:':
    'If you skip, GapWalk will use these defaults.',
  'Do you want to save these preference changes?': 'Save these preference changes',
  'If you cancel now, your unsaved changes will be discarded. Do you want to continue?':
    'If you cancel now, your unsaved changes will be lost. Continue',
  'No gaps are found for today.': 'No walk windows are available today.',
  'Could not cancel opportunity': 'Could not cancel this walk window',
  'Cancel this walk opportunity?': 'Cancel this walk window',
  'If you cancel, GapWalk will try to use your next best available gap today.':
    'If you cancel, GapWalk will move to the next best walk window today.',
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
    re: /^Completion:\s(\d+)\s(minutes|times|steps)\/(\d+)\s(minutes|times|steps)$/,
    toEs: (m) => {
      const mapUnit = (unit: string): string => {
        if (unit === 'minutes') return 'minutos';
        if (unit === 'times') return 'veces';
        return 'pasos';
      };
      const u1 = mapUnit(m[2]);
      const u2 = mapUnit(m[4]);
      return `Completado: ${m[1]} ${u1}/${m[3]} ${u2}`;
    },
  },
  {
    re: /^Progress:\s(\d+)\sof\s(\d+)\s(minutes|times|steps)$/,
    toEs: (m) => {
      const mapUnit = (unit: string): string => {
        if (unit === 'minutes') return 'minutos';
        if (unit === 'times') return 'veces';
        return 'pasos';
      };
      const unit = mapUnit(m[3]);
      return `Progreso: ${m[1]} de ${m[2]} ${unit}`;
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
    re: /^Calendar file:\s(.+)$/,
    toEs: (m) => `Archivo de calendario: ${m[1]}`,
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
    re: /^Current streak:\s(\d+)\sday(?:s)?\.$/,
    toEs: (m) => `Racha actual: ${m[1]} dia${m[1] === '1' ? '' : 's'}.`,
  },
  {
    re: /^(\d+)\sminutes • (\d+)\scalories(.*)$/,
    toEs: (m) => `${m[1]} minutos • ${m[2]} calorias${m[3] ?? ''}`,
  },
  {
    re: /^(\d+)\smin\s(\d+)\ssec$/,
    toEs: (m) => `${m[1]} min ${m[2]} s`,
  },
  {
    re: /^Period\s(\d+)$/,
    toEs: (m) => `Periodo ${m[1]}`,
  },
  {
    re: /^(\d+)\smin session saved$/,
    toEs: (m) => `Sesion de ${m[1]} min guardada`,
  },
  {
    re: /^Session recorded:\s(\d+)\smin$/,
    toEs: (m) => `Sesion registrada: ${m[1]} min`,
  },
  {
    re: /^Session summary:\s(\d+)\smin\s•\s(\d+)\ssteps\s•\s([0-9]+(?:\.[0-9]+)?)\smi$/,
    toEs: (m) => `Resumen de sesion: ${m[1]} min • ${m[2]} pasos • ${m[3]} mi`,
  },
  {
    re: /^(\d+)\smin\s-\s(\d+)\ssteps\s-\s([0-9]+(?:\.[0-9]+)?)\smi$/,
    toEs: (m) => `${m[1]} min - ${m[2]} pasos - ${m[3]} mi`,
  },
  {
    re: /^One-time • (.+)$/,
    toEs: (m) => `Evento unico • ${m[1]}`,
  },
];

export const translateLiteral = (input: string, language: AppLanguage): string => {
  const friendly = enFriendly[input] ?? input;
  if (language === 'en') return friendly;

  const exact = esExact[input] ?? esExact[friendly];
  if (exact) return exact;

  for (const pattern of patterns) {
    const match = input.match(pattern.re);
    if (match) return pattern.toEs(match);
    const friendlyMatch = friendly.match(pattern.re);
    if (friendlyMatch) return pattern.toEs(friendlyMatch);
  }

  return friendly;
};
