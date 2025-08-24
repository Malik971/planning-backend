// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Configuration
const config = require('./config');

// Services et middleware
const auditService = require('./services/auditService');

// Routes
const eventsRoutes = require('./routes/events');
const usersRoutes = require('./routes/users');
const planningRoutes = require('./routes/planning');

// Configuration du logger
const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.simple()
  ),
  defaultMeta: { service: 'planning-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ],
});

const app = express();

// Trust proxy pour obtenir la vraie IP derrière un reverse proxy
app.set('trust proxy', 1);

// Middleware de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Compression des réponses
app.use(compression());

// CORS
app.use(cors(config.cors));

// Rate limiting global
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Trop de requêtes',
    message: 'Veuillez patienter avant de réessayer'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Rate limiting strict pour les endpoints sensibles
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requêtes max
  message: {
    error: 'Trop de requêtes sensibles',
    message: 'Limite de sécurité atteinte, veuillez patienter'
  }
});

// Parsing du JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware d'audit pour capturer le contexte des requêtes
app.use(auditService.middleware());

// Middleware de logging des requêtes
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user?.email || 'anonymous'
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: config.env
  });
});

// Documentation API basique
app.get('/api', (req, res) => {
  res.json({
    name: 'Planning API',
    version: '1.0.0',
    description: 'API pour la gestion de planning avec sécurité Firebase',
    endpoints: {
      events: {
        'GET /api/events': 'Récupérer les événements',
        'POST /api/events': 'Créer un événement',
        'PUT /api/events/:id': 'Modifier un événement',
        'DELETE /api/events/:id': 'Supprimer un événement',
        'GET /api/events/week/:date': 'Événements d\'une semaine',
        'GET /api/events/stats/summary': 'Statistiques'
      },
      users: {
        'GET /api/users/profile': 'Mon profil',
        'PUT /api/users/profile': 'Modifier mon profil',
        'GET /api/users': 'Liste des utilisateurs (admin)',
        'POST /api/users': 'Créer utilisateur (admin)',
        'PUT /api/users/:uid': 'Modifier utilisateur (admin)'
      },
      planning: {
        'POST /api/planning/duplicate': 'Dupliquer semaine',
        'GET /api/planning/templates': 'Templates de planning',
        'POST /api/planning/templates': 'Créer template',
        'GET /api/planning/overview': 'Vue d\'ensemble'
      }
    },
    authentication: {
      type: 'Firebase JWT',
      header: 'Authorization: Bearer <token>'
    }
  });
});

// Routes API
app.use('/api/events', eventsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/planning', planningRoutes);

// Route d'audit pour les admins
app.get('/api/audit', 
  require('./middleware/auth').authenticateToken,
  require('./middleware/permissions').requireAdminPermissions,
  strictLimiter,
  async (req, res) => {
    try {
      const { table_name, record_id, action, start_date, end_date, limit, offset } = req.query;
      
      const result = await auditService.getAuditLogs({
        table_name,
        record_id,
        action,
        start_date,
        end_date,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });
      
      res.json({
        success: true,
        data: result.logs,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Erreur récupération audit:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

// Route de statistiques d'audit
app.get('/api/audit/stats', 
  require('./middleware/auth').authenticateToken,
  require('./middleware/permissions').requireAdminPermissions,
  strictLimiter,
  async (req, res) => {
    try {
      const { start_date, end_date, table_name } = req.query;
      
      const stats = await auditService.getAuditStats({
        start_date,
        end_date,
        table_name
      });
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Erreur statistiques audit:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

// Export CSV des audits
app.get('/api/audit/export', 
  require('./middleware/auth').authenticateToken,
  require('./middleware/permissions').requireAdminPermissions,
  strictLimiter,
  async (req, res) => {
    try {
      const csv = await auditService.exportAuditLogs(req.query);
      
      if (!csv) {
        return res.status(404).json({
          error: 'Aucune donnée à exporter'
        });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      logger.error('Erreur export audit:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

// Middleware de gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint non trouvé',
    message: `La route ${req.method} ${req.originalUrl} n'existe pas`
  });
});

// Middleware global de gestion des erreurs
app.use((error, req, res, next) => {
  logger.error('Erreur serveur:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    user: req.user?.email
  });

  // Erreurs de validation Joi
  if (error.isJoi) {
    return res.status(400).json({
      error: 'Données invalides',
      message: 'Veuillez vérifier les données envoyées',
      details: error.details
    });
  }

  // Erreurs de base de données
  if (error.code) {
    switch (error.code) {
      case '23505': // Violation contrainte unique
        return res.status(409).json({
          error: 'Conflit de données',
          message: 'Cette ressource existe déjà'
        });
      case '23503': // Violation clé étrangère
        return res.status(400).json({
          error: 'Référence invalide',
          message: 'La ressource référencée n\'existe pas'
        });
      default:
        break;
    }
  }

  // Erreur générique
  const statusCode = error.status || error.statusCode || 500;
  res.status(statusCode).json({
    error: config.env === 'production' ? 'Erreur serveur' : error.message,
    ...(config.env !== 'production' && { stack: error.stack })
  });
});

// Démarrage du serveur
const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(`🚀 Serveur démarré sur le port ${PORT}`, {
    environment: config.env,
    timestamp: new Date().toISOString()
  });
});

// Gestion gracieuse de l'arrêt
const gracefulShutdown = (signal) => {
  logger.info(`🛑 Signal ${signal} reçu, arrêt en cours...`);
  
  server.close(() => {
    logger.info('🔚 Serveur arrêté proprement');
    process.exit(0);
  });
  
  // Force l'arrêt après 10 secondes
  setTimeout(() => {
    logger.error('❌ Arrêt forcé après timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Rejet de promesse non géré:', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Exception non capturée:', error);
  process.exit(1);
});

module.exports = app;