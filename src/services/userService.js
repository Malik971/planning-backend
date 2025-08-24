// src/services/userService.js
const db = require('../config/database');
const { setUserRole } = require('../config/firebase');
const auditService = require('./auditService');

class UserService {
  /**
   * Créer un nouvel utilisateur
   */
  async createUser(userData) {
    const trx = await db.transaction();
    
    try {
      const user = {
        ...userData,
        created_at: new Date(),
        updated_at: new Date()
      };

      // Insérer en base
      const [newUser] = await trx('users')
        .insert(user)
        .returning('*');

      // Définir le rôle dans Firebase
      await setUserRole(newUser.uid, newUser.role);

      // Audit log
      await auditService.logAction(trx, {
        table_name: 'users',
        record_id: newUser.uid,
        action: 'CREATE',
        user_uid: newUser.uid, // Auto-création ou admin
        new_values: newUser
      });

      await trx.commit();
      return newUser;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Récupérer un utilisateur par UID
   */
  async getUserByUid(uid) {
    const user = await db('users')
      .where('uid', uid)
      .first();
    
    return user;
  }

  /**
   * Récupérer un utilisateur par email
   */
  async getUserByEmail(email) {
    const user = await db('users')
      .where('email', email)
      .first();
    
    return user;
  }

  /**
   * Récupérer tous les utilisateurs avec filtres
   */
  async getUsers(filters = {}) {
    const {
      role,
      team,
      active,
      limit = 50,
      offset = 0
    } = filters;

    let query = db('users')
      .select('uid', 'email', 'display_name', 'role', 'teams', 'active', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc');

    // Filtres
    if (role) {
      query = query.where('role', role);
    }

    if (team) {
      query = query.whereRaw('JSON_EXTRACT(teams, "$") LIKE ?', [`%"${team}"%`]);
    }

    if (typeof active === 'boolean') {
      query = query.where('active', active);
    }

    // Pagination
    query = query.limit(limit).offset(offset);

    const users = await query;
    
    // Compter le total
    let countQuery = db('users').count('* as total');
    
    if (role) countQuery = countQuery.where('role', role);
    if (team) countQuery = countQuery.whereRaw('JSON_EXTRACT(teams, "$") LIKE ?', [`%"${team}"%`]);
    if (typeof active === 'boolean') countQuery = countQuery.where('active', active);
    
    const [{ total }] = await countQuery;

    return {
      users,
      pagination: {
        total: parseInt(total),
        limit,
        offset,
        hasNext: (offset + limit) < parseInt(total)
      }
    };
  }

  /**
   * Mettre à jour un utilisateur
   */
  async updateUser(uid, updateData, updatedBy) {
    const trx = await db.transaction();
    
    try {
      // Récupérer l'ancien utilisateur pour l'audit
      const oldUser = await trx('users')
        .where('uid', uid)
        .first();

      if (!oldUser) {
        throw new Error('Utilisateur non trouvé');
      }

      const updatedUser = {
        ...updateData,
        updated_at: new Date()
      };

      const [user] = await trx('users')
        .where('uid', uid)
        .update(updatedUser)
        .returning('*');

      // Mettre à jour le rôle Firebase si modifié
      if (updateData.role && updateData.role !== oldUser.role) {
        await setUserRole(uid, updateData.role);
      }

      // Audit log
      await auditService.logAction(trx, {
        table_name: 'users',
        record_id: uid,
        action: 'UPDATE',
        user_uid: updatedBy,
        old_values: oldUser,
        new_values: user
      });

      await trx.commit();
      return user;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Désactiver un utilisateur (soft delete)
   */
  async deactivateUser(uid, deactivatedBy) {
    return this.updateUser(uid, { active: false }, deactivatedBy);
  }

  /**
   * Réactiver un utilisateur
   */
  async reactivateUser(uid, reactivatedBy) {
    return this.updateUser(uid, { active: true }, reactivatedBy);
  }

  /**
   * Supprimer définitivement un utilisateur
   */
  async deleteUser(uid, deletedBy) {
    const trx = await db.transaction();
    
    try {
      // Récupérer l'utilisateur avant suppression
      const user = await trx('users')
        .where('uid', uid)
        .first();

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Vérifier qu'il n'y a pas d'événements liés
      const eventCount = await trx('events')
        .where('created_by', uid)
        .count('* as count')
        .first();

      if (parseInt(eventCount.count) > 0) {
        throw new Error('Impossible de supprimer un utilisateur ayant créé des événements');
      }

      await trx('users')
        .where('uid', uid)
        .del();

      // Audit log
      await auditService.logAction(trx, {
        table_name: 'users',
        record_id: uid,
        action: 'DELETE',
        user_uid: deletedBy,
        old_values: user
      });

      await trx.commit();
      return user;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Assigner des équipes à un utilisateur
   */
  async assignTeams(uid, teams, assignedBy) {
    const validTeams = ['bar', 'animation', 'reception'];
    const invalidTeams = teams.filter(team => !validTeams.includes(team));
    
    if (invalidTeams.length > 0) {
      throw new Error(`Équipes invalides: ${invalidTeams.join(', ')}`);
    }

    return this.updateUser(uid, { teams }, assignedBy);
  }

  /**
   * Récupérer les utilisateurs d'une équipe
   */
  async getTeamMembers(team) {
    const validTeams = ['bar', 'animation', 'reception'];
    
    if (!validTeams.includes(team)) {
      throw new Error('Équipe invalide');
    }

    const users = await db('users')
      .select('uid', 'email', 'display_name', 'role')
      .where('active', true)
      .whereRaw('JSON_EXTRACT(teams, "$") LIKE ?', [`%"${team}"%`])
      .orderBy('display_name', 'asc');

    return users;
  }

  /**
   * Statistiques des utilisateurs
   */
  async getUserStats() {
    const roleStats = await db('users')
      .select('role')
      .count('* as count')
      .where('active', true)
      .groupBy('role');

    const teamStats = await db('users')
      .select(
        db.raw(`
          CASE 
            WHEN JSON_EXTRACT(teams, '$') LIKE '%"bar"%' THEN 'bar'
            WHEN JSON_EXTRACT(teams, '$') LIKE '%"animation"%' THEN 'animation'  
            WHEN JSON_EXTRACT(teams, '$') LIKE '%"reception"%' THEN 'reception'
          END as team
        `)
      )
      .count('* as count')
      .where('active', true)
      .groupBy('team')
      .havingNotNull('team');

    const totalUsers = await db('users')
      .count('* as total')
      .where('active', true)
      .first();

    const recentUsers = await db('users')
      .count('* as count')
      .where('active', true)
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 30 DAY'))
      .first();

    return {
      total: parseInt(totalUsers.total),
      recentRegistrations: parseInt(recentUsers.count),
      byRole: roleStats.map(stat => ({
        role: stat.role,
        count: parseInt(stat.count)
      })),
      byTeam: teamStats.map(stat => ({
        team: stat.team,
        count: parseInt(stat.count)
      }))
    };
  }

  /**
   * Créer ou mettre à jour un utilisateur depuis Firebase Auth
   */
  async syncUserFromFirebase(firebaseUser) {
    const existingUser = await this.getUserByUid(firebaseUser.uid);
    
    const userData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      display_name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      role: 'staff', // Rôle par défaut
      teams: [],
      active: true
    };

    if (existingUser) {
      // Mettre à jour seulement l'email et le nom si changés
      const updates = {};
      if (existingUser.email !== userData.email) updates.email = userData.email;
      if (existingUser.display_name !== userData.display_name) updates.display_name = userData.display_name;
      
      if (Object.keys(updates).length > 0) {
        return this.updateUser(firebaseUser.uid, updates, firebaseUser.uid);
      }
      
      return existingUser;
    } else {
      // Créer un nouvel utilisateur
      return this.createUser(userData);
    }
  }
}

module.exports = new UserService();