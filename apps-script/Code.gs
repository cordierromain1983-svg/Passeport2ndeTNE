// =====================================================================
//  Passeports de compétences — 2TNE1 (2de) et 1MS (1re)
//  - Menu « Passeports » : publier à la main les validations vers GitHub.
//  - doPost : reçoit les fiches faites en ligne par les élèves, les recorrige,
//    note le résultat dans l'onglet « Résultats », remplit la grille et publie.
//  Le jeton GitHub est rangé dans Paramètres du projet > Propriétés du script
//  (GITHUB_TOKEN) : il n'apparaît jamais dans ce code.
// =====================================================================

const CONFIGURATIONS = {
  "2TNE1": { depot: "cordierromain1983-svg/Passeport2ndeTNE", prefixe: "2D-" },
  "1MS": { depot: "cordierromain1983-svg/passeport-comp-tences-1-re-Bac-pro", prefixe: "1P-" }
};
const SEUIL_REUSSITE = 14;          // note minimale (sur 20) pour réussir une fiche
const ONGLET_RESULTATS = "Résultats";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Passeports")
    .addItem("Publier les validations", "publierValidations")
    .addToUi();
}

function extraireNumeroBadge(fiche) {
  const match = String(fiche).trim().match(/^fiche\s*(\d+)/i);
  if (!match) return null;
  const numero = Number(match[1]);
  return numero >= 1 && numero <= 22 ? numero : null;
}

// ---------------------------------------------------------------------
//  Publication manuelle (menu) : même fonctionnement qu'avant
// ---------------------------------------------------------------------
function publierValidations() {
  const ui = SpreadsheetApp.getUi();
  const nomFeuille = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();

  if (!CONFIGURATIONS[nomFeuille]) {
    ui.alert("Sélectionne l'onglet 2TNE1 ou 1MS.");
    return;
  }

  const etat = lireGrille_(nomFeuille);
  if (!etat) {
    ui.alert("Le tableau ne contient pas de données.");
    return;
  }

  if (etat.nombreOui === 0) {
    const vide = ui.alert(
      "Confirmer la suppression des validations",
      "Aucune validation « Oui » trouvée dans l'onglet " + nomFeuille +
        ". Publier cet état pour retirer les badges de test ?",
      ui.ButtonSet.YES_NO
    );
    if (vide !== ui.Button.YES) return;
  }

  const confirmation = ui.alert(
    "Confirmer la publication",
    etat.nombreOui + " validation(s) « Oui » et " + etat.nombreAValider +
      " « À valider » trouvée(s) dans l'onglet " + nomFeuille + ". Envoyer à GitHub ?",
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  const verrou = LockService.getScriptLock();
  verrou.waitLock(30000);
  try {
    const nombreEleves = publierVersGitHub_(nomFeuille, etat);
    ui.alert(
      "Publication réussie !\n\n" +
      etat.nombreOui + " validation(s) « Oui » envoyée(s).\n" +
      nombreEleves + " élève(s) traité(s).\n\n" +
      "Actualise le passeport pour voir les changements."
    );
  } catch (erreur) {
    ui.alert("Échec de la publication :\n" + erreur.message);
  } finally {
    verrou.releaseLock();
  }
}

// Lit la grille d'un onglet : « Oui » = badge validé, « À valider » = badge acquis (en attente).
function lireGrille_(nomFeuille) {
  const config = CONFIGURATIONS[nomFeuille];
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!feuille) return null;
  const donnees = feuille.getDataRange().getDisplayValues();
  if (donnees.length < 2 || donnees[0].length < 2) return null;

  const validations = {};
  const acquis = {};
  let nombreOui = 0;
  let nombreAValider = 0;

  // Ligne 1 : codes élèves (à partir de la colonne B). Colonne A : noms des fiches.
  for (let col = 1; col < donnees[0].length; col++) {
    const code = String(donnees[0][col]).trim().toUpperCase();
    if (!code.startsWith(config.prefixe)) continue;
    const val = [];
    const acq = [];
    for (let ligne = 1; ligne < donnees.length; ligne++) {
      const numero = extraireNumeroBadge(donnees[ligne][0]);
      if (numero === null) continue;
      const valeur = normaliser_(donnees[ligne][col]);
      if (valeur === "oui") { val.push(numero); nombreOui++; }
      else if (valeur === "a valider") { acq.push(numero); nombreAValider++; }
    }
    validations[code] = [...new Set(val)];
    acquis[code] = [...new Set(acq)];
  }
  return { validations, acquis, nombreOui, nombreAValider };
}

