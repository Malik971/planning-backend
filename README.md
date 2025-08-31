# 🎯 Planning Backend - API REST avec Firebase Auth & PostgreSQL

## 📋 Vue d'ensemble

Back-end robuste pour application de planning avec authentification Firebase, gestion de rôles, et API REST complète. Conçu pour gérer les événements de planning multi-équipes avec sécurité avancée et traçabilité complète.

### ✨ Fonctionnalités principales

- **Authentification Firebase** avec gestion des rôles (admin, manager, staff)
- **API REST complète** pour la gestion d'événements
- **Base PostgreSQL** avec migrations et seeds
- **Système d'audit** complet avec traçabilité
- **Duplication de plannings** entre semaines
- **Templates de planning** réutilisables
- **Validation avancée** des données
- **Rate limiting** et sécurité
- **Logging structuré** avec Winston

## 🏗️ Architecture

```
src/
├── config/          # Configuration (DB, Firebase, env)
├── middleware/      # Auth, permissions, validation
├── services/        # Logique métier (events, users, audit)
├── routes/          # Endpoints API REST
└── app.js          # Application Express principale
```

## 🚀 Installation et configuration

### 1. Prérequis

- **Node.js** >= 16.0.0
- **PostgreSQL** >= 12
- **Firebase** projet configuré
- **Git**

### 2. Installation

```bash
# Cloner le projet
git clone <repository-url>
cd planning-backend

# Installer les dépendances
npm install

# Copier et configurer l'environnement
cp .env.example .env
# Éditer .env avec vos valeurs
```

### 3. Configuration de la base de données

```bash
# Créer la base PostgreSQL
createdb planning_db

# Exécuter les migrations
npm run migrate

# (Optionnel) Peupler avec des données de test
npm run seed
```

### 4. Configuration Firebase

1. Créer un projet Firebase
2. Générer une clé de compte de service
3. Activer Authentication et Firestore
4. Configurer les variables Firebase dans `.env`

### 5. Démarrage

```bash
# Développement
npm run dev

# Production
npm start
```

## 🔐 Authentification et rôles

### Système de rôles

- **🔴 Admin** : Accès complet, gestion utilisateurs, toutes équipes
- **🟡 Manager** : Création/modification événements, équipes assignées
- **🟢 Staff** : Lecture seule, équipes assignées

### Équipes disponibles

- `bar` - Équipe bar
- `animation` - Équipe animation  
- `reception` - Équipe réception

### Headers d'authentification

```
Authorization: Bearer <firebase-jwt-token>
```

## 📡 API Endpoints

### 📅 Événements (`/api/events`)

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/events` | Tous | Liste des événements avec filtres |
| `GET` | `/api/events/:id` | Tous | Détail d'un événement |
| `POST` | `/api/events` | Admin/Manager | Créer un événement |
| `PUT` | `/api/events/:id` | Admin/Manager/Propriétaire | Modifier un événement |
| `DELETE` | `/api/events/:id` | Admin/Manager/Propriétaire | Supprimer un événement |
| `GET` | `/api/events/week/:date` | Tous | Événements d'une semaine |
| `POST` | `/api/events/conflicts/check` | Tous | Vérifier les conflits |
| `GET` | `/api/events/stats/summary` | Tous | Statistiques |

#### Exemples d'utilisation

```javascript
// Créer un événement
POST /api/events
{
  "title": "Club enfants",
  "start_time": "2025-08-25T14:00:00.000Z",
  "end_time": "2025-08-25T15:30:00.000Z",
  "team": "animation",
  "animator": "Sophie",
  "color": "#FF6B6B",
  "description": "Activités pour les 6-12 ans"
}

// Récupérer les événements d'une équipe
GET /api/events?team=bar&start_date=2025-08-25&end_date=2025-08-31

// Vérifier les conflits
POST /api/events/conflicts/check
{
  "start_time": "2025-08-25T14:00:00.000Z",
  "end_time": "2025-08-25T15:30:00.000Z",
  "team": "animation",
  "exclude_event_id": "uuid-optionnel"
}
```

### 👥 Utilisateurs (`/api/users`)

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/users/profile` | Tous | Mon profil |
| `PUT` | `/api/users/profile` | Tous | Modifier mon profil |
| `GET` | `/api/users` | Admin/Manager | Liste des utilisateurs |
| `GET` | `/api/users/:uid` | Admin/Manager | Détail utilisateur |
| `POST` | `/api/users` | Admin | Créer un utilisateur |
| `PUT` | `/api/users/:uid` | Admin | Modifier un utilisateur |
| `DELETE` | `/api/users/:uid` | Admin | Supprimer un utilisateur |
| `PUT` | `/api/users/:uid/deactivate` | Admin | Désactiver un utilisateur |
| `PUT` | `/api/users/:uid/teams` | Admin | Assigner des équipes |
| `GET` | `/api/users/teams/:team` | Tous | Membres d'une équipe |

### 📋 Planning (`/api/planning`)

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `POST` | `/api/planning/duplicate` | Admin/Manager | Dupliquer une semaine |
| `GET` | `/api/planning/templates` | Tous | Templates de planning |
| `POST` | `/api/planning/templates` | Admin/Manager | Créer un template |
| `POST` | `/api/planning/templates/:id/apply` | Admin/Manager | Appliquer un template |
| `GET` | `/api/planning/overview` | Tous | Vue d'ensemble multi-équipes |
| `POST` | `/api/planning/bulk-create` | Admin/Manager | Création en masse |

#### Exemple de duplication

```javascript
// Dupliquer le planning d'une semaine
POST /api/planning/duplicate
{
  "source_week": "2025-08-25T00:00:00.000Z",
  "target_week": "2025-09-01T00:00:00.000Z", 
  "team": "animation",
  "overwrite": false
}
```

