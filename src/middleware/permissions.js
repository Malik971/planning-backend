// src/middleware/permissions.js

/**
 * Vérifie si l'utilisateur a le rôle requis
 * @param {Array} allowedRoles - Rôles autorisés
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentification requise',
        message: 'Vous devez être connecté pour accéder à cette ressource'
      });
    }

    const userRole = req.user.role;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Permissions insuffisantes',
        message: `Rôle requis: ${allowedRoles.join(' ou ')}. Votre rôle: ${userRole}`
      });
    }

    next();
  };
}

/**
 * Vérifie les permissions d'écriture (admin ou manager)
 */
const requireWritePermissions = requireRole(['admin', 'manager']);

/**
 * Vérifie les permissions d'administration (admin seulement)
 */
const requireAdminPermissions = requireRole(['admin']);

/**
 * Vérifie si l'utilisateur peut accéder à une équipe spécifique
 * @param {string} teamParam - Nom du paramètre contenant l'équipe (ex: 'team')
 */
function requireTeamAccess(teamParam = 'team') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentification requise'
      });
    }

    const requestedTeam = req.params[teamParam] || req.body[teamParam] || req.query[teamParam];
    
    if (!requestedTeam) {
      return res.status(400).json({
        error: 'Équipe non spécifiée',
        message: `Le paramètre '${teamParam}' est requis`
      });
    }

    const validTeams = ['bar', 'animation', 'reception'];
    if (!validTeams.includes(requestedTeam)) {
      return res.status(400).json({
        error: 'Équipe invalide',
        message: `Équipes valides: ${validTeams.join(', ')}`
      });
    }

    // Les admins ont accès à toutes les équipes
    if (req.user.role === 'admin') {
      return next();
    }

    // Vérifier si l'utilisateur a accès à cette équipe
    const userTeams = req.user.teams || [];
    if (!userTeams.includes(requestedTeam)) {
      return res.status(403).json({
        error: 'Accès à l\'équipe refusé',
        message: `Vous n'avez pas accès à l'équipe '${requestedTeam}'`
      });
    }

    next();
  };
}

/**
 * Vérifie si l'utilisateur peut modifier un événement spécifique
 */
async function requireEventOwnership(req, res, next) {
  const eventService = require('../services/eventService');
  
  try {
    const eventId = req.params.id;
    const event = await eventService.getEventById(eventId);
    
    if (!event) {
      return res.status(404).json({
        error: 'Événement non trouvé'
      });
    }

    // Les admins peuvent tout modifier
    if (req.user.role === 'admin') {
      req.event = event;
      return next();
    }

    // Les managers peuvent modifier les événements de leurs équipes
    if (req.user.role === 'manager') {
      const userTeams = req.user.teams || [];
      if (userTeams.includes(event.team)) {
        req.event = event;
        return next();
      }
    }

    // Les utilisateurs ne peuvent modifier que leurs propres événements
    if (event.created_by === req.user.uid) {
      req.event = event;
      return next();
    }

    return res.status(403).json({
      error: 'Permissions insuffisantes',
      message: 'Vous ne pouvez pas modifier cet événement'
    });

  } catch (error) {
    console.error('Erreur vérification propriété événement:', error);
    return res.status(500).json({
      error: 'Erreur serveur lors de la vérification des permissions'
    });
  }
}

/**
 * Middleware de logging des actions sensibles
 */
function logSensitiveAction(action) {
  return (req, res, next) => {
    console.log(`🔒 Action sensible: ${action}`, {
      user: req.user?.email,
      role: req.user?.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    next();
  };
}

module.exports = {
  requireRole,
  requireWritePermissions,
  requireAdminPermissions,
  requireTeamAccess,
  requireEventOwnership,
  logSensitiveAction
};