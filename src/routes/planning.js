// src/routes/planning.js
const express = require('express');
const router = express.Router();
const eventService = require('../services/eventService');
const { authenticateToken } = require('../middleware/auth');
const { requireWritePermissions, requireTeamAccess, logSensitiveAction } = require('../middleware/permissions');
const { validate } = require('../middleware/validation');

/**
 * @route POST /api/planning/duplicate
 * @desc Dupliquer les événements d'une semaine vers une autre
 * @access Private (admin/manager seulement)
 */
router.post('/duplicate', 
  authenticateToken,
  requireWritePermissions,
  validate('planningDuplication'),
  requireTeamAccess('team'),
  logSensitiveAction('DUPLICATE_PLANNING'),
  async (req, res) => {
    try {
      const { source_week, target_week, team, overwrite } = req.body;
      
      const duplicatedEvents = await eventService.duplicateWeekEvents(
        source_week,
        target_week,
        team,
        req.user.uid,
        overwrite
      );
      
      res.json({
        success: true,
        message: `Planning dupliqué avec succès: ${duplicatedEvents.length} événements`,
        data: {
          duplicated_count: duplicatedEvents.length,
          events: duplicatedEvents,
          source_week,
          target_week,
          team,
          overwrite
        }
      });
    } catch (error) {
      console.error('Erreur duplication planning:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/planning/templates
 * @desc Récupérer les templates de planning
 * @access Private
 */
router.get('/templates', 
  authenticateToken,
  async (req, res) => {
    try {
      const { team } = req.query;
      
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
      
      let query = db('planning_templates')
        .where('active', true)
        .orderBy('created_at', 'desc');
      
      if (team) {
        query = query.where('team', team);
      } else if (req.user.role !== 'admin') {
        query = query.whereIn('team', req.user.teams || []);
      }
      
      const templates = await query;
      
      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      console.error('Erreur récupération templates:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/planning/templates
 * @desc Créer un template de planning
 * @access Private (admin/manager seulement)
 */
router.post('/templates', 
  authenticateToken,
  requireWritePermissions,
  async (req, res) => {
    try {
      const { name, description, team, template_events } = req.body;
      
      if (!name || !team || !template_events) {
        return res.status(400).json({
          error: 'Paramètres manquants',
          message: 'name, team et template_events sont requis'
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
      
      const template = {
        name,
        description,
        team,
        template_events: JSON.stringify(template_events),
        created_by: req.user.uid,
        active: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const [newTemplate] = await db('planning_templates')
        .insert(template)
        .returning('*');
      
      res.status(201).json({
        success: true,
        message: 'Template créé avec succès',
        data: newTemplate
      });
    } catch (error) {
      console.error('Erreur création template:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/planning/templates/:id/apply
 * @desc Appliquer un template à une semaine
 * @access Private (admin/manager seulement)
 */
router.post('/templates/:id/apply', 
  authenticateToken,
  requireWritePermissions,
  logSensitiveAction('APPLY_TEMPLATE'),
  async (req, res) => {
    try {
      const { target_week, overwrite } = req.body;
      
      if (!target_week) {
        return res.status(400).json({
          error: 'Paramètre manquant',
          message: 'target_week est requis'
        });
      }
      
      const template = await db('planning_templates')
        .where('id', req.params.id)
        .where('active', true)
        .first();
      
      if (!template) {
        return res.status(404).json({
          error: 'Template non trouvé'
        });
      }
      
      // Vérifier l'accès à l'équipe
      if (req.user.role !== 'admin') {
        const userTeams = req.user.teams || [];
        if (!userTeams.includes(template.team)) {
          return res.status(403).json({
            error: 'Accès refusé',
            message: 'Vous n\'avez pas accès à ce template'
          });
        }
      }
      
      const templateEvents = JSON.parse(template.template_events);
      const createdEvents = [];
      
      // Supprimer les événements existants si overwrite
      if (overwrite) {
        const weekStart = new Date(target_week);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        await db('events')
          .where('team', template.team)
          .whereBetween('start_time', [weekStart, weekEnd])
          .del();
      }
      
      // Créer les événements du template
      for (const templateEvent of templateEvents) {
        const weekStart = new Date(target_week);
        const eventStart = new Date(weekStart);
        const eventEnd = new Date(weekStart);
        
        // Appliquer l'heure du template
        eventStart.setHours(templateEvent.start_hour, templateEvent.start_minute || 0, 0, 0);
        eventEnd.setHours(templateEvent.end_hour, templateEvent.end_minute || 0, 0, 0);
        
        // Ajuster le jour de la semaine
        if (templateEvent.day_offset) {
          eventStart.setDate(eventStart.getDate() + templateEvent.day_offset);
          eventEnd.setDate(eventEnd.getDate() + templateEvent.day_offset);
        }
        
        const event = {
          title: templateEvent.title,
          start_time: eventStart,
          end_time: eventEnd,
          team: template.team,
          animator: templateEvent.animator,
          color: templateEvent.color,
          description: templateEvent.description,
          metadata: templateEvent.metadata || {},
          created_by: req.user.uid,
          created_at: new Date(),
          updated_at: new Date()
        };
        
        const [createdEvent] = await db('events')
          .insert(event)
          .returning('*');
        
        createdEvents.push(createdEvent);
      }
      
      res.json({
        success: true,
        message: `Template appliqué avec succès: ${createdEvents.length} événements créés`,
        data: {
          template_name: template.name,
          created_count: createdEvents.length,
          events: createdEvents,
          target_week,
          overwrite
        }
      });
    } catch (error) {
      console.error('Erreur application template:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/planning/overview
 * @desc Vue d'ensemble du planning (toutes équipes)
 * @access Private
 */
router.get('/overview', 
  authenticateToken,
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query;
      
      if (!start_date || !end_date) {
        return res.status(400).json({
          error: 'Paramètres manquants',
          message: 'start_date et end_date sont requis'
        });
      }
      
      const teams = req.user.role === 'admin' 
        ? ['bar', 'animation', 'reception']
        : req.user.teams || [];
      
      const overview = {};
      
      for (const team of teams) {
        const events = await eventService.getEvents({
          team,
          start_date,
          end_date,
          limit: 1000 // Limite élevée pour l'overview
        });
        
        overview[team] = {
          events: events.events,
          total_count: events.pagination.total,
          total_hours: events.events.reduce((sum, event) => {
            const duration = (new Date(event.end_time) - new Date(event.start_time)) / (1000 * 60 * 60);
            return sum + duration;
          }, 0)
        };
      }
      
      res.json({
        success: true,
        data: overview,
        meta: {
          period: { start_date, end_date },
          teams: teams
        }
      });
    } catch (error) {
      console.error('Erreur vue d\'ensemble:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/planning/bulk-create
 * @desc Création en masse d'événements
 * @access Private (admin/manager seulement)
 */
router.post('/bulk-create', 
  authenticateToken,
  requireWritePermissions,
  logSensitiveAction('BULK_CREATE_EVENTS'),
  async (req, res) => {
    try {
      const { events } = req.body;
      
      if (!events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          error: 'Données invalides',
          message: 'Un tableau d\'événements est requis'
        });
      }
      
      if (events.length > 50) {
        return res.status(400).json({
          error: 'Trop d\'événements',
          message: 'Maximum 50 événements par création en masse'
        });
      }
      
      const createdEvents = [];
      const errors = [];
      
      for (let i = 0; i < events.length; i++) {
        try {
          const eventData = events[i];
          
          // Vérifier l'accès à l'équipe
          if (req.user.role !== 'admin') {
            const userTeams = req.user.teams || [];
            if (!userTeams.includes(eventData.team)) {
              errors.push({
                index: i,
                error: `Pas d'accès à l'équipe '${eventData.team}'`
              });
              continue;
            }
          }
          
          const createdEvent = await eventService.createEvent(eventData, req.user.uid);
          createdEvents.push(createdEvent);
        } catch (error) {
          errors.push({
            index: i,
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        message: `Création en masse terminée: ${createdEvents.length} événements créés`,
        data: {
          created_count: createdEvents.length,
          error_count: errors.length,
          created_events: createdEvents,
          errors: errors
        }
      });
    } catch (error) {
      console.error('Erreur création en masse:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

module.exports = router;