// Réécrit la liste des élèves (const D) du site GitHub de l'onglet. Renvoie le nombre d'élèves traités.
function publierVersGitHub_(nomFeuille, etat) {
  const config = CONFIGURATIONS[nomFeuille];
  const jeton = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!jeton) {
    throw new Error(
      "Le jeton GitHub est absent. Dans Apps Script, ouvre Paramètres du projet > " +
      "Propriétés du script et ajoute GITHUB_TOKEN avec ton jeton GitHub."
    );
  }
  const url = "https://api.github.com/repos/" + config.depot + "/contents/index.html";
  const entetes = {
    Authorization: "Bearer " + jeton,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const lecture = UrlFetchApp.fetch(url, { method: "get", headers: entetes, muteHttpExceptions: true });
  if (lecture.getResponseCode() !== 200) {
    throw new Error("Lecture GitHub impossible (" + lecture.getResponseCode() +
      "). Vérifie le jeton et les droits du dépôt.");
  }
  const fichier = JSON.parse(lecture.getContentText());
  const html = Utilities.newBlob(Utilities.base64Decode(fichier.content.replace(/\n/g, "")))
    .getDataAsString("UTF-8");

  const debut = html.indexOf("const D=");
  const fin = html.indexOf("];", debut);
  if (debut < 0 || fin < 0) throw new Error("Liste des élèves introuvable dans index.html.");

  const eleves = JSON.parse(html.slice(debut + "const D=".length, fin + 1));
  let nombreEleves = 0;
  for (const eleve of eleves) {
    if (!Object.prototype.hasOwnProperty.call(etat.validations, eleve.code)) continue;
    eleve.val = etat.validations[eleve.code];
    eleve.acq = etat.acquis[eleve.code] || [];
    nombreEleves++;
  }
  if (nombreEleves === 0) throw new Error("Aucun code élève de cet onglet ne correspond au passeport GitHub.");

  const nouveauHtml = html.slice(0, debut) + "const D=" + JSON.stringify(eleves) + ";" + html.slice(fin + 2);
  if (nouveauHtml === html) return nombreEleves;   // rien n'a changé : inutile de publier

  const publication = UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    headers: entetes,
    payload: JSON.stringify({
      message: "Mise à jour des validations depuis Google Sheets",
      content: Utilities.base64Encode(nouveauHtml, Utilities.Charset.UTF_8),
      sha: fichier.sha
    }),
    muteHttpExceptions: true
  });
  if (publication.getResponseCode() !== 200) {
    throw new Error("Publication GitHub impossible (" + publication.getResponseCode() +
      "). Vérifie les droits du jeton.");
  }
  return nombreEleves;
}

