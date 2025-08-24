// src/middleware/validation.js
const Joi = require('joi');

/**
 * Schémas de validation Joi
 */
const schemas = {
  // Validation d'événement
  event: Joi.object({
    title: Joi.string().min(1).max(200).required()
      .messages({
        'string.empty': 'Le titre est requis',
        'string.max': 'Le titre ne peut pas dépasser 200 caractères'
      }),
    
    start_time: Joi.date().iso().required()
      .messages({
        'date.base': 'La date de début doit être une date valide',
        'any.required': 'La date de début est requise'
      }),
    
    end_time: Joi.date().iso().min(Joi.ref('start_time')).required()
      .messages({
        'date.base': 'La date de fin doit être une date valide',
        'date.min': 'La date de fin doit être après la date de début',
        'any.required': 'La date de fin est requise'
      }),
    
    team: Joi.string().valid('bar', 'animation', 'reception').required()
      .messages({
        'any.only': 'L\'équipe doit être: bar, animation ou reception',
        'any.required': 'L\'équipe est requise'
      }),
    
    animator: Joi.string().max(100).allow(null, '')
      .messages({
        'string.max': 'Le nom de l\'animateur ne peut pas dépasser 100 caractères'
      }),
    
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null, '')
      .messages({
        'string.pattern.base': 'La couleur doit être au format hexadécimal (#RRGGBB)'
      }),
    
    description: Joi.string().max(1000).allow(null, '')
      .messages({
        'string.max': 'La description ne peut pas dépasser 1000 caractères'
      }),
    
    metadata: Joi.object().default({})
  }),

  // Validation d'utilisateur
  user: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'L\'email doit être valide',
        'any.required': 'L\'email est requis'
      }),
    
    display_name: Joi.string().min(2).max(100).allow(null, '')
      .messages({
        'string.min': 'Le nom d\'affichage doit faire au moins 2 caractères',
        'string.max': 'Le nom d\'affichage ne peut pas dépasser 100 caractères'
      }),
    
    role: Joi.string().valid('admin', 'manager', 'staff').required()
      .messages({
        'any.only': 'Le rôle doit être: admin, manager ou staff',
        'any.required': 'Le rôle est requis'
      }),
    
    teams: Joi.array().items(
      Joi.string().valid('bar', 'animation', 'reception')
    ).default([])
      .messages({
        'array.includes': 'Les équipes doivent être: bar, animation ou reception'
      }),
    
    active: Joi.boolean().default(true)
  }),

  // Validation de duplication de planning
  planningDuplication: Joi.object({
    source_week: Joi.date().iso().required()
      .messages({
        'date.base': 'La semaine source doit être une date valide',
        'any.required': 'La semaine source est requise'
      }),
    
    target_week: Joi.date().iso().required()
      .messages({
        'date.base': 'La semaine cible doit être une date valide',
        'any.required': 'La semaine cible est requise'
      }),
    
    team: Joi.string().valid('bar', 'animation', 'reception').required()
      .messages({
        'any.only': 'L\'équipe doit être: bar, animation ou reception',
        'any.required': 'L\'équipe est requise'
      }),
    
    overwrite: Joi.boolean().default(false)
  }),

  // Validation des paramètres de requête
  queryParams: Joi.object({
    team: Joi.string().valid('bar', 'animation', 'reception')
      .messages({
        'any.only': 'L\'équipe doit être: bar, animation ou reception'
      }),
    
    start_date: Joi.date().iso()
      .messages({
        'date.base': 'La date de début doit être une date valide'
      }),
    
    end_date: Joi.date().iso().min(Joi.ref('start_date'))
      .messages({
        'date.base': 'La date de fin doit être une date valide',
        'date.min': 'La date de fin doit être après la date de début'
      }),
    
    limit: Joi.number().integer().min(1).max(100).default(50)
      .messages({
        'number.base': 'La limite doit être un nombre',
        'number.integer': 'La limite doit être un nombre entier',
        'number.min': 'La limite doit être au moins 1',
        'number.max': 'La limite ne peut pas dépasser 100'
      }),
    
    offset: Joi.number().integer().min(0).default(0)
      .messages({
        'number.base': 'L\'offset doit être un nombre',
        'number.integer': 'L\'offset doit être un nombre entier',
        'number.min': 'L\'offset doit être positif ou nul'
      })
  })
};

/**
 * Middleware de validation générique
 * @param {string} schemaName - Nom du schéma à utiliser
 * @param {string} source - Source des données ('body', 'query', 'params')
 */
function validate(schemaName, source = 'body') {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      return res.status(500).json({
        error: 'Erreur de configuration',
        message: `Schéma de validation '${schemaName}' non trouvé`
      });
    }

    const dataToValidate = req[source];
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Données invalides',
        message: 'Veuillez corriger les erreurs suivantes',
        details: validationErrors
      });
    }

    // Remplacer les données originales par les données validées et nettoyées
    req[source] = value;
    next();
  };
}

/**
 * Validation personnalisée pour les heures d'ouverture
 */
function validateBusinessHours(req, res, next) {
  const { start_time, end_time } = req.body;
  
  if (!start_time || !end_time) {
    return next();
  }

  const startHour = new Date(start_time).getHours();
  const endHour = new Date(end_time).getHours();
  
  // Heures d'ouverture : 10h à 23h
  if (startHour < 10 || endHour > 23) {
    return res.status(400).json({
      error: 'Horaires invalides',
      message: 'Les événements doivent être entre 10h et 23h',
      details: [
        {
          field: 'horaires',
          message: 'Horaires autorisés: 10h00 - 23h00'
        }
      ]
    });
  }

  next();
}

/**
 * Validation des conflits d'événements
 */
async function validateEventConflicts(req, res, next) {
  const eventService = require('../services/eventService');
  
  try {
    const { start_time, end_time, team } = req.body;
    const eventId = req.params.id; // Pour les mises à jour
    
    const conflicts = await eventService.checkEventConflicts(
      start_time,
      end_time,
      team,
      eventId
    );
    
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: 'Conflit d\'événements',
        message: 'Un événement existe déjà sur cette plage horaire',
        conflicts: conflicts.map(event => ({
          id: event.id,
          title: event.title,
          start: event.start_time,
          end: event.end_time
        }))
      });
    }
    
    next();
  } catch (error) {
    console.error('Erreur validation conflits:', error);
    return res.status(500).json({
      error: 'Erreur serveur lors de la validation des conflits'
    });
  }
}

module.exports = {
  validate,
  validateBusinessHours,
  validateEventConflicts,
  schemas
};