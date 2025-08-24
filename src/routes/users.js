// src/routes/users.js
const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const auditService = require('../services/auditService');
const { authenticateToken } = require('../middleware/auth');
const { requireAdminPermissions, requireWritePermissions, logSensitiveAction } = require('../middleware/permissions');
const { validate } = require('../middleware/validation');

/**
 * @route GET /api/users/profile
 * @desc Récupérer son propre profil
 * @access Private
 */
router.get('/profile', 
  authenticateToken,
  async (req, res) => {
    try {
      const user = await userService.getUserByUid(req.user.uid);
      
      if (!user) {
        return res.status(404).json({
          error: 'Profil non trouvé'
        });
      }
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Erreur récupération profil:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route PUT /api/users/profile
 * @desc Mettre à jour son propre profil
 * @access Private
 */
router.put('/profile', 
  authenticateToken,
  async (req, res) => {
    try {
      const { display_name } = req.body;
      
      // Seul le nom d'affichage peut être modifié par l'utilisateur
      const allowedUpdates = {};
      if (display_name !== undefined) {
        allowedUpdates.display_name = display_name;
      }
      
      if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({
          error: 'Aucune modification valide',
          message: 'Seul le nom d\'affichage peut être modifié'
        });
      }
      
      const updatedUser = await userService.updateUser(req.user.uid, allowedUpdates, req.user.uid);
      
      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        data: updatedUser
      });
    } catch (error) {
      console.error('Erreur mise à jour profil:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/users
 * @desc Récupérer la liste des utilisateurs
 * @access Private (admin/manager)
 */
router.get('/', 
  authenticateToken,
  requireWritePermissions,
  async (req, res) => {
    try {
      const { role, team, active, limit, offset } = req.query;
      
      const result = await userService.getUsers({
        role,
        team,
        active: active !== undefined ? active === 'true' : undefined,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });
      
      res.json({
        success: true,
        data: result.users,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erreur récupération utilisateurs:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/users/:uid
 * @desc Récupérer un utilisateur par UID
 * @access Private (admin/manager)
 */
router.get('/:uid', 
  authenticateToken,
  requireWritePermissions,
  async (req, res) => {
    try {
      const user = await userService.getUserByUid(req.params.uid);
      
      if (!user) {
        return res.status(404).json({
          error: 'Utilisateur non trouvé'
        });
      }
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Erreur récupération utilisateur:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/users
 * @desc Créer un nouvel utilisateur
 * @access Private (admin seulement)
 */
router.post('/', 
  authenticateToken,
  requireAdminPermissions,
  validate('user'),
  logSensitiveAction('CREATE_USER'),
  async (req, res) => {
    try {
      const user = await userService.createUser(req.body);
      
      res.status(201).json({
        success: true,
        message: 'Utilisateur créé avec succès',
        data: user
      });
    } catch (error) {
      console.error('Erreur création utilisateur:', error);
      
      if (error.code === '23505') { // Contrainte unique PostgreSQL
        return res.status(409).json({
          error: 'Utilisateur existant',
          message: 'Un utilisateur avec cet email existe déjà'
        });
      }
      
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route PUT /api/users/:uid
 * @desc Mettre à jour un utilisateur
 * @access Private (admin seulement)
 */
router.put('/:uid', 
  authenticateToken,
  requireAdminPermissions,
  validate('user'),
  logSensitiveAction('UPDATE_USER'),
  async (req, res) => {
    try {
      const user = await userService.updateUser(req.params.uid, req.body, req.user.uid);
      
      res.json({
        success: true,
        message: 'Utilisateur mis à jour avec succès',
        data: user
      });
    } catch (error) {
      console.error('Erreur mise à jour utilisateur:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route DELETE /api/users/:uid
 * @desc Supprimer définitivement un utilisateur
 * @access Private (admin seulement)
 */
router.delete('/:uid', 
  authenticateToken,
  requireAdminPermissions,
  logSensitiveAction('DELETE_USER'),
  async (req, res) => {
    try {
      // Empêcher l'auto-suppression
      if (req.params.uid === req.user.uid) {
        return res.status(400).json({
          error: 'Action interdite',
          message: 'Vous ne pouvez pas supprimer votre propre compte'
        });
      }
      
      const user = await userService.deleteUser(req.params.uid, req.user.uid);
      
      res.json({
        success: true,
        message: 'Utilisateur supprimé avec succès',
        data: user
      });
    } catch (error) {
      console.error('Erreur suppression utilisateur:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route PUT /api/users/:uid/deactivate
 * @desc Désactiver un utilisateur
 * @access Private (admin seulement)
 */
router.put('/:uid/deactivate', 
  authenticateToken,
  requireAdminPermissions,
  logSensitiveAction('DEACTIVATE_USER'),
  async (req, res) => {
    try {
      // Empêcher l'auto-désactivation
      if (req.params.uid === req.user.uid) {
        return res.status(400).json({
          error: 'Action interdite',
          message: 'Vous ne pouvez pas désactiver votre propre compte'
        });
      }
      
      const user = await userService.deactivateUser(req.params.uid, req.user.uid);
      
      res.json({
        success: true,
        message: 'Utilisateur désactivé avec succès',
        data: user
      });
    } catch (error) {
      console.error('Erreur désactivation utilisateur:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route PUT /api/users/:uid/reactivate
 * @desc Réactiver un utilisateur
 * @access Private (admin seulement)
 */
router.put('/:uid/reactivate', 
  authenticateToken,
  requireAdminPermissions,
  logSensitiveAction('REACTIVATE_USER'),
  async (req, res) => {
    try {
      const user = await userService.reactivateUser(req.params.uid, req.user.uid);
      
      res.json({
        success: true,
        message: 'Utilisateur réactivé avec succès',
        data: user
      });
    } catch (error) {
      console.error('Erreur réactivation utilisateur:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route PUT /api/users/:uid/teams
 * @desc Assigner des équipes à un utilisateur
 * @access Private (admin seulement)
 */
router.put('/:uid/teams', 
  authenticateToken,
  requireAdminPermissions,
  logSensitiveAction('ASSIGN_TEAMS'),
  async (req, res) => {
    try {
      const { teams } = req.body;
      
      if (!Array.isArray(teams)) {
        return res.status(400).json({
          error: 'Format invalide',
          message: 'teams doit être un tableau'
        });
      }
      
      const user = await userService.assignTeams(req.params.uid, teams, req.user.uid);
      
      res.json({
        success: true,
        message: 'Équipes assignées avec succès',
        data: user
      });
    } catch (error) {
      console.error('Erreur assignation équipes:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/users/teams/:team
 * @desc Récupérer les membres d'une équipe
 * @access Private
 */
router.get('/teams/:team', 
  authenticateToken,
  async (req, res) => {
    try {
      const { team } = req.params;
      
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
      
      const members = await userService.getTeamMembers(team);
      
      res.json({
        success: true,
        data: members,
        meta: {
          team: team,
          count: members.length
        }
      });
    } catch (error) {
      console.error('Erreur récupération membres équipe:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/users/stats
 * @desc Statistiques des utilisateurs
 * @access Private (admin/manager)
 */
router.get('/stats/summary', 
  authenticateToken,
  requireWritePermissions,
  async (req, res) => {
    try {
      const stats = await userService.getUserStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erreur statistiques utilisateurs:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/users/:uid/audit
 * @desc Historique d'audit d'un utilisateur
 * @access Private (admin seulement)
 */
router.get('/:uid/audit', 
  authenticateToken,
  requireAdminPermissions,
  async (req, res) => {
    try {
      const { limit, offset } = req.query;
      
      const result = await auditService.getAuditLogs({
        user_uid: req.params.uid,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });
      
      res.json({
        success: true,
        data: result.logs,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erreur historique audit utilisateur:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/users/sync
 * @desc Synchroniser l'utilisateur depuis Firebase Auth
 * @access Private
 */
router.post('/sync', 
  authenticateToken,
  async (req, res) => {
    try {
      const firebaseUser = {
        uid: req.user.uid,
        email: req.user.email,
        displayName: req.body.displayName
      };
      
      const user = await userService.syncUserFromFirebase(firebaseUser);
      
      res.json({
        success: true,
        message: 'Utilisateur synchronisé avec succès',
        data: user
      });
    } catch (error) {
      console.error('Erreur synchronisation utilisateur:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        message: error.message
      });
    }
  }
);

module.exports = router;