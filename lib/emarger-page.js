const { escapeHtml } = require('./escape-html');
const { layoutPage } = require('./ui-shell');

/** Page formulaire mobile — géolocalisation + identité. */
function emargerFormPage({ t, sig, n, geofenceEnabled, radius, lat, lon, session = {}, students = [] }) {
  const geoBlock = geofenceEnabled
    ? `<div id="geo-box" class="geo-status is-warn" role="status">
        <div class="geo-spinner" id="geo-spin" aria-hidden="true"></div>
        <div>
          <strong>Vérification de la position</strong>
          <p style="margin-top:0.25rem; opacity:0.8;">Rayon requis : ${radius} m</p>
        </div>
      </div>`
    : `<div class="geo-status is-ok" role="status">
        <span aria-hidden="true">✓</span>
        <div><strong>Prêt à émarger</strong></div>
      </div>`;

  const body = `
    <link rel="stylesheet" href="/static/css/mobile-emarger.css" />
    <ol class="mobile-steps" aria-label="Étapes">
      <li class="is-done">QR</li>
      <li class="is-active">Identité</li>
      <li>Fini</li>
    </ol>
    <div id="session-info" class="session-chip" hidden>
      <span class="session-chip-k">Cours actuel</span>
      <span class="session-chip-v session-chip-v--course" id="si-cours">—</span>
      <span class="session-chip-k">Classe & Enseignant</span>
      <span class="session-chip-v" id="si-meta">—</span>
    </div>
    <section class="mobile-panel">
      <h2>Votre identité</h2>
      <p class="mobile-lead">Sélectionnez votre nom dans la liste pour confirmer votre présence.</p>
      ${geoBlock}
      <form id="f" method="post" action="/emarger" novalidate>
        <input type="hidden" name="t" value="${escapeHtml(t)}">
        <input type="hidden" name="sig" value="${escapeHtml(sig)}">
        <input type="hidden" name="n" value="${escapeHtml(n)}">
        <input type="hidden" name="session_id" value="${escapeHtml(session.startedAt || '')}">
        <input type="hidden" name="latitude" id="lat">
        <input type="hidden" name="longitude" id="lng">
        <input type="hidden" name="prenom" id="hidden-prenom">
        <input type="hidden" name="nom" id="hidden-nom">

        <!-- Student selector -->
        <div class="student-selector" id="student-selector">
          <div class="student-selector-loading" id="selector-loading">
            <div class="geo-spinner"></div>
            <span>Chargement de la liste…</span>
          </div>

          <div class="student-search-box" id="search-box" hidden>
            <label for="student-search" class="student-search-label">Rechercher votre nom</label>
            <input type="text" id="student-search" class="student-search-input" placeholder="Tapez pour filtrer…" autocomplete="off" enterkeyhint="search">
          </div>

          <div class="student-list-container" id="student-list-container" hidden>
            <ul class="student-list" id="student-list" role="listbox" aria-label="Liste des élèves"></ul>
            <p class="student-list-empty" id="student-empty" hidden>Aucun résultat trouvé</p>
          </div>

          <div class="student-selected-card" id="selected-card" hidden>
            <div class="student-selected-info">
              <span class="student-selected-icon">✓</span>
              <div>
                <p class="student-selected-name" id="selected-name"></p>
                <p class="student-selected-hint">C'est bien vous ?</p>
              </div>
            </div>
            <button type="button" class="btn-change-student" id="btn-change">Changer</button>
          </div>
        </div>

        <button type="submit" class="btn-primary btn-mobile-submit" id="btn" disabled>Confirmer ma présence</button>
      </form>
      <p id="err" style="color:var(--error); font-size:0.9rem; margin-top:1rem; text-align:center; display:none;"></p>
    </section>
    <script>
      (function () {
        var geoRequired = ${geofenceEnabled ? 'true' : 'false'};
        var err = document.getElementById('err');
        var btn = document.getElementById('btn');
        var latEl = document.getElementById('lat');
        var lngEl = document.getElementById('lng');
        var geoBox = document.getElementById('geo-box');
        var hiddenPrenom = document.getElementById('hidden-prenom');
        var hiddenNom = document.getElementById('hidden-nom');
        var searchBox = document.getElementById('search-box');
        var searchInput = document.getElementById('student-search');
        var listContainer = document.getElementById('student-list-container');
        var studentList = document.getElementById('student-list');
        var emptyMsg = document.getElementById('student-empty');
        var selectedCard = document.getElementById('selected-card');
        var selectedName = document.getElementById('selected-name');
        var btnChange = document.getElementById('btn-change');
        var selectorLoading = document.getElementById('selector-loading');
        var geoReady = !geoRequired;
        var studentSelected = false;
        
        var allStudents = ${JSON.stringify(students)};
        var sessionData = ${JSON.stringify(session)};

        function updateSubmitBtn() {
          btn.disabled = !(geoReady && studentSelected);
        }

        // Load session info
        if (sessionData && sessionData.cours) {
          document.getElementById('session-info').hidden = false;
          document.getElementById('si-cours').textContent = sessionData.cours;
          document.getElementById('si-meta').textContent = (sessionData.classe || '—') + ' · ' + (sessionData.intervenant || '—');
        }

        // Load students
        selectorLoading.hidden = true;

        if (allStudents.length === 0) {
          // Pas de liste → saisie manuelle
          searchBox.hidden = true;
          listContainer.hidden = true;
          var manualDiv = document.createElement('div');
          manualDiv.className = 'manual-entry';
          manualDiv.innerHTML =
            '<p style="margin-bottom:1rem;font-size:0.9rem;color:var(--text-muted);">Saisissez votre nom et prénom :</p>' +
            '<div style="margin-bottom:1rem;"><label style="display:block;font-weight:600;margin-bottom:0.3rem;font-size:0.9rem;">Prénom</label>' +
            '<input type="text" id="manual-prenom" placeholder="Votre prénom" required style="width:100%;padding:0.75rem;border-radius:8px;border:1.5px solid var(--border);font-size:1rem;"></div>' +
            '<div style="margin-bottom:1rem;"><label style="display:block;font-weight:600;margin-bottom:0.3rem;font-size:0.9rem;">Nom</label>' +
            '<input type="text" id="manual-nom" placeholder="Votre nom" required style="width:100%;padding:0.75rem;border-radius:8px;border:1.5px solid var(--border);font-size:1rem;"></div>';
          document.getElementById('student-selector').appendChild(manualDiv);
          var mp = document.getElementById('manual-prenom');
          var mn = document.getElementById('manual-nom');
          function checkManual() {
            if (mp.value.trim() && mn.value.trim()) {
              hiddenPrenom.value = mp.value.trim();
              hiddenNom.value = mn.value.trim();
              studentSelected = true;
            } else {
              studentSelected = false;
            }
            updateSubmitBtn();
          }
          mp.addEventListener('input', checkManual);
          mn.addEventListener('input', checkManual);
        } else {
          searchBox.hidden = false;
          listContainer.hidden = false;
          renderStudents(allStudents);

          searchInput.addEventListener('input', function () {
            var q = searchInput.value.trim().toLowerCase()
              .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
            if (!q) {
              renderStudents(allStudents);
              return;
            }
            var filtered = allStudents.filter(function (s) {
              var full = (s.prenom + ' ' + s.nom).toLowerCase()
                .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
              var fullReverse = (s.nom + ' ' + s.prenom).toLowerCase()
                .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
              return full.indexOf(q) !== -1 || fullReverse.indexOf(q) !== -1;
            });
            renderStudents(filtered);
          });
        }

        function renderStudents(list) {
          studentList.innerHTML = '';
          emptyMsg.hidden = list.length > 0;
          list.forEach(function (s, i) {
            var li = document.createElement('li');
            li.className = 'student-item';
            li.setAttribute('role', 'option');
            li.setAttribute('tabindex', '0');
            li.innerHTML =
              '<span class="student-item-avatar">' + s.prenom.charAt(0).toUpperCase() + s.nom.charAt(0).toUpperCase() + '</span>' +
              '<span class="student-item-name">' + escapeH(s.prenom) + ' <strong>' + escapeH(s.nom) + '</strong></span>';
            li.addEventListener('click', function () { selectStudent(s); });
            li.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStudent(s); }
            });
            studentList.appendChild(li);
          });
        }

        function selectStudent(s) {
          hiddenPrenom.value = s.prenom;
          hiddenNom.value = s.nom;
          selectedName.textContent = s.prenom + ' ' + s.nom;
          searchBox.hidden = true;
          listContainer.hidden = true;
          selectedCard.hidden = false;
          studentSelected = true;
          updateSubmitBtn();
        }

        btnChange.addEventListener('click', function () {
          hiddenPrenom.value = '';
          hiddenNom.value = '';
          studentSelected = false;
          selectedCard.hidden = true;
          searchBox.hidden = false;
          listContainer.hidden = false;
          searchInput.value = '';
          renderStudents(allStudents);
          searchInput.focus();
          updateSubmitBtn();
        });

        function escapeH(t) {
          var d = document.createElement('div');
          d.textContent = t;
          return d.innerHTML;
        }

        // Geolocation
        if (geoRequired && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            function (pos) {
              latEl.value = pos.coords.latitude;
              lngEl.value = pos.coords.longitude;
              geoReady = true;
              updateSubmitBtn();
              if (geoBox) {
                geoBox.className = 'geo-status is-ok';
                geoBox.innerHTML = '<span>✓</span><div><strong>Position validée</strong></div>';
              }
            },
            function () {
              if (geoBox) {
                geoBox.className = 'geo-status is-err';
                geoBox.innerHTML = '<span>✕</span><div><strong>Position requise</strong><p style="margin-top:0.25rem;">Activez le GPS pour continuer.</p></div>';
              }
              err.textContent = "La localisation est obligatoire.";
              err.style.display = "block";
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        }
      })();
    </script>`;

  return layoutPage({
    title: 'Émarger',
    headerTitle: 'Émargement',
    headerSubtitle: 'Scan validé — sélectionnez votre nom',
    extraClass: 'page-mobile-emarger',
    bodyHtml: body,
  });
}

module.exports = { emargerFormPage };
