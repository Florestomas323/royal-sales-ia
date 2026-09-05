/**
 * Textos de la interfaz — español (LatAm).
 *
 * Punto único donde vive TODO el copy visible del producto. Los componentes
 * importan `t` y nunca escriben cadenas literales. Cuando se añada un segundo
 * idioma basta con crear otro diccionario con esta misma forma y elegirlo aquí,
 * sin tocar los componentes.
 *
 * Regla: aquí solo va texto visible. Nombres de campos, ids, colecciones de
 * Firestore, rutas y variables de entorno NO se traducen ni se listan aquí.
 */
export const t = {
  common: {
    search: 'Buscar',
    searchEllipsis: 'Buscar…',
    save: 'Guardar',
    saveChanges: 'Guardar cambios',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Eliminar',
    filter: 'Filtrar',
    assign: 'Asignar',
    call: 'Llamar',
    message: 'Mensaje',
    schedule: 'Agendar',
    addNote: 'Agregar nota',
    send: 'Enviar',
    copy: 'Copiar',
    copied: 'Copiado',
    close: 'Cerrar',
    more: 'Más',
    creating: 'Creando…',
    sending: 'Enviando…',
    loading: 'Cargando…',
    viewAll: 'Ver todo',
    live: 'En vivo',
    priority: 'Prioridad',
    comingSoon: 'Próximamente',
    phase2: 'Fase 2',
    unassigned: 'Sin asignar',
    by: 'por',
    vsPrevious: 'vs. periodo anterior',
    retry: 'Reintentar',
    demoData: 'Datos de demostración',
    demoDataHint: 'Esta vista muestra datos ilustrativos; aún no está conectada a Firestore.',
    containsDemoRows: 'Esta lista incluye registros demo marcados como tal.',
    selectWorkspaceFirst: 'Selecciona un workspace para poder crear registros.',
  },

  tenancy: {
    workspace: 'Workspace',
    allWorkspaces: 'Todos los workspaces',
    switchWorkspace: 'Cambiar de workspace',
    superAdminGlobal: 'Vista global',
    noMembershipTitle: 'Tu cuenta aún no tiene workspace',
    noMembershipBody: (email: string) =>
      `Iniciaste sesión como ${email}, pero ningún administrador te ha invitado a un workspace. Pídele a tu distribuidor o al super admin que te agregue al equipo con este mismo correo.`,
    unverifiedTitle: 'Verifica tu correo para continuar',
    unverifiedBody: (email: string) =>
      `Encontramos una invitación para ${email}. Por seguridad, necesitas confirmar tu correo antes de entrar al workspace. Revisa tu bandeja de entrada (y spam).`,
    resendVerification: 'Reenviar correo de verificación',
    alreadyVerified: 'Ya lo verifiqué',
    verificationSent: 'Te enviamos un nuevo correo de verificación.',
    errorTitle: 'No pudimos cargar tu workspace',
    errorBody: 'Ocurrió un error al resolver tu acceso. Intenta de nuevo o cierra sesión.',
    dataErrorTitle: 'No se pudieron cargar los datos',
    onlyAssignedLeads: 'Como vendedor solo ves los prospectos asignados a ti.',
    readOnly: 'Tu rol es de solo lectura.',
  },

  superAdmin: {
    tab: 'Super admin',
    title: 'Herramientas de super admin',
    description:
      'Operaciones globales sobre todos los workspaces. Cada acción escribe directamente en Firestore.',
    workspacesTitle: 'Workspaces',
    workspacesDescription: 'Cada distribuidor es un workspace con datos completamente aislados.',
    newWorkspace: 'Nuevo workspace',
    workspaceName: 'Nombre del workspace',
    workspaceNamePlaceholder: 'Distribuidora Andrés Characo',
    ownerEmail: 'Correo del administrador (opcional)',
    createWorkspace: 'Crear workspace',
    workspaceCreated: 'Workspace creado',
    migrationTitle: 'Migración: documentos sin workspaceId',
    migrationDescription:
      'Asigna los documentos antiguos (creados antes del modelo multi-tenant) al workspace seleccionado. No borra ni sobrescribe nada que ya tenga workspaceId.',
    migrationScan: 'Escanear',
    migrationRun: (n: number) => `Asignar ${n} documentos al workspace activo`,
    migrationNothing: 'No hay documentos pendientes de migrar.',
    migrationDone: (n: number) => `${n} documentos migrados.`,
    migrationNeedsWorkspace: 'Selecciona un workspace concreto (no "Todos") para migrar.',
    seedTitle: 'Datos demo (solo desarrollo)',
    seedDescription:
      'Siembra el dataset de demostración en el workspace activo. Deshabilitado en producción salvo que NEXT_PUBLIC_ENABLE_DEMO_SEED=true.',
    seedRun: 'Sembrar datos demo',
    seedDisabled: 'La siembra de datos demo está deshabilitada en este entorno.',
    seedDone: 'Datos demo sembrados en el workspace activo.',
    seedExists: 'El workspace ya tiene datos; no se sembró nada.',
    pending: (label: string, n: number) => `${label}: ${n} sin workspaceId`,
    normalizeTitle: 'Normalización Fase 2: tipo de prospecto y objetivo de campaña',
    normalizeDescription:
      'Asigna leadType = "sales" a los prospectos del workspace activo que no lo tengan y objective a las campañas sin objetivo. Idempotente: no toca documentos ya normalizados ni datos comerciales.',
    normalizeScan: 'Revisar',
    normalizeRun: (n: number) => `Normalizar ${n} documentos`,
    normalizeNothing: 'Todos los documentos del workspace ya están normalizados.',
    normalizeDone: (n: number) => `${n} documentos normalizados.`,
    normalizePending: (leads: number, campaigns: number) =>
      `Prospectos sin tipo: ${leads} · Campañas sin objetivo: ${campaigns}`,
  },

  nav: {
    sections: {
      overview: 'Resumen',
      marketing: 'Marketing',
      sales: 'Ventas',
      intelligence: 'Inteligencia',
      automation: 'Automatización',
      management: 'Gestión',
      system: 'Sistema',
    },
    items: {
      commandCenter: 'Centro de mando',
      campaigns: 'Campañas',
      mediaBuyer: 'Media Buyer IA',
      contentLab: 'Laboratorio de Contenido',
      leads: 'Prospectos',
      pipeline: 'Embudo de ventas',
      inbox: 'Bandeja de entrada',
      calendar: 'Calendario',
      analytics: 'Analítica',
      reports: 'Reportes',
      automations: 'Automatizaciones',
      clients: 'Clientes',
      team: 'Equipo',
      integrations: 'Integraciones',
      settings: 'Configuración',
    },
  },

  shell: {
    brandTagline: 'Marketing & Sales OS',
    toggleSidebar: 'Mostrar u ocultar la barra lateral',
    sidebarTitle: 'Barra lateral',
    sidebarDescription: 'Menú de navegación de la aplicación.',
    reportingPeriod: 'Periodo del reporte',
    upgradePlan: 'Mejorar plan',
    workspaceSettings: 'Configuración del workspace',
    signOut: 'Cerrar sesión',
    loadingWorkspace: 'Cargando tu workspace…',
  },

  search: {
    title: 'Búsqueda global',
    description: 'Busca en páginas y prospectos.',
    placeholder: 'Busca páginas, prospectos…',
    pages: 'Páginas',
    leads: 'Prospectos',
    noResults: (query: string) => `Sin resultados para “${query}”.`,
    hint: 'para abrir · Esc para cerrar',
  },

  notifications: {
    title: 'Notificaciones',
    ariaLabel: 'Notificaciones',
    emptyTitle: 'No hay notificaciones',
    emptyBody:
      'Aquí verás avisos de prospectos nuevos, citas y seguimientos cuando el registro de actividades esté conectado.',
  },

  auth: {
    signIn: 'Iniciar sesión',
    signOut: 'Cerrar sesión',
    activate: 'Activar invitación',
    activateAccount: 'Activa tu invitación',
    activateSubtitle: 'Royal Sales IA es solo por invitación. Escribe el correo con el que te invitaron.',
    checkInvitation: 'Continuar',
    checking: 'Verificando…',
    invitationFound: (email: string) => `Encontramos tu invitación para ${email}. Crea tu contraseña para entrar.`,
    invitationNotFound:
      'No hay ninguna invitación pendiente para ese correo. Pide a tu distribuidor o al administrador que te invite desde Equipo.',
    invitationUnavailable:
      'No pudimos verificar tu invitación en este momento. Inténtalo de nuevo en unos minutos.',
    invitationRateLimited: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
    changeEmail: 'Usar otro correo',
    inviteOnlyNotice:
      'El acceso es solo por invitación. Si ya tienes cuenta, inicia sesión con el mismo correo con el que te invitaron.',
    goToActivate: 'Activa tu invitación',
    noAccountInvite: '¿Te invitaron y aún no entras?',
    continueWithGoogle: 'Continuar con Google',
    orWithEmail: 'o con tu correo',
    welcomeBack: 'Bienvenido de vuelta',
    signInSubtitle: 'Ingresa a tu centro de mando de ventas.',
    fullName: 'Nombre completo',
    fullNamePlaceholder: 'Ana Torres',
    email: 'Correo electrónico',
    workEmail: 'Correo de trabajo',
    emailPlaceholder: 'tu@agencia.com',
    password: 'Contraseña',
    passwordHint: 'Mínimo 6 caracteres.',
    haveAccount: '¿Ya tienes cuenta?',
    goToSignIn: 'Inicia sesión',
    heroTitle:
      'El sistema operativo de IA para equipos de marketing y ventas de alto rendimiento.',
    rights: 'Todos los derechos reservados.',
    highlights: [
      {
        title: 'Embudo inteligente',
        body: 'Prioriza prospectos con scoring por IA y cierra más rápido.',
      },
      {
        title: 'Todo tu equipo',
        body: 'Media buyers, closers y clientes en un solo centro de mando.',
      },
      {
        title: 'Asistente Royal AI',
        body: 'Recomendaciones accionables sobre cada prospecto y campaña.',
      },
    ],
    errors: {
      invalidEmail: 'El correo no tiene un formato válido.',
      invalidCredential: 'Correo o contraseña incorrectos.',
      emailInUse: 'Ya existe una cuenta con este correo. Inicia sesión.',
      weakPassword: 'La contraseña debe tener al menos 6 caracteres.',
      tooManyRequests: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
      operationNotAllowed:
        'El acceso con correo y contraseña aún no está habilitado en Firebase. Actívalo en Authentication → Sign-in method.',
      configurationNotFound:
        'Falta configurar Authentication en Firebase. Habilita el proveedor Email/Password en la consola.',
      networkFailed: 'Error de red. Revisa tu conexión e inténtalo de nuevo.',
      popupClosed: 'Se cerró la ventana de Google antes de terminar. Inténtalo de nuevo.',
      popupBlocked: 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes.',
      unauthorizedDomain:
        'Este dominio no está autorizado en Firebase. Agrégalo en Authentication → Settings → Authorized domains.',
      googleFailed: 'No se pudo continuar con Google. Inténtalo de nuevo.',
      generic: 'Algo salió mal. Inténtalo de nuevo.',
    },
  },

  overview: {
    welcome: (name: string) => `Hola de nuevo, ${name}`,
    description: 'Esto es lo que está pasando hoy en tus campañas y tu embudo.',
    performanceTrend: 'Tendencia de rendimiento',
    performanceTrendDescription: 'Prospectos e ingresos de los últimos 14 días',
    platformPerformance: 'Rendimiento por plataforma',
    platformPerformanceDescription: 'De dónde vienen tus prospectos y tus ingresos',
    leadsUnit: 'prospectos',
    funnel: 'Embudo de conversión',
    funnelDescription: 'Recorrido del prospecto a lo largo del embudo',
    priorities: 'Prioridades de hoy',
    prioritiesDescription: 'Prospectos con mayor puntaje que necesitan un contacto',
    prioritiesEmpty: 'No hay prospectos activos en este workspace todavía.',
    kpis: {
      totalLeads: 'Prospectos',
      totalLeadsSub: 'en el workspace',
      salesLeads: 'Prospectos de venta',
      salesLeadsSub: (open: number) => `${open} activos`,
      candidates: 'Candidatos',
      candidatesSub: (open: number) => `${open} en proceso`,
      closed: 'Ventas cerradas',
      closedSub: (hired: number) => `${hired} incorporaciones`,
    },
  },

  ai: {
    name: 'Royal AI',
    refreshed: 'Recomendaciones actualizadas hace unos minutos',
    assistant: 'Asistente Royal AI',
    assistantSubtitle: 'Coaching para este prospecto',
    inputPlaceholder: 'Pregúntale a Royal AI sobre este prospecto...',
    suggestions: {
      whatsapp: 'Redacta un mensaje de WhatsApp',
      nextAction: '¿Cuál es la mejor siguiente acción?',
      objection: 'Manejar objeción de precio',
    },
    prompts: {
      whatsapp: 'Redacta un mensaje de WhatsApp para abrir la conversación',
      nextAction: '¿Cuál es la mejor siguiente acción para este prospecto?',
      objection: '¿Cómo manejo una objeción de precio?',
    },
    replies: {
      whatsapp: (first: string, campaign: string) =>
        `¡Hola ${first}! Gracias por tu interés desde ${campaign}. Me encantaría mostrarte cómo podemos ayudarte, ¿tienes 10 minutos hoy o mañana para una llamada rápida?`,
      objection: (first: string, value: string) =>
        `${first} probablemente es sensible al precio. Habla del resultado, no del costo: ancla la conversación en el valor de ${value} que está en juego y luego ofrece una opción de entrada. Pregúntale qué resultado haría que esto fuera un sí claro.`,
      nextAction: (first: string, action: string, stage: string, score: number) =>
        `Mejor siguiente paso para ${first}: ${action}. Está en la etapa "${stage}" con un puntaje de ${score}/100 — muévete rápido mientras la intención está alta.`,
      summary: (
        first: string,
        score: number,
        campaign: string,
        temperature: string,
        action: string,
      ) =>
        `${first} obtuvo ${score}/100 desde ${campaign}. Se ve ${temperature}. Yo haría esto: ${action}, y mencionaría el creativo con el que interactuó para mantener el contexto fresco.`,
    },
  },

  campaigns: {
    title: 'Campañas',
    description: 'Rendimiento de anuncios en Meta, Google y TikTok.',
    newCampaign: 'Nueva campaña',
    dialogTitle: 'Nueva campaña',
    dialogDescription:
      'Registra una campaña y asígnala a un cliente. Se guarda en tiempo real.',
    nameLabel: 'Nombre de la campaña',
    namePlaceholder: 'Ej. Cocina Saludable — Prospección',
    objectiveLabel: 'Objetivo',
    objectiveHint: 'Define si la campaña busca clientes o candidatos.',
    platformLabel: 'Plataforma',
    statusLabel: 'Estado',
    clientLabel: 'Cliente',
    clientPlaceholder: 'Selecciona un cliente',
    create: 'Crear campaña',
    createdTitle: 'Campaña creada',
    createdDescription: (name: string) => `${name} se creó correctamente.`,
    createError: 'No se pudo crear la campaña. Inténtalo de nuevo.',
    searchPlaceholder: 'Buscar campañas',
    stats: {
      spend: 'Inversión publicitaria',
      leads: 'Prospectos generados',
      revenue: 'Ingresos',
      roas: 'ROAS combinado',
      active: 'Campañas activas',
    },
    table: {
      campaign: 'Campaña',
      objective: 'Objetivo',
      status: 'Estado',
      spend: 'Inversión',
      leads: 'Prospectos',
      cpl: 'CPL',
      revenue: 'Ingresos',
      roas: 'ROAS',
    },
  },

  leads: {
    title: 'Prospectos',
    description:
      'Todos los prospectos de todas tus campañas: puntuados, atribuidos y listos para trabajar.',
    metaDescription: 'Todos los prospectos de todas tus campañas, puntuados y listos para trabajar.',
    newLead: 'Nuevo prospecto',
    addLead: 'Agregar prospecto',
    dialogTitle: 'Nuevo prospecto',
    dialogDescription:
      'Agrega un prospecto manualmente al embudo. Se guarda en tiempo real.',
    types: {
      all: 'Todos',
      label: 'Tipo de prospecto',
      sales: 'Venta',
      salesHint: 'Interesado en productos, demostración o compra.',
      recruiting: 'Reclutamiento',
      recruitingHint: 'Interesado en la oportunidad, empleo o trabajar contigo.',
    },
    source: 'Fuente',
    sourcePlaceholder: 'Selecciona la fuente',
    sourceIndeedHint: 'Indeed solo está disponible para candidatos de reclutamiento.',
    noCampaign: 'Sin campaña',
    recruitingFields: {
      title: 'Datos del candidato (opcional)',
      jobTitle: 'Puesto de interés',
      jobTitlePlaceholder: 'Ej. Vendedor independiente',
      city: 'Ciudad',
      state: 'Estado',
      employmentPreference: 'Preferencia',
      employmentPreferencePlaceholder: 'Ej. Tiempo completo, medio tiempo',
      hasVehicle: 'Cuenta con vehículo',
    },
    fullName: 'Nombre completo',
    fullNamePlaceholder: 'Ej. Marta Díaz',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    emailPlaceholder: 'nombre@correo.com',
    campaign: 'Campaña',
    campaignPlaceholder: 'Selecciona una campaña',
    assignTo: 'Asignar a',
    assignPlaceholder: 'Selecciona un vendedor',
    create: 'Crear prospecto',
    createdTitle: 'Prospecto creado',
    createdDescription: (name: string) => `${name} se agregó a Nuevo prospecto.`,
    createError: 'No se pudo crear el prospecto. Inténtalo de nuevo.',
    defaultName: 'Nuevo prospecto',
    searchPlaceholder: 'Busca por nombre, correo, teléfono o campaña...',
    allStages: 'Todas las etapas',
    allSources: 'Todas las fuentes',
    allTemperatures: 'Todos los niveles',
    sortByScore: 'Mayor puntaje',
    sortByValue: 'Mayor valor',
    sortByRecent: 'Más recientes',
    count: (shown: number, total: number) => `de ${total} prospectos`,
    emptyTitle: 'Ningún prospecto coincide con tus filtros',
    emptyDescription: 'Prueba quitando un filtro o ajustando tu búsqueda.',
    searchPlaceholderShort: 'Buscar prospectos…',
    filtersLabel: 'Filtros',
    table: {
      lead: 'Prospecto',
      type: 'Tipo',
      source: 'Fuente',
      stage: 'Etapa',
      score: 'Puntaje',
      value: 'Valor',
      owner: 'Responsable',
      received: 'Recibido',
    },
    detail: {
      receivedTitle: 'Prospecto recibido',
      receivedDescription: (campaign: string) => `Entró al workspace desde ${campaign} y espera su primer contacto.`,
      systemActor: 'Sistema',
      potential: 'de valor potencial',
      whatsapp: 'WhatsApp',
      call: 'Llamar',
      book: 'Agendar',
      bookPending: 'Agendar estará disponible con el módulo de Calendario.',
      noPhone: 'Este prospecto no tiene teléfono registrado.',
      whatsappGreeting: (name: string) => `Hola ${name}, te escribo de Royal Prestige.`,
      openLead: 'Abrir prospecto',
      tabs: {
        details: 'Detalles',
        timeline: 'Historial',
        attribution: 'Atribución',
      },
      type: 'Tipo',
      source: 'Fuente',
      stage: 'Etapa',
      temperature: 'Temperatura',
      createdAt: 'Fecha de creación',
      workspace: 'Workspace',
      phone: 'Teléfono',
      email: 'Correo electrónico',
      assignedTo: 'Asignado a',
      nextAction: 'Siguiente acción',
      lastContact: 'Último contacto',
      notContacted: 'Sin contactar aún',
      changeType: 'Cambiar tipo',
      changeTypeTitle: 'Cambiar tipo de prospecto',
      changeTypeConfirm: (to: string) =>
        `¿Cambiar este prospecto a ${to}? Volverá a la primera etapa de ese embudo.`,
      changeTypeAction: (to: string) => `Cambiar a ${to}`,
      typeChanged: 'Tipo de prospecto actualizado',
      typeChangeError: 'No se pudo cambiar el tipo. Inténtalo de nuevo.',
      candidate: {
        title: 'Candidato',
        jobTitle: 'Puesto',
        location: 'Ubicación',
        employmentPreference: 'Preferencia',
        hasVehicle: 'Vehículo',
        yes: 'Sí',
        no: 'No',
        interviewDate: 'Entrevista',
        orientationDate: 'Orientación',
        hiredAt: 'Incorporado',
        indeedCandidate: 'Candidato de Indeed',
      },
      notAvailable: '—',
      platform: 'Plataforma',
      campaign: 'Campaña',
      adSet: 'Conjunto de anuncios',
      ad: 'Anuncio',
      creative: 'Creativo',
      utm: 'Parámetros UTM',
      landingPage: 'Página de destino',
      referrer: 'Referente',
      externalIds: 'Identificadores externos',
      noAttribution: 'Sin datos de atribución adicionales todavía. Se completarán cuando se conecten las plataformas publicitarias.',
    },
  },

  pipeline: {
    title: 'Embudos',
    description: 'Arrastra los prospectos entre etapas. Ventas y reclutamiento tienen embudos independientes.',
    salesHint: 'Prospectos comerciales: de nuevo a venta.',
    recruitingHint: 'Candidatos: de nuevo a incorporado.',
    dropHere: 'Suelta prospectos aquí',
    moveError: 'No se pudo mover el prospecto. Inténtalo de nuevo.',
    recruitingStats: {
      open: 'Candidatos activos',
      openSub: 'en proceso',
      interviews: 'Entrevistas',
      interviewsSub: 'llegaron a entrevista o más',
      hired: 'Incorporados',
      hiredSub: 'candidatos incorporados',
      conversion: 'Tasa de incorporación',
      conversionSub: 'del total de candidatos',
    },
    stats: {
      open: 'Embudo abierto',
      openSub: (count: number) => `${count} prospectos activos`,
      won: 'Ganado en el periodo',
      wonSub: (count: number) => `${count} negocios cerrados`,
      winRate: 'Tasa de cierre',
      winRateSub: 'del total de prospectos',
      avgScore: 'Puntaje promedio',
      avgScoreSub: 'índice de calidad',
    },
  },

  clients: {
    title: 'Clientes',
    description: 'Todas las cuentas que gestionas, con inversión e ingresos de un vistazo.',
    addClient: 'Agregar cliente',
    dialogTitle: 'Nuevo cliente',
    dialogDescription:
      'Crea una cuenta para empezar a asignar campañas y prospectos. Se guarda en tiempo real.',
    nameLabel: 'Nombre del cliente',
    namePlaceholder: 'Ej. Cocina Saludable S.A.',
    industryLabel: 'Industria',
    industryPlaceholder: 'Ej. Alimentos y bebidas',
    statusLabel: 'Estado',
    create: 'Crear cliente',
    createdTitle: 'Cliente agregado',
    createdDescription: (name: string) => `${name} se creó correctamente.`,
    createError: 'No se pudo crear el cliente. Inténtalo de nuevo.',
    emptyTitle: 'Aún no hay clientes',
    emptyDescription: 'Agrega tu primer cliente para empezar a gestionar campañas y prospectos.',
    roas: 'Retorno de la inversión publicitaria',
    metrics: {
      adSpend: 'Inversión',
      revenue: 'Ingresos',
      leads: 'Prospectos',
      cpl: 'Costo / prospecto',
      appointments: 'Citas',
      sales: 'Ventas',
    },
  },

  team: {
    title: 'Equipo',
    description: 'Gestiona roles, licencias y rendimiento de tu equipo de ventas.',
    invite: 'Invitar miembro',
    dialogTitle: 'Invitar miembro',
    dialogDescription:
      'Agrega a alguien a tu equipo de ventas. Entrará como invitado hasta que acepte.',
    nameLabel: 'Nombre completo',
    namePlaceholder: 'Ej. Diego Torres',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'nombre@royalagency.com',
    roleLabel: 'Rol',
    send: 'Enviar invitación',
    invitedTitle: 'Invitación enviada',
    invitedDescription: (name: string, role: string) =>
      `${name} se agregó al equipo como ${role}.`,
    inviteError: 'No se pudo invitar al miembro. Inténtalo de nuevo.',
    stats: {
      members: 'Miembros del equipo',
      activeSeats: 'Licencias activas',
      assignedLeads: 'Prospectos asignados',
      salesClosed: 'Ventas cerradas',
    },
    table: {
      member: 'Miembro',
      role: 'Rol',
      status: 'Estado',
      leads: 'Prospectos',
      appointments: 'Citas',
      sales: 'Ventas',
    },
  },

  integrations: {
    title: 'Integraciones',
    description:
      'Conecta plataformas de anuncios y canales de mensajería para alimentar tu motor de prospectos.',
    status: {
      connected: 'Conectado',
      not_connected: 'No conectado',
      expired: 'Conexión expirada',
      error: 'Error de conexión',
      coming_soon: 'Próximamente',
      unavailable: 'No disponible',
    },
    connect: (name: string) => `Conectar ${name}`,
    manage: 'Administrar',
    comingSoon: 'Próximamente',
    unavailable: 'No disponible',
    selectWorkspace: 'Selecciona un workspace concreto para administrar sus integraciones.',
    categories: {
      advertising: 'Publicidad',
      messaging: 'Mensajería',
      social: 'Redes sociales',
      recruiting: 'Reclutamiento',
    },
    meta: {
      title: 'Administrar Meta',
      description:
        'Estado real de la conexión de este workspace con Meta: cuenta, activos, campañas, Lead Ads y sincronización.',
      back: 'Integraciones',
      pending: 'Pendiente de conexión',
      workspaceLabel: 'Workspace',
      sections: {
        status: 'Estado',
        account: 'Cuenta',
        accountHint: 'Usuario del sistema de Meta que autentica el token.',
        assets: 'Activos',
        adAccount: 'Cuenta publicitaria',
        adAccountNone: 'Sin cuentas publicitarias accesibles',
        adAccountChoose: 'Elige una cuenta y sincroniza',
        page: 'Página de Facebook',
        pageNone: 'Sin páginas accesibles con este token',
        pagesCount: (n: number) => (n === 1 ? '1 página accesible' : `${n} páginas accesibles`),
        leadForms: 'Formularios de Lead Ads',
        leadFormsCount: (n: number) => (n === 1 ? '1 formulario' : `${n} formularios`),
        campaigns: 'Campañas',
        campaignsCount: (n: number) => (n === 1 ? '1 campaña' : `${n} campañas`),
        campaignsMore: (n: number) => `y ${n} más`,
        campaignsNone: 'Sin campañas en esta cuenta',
        leadAds: 'Estado de Lead Ads',
        leadAdsActive: 'Activo',
        leadAdsInactive: 'Inactivo',
        leadAdsPermissions: 'Permisos adicionales requeridos',
        leadAdsNoPages: 'Sin páginas accesibles',
        leadAdsError: 'Error al leer formularios',
        leadAdsUnknown: 'Sin verificar',
        missingPermissions: (list: string) => `Faltan en el token: ${list}`,
        sync: 'Sincronización',
        lastSync: 'Última sincronización',
        never: 'Nunca',
        actions: 'Acciones',
      },
      actions: {
        sync: 'Sincronizar Meta',
        syncing: 'Sincronizando…',
        verify: 'Verificar conexión',
        syncDone: 'Meta sincronizado',
        syncDoneDescription: (accounts: number, campaigns: number) =>
          `${accounts} cuenta(s) publicitaria(s) · ${campaigns} campaña(s)`,
        syncError: 'No se pudo sincronizar con Meta',
        adminOnly: 'Solo un administrador del workspace o el super admin puede sincronizar Meta.',
        tokenHint:
          'La conexión usa el token de sistema configurado en el servidor. Los tokens nunca llegan al navegador.',
      },
      permissions: {
        title: 'Permisos del token',
        description: 'Lo que el token de sistema puede hacer realmente, según Meta.',
        adsRead: 'Leer anuncios y campañas',
        adsManagement: 'Administrar campañas',
        businessManagement: 'Activos del negocio (cuentas y páginas)',
        leadsRetrieval: 'Descargar prospectos de Lead Ads',
        pagesAccess: 'Acceso a páginas',
        granted: 'Concedido',
        missing: 'No concedido',
      },
      campaignsTable: {
        title: 'Campañas y workspace propietario',
        description:
          'Cada campaña de Meta pertenece a un solo workspace. Ese workspace recibirá los prospectos que genere la campaña, y el tipo decide si entran a Ventas o a Reclutamiento.',
        columnCampaign: 'Campaña',
        columnStatus: 'Estado',
        columnWorkspace: 'Workspace propietario',
        columnType: 'Tipo',
        unassigned: 'Sin asignar',
        unassignedHint: 'Los prospectos de esta campaña quedarán sin asignar hasta que elijas un workspace.',
        assign: 'Asignar',
        remove: 'Quitar asignación',
        assigned: 'Campaña asignada',
        assignedDescription: (campaign: string, workspace: string) => `${campaign} → ${workspace}`,
        assignError: 'No se pudo asignar la campaña',
        removed: 'Asignación eliminada',
        empty: 'No hay campañas en la cuenta publicitaria seleccionada. Sincroniza Meta o elige otra cuenta.',
        emptyNoAccount: 'Selecciona una cuenta publicitaria y sincroniza para ver sus campañas.',
        loadError: 'No se pudieron cargar las asignaciones de campañas.',
        readOnly: 'Solo el administrador del workspace (client_admin) o el super admin pueden asignar campañas. Tu rol puede consultarlas.',
        existingOnly: 'Las asignaciones solo afectan a los prospectos que lleguen a partir de ahora.',
      },
      syncReport: {
        title: 'Resultado de la última sincronización',
        description: 'Cada recurso se sincroniza por separado: que falte un permiso no cancela el resto.',
        resources: {
          businesses: 'Negocios',
          adAccounts: 'Cuentas publicitarias',
          pages: 'Páginas',
          campaigns: 'Campañas',
          leadForms: 'Formularios de Lead Ads',
          leadRetrieval: 'Descarga de prospectos',
        },
        states: {
          ok: 'Sincronizado',
          permission_required: 'Pendiente por permisos',
          error: 'Error',
          skipped: 'Sin consultar',
        },
        items: (n: number) => (n === 1 ? '1 elemento' : `${n} elementos`),
        pending: 'Aún no se ha sincronizado este workspace.',
      },
      ownership: {
        title: 'Cómo se asignan los prospectos',
        body:
          'Una página de Facebook puede compartirse entre varios distribuidores. Por eso cada prospecto se asigna al workspace que paga la campaña que lo generó, nunca a la página. Una campaña pertenece a un solo workspace y su objetivo decide si el prospecto entra a Ventas o a Reclutamiento.',
      },
    },
  },

  settings: {
    title: 'Configuración',
    description: 'Administra tu workspace, tu perfil y tus preferencias.',
    savedTitle: 'Cambios guardados',
    saveError: 'No se pudieron guardar los cambios',
    noChanges: 'No hay cambios que guardar.',
    tabs: {
      workspace: 'Workspace',
      profile: 'Perfil',
      notifications: 'Notificaciones',
      billing: 'Facturación',
    },
    workspace: {
      title: 'Workspace',
      description: 'Información general de tu workspace.',
      nameLabel: 'Nombre del workspace',
      nameDescription: 'Se muestra en toda la aplicación y en los reportes a clientes.',
      nameSaved: 'El nombre del workspace se actualizó.',
      planLabel: 'Plan',
      planDescription: 'Tu plan de suscripción actual.',
      currencyLabel: 'Moneda',
      currencyDescription: 'Todos los montos se muestran en dólares estadounidenses.',
      currencyValue: 'USD ($)',
      readOnly: 'Solo el administrador del workspace o el super admin pueden cambiar el nombre.',
      noWorkspace: 'Selecciona un workspace concreto para editarlo.',
    },
    profile: {
      title: 'Perfil',
      description: 'Actualiza tu información personal.',
      nameLabel: 'Nombre completo',
      emailLabel: 'Correo electrónico',
      emailReadOnly: 'Tu correo viene de tu cuenta de acceso y no se edita aquí.',
      colorLabel: 'Color de tu avatar',
      colorDescription: 'Se usa en el equipo, el embudo y las asignaciones.',
      saved: 'Tu perfil se actualizó.',
      noProfile:
        'Tu cuenta no tiene un perfil de equipo en este workspace, así que no hay nada que editar aquí.',
    },
    notifications: {
      title: 'Notificaciones',
      description: 'Elige sobre qué quieres recibir avisos.',
      unavailableTitle: 'Todavía no disponible',
      unavailableBody:
        'Las notificaciones se activarán cuando el registro de actividades esté conectado. Por ahora no se envía ningún aviso, así que no mostramos preferencias que no tendrían efecto.',
    },
    billing: {
      title: 'Facturación',
      description: 'Tu plan actual.',
      plan: (plan: string) => `Plan ${plan}`,
      unavailableBody:
        'La facturación se gestiona fuera de la aplicación. Para cambiar de plan o actualizar tu método de pago, contacta al administrador de Royal Sales IA.',
    },
  },

  analytics: {
    title: 'Analítica',
    description:
      'Inversión, volumen de prospectos e ingresos en todos los canales conectados.',
    revenueByDay: 'Ingresos por día',
    revenueByDayDescription: 'Ingresos de ventas cerradas y atribuidas en los últimos 14 días',
    revenue: 'Ingresos',
    leads: 'Prospectos',
  },

  modules: {
    onRoadmap: (title: string) => `${title} está en la hoja de ruta`,
    mediaBuyer: {
      title: 'Media Buyer IA',
      description:
        'Asignación autónoma de presupuesto y optimización de creativos en las plataformas de anuncios.',
      blurb:
        'El Media Buyer IA reasignará continuamente la inversión hacia las campañas con mejor ROAS y detectará el desgaste creativo antes de que afecte el rendimiento.',
      features: [
        {
          title: 'Presupuesto automático',
          description:
            'Mueve la inversión hacia los conjuntos ganadores de Meta, Google y TikTok casi en tiempo real.',
        },
        {
          title: 'Alertas de desgaste creativo',
          description:
            'Detecta caídas de CTR y picos de frecuencia para rotar creativos a tiempo.',
        },
        {
          title: 'Estrategia de puja',
          description:
            'Recomienda topes de puja y ampliaciones de segmentación según la tendencia del CPL.',
        },
        {
          title: 'Límites de control',
          description:
            'Define techos de inversión y pisos de ROAS que la IA debe respetar por cliente.',
        },
      ],
    },
    contentLab: {
      title: 'Laboratorio de Contenido',
      description: 'Genera y prueba creativos, ganchos y textos de anuncios con IA.',
      blurb:
        'El Laboratorio de Contenido convertirá tus ángulos con mejor rendimiento en nuevas variaciones de anuncios y las enviará directo a campañas para probarlas.',
      features: [
        {
          title: 'Generador de ganchos',
          description:
            'Crea primeras líneas que detienen el scroll, ajustadas a cada plataforma y audiencia.',
        },
        {
          title: 'Variaciones de creativos',
          description:
            'Convierte los anuncios ganadores en nuevos formatos y proporciones automáticamente.',
        },
        {
          title: 'Pruebas de copy',
          description: 'Prueba A/B de textos y titulares, y promueve a los ganadores.',
        },
        {
          title: 'Voz de marca',
          description:
            'Mantén cada pieza alineada con reglas de tono y estilo por cliente.',
        },
      ],
    },
    inbox: {
      title: 'Bandeja de entrada unificada',
      description:
        'Todas las conversaciones de WhatsApp, Instagram y Messenger en un solo hilo.',
      blurb:
        'La bandeja unificada juntará todos los canales de mensajería con respuestas redactadas por IA para que ningún prospecto espere más de un minuto.',
      features: [
        {
          title: 'Hilos omnicanal',
          description: 'WhatsApp, DM de Instagram y Messenger unificados por prospecto.',
        },
        {
          title: 'Respuestas sugeridas por IA',
          description:
            'Borradores que consideran el contexto del prospecto y la mejor siguiente acción.',
        },
        {
          title: 'Asignación rápida',
          description: 'Enruta conversaciones al vendedor correcto con temporizadores de SLA.',
        },
        {
          title: 'Plantillas y atajos',
          description:
            'Respuestas de un toque para preguntas frecuentes y enlaces para agendar.',
        },
      ],
    },
    calendar: {
      title: 'Calendario',
      description: 'Citas, seguimientos y disponibilidad del equipo en una sola agenda.',
      blurb:
        'El calendario sincronizará las citas agendadas desde tus embudos y permitirá a los vendedores gestionar seguimientos con recordatorios automáticos.',
      features: [
        {
          title: 'Sincronización de citas',
          description:
            'Trae a una sola vista las llamadas agendadas desde embudos y mensajería.',
        },
        {
          title: 'Recordatorios de seguimiento',
          description:
            'Avisos automáticos para que ningún prospecto caliente se quede sin atención.',
        },
        {
          title: 'Disponibilidad del equipo',
          description: 'Asignación rotativa según carga de trabajo y horario laboral.',
        },
        {
          title: 'Recuperación de ausencias',
          description:
            'Dispara secuencias de reenganche cuando un prospecto no asiste a la llamada.',
        },
      ],
    },
    reports: {
      title: 'Reportes',
      description: 'Reportes de rendimiento automáticos y listos para el cliente.',
      blurb:
        'Reportes generará PDFs con tu marca y tableros en vivo para cada cliente, con la frecuencia que elijas.',
      features: [
        {
          title: 'PDFs de marca blanca',
          description: 'Reportes mensuales con tu marca, generados automáticamente por cliente.',
        },
        {
          title: 'Enlaces en vivo',
          description:
            'Comparte con tus clientes un tablero de solo lectura que se actualiza en tiempo real.',
        },
        {
          title: 'Envío programado',
          description: 'Envía reportes por correo cada semana o cada mes sin mover un dedo.',
        },
        {
          title: 'Métricas personalizadas',
          description: 'Elige los KPIs que más le importan a cada cliente.',
        },
      ],
    },
    automations: {
      title: 'Automatizaciones',
      description:
        'Flujos con disparadores para asignar prospectos, dar seguimiento y enviar alertas.',
      blurb:
        'Las automatizaciones te permitirán armar flujos del tipo "si pasa esto, haz aquello" que mueven prospectos, envían mensajes y avisan a los vendedores sin trabajo manual.',
      features: [
        {
          title: 'Constructor visual',
          description: 'Arrastra y suelta disparadores, condiciones y acciones.',
        },
        {
          title: 'Seguimiento automatizado',
          description:
            'Secuencias de varios pasos por WhatsApp y correo según etapa y puntaje.',
        },
        {
          title: 'Asignación inteligente',
          description:
            'Asigna prospectos por fuente, valor o rendimiento del vendedor.',
        },
        {
          title: 'Alertas',
          description: 'Avisa a los gerentes cuando un prospecto de alto valor se enfría.',
        },
      ],
    },
  },
} as const
