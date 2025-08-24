// src/middleware/auth.js
const { verifyToken, getUserClaims } = require('../config/firebase');
const userService = require('../services/userService');

/**
 * Middleware d'authentification Firebase
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Token d\'authentification manquant',
        message: 'Veuillez fournir un token Bearer dans le header Authorization'
      });
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        error: 'Format de token invalide',
        message: 'Format attendu: "Bearer <token>"'
      });
    }

    // Vérification du token Firebase
    const decodedToken = await verifyToken(token);
    
    // Récupération des informations utilisateur complètes
    const user = await userService.getUserByUid(decodedToken.uid);
    
    if (!user) {
      return res.status(401).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur n\'existe pas dans la base de données'
      });
    }

    if (!user.active) {
      return res.status(401).json({
        error: 'Compte désactivé',
        message: 'Votre compte a été désactivé'
      });
    }

    // Ajout des infos utilisateur à la requête
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: user.role,
      teams: user.teams,
      displayName: user.display_name
    };

    next();
  } catch (error) {
    console.error('Erreur authentification:', error);
    return res.status(401).json({
      error: 'Token invalide',
      message: error.message
    });
  }
}

/**
 * Middleware optionnel - n'échoue pas si pas de token
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    req.user = null;
    return next();
  }

  try {
    await authenticateToken(req, res, next);
  } catch (error) {
    req.user = null;
    next();
  }
}

module.exports = {
  authenticateToken,
  optionalAuth
};