### 📊 Audit (`/api/audit`) - Admin uniquement

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/audit` | Logs d'audit avec filtres |
| `GET` | `/api/audit/stats` | Statistiques d'audit |
| `GET` | `/api/audit/export` | Export CSV des audits |

## 🛡️ Sécurité

### Middleware de sécurité

- **Helmet** : Headers de sécurité HTTP
- **CORS** : Configuration cross-origin
- **Rate limiting** : Protection contre le spam
- **Validation** : Sanitisation des données avec Joi
- **Audit logging** : Traçabilité complète des actions

### Validation des données

Tous les endpoints utilisent une validation stricte :

```javascript
// Exemple de schéma d'événement
{
  title: "String 1-200 caractères",
  start_time: "Date ISO requise",
  end_time: "Date ISO > start_time",
  team: "Enum: bar|animation|reception",
  animator: "String optionnel max 100",
  color: "Hex color #RRGGBB optionnel"
}
```

### Permissions granulaires

- **Accès par équipe** : Vérification automatique
- **Propriété des événements** : Seuls les créateurs/managers peuvent modifier
- **Actions sensibles** : Logging obligatoire
- **Rate limiting strict** : 10 req/15min pour endpoints critiques

## 🗄️ Base de données

### Structure principale

```sql
-- Utilisateurs
users (
  uid PRIMARY KEY,           -- Firebase UID
  email UNIQUE NOT NULL,
  display_name,
  role ENUM('admin','manager','staff'),
  teams JSON DEFAULT '[]',   -- ['bar','animation']
  active BOOLEAN DEFAULT true
)

-- Événements
events (
  id UUID PRIMARY KEY,
  title NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  team ENUM('bar','animation','reception'),
  animator,
  color,
  description,
  metadata JSON,
  created_by REFERENCES users(uid),
  last_modified_by REFERENCES users(uid)
)

-- Audit complet
audit_logs (
  id SERIAL PRIMARY KEY,
  table_name NOT NULL,
  record_id NOT NULL, 
  action ENUM('CREATE','UPDATE','DELETE'),
  user_uid REFERENCES users(uid),
  old_values JSON,
  new_values JSON,
  ip_address,
  user_agent,
  created_at TIMESTAMP
)
```

### Migrations et seeds

```bash
# Nouvelle migration
npx knex migrate:make nom_migration

# Rollback
npx knex migrate:rollback

# Status
npx knex migrate:status
```

## 🔧 Configuration avancée

### Variables d'environnement critiques

```bash
# Base de données
DB_HOST=localhost
DB_USER=planning_user
DB_PASSWORD=secure_password
DB_NAME=planning_db

# Firebase (depuis la console Firebase > Paramètres > Comptes de service)
FIREBASE_PROJECT_ID=votre-projet-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@votre-projet.iam.gserviceaccount.com

# Sécurité
FRONTEND_URL=http://localhost:3000  # URL de votre front
```

### Logging et monitoring

- **Winston** pour les logs structurés
- **Logs d'audit** automatiques pour toutes les modifications
- **Health check** sur `/health`
- **Métriques** disponibles pour monitoring externe

### Performance

- **Indexation** optimisée des requêtes fréquentes
- **Pagination** automatique (max 100 résultats)
- **Compression gzip** des réponses
- **Connection pooling** PostgreSQL

## 🧪 Tests et développement

### Scripts disponibles

```bash
npm run dev          # Développement avec rechargement
npm start           # Production
npm run migrate     # Migrations DB
npm run seed        # Données de test
npm test           # Tests unitaires
npm run test:watch # Tests en mode watch
```

### Tests

```bash
# Tests unitaires
npm test

# Tests d'intégration avec base de test
NODE_ENV=test npm test

# Coverage
npm run test:coverage
```

## 🚀 Déploiement

### Production

```bash
# Variables d'environnement
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@host:port/db

# Commandes
npm run migrate
npm start
```

### Docker (optionnel)

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3001
CMD ["npm", "start"]
```

## 📞 Support et maintenance

### Monitoring recommandé

- **Uptime** : Surveillance de `/health`
- **Erreurs** : Logs dans `logs/error.log`
- **Performance** : Métriques de réponse
- **Base de données** : Monitoring PostgreSQL

### Maintenance régulière

```bash
# Nettoyage des anciens audits (90+ jours)
# Automatique ou manuel via l'API

# Sauvegarde base de données
pg_dump planning_db > backup_$(date +%Y%m%d).sql

# Rotation des logs
# Configuration logrotate recommandée
```

### Endpoints de maintenance

- `GET /health` - État du serveur
- `GET /api/audit/stats` - Statistiques système
- Rate limiting adaptatif selon la charge

## 🤝 Intégration avec le front-end

### Format des réponses

```javascript
// Succès
{
  "success": true,
  "data": { ... },
  "pagination": { ... }  // Si applicable
}

// Erreur
{
  "error": "Type d'erreur",
  "message": "Message explicite",
  "details": [ ... ]     // Si applicable
}
```

### WebSocket (extension future)

L'architecture permet l'ajout facile de WebSocket pour :
- Notifications temps réel
- Synchronisation multi-utilisateurs
- Updates automatiques du planning

---

## 🎯 Migration depuis Firestore

Si vous migrez depuis une solution Firestore existante :

1. **Export des données** : Scripts de migration disponibles
2. **Synchronisation** : Endpoint `/api/users/sync` pour migration utilisateurs
3. **Compatibilité** : Structure des événements similaire
4. **Import en masse** : Endpoint `/api/planning/bulk-create`

Cette architecture back-end robuste assure une sécurité maximale, une performance optimale, et une maintenance facilitée pour votre application de planning multi-équipes. 🚀