// ---------------------------------------------------------------------
//  Réception des fiches faites en ligne (application Web)
// ---------------------------------------------------------------------
function doPost(e) {
  let reponse;
  const verrou = LockService.getScriptLock();
  try {
    if (!e || !e.postData || e.postData.contents.length > 20000) throw new Error("Envoi invalide.");
    const envoi = JSON.parse(e.postData.contents);
    const code = String(envoi.code || "").trim().toUpperCase();
    const fiche = String(Number(envoi.fiche));
    const nomFeuille = Object.keys(CONFIGURATIONS).find(n => code.startsWith(CONFIGURATIONS[n].prefixe));
    if (!nomFeuille || !/^[A-Z0-9]{1,3}-[A-Z0-9]{5}$/.test(code)) throw new Error("Code élève inconnu.");
    const corrige = CORRIGE[fiche];
    if (!corrige) throw new Error("Cette fiche ne se fait pas en ligne.");

    verrou.waitLock(30000);
    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    const grille = classeur.getSheetByName(nomFeuille);
    const donnees = grille.getDataRange().getDisplayValues();
    const colonne = donnees[0].findIndex(c => String(c).trim().toUpperCase() === code);
    const ligne = donnees.findIndex((l, i) => i > 0 && extraireNumeroBadge(l[0]) === Number(fiche));
    if (colonne < 1) throw new Error("Code élève inconnu.");
    if (ligne < 1) throw new Error("La fiche " + fiche + " est absente du tableau.");

    // 1. Recorrection côté tableur (la note envoyée par la page n'est pas utilisée)
    const rep = envoi.rep || {};
    let note = 0;
    let ouverte = false;
    const detail = [];
    Object.keys(corrige.items).forEach(n => {
      const item = corrige.items[n];
      const valeurs = (Array.isArray(rep[n]) ? rep[n] : []).map(v => String(v).slice(0, 300));
      const juste = itemJuste_(item, valeurs, corrige.ai);
      if (juste) note++;
      if (item.w.some(w => w.k === "a")) ouverte = true;
      detail.push(n + (juste ? "✔" : "✘(" + valeurs.join("/").slice(0, 40) + ")"));
    });

    // 2. Numéro de tentative, compté par le tableur
    const resultats = ongletResultats_(classeur);
    const lignes = resultats.getLastRow() > 1
      ? resultats.getRange(2, 3, resultats.getLastRow() - 1, 2).getDisplayValues() : [];
    const tentative = lignes.filter(l => l[0] === code && String(l[1]) === fiche).length + 1;

    // 3. Décision : « Oui » si réussi au 1er essai, « À valider » si réussi plus tard
    const cellule = grille.getRange(ligne + 1, colonne + 1);
    const actuel = normaliser_(cellule.getDisplayValue());
    let decision = "Non réussie";
    if (actuel === "oui") decision = "Déjà validée";
    else if (note >= SEUIL_REUSSITE && tentative === 1) decision = "Oui";
    else if (note >= SEUIL_REUSSITE) decision = actuel === "a valider" ? "Déjà à valider" : "À valider";

    resultats.appendRow([
      new Date(), nomFeuille, code, Number(fiche), note,
      niveau_(note) + (ouverte ? " (question ouverte à vérifier)" : ""), tentative, decision, detail.join(" ")
    ]);

    // 4. Grille + publication automatique si quelque chose a changé
    let publie = false;
    if (decision === "Oui" || decision === "À valider") {
      cellule.setValue(decision);
      SpreadsheetApp.flush();
      try {
        publierVersGitHub_(nomFeuille, lireGrille_(nomFeuille));
        publie = true;
      } catch (erreurPublication) {
        resultats.getRange(resultats.getLastRow(), 8).setValue(decision + " — publication à refaire : " + erreurPublication.message);
      }
    }
    reponse = { ok: true, note: note, tentative: tentative, decision: decision, publie: publie };
  } catch (erreur) {
    reponse = { ok: false, erreur: erreur.message };
  } finally {
    try { verrou.releaseLock(); } catch (x) {}
  }
  return ContentService.createTextOutput(JSON.stringify(reponse)).setMimeType(ContentService.MimeType.JSON);
}

// Page ouverte directement dans un navigateur : simple vérification que le service répond.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "passeports" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function ongletResultats_(classeur) {
  let feuille = classeur.getSheetByName(ONGLET_RESULTATS);
  if (!feuille) {
    feuille = classeur.insertSheet(ONGLET_RESULTATS);
    feuille.appendRow(["Date", "Classe", "Code", "Fiche", "Note /20", "Niveau", "Tentative", "Décision", "Détail"]);
    feuille.setFrozenRows(1);
    feuille.getRange("1:1").setFontWeight("bold");
    feuille.getRange("A:A").setNumberFormat("dd/mm/yyyy hh:mm");
  }
  return feuille;
}

function niveau_(note) {
  return note >= 14 ? "N3 — Validé" : note >= 10 ? "N2 — Fragile" : "N1 — Non acquis";
}

function normaliser_(texte) {
  return String(texte).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Correction : mêmes règles que sur le site ---
function nzs_(s, ai) {
  s = String(s).normalize("NFC").toLowerCase().replace(/’/g, "'");
  if (ai) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return s.replace(/[«»"'‑\-.!?;:,\[\]()…]+/g, " ").replace(/\s+/g, " ").trim();
}
function nzp_(s) {
  return String(s).normalize("NFC").toLowerCase().replace(/’/g, "'").replace(/[«»"]/g, "")
    .replace(/\s+,/g, ",").replace(/[.!?]+\s*$/, "").replace(/\s+/g, " ").trim();
}
function reponseJuste_(w, v, ai) {
  if (w.k === "s") return w.ok.includes(v);
  if (w.k === "t") return w.ok.some(a => nzs_(a, ai) === nzs_(v, ai));
  if (w.k === "p") return w.v.some(a => nzp_(a) === nzp_(v));
  const t = nzs_(v, ai);
  if (w.k === "x") return new RegExp(w.re, "i").test(t);
  return t.length >= 20 && new RegExp(w.re, "i").test(t);
}
function itemJuste_(item, v, ai) {
  if (item.cond) {
    if (!reponseJuste_(item.w[0], v[0] || "", ai)) return false;
    return item.w[0].ok[0] === "Correct" ? true : reponseJuste_(item.w[1], v[1] || "", ai);
  }
  return item.w.every((w, i) => reponseJuste_(w, v[i] || "", ai));
}
