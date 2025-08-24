// src/services/auditService.js
const db = require('../config/database');

class AuditService {
  /**
   * Enregistrer une action dans l'audit log
   */
  async logAction(trx, auditData) {
    const {
      table_name,
      record_id,
      action,
      user_uid,
      old_values = null,
      new_values = null,
      ip_address = null,
      user_agent = null
    } = auditData;

    const logEntry = {
      table_name,
      record_id,
      action,
      user_uid,
      old_values: old_values ? JSON.stringify(old_values) : null,
      new_values: new_values ? JSON.stringify(new_values) : null,
      ip_address,
      user_agent,
      created_at: new Date()
    };

    await trx('audit_logs').insert(logEntry);
  }

  /**
   * Récupérer l'historique d'audit avec filtres
   */
  async getAuditLogs(filters = {}) {
    const {
      table_name,
      record_id,
      user_uid,
      action,
      start_date,
      end_date,
      limit = 50,
      offset = 0
    } = filters;

    let query = db('audit_logs')
      .select(
        'audit_logs.*',
        'users.email as user_email',
        'users.display_name as user_name'
      )
      .leftJoin('users', 'audit_logs.user_uid', 'users.uid')
      .orderBy('created_at', 'desc');

    // Filtres
    if (table_name) {
      query = query.where('table_name', table_name);
    }

    if (record_id) {
      query = query.where('record_id', record_id);
    }

    if (user_uid) {
      query = query.where('user_uid', user_uid);
    }

    if (action) {
      query = query.where('action', action);
    }

    if (start_date) {
      query = query.where('audit_logs.created_at', '>=', start_date);
    }

    if (end_date) {
      query = query.where('audit_logs.created_at', '<=', end_date);
    }

    // Pagination
    query = query.limit(limit).offset(offset);

    const logs = await query;
    
    // Compter le total
    let countQuery = db('audit_logs').count('* as total');
    
    if (table_name) countQuery = countQuery.where('table_name', table_name);
    if (record_id) countQuery = countQuery.where('record_id', record_id);
    if (user_uid) countQuery = countQuery.where('user_uid', user_uid);
    if (action) countQuery = countQuery.where('action', action);
    if (start_date) countQuery = countQuery.where('created_at', '>=', start_date);
    if (end_date) countQuery = countQuery.where('created_at', '<=', end_date);
    
    const [{ total }] = await countQuery;

    // Parser les JSON pour les valeurs
    const parsedLogs = logs.map(log => ({
      ...log,
      old_values: log.old_values ? JSON.parse(log.old_values) : null,
      new_values: log.new_values ? JSON.parse(log.new_values) : null
    }));

    return {
      logs: parsedLogs,
      pagination: {
        total: parseInt(total),
        limit,
        offset,
        hasNext: (offset + limit) < parseInt(total)
      }
    };
  }

  /**
   * Récupérer l'historique d'un enregistrement spécifique
   */
  async getRecordHistory(tableName, recordId) {
    const logs = await db('audit_logs')
      .select(
        'audit_logs.*',
        'users.email as user_email',
        'users.display_name as user_name'
      )
      .leftJoin('users', 'audit_logs.user_uid', 'users.uid')
      .where('table_name', tableName)
      .where('record_id', recordId)
      .orderBy('created_at', 'asc');

    // Parser les JSON et ajouter les changements détaillés
    return logs.map(log => {
      const parsedLog = {
        ...log,
        old_values: log.old_values ? JSON.parse(log.old_values) : null,
        new_values: log.new_values ? JSON.parse(log.new_values) : null
      };

      // Calculer les changements pour les mises à jour
      if (parsedLog.action === 'UPDATE' && parsedLog.old_values && parsedLog.new_values) {
        parsedLog.changes = this.calculateChanges(parsedLog.old_values, parsedLog.new_values);
      }

      return parsedLog;
    });
  }

