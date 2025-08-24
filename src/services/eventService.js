// src/services/eventService.js
const db = require('../config/database');
const auditService = require('./auditService');
const moment = require('moment-timezone');

class EventService {
  constructor() {
    this.timezone = 'Europe/Paris';
  }

  /**
   * Créer un nouvel événement
   */
  async createEvent(eventData, createdBy) {
    const trx = await db.transaction();
    
    try {
      const event = {
        ...eventData,
        created_by: createdBy,
        created_at: new Date(),
        updated_at: new Date()
      };

      const [newEvent] = await trx('events')
        .insert(event)
        .returning('*');

      // Audit log
      await auditService.logAction(trx, {
        table_name: 'events',
        record_id: newEvent.id,
        action: 'CREATE',
        user_uid: createdBy,
        new_values: newEvent
      });

      await trx.commit();
      return newEvent;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Récupérer un événement par ID
   */
  async getEventById(eventId) {
    const event = await db('events')
      .where('id', eventId)
      .first();
    
    return event;
  }

  /**
   * Récupérer les événements avec filtres
   */
  async getEvents(filters = {}) {
    const {
      team,
      start_date,
      end_date,
      limit = 50,
      offset = 0,
      created_by
    } = filters;

    let query = db('events')
      .select('*')
      .orderBy('start_time', 'asc');

    // Filtres
    if (team) {
      query = query.where('team', team);
    }

    if (start_date) {
      query = query.where('start_time', '>=', start_date);
    }

    if (end_date) {
      query = query.where('end_time', '<=', end_date);
    }

    if (created_by) {
      query = query.where('created_by', created_by);
    }

    // Pagination
    query = query.limit(limit).offset(offset);

    const events = await query;
    
    // Compter le total pour la pagination
    let countQuery = db('events').count('* as total');
    
    if (team) countQuery = countQuery.where('team', team);
    if (start_date) countQuery = countQuery.where('start_time', '>=', start_date);
    if (end_date) countQuery = countQuery.where('end_time', '<=', end_date);
    if (created_by) countQuery = countQuery.where('created_by', created_by);
    
    const [{ total }] = await countQuery;

    return {
      events,
      pagination: {
        total: parseInt(total),
        limit,
        offset,
        hasNext: (offset + limit) < parseInt(total)
      }
    };
  }

  /**
   * Récupérer les événements d'une semaine
   */
  async getWeekEvents(weekStart, team) {
    const weekEnd = moment(weekStart).add(6, 'days').endOf('day').toDate();
    
    const events = await db('events')
      .where('team', team)
      .whereBetween('start_time', [weekStart, weekEnd])
      .orderBy('start_time', 'asc');

    return events;
  }

  /**
   * Mettre à jour un événement
   */
  async updateEvent(eventId, updateData, updatedBy) {
    const trx = await db.transaction();
    
    try {
      // Récupérer l'ancien événement pour l'audit
      const oldEvent = await trx('events')
        .where('id', eventId)
        .first();

      if (!oldEvent) {
        throw new Error('Événement non trouvé');
      }

      const updatedEvent = {
        ...updateData,
        last_modified_by: updatedBy,
        updated_at: new Date()
      };

      const [event] = await trx('events')
        .where('id', eventId)
        .update(updatedEvent)
        .returning('*');

      // Audit log
      await auditService.logAction(trx, {
        table_name: 'events',
        record_id: eventId,
        action: 'UPDATE',
        user_uid: updatedBy,
        old_values: oldEvent,
        new_values: event
      });

      await trx.commit();
      return event;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Supprimer un événement
   */
  async deleteEvent(eventId, deletedBy) {
    const trx = await db.transaction();
    
    try {
      // Récupérer l'événement avant suppression
      const event = await trx('events')
        .where('id', eventId)
        .first();

      if (!event) {
        throw new Error('Événement non trouvé');
      }

      await trx('events')
        .where('id', eventId)
        .del();

      // Audit log
      await auditService.logAction(trx, {
        table_name: 'events',
        record_id: eventId,
        action: 'DELETE',
        user_uid: deletedBy,
        old_values: event
      });

      await trx.commit();
      return event;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Vérifier les conflits d'événements
   */
  async checkEventConflicts(startTime, endTime, team, excludeEventId = null) {
    let query = db('events')
      .where('team', team)
      .where(function() {
        this.where(function() {
          // Nouveau événement commence pendant un événement existant
          this.where('start_time', '<=', startTime)
            .andWhere('end_time', '>', startTime);
        }).orWhere(function() {
          // Nouveau événement finit pendant un événement existant
          this.where('start_time', '<', endTime)
            .andWhere('end_time', '>=', endTime);
        }).orWhere(function() {
          // Nouveau événement englobe un événement existant
          this.where('start_time', '>=', startTime)
            .andWhere('end_time', '<=', endTime);
        });
      });

    if (excludeEventId) {
      query = query.whereNot('id', excludeEventId);
    }

    return await query;
  }

  /**
   * Dupliquer les événements d'une semaine vers une autre
   */
  async duplicateWeekEvents(sourceWeek, targetWeek, team, createdBy, overwrite = false) {
    const trx = await db.transaction();
    
    try {
      // Récupérer les événements de la semaine source
      const sourceEvents = await this.getWeekEvents(sourceWeek, team);
      
      if (sourceEvents.length === 0) {
        throw new Error('Aucun événement trouvé pour la semaine source');
      }

      // Supprimer les événements existants si overwrite = true
      if (overwrite) {
        const targetWeekEnd = moment(targetWeek).add(6, 'days').endOf('day').toDate();
        
        const existingEvents = await trx('events')
          .where('team', team)
          .whereBetween('start_time', [targetWeek, targetWeekEnd]);

        for (const event of existingEvents) {
          await auditService.logAction(trx, {
            table_name: 'events',
            record_id: event.id,
            action: 'DELETE',
            user_uid: createdBy,
            old_values: event
          });
        }

        await trx('events')
          .where('team', team)
          .whereBetween('start_time', [targetWeek, targetWeekEnd])
          .del();
      }

      const duplicatedEvents = [];
      
      for (const sourceEvent of sourceEvents) {
        // Calculer la différence en jours
        const daysDiff = moment(targetWeek).diff(moment(sourceWeek), 'days');
        
        const newEvent = {
          title: sourceEvent.title,
          start_time: moment(sourceEvent.start_time).add(daysDiff, 'days').toDate(),
          end_time: moment(sourceEvent.end_time).add(daysDiff, 'days').toDate(),
          team: sourceEvent.team,
          animator: sourceEvent.animator,
          color: sourceEvent.color,
          description: sourceEvent.description,
          metadata: sourceEvent.metadata,
          created_by: createdBy,
          created_at: new Date(),
          updated_at: new Date()
        };

        const [insertedEvent] = await trx('events')
          .insert(newEvent)
          .returning('*');

        await auditService.logAction(trx, {
          table_name: 'events',
          record_id: insertedEvent.id,
          action: 'CREATE',
          user_uid: createdBy,
          new_values: insertedEvent
        });

        duplicatedEvents.push(insertedEvent);
      }

      await trx.commit();
      return duplicatedEvents;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Statistiques des événements
   */
  async getEventStats(filters = {}) {
    const { team, start_date, end_date } = filters;
    
    let query = db('events');
    
    if (team) query = query.where('team', team);
    if (start_date) query = query.where('start_time', '>=', start_date);
    if (end_date) query = query.where('end_time', '<=', end_date);

    const stats = await query
      .select('team')
      .count('* as total_events')
      .sum(db.raw('EXTRACT(EPOCH FROM (end_time - start_time))/3600 as total_hours'))
      .groupBy('team');

    return stats;
  }
}

module.exports = new EventService();