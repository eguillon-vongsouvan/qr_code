const crypto = require('crypto');

/**
 * Vérifie si un mot de passe a été compromis dans une fuite de données (ex: RockYou).
 * Utilise l'API Have I Been Pwned (k-Anonymity) : le mot de passe n'est jamais envoyé en clair,
 * seuls les 5 premiers caractères du hash SHA-1 sont envoyés.
 * 
 * @param {string} password Le mot de passe à vérifier
 * @returns {Promise<boolean>} true si le mot de passe est compromis, false sinon
 */
async function isPasswordPwned(password) {
  if (!password) return false;

  try {
    // 1. Hasher le mot de passe en SHA-1 (requis par l'API HIBP)
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    
    // 2. Séparer les 5 premiers caractères (prefix) du reste (suffix)
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    // 3. Appeler l'API k-Anonymity de Have I Been Pwned
    // Note: Node 18+ possède nativement la fonction `fetch`
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    
    if (!response.ok) {
      console.warn(`[HIBP API] Erreur ${response.status} lors de la vérification du mot de passe.`);
      // En cas d'erreur de l'API (ex: rate limit), on autorise par défaut pour ne pas bloquer l'utilisateur
      return false; 
    }

    const text = await response.text();
    
    // 4. L'API retourne une liste de suffixes correspondants au prefix, avec le nombre d'occurrences.
    // Format: SUFFIX:COUNT
    const hashes = text.split('\n').map(line => line.trim().split(':'));

    // 5. Vérifier si notre suffixe est dans la liste
    for (const [hashSuffix, count] of hashes) {
      if (hashSuffix === suffix) {
        // Le mot de passe a été trouvé !
        return true;
      }
    }

    // Le mot de passe n'a pas été trouvé dans les fuites
    return false;
  } catch (error) {
    console.error(`[HIBP API] Erreur réseau :`, error);
    return false; // Fallback sécuritaire
  }
}

module.exports = {
  isPasswordPwned
};
