// src/routes/events.js
const express = require('express');
const router = express.Router();
const eventService = require('../services/eventService');
const { authenticateToken } = require('../middleware/auth');
const { requireWritePermissions, requireTeamAccess, requireEventOwnership, logSensitiveAction } = require('../middleware/permissions');
const { validate, validateBusinessHours, validateEventConflicts } = require('../middleware/validation');

/**
 * @route GET /api/events
 * @desc Récupérer les événements avec filtres
 * @access Private (tous les utilisateurs connectés)
 */
router.get('/', 
  authenticateToken,
  validate('queryParams', 'query'),
  async (req, res) => {
    try {
      const { team, start_date, end_date, limit, offset } = req.query;
      
      // Vérifier l'accès à l'équipe si spécifiée
      if (team && req.user.role !== 'admin') {
        const userTeams = req.user.teams || [];
        if (!userTeams.includes(team)) {
          return res.status(403).json({
            error: 'Accès refusé',
            message: `Vous n'avez pas accès à l'équipe '${team}'`
          });
        }
      }
      
      const result = await eventService.getEvents({
        team,
        start_date,
        end_date,
        limit,
        offset
      });
      
      res.json({
        success: true,
        data: result.events,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erreur récupération événements:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/events/:id
 * @desc Récupérer un événement par ID
 * @access Private
 */
router.get('/:id', 
  authenticateToken,
  async (req, res) => {
    try {
      const event = await eventService.getEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({
          error: 'Événement non trouvé'
        });
      }
      
      // Vérifier l'accès à l'équipe
      if (req.user.role !== 'admin') {
        const userTeams = req.user.teams || [];
        if (!userTeams.includes(event.team)) {
          return res.status(403).json({
            error: 'Accès refusé',
            message: 'Vous n\'avez pas accès à cet événement'
          });
        }
      }
      
      res.json({
        success: true,
        data: event
      });
    } catch (error) {
      console.error('Erreur récupération événement:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/events
 * @desc Créer un nouvel événement
 * @access Private (admin/manager seulement)
 */
router.post('/', 
  authenticateToken,
  requireWritePermissions,
  validate('event'),
  validateBusinessHours,
  validateEventConflicts,
  requireTeamAccess('team'),
  logSensitiveAction('CREATE_EVENT'),
  async (req, res) => {
    try {
      const event = await eventService.createEvent(req.body, req.user.uid);
      
      res.status(201).json({
        success: true,
        message: 'Événement créé avec succès',
        data: event
      });
    } catch (error) {
      console.error('Erreur création événement:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route PUT /api/events/:id
 * @desc Mettre à jour un événement
 * @access Private (admin/manager/propriétaire)
 */
router.put('/:id', 
  authenticateToken,
  requireEventOwnership,
  validate('event'),
  validateBusinessHours,
  validateEventConflicts,
  logSensitiveAction('UPDATE_EVENT'),
  async (req, res) => {
    try {
      const event = await eventService.updateEvent(req.params.id, req.body, req.user.uid);
      
      res.json({
        success: true,
        message: 'Événement mis à jour avec succès',
        data: event
      });
    } catch (error) {
      console.error('Erreur mise à jour événement:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route DELETE /api/events/:id
 * @desc Supprimer un événement
 * @access Private (admin/manager/propriétaire)
 */
router.delete('/:id', 
  authenticateToken,
  requireEventOwnership,
  logSensitiveAction('DELETE_EVENT'),
  async (req, res) => {
    try {
      const event = await eventService.deleteEvent(req.params.id, req.user.uid);
      
      res.json({
        success: true,
        message: 'Événement supprimé avec succès',
        data: event
      });
    } catch (error) {
      console.error('Erreur suppression événement:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/events/week/:date
 * @desc Récupérer les événements d'une semaine
 * @access Private
 */
router.get('/week/:date', 
  authenticateToken,
  async (req, res) => {
    try {
      const { date } = req.params;
      const { team } = req.query;
      
      if (!team) {
        return res.status(400).json({
          error: 'Paramètre manquant',
          message: 'Le paramètre "team" est requis'
        });
      }
      
      // Vérifier l'accès à l'équipe
      if (req.user.role !== 'admin') {
        const userTeams = req.user.teams || [];
        if (!userTeams.includes(team)) {
          return res.status(403).json({
            error: 'Accès refusé',
            message: `Vous n'avez pas accès à l'équipe '${team}'`
          });
        }
      }
      
      const weekStart = new Date(date);
      const events = await eventService.getWeekEvents(weekStart, team);
      
      res.json({
        success: true,
        data: events,
        meta: {
          week_start: weekStart,
          team: team
        }
      });
    } catch (error) {
      console.error('Erreur récupération semaine:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/events/conflicts/check
 * @desc Vérifier les conflits d'événements
 * @access Private
 */
router.post('/conflicts/check', 
  authenticateToken,
  async (req, res) => {
    try {
      const { start_time, end_time, team, exclude_event_id } = req.body;
      
      if (!start_time || !end_time || !team) {
        return res.status(400).json({
          error: 'Paramètres manquants',
          message: 'start_time, end_time et team sont requis'
        });
      }
      
      const conflicts = await eventService.checkEventConflicts(
        start_time,
        end_time,
        team,
        exclude_event_id
      );
      
      res.json({
        success: true,
        data: {
          has_conflicts: conflicts.length > 0,
          conflicts: conflicts.map(event => ({
            id: event.id,
            title: event.title,
            start: event.start_time,
            end: event.end_time
          }))
        }
      });
    } catch (error) {
      console.error('Erreur vérification conflits:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/events/stats
 * @desc Statistiques des événements
 * @access Private
 */
router.get('/stats/summary', 
  authenticateToken,
  async (req, res) => {
    try {
      const { team, start_date, end_date } = req.query;
      
      // Filtrer par équipes accessibles si pas admin
      let filters = { start_date, end_date };
      
      if (req.user.role !== 'admin') {
        if (team) {
          const userTeams = req.user.teams || [];
          if (!userTeams.includes(team)) {
            return res.status(403).json({
              error: 'Accès refusé',
              message: `Vous n'avez pas accès à l'équipe '${team}'`
            });
          }
          filters.team = team;
        } else {
          // Limiter aux équipes de l'utilisateur
          filters.teams = req.user.teams;
        }
      } else {
        if (team) filters.team = team;
      }
      
      const stats = await eventService.getEventStats(filters);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erreur statistiques événements:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

module.exports = router;