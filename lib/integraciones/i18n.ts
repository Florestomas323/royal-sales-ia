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
    unread: (count: number) => `${count} nuevas`,
  },

  auth: {
    signIn: 'Iniciar sesión',
    signUp: 'Crear cuenta',
    signOut: 'Cerrar sesión',
    continueWithGoogle: 'Continuar con Google',
    orWithEmail: 'o con tu correo',
    welcomeBack: 'Bienvenido de vuelta',
    createAccount: 'Crea tu cuenta',
    signInSubtitle: 'Ingresa a tu centro de mando de ventas.',
    signUpSubtitle: 'Empieza a operar tu marketing y ventas con IA.',
    fullName: 'Nombre completo',
    fullNamePlaceholder: 'Ana Torres',
    email: 'Correo electrónico',
    workEmail: 'Correo de trabajo',
    emailPlaceholder: 'tu@agencia.com',
    password: 'Contraseña',
    passwordHint: 'Mínimo 6 caracteres.',
    haveAccount: '¿Ya tienes cuenta?',
    noAccount: '¿Aún no tienes cuenta?',
    goToSignIn: 'Inicia sesión',
    goToSignUp: 'Crea una gratis',
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
      changeTypeConfirm: (to: string) =>
        `¿Cambiar este prospecto a ${to}? Volverá a la primera etapa de ese embudo.`,
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
        'Estado de la conexión de este workspace con Meta: cuenta, activos, Lead Ads y sincronización.',
      back: 'Integraciones',
      pending: 'Pendiente de conexión',
      workspaceLabel: 'Workspace',
      sections: {
        status: 'Estado',
        account: 'Cuenta',
        accountHint: 'Usuario o negocio de Meta que autorizará el acceso.',
        assets: 'Activos',
        adAccount: 'Cuenta publicitaria',
        page: 'Página de Facebook',
        leadForms: 'Formularios de Lead Ads',
        leadAds: 'Estado de Lead Ads',
        leadAdsActive: 'Activo',
        leadAdsInactive: 'Inactivo',
        sync: 'Sincronización',
        lastSync: 'Última sincronización',
        never: 'Nunca',
        actions: 'Acciones',
      },
      actions: {
        connect: 'Conectar Meta',
        reconnect: 'Reconectar',
        disconnect: 'Desconectar',
        connectUnavailable:
          'La conexión real se habilitará en la siguiente fase, cuando la app de Meta esté verificada y exista el backend para guardar los tokens de forma segura.',
        adminOnly: 'Solo un administrador del workspace o el super admin puede conectar Meta.',
      },
      prerequisites: {
        title: 'Requisitos antes de conectar',
        description:
          'Estos pasos se hacen fuera de Royal Sales IA. Ninguno está completado todavía.',
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
    description: 'Administra tu workspace, tu perfil y tus preferencias de notificación.',
    savedTitle: 'Cambios guardados',
    savedDescription: 'Tu configuración se actualizó.',
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
      planLabel: 'Plan',
      planDescription: 'Tu plan de suscripción actual.',
      currencyLabel: 'Moneda predeterminada',
      currencyDescription: 'Se usa para inversión, ingresos y valores del embudo.',
    },
    profile: {
      title: 'Perfil',
      description: 'Actualiza tu información personal.',
      changePhoto: 'Cambiar foto',
      nameLabel: 'Nombre completo',
      emailLabel: 'Correo electrónico',
    },
    notifications: {
      title: 'Notificaciones',
      description: 'Elige sobre qué quieres recibir avisos.',
      items: [
        {
          id: 'new-lead',
          title: 'Nuevo prospecto asignado',
          description: 'Avísame cuando me asignen un prospecto.',
          on: true,
        },
        {
          id: 'hot-lead',
          title: 'Alertas de prospectos calientes',
          description: 'Aviso inmediato para prospectos con puntaje de 80 o más.',
          on: true,
        },
        {
          id: 'appointment',
          title: 'Cita agendada',
          description: 'Cuando un prospecto agenda una llamada desde cualquier embudo.',
          on: true,
        },
        {
          id: 'cold',
          title: 'Prospecto enfriándose',
          description: 'Cuando un prospecto caliente lleva 24 h sin actividad.',
          on: false,
        },
        {
          id: 'digest',
          title: 'Resumen diario',
          description: 'Resumen matutino del embudo y las prioridades del día.',
          on: true,
        },
      ],
    },
    billing: {
      title: 'Facturación',
      description: 'Administra tu plan y tu método de pago.',
      plan: (plan: string) => `Plan ${plan}`,
      billedAnnually: 'Facturación anual · se renueva en enero de 2027',
      managePlan: 'Administrar plan',
      cardEnding: 'Visa terminada en 4242',
      cardExpires: 'Vence 08 / 2028',
      update: 'Actualizar',
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