  /**
   * Calculer les différences entre ancien et nouveau état
   */
  calculateChanges(oldValues, newValues) {
    const changes = [];
    
    // Vérifier tous les champs du nouvel objet
    for (const [key, newValue] of Object.entries(newValues)) {
      const oldValue = oldValues[key];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: key,
          old_value: oldValue,
          new_value: newValue
        });
      }
    }
    
    return changes;
  }

  /**
   * Statistiques d'audit
   */
  async getAuditStats(filters = {}) {
    const { start_date, end_date, table_name } = filters;
    
    let baseQuery = db('audit_logs');
    
    if (start_date) baseQuery = baseQuery.where('created_at', '>=', start_date);
    if (end_date) baseQuery = baseQuery.where('created_at', '<=', end_date);
    if (table_name) baseQuery = baseQuery.where('table_name', table_name);

    // Actions par type
    const actionStats = await baseQuery.clone()
      .select('action')
      .count('* as count')
      .groupBy('action');

    // Actions par table
    const tableStats = await baseQuery.clone()
      .select('table_name')
      .count('* as count')
      .groupBy('table_name');

    // Utilisateurs les plus actifs
    const userStats = await baseQuery.clone()
      .select('audit_logs.user_uid', 'users.email', 'users.display_name')
      .count('* as count')
      .leftJoin('users', 'audit_logs.user_uid', 'users.uid')
      .groupBy('audit_logs.user_uid', 'users.email', 'users.display_name')
      .orderBy('count', 'desc')
      .limit(10);

    // Activité par jour (7 derniers jours)
    const dailyActivity = await db('audit_logs')
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('COUNT(*) as count')
      )
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 7 DAY'))
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'desc');

    return {
      byAction: actionStats.map(stat => ({
        action: stat.action,
        count: parseInt(stat.count)
      })),
      byTable: tableStats.map(stat => ({
        table: stat.table_name,
        count: parseInt(stat.count)
      })),
      topUsers: userStats.map(stat => ({
        uid: stat.user_uid,
        email: stat.email,
        name: stat.display_name,
        count: parseInt(stat.count)
      })),
      dailyActivity: dailyActivity.map(stat => ({
        date: stat.date,
        count: parseInt(stat.count)
      }))
    };
  }

  /**
   * Nettoyer les anciens logs d'audit (politique de rétention)
   */
  async cleanupOldLogs(retentionDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const deletedCount = await db('audit_logs')
      .where('created_at', '<', cutoffDate)
      .del();
    
    console.log(`🧹 Nettoyage audit: ${deletedCount} entrées supprimées (+ de ${retentionDays} jours)`);
    
    return deletedCount;
  }

  /**
   * Exporter les logs d'audit au format CSV
   */
  async exportAuditLogs(filters = {}) {
    const { logs } = await this.getAuditLogs({
      ...filters,
      limit: 10000, // Export limité
      offset: 0
    });
    
    if (logs.length === 0) {
      return null;
    }
    
    // Headers CSV
    const headers = [
      'Date/Heure',
      'Action',
      'Table',
      'Enregistrement ID',
      'Utilisateur Email',
      'Utilisateur Nom',
      'Adresse IP',
      'Anciennes Valeurs',
      'Nouvelles Valeurs'
    ];
    
    // Conversion en CSV
    const csvRows = [headers.join(',')];
    
    logs.forEach(log => {
      const row = [
        log.created_at,
        log.action,
        log.table_name,
        log.record_id,
        log.user_email || '',
        log.user_name || '',
        log.ip_address || '',
        log.old_values ? JSON.stringify(log.old_values).replace(/"/g, '""') : '',
        log.new_values ? JSON.stringify(log.new_values).replace(/"/g, '""') : ''
      ];
      
      csvRows.push(row.map(field => `"${field}"`).join(','));
    });
    
    return csvRows.join('\n');
  }

  /**
   * Middleware pour capturer automatiquement les informations de requête
   */
  middleware() {
    return (req, res, next) => {
      // Stocker les informations de contexte pour l'audit
      req.auditContext = {
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent')
      };
      
      next();
    };
  }
}

module.exports = new AuditService();