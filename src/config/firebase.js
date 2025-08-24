// src/config/firebase.js
const admin = require('firebase-admin');
const config = require('./index');

// Initialisation Firebase Admin
const serviceAccount = config.firebase.serviceAccountKey;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: config.firebase.projectId
});

const auth = admin.auth();
const firestore = admin.firestore();

/**
 * Vérifie et décode le token Firebase
 * @param {string} idToken - Token Firebase du client
 * @returns {Promise<Object>} - Données utilisateur décodées
 */
async function verifyToken(idToken) {
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Token Firebase invalide: ' + error.message);
  }
}

/**
 * Récupère les claims personnalisés d'un utilisateur
 * @param {string} uid - UID utilisateur
 * @returns {Promise<Object>} - Claims utilisateur
 */
async function getUserClaims(uid) {
  try {
    const userRecord = await auth.getUser(uid);
    return userRecord.customClaims || {};
  } catch (error) {
    throw new Error('Impossible de récupérer les claims: ' + error.message);
  }
}

/**
 * Définit le rôle d'un utilisateur
 * @param {string} uid - UID utilisateur
 * @param {string} role - Rôle (admin, manager, staff)
 */
async function setUserRole(uid, role) {
  const validRoles = ['admin', 'manager', 'staff'];
  
  if (!validRoles.includes(role)) {
    throw new Error(`Rôle invalide. Rôles autorisés: ${validRoles.join(', ')}`);
  }

  try {
    await auth.setCustomUserClaims(uid, { role });
    console.log(`✅ Rôle "${role}" assigné à l'utilisateur ${uid}`);
  } catch (error) {
    throw new Error('Erreur lors de l\'assignation du rôle: ' + error.message);
  }
}

module.exports = {
  admin,
  auth,
  firestore,
  verifyToken,
  getUserClaims,
  setUserRole
};