/* =========================================================
   Badminton Match Manager
   - Input pemain manual (3 level)
   - Tabel pemain per-level
   - Random 4 pemain -> 2 tim seimbang (tiap tim 2 level berbeda)
   - Tabel match
   - Tanpa partner berulang (pemain yang pernah 1 tim tak dipasang lagi)
   ========================================================= */

const LEVELS = ["Beginner", "Beginner Plus", "Intermediate"];
const STORAGE_KEY = "badminton_data_v1";

/** Poin tiap level untuk menilai keseimbangan tim (total poin tim harus sama). */
const LEVEL_POINTS = {
  "Beginner": 1,
  "Beginner Plus": 2,
  "Intermediate": 3,
};

/** Lama istirahat: pemain yang baru main harus duduk 3 match sebelum boleh lagi. */
const REST_MATCHES = 3;

/** @typedef {{id:string, name:string, level:string}} Player */
/** @typedef {{id:string, teamA:string[], teamB:string[], court:string|null, time:string}} Match */
/** @typedef {{id:string, name:string}} Court */

/** @type {{players: Player[], matches: Match[], courts: Court[]}} */
let state = { players: [], matches: [], courts: [] };

/** Pasangan tim dari match tersimpul, dipakai untuk cegah partner berulang. */
let pendingMatch = null; // { teamA: Player[], teamB: Player[] }

/* ---------------- Persistence ---------------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {
    console.warn("Gagal memuat data:", e);
  }
  if (!Array.isArray(state.players)) state.players = [];
  if (!Array.isArray(state.matches)) state.matches = [];
  if (!Array.isArray(state.courts)) state.courts = [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------- Helpers ---------------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function levelClass(level) {
  return level.replace(/\s+/g, ""); // "Beginner Plus" -> "BeginnerPlus"
}

function playerById(id) {
  return state.players.find((p) => p.id === id);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Set pasangan partner yang sudah pernah terjadi.
 * Key = "idKecil|idBesar" supaya tidak tergantung urutan.
 */
function buildPastPartners() {
  const set = new Set();
  const addPair = (a, b) => {
    const key = [a, b].sort().join("|");
    set.add(key);
  };
  for (const m of state.matches) {
    if (m.teamA.length === 2) addPair(m.teamA[0], m.teamA[1]);
    if (m.teamB.length === 2) addPair(m.teamB[0], m.teamB[1]);
  }
  return set;
}

function pairKey(a, b) {
  return [a, b].sort().join("|");
}

/**
 * Hitung berapa kali tiap pemain sudah main, berdasarkan kemunculannya
 * di tabel match (tim A + tim B tiap match).
 * @returns {Record<string, number>} map playerId -> jumlah main
 */
function buildPlayCounts() {
  const counts = {};
  for (const m of state.matches) {
    for (const id of [...m.teamA, ...m.teamB]) {
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Kumpulan id pemain yang sedang "istirahat": mereka yang ikut bermain
 * dalam `n` match terakhir. Pemain ini diprioritaskan untuk TIDAK dipilih
 * di match berikutnya, supaya tidak langsung main lagi berturut-turut.
 */
function buildRestingPlayers(n) {
  const resting = new Set();
  const recent = state.matches.slice(-n);
  for (const m of recent) {
    for (const id of [...m.teamA, ...m.teamB]) resting.add(id);
  }
  return resting;
}

/** Pilih satu nama lapangan secara acak, atau null jika belum ada lapangan. */
function pickRandomCourt() {
  if (state.courts.length === 0) return null;
  return shuffle(state.courts)[0].name;
}

/* ---------------- Rendering: Players ---------------- */
function renderPlayers() {
  const grid = document.getElementById("levels-grid");
  grid.innerHTML = "";

  const playCounts = buildPlayCounts();

  for (const level of LEVELS) {
    const group = state.players.filter((p) => p.level === level);
    const col = document.createElement("div");
    col.className = `level-col level-${levelClass(level)}`;

    col.innerHTML = `
      <div class="level-col-head">
        <span>${level}</span>
        <span class="count">${group.length}</span>
      </div>
      <ul></ul>
    `;
    const ul = col.querySelector("ul");

    if (group.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Belum ada pemain";
      ul.appendChild(li);
    } else {
      for (const p of group) {
        const li = document.createElement("li");

        const name = document.createElement("span");
        name.className = "player-name";
        name.textContent = p.name;

        const plays = playCounts[p.id] || 0;
        const count = document.createElement("span");
        count.className = "play-count";
        count.title = `Sudah main ${plays} kali`;
        count.textContent = `🏸 ${plays}×`;

        const btn = document.createElement("button");
        btn.className = "remove-player";
        btn.title = "Hapus pemain";
        btn.textContent = "✕";
        btn.addEventListener("click", () => removePlayer(p.id));

        const right = document.createElement("span");
        right.className = "player-meta";
        right.appendChild(count);
        right.appendChild(btn);

        li.appendChild(name);
        li.appendChild(right);
        ul.appendChild(li);
      }
    }
    grid.appendChild(col);
  }

  document.getElementById("player-count").textContent =
    `${state.players.length} pemain`;

  renderManualSelects(); // jaga dropdown match manual tetap sinkron
}

/* ---------------- Rendering: Matches ---------------- */
function teamCellHtml(ids) {
  return ids
    .map((id) => {
      const p = playerById(id);
      const name = p ? p.name : "(dihapus)";
      const lvl = p ? p.level : "";
      const cls = p ? levelClass(p.level) : "";
      return `<span><strong>${escapeHtml(name)}</strong> <small class="badge badge-${cls}">${lvl}</small></span>`;
    })
    .join("");
}

function renderMatches() {
  const tbody = document.getElementById("match-tbody");
  tbody.innerHTML = "";

  if (state.matches.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Belum ada match tercatat</td></tr>`;
  } else {
    state.matches.forEach((m, idx) => {
      const tr = document.createElement("tr");
      const courtHtml = m.court
        ? `<span class="court-tag">${escapeHtml(m.court)}</span>`
        : `<span class="court-tag" style="opacity:.5;border-style:dashed">-</span>`;
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${courtHtml}</td>
        <td class="team-cell">${teamCellHtml(m.teamA)}</td>
        <td class="team-cell">${teamCellHtml(m.teamB)}</td>
        <td>${m.time}</td>
        <td>
          <button class="copy-match" data-id="${m.id}">Copy</button>
          <button class="delete-match" data-id="${m.id}">Hapus</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".delete-match").forEach((btn) => {
      btn.addEventListener("click", () => deleteMatch(btn.dataset.id));
    });
    tbody.querySelectorAll(".copy-match").forEach((btn) => {
      btn.addEventListener("click", () => copyMatch(btn.dataset.id, btn));
    });
  }

  document.getElementById("match-count").textContent =
    `${state.matches.length} match`;
}

/** Teks match untuk disalin: hanya lapangan + nama pemain, tanpa level. */
function matchCopyText(m) {
  const names = (ids) =>
    ids.map((id) => (playerById(id) ? playerById(id).name : "(dihapus)")).join(" & ");
  const lines = [];
  if (m.court) lines.push(m.court);
  lines.push(names(m.teamA));
  lines.push("vs");
  lines.push(names(m.teamB));
  return lines.join("\n");
}

/** Salin teks match ke clipboard, dengan fallback bila clipboard API tak ada. */
function copyMatch(id, btn) {
  const m = state.matches.find((x) => x.id === id);
  if (!m) return;
  const text = matchCopyText(m);

  const markCopied = () => {
    const old = btn.textContent;
    btn.textContent = "Tersalin ✓";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = old;
      btn.classList.remove("copied");
    }, 1500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(markCopied).catch(() => fallbackCopy(text, markCopied));
  } else {
    fallbackCopy(text, markCopied);
  }
}

function fallbackCopy(text, onDone) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    if (onDone) onDone();
  } catch (e) {
    alert("Gagal menyalin otomatis. Teks:\n\n" + text);
  }
  document.body.removeChild(ta);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------------- Actions: Players ---------------- */
function addPlayer(name, level) {
  name = name.trim();
  const msg = document.getElementById("form-message");

  if (!name) {
    showMsg(msg, "Nama tidak boleh kosong.", "error");
    return false;
  }
  const exists = state.players.some(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) {
    showMsg(msg, `Pemain "${name}" sudah ada.`, "error");
    return false;
  }

  state.players.push({ id: uid(), name, level });
  save();
  renderPlayers();
  showMsg(msg, `"${name}" ditambahkan ke level ${level}.`, "success");
  return true;
}

function removePlayer(id) {
  const p = playerById(id);
  if (!p) return;
  if (!confirm(`Hapus pemain "${p.name}"?`)) return;
  state.players = state.players.filter((x) => x.id !== id);
  save();
  renderPlayers();
}

/* ---------------- Actions: Courts (Lapangan) ---------------- */
function renderCourts() {
  const ul = document.getElementById("court-list");
  ul.innerHTML = "";

  if (state.courts.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Belum ada lapangan. Match akan tampil tanpa lapangan.";
    ul.appendChild(li);
  } else {
    for (const c of state.courts) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = c.name;
      const btn = document.createElement("button");
      btn.className = "remove-court";
      btn.title = "Hapus lapangan";
      btn.textContent = "✕";
      btn.addEventListener("click", () => removeCourt(c.id));
      li.appendChild(name);
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }

  document.getElementById("court-count").textContent =
    `${state.courts.length} lapangan`;
}

function addCourt(name) {
  name = name.trim();
  const msg = document.getElementById("court-message");
  if (!name) {
    showMsg(msg, "Nama lapangan tidak boleh kosong.", "error");
    return false;
  }
  if (state.courts.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    showMsg(msg, `Lapangan "${name}" sudah ada.`, "error");
    return false;
  }
  state.courts.push({ id: uid(), name });
  save();
  renderCourts();
  showMsg(msg, `Lapangan "${name}" ditambahkan.`, "success");
  return true;
}

function removeCourt(id) {
  const c = state.courts.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Hapus lapangan "${c.name}"?`)) return;
  state.courts = state.courts.filter((x) => x.id !== id);
  save();
  renderCourts();
}

/* ---------------- Random Match Logic ---------------- */

/** Total poin satu tim (array 2 pemain) berdasarkan level. */
function teamPoints(team) {
  return team.reduce((sum, p) => sum + (LEVEL_POINTS[p.level] || 0), 0);
}

/** Tim seimbang jika total poin kedua tim sama. */
function isBalanced(teamA, teamB) {
  return teamPoints(teamA) === teamPoints(teamB);
}

/**
 * Kumpulkan kandidat match (2v2) dari sebuah kolam pemain, dengan filter
 * sesuai bendera aturan. Setiap kombinasi 4 pemain dibagi 3 cara jadi 2 pasang.
 *
 * @param {Player[]} pool  kolam pemain yang boleh dipilih
 * @param {Set<string>} past  pasangan partner yang sudah pernah terjadi
 * @param {{balanced:boolean, noRepeatPartner:boolean}} rules
 * @returns {Array<{teamA:Player[], teamB:Player[], balanced:boolean, repeated:boolean}>}
 */
function collectCandidates(pool, past, rules) {
  const out = [];
  if (pool.length < 4) return out;

  for (const four of combinations(pool, 4)) {
    for (const [teamA, teamB] of teamSplits(four)) {
      const balanced = isBalanced(teamA, teamB);
      if (rules.balanced && !balanced) continue;

      const repeated =
        past.has(pairKey(teamA[0].id, teamA[1].id)) ||
        past.has(pairKey(teamB[0].id, teamB[1].id));
      if (rules.noRepeatPartner && repeated) continue;

      out.push({ teamA, teamB, balanced, repeated });
    }
  }
  return out;
}

/**
 * Membentuk 1 match 2v2 dengan pelonggaran aturan bertahap.
 *
 * Keseimbangan dinilai dari TOTAL POIN tim (Beginner=1, Beginner Plus=2,
 * Intermediate=3). Dua tim seimbang jika total poinnya sama. Contoh:
 * (BeginnerPlus+BeginnerPlus = 4) lawan (Intermediate+Beginner = 4).
 *
 * Urutan percobaan (berhenti pada yang pertama berhasil):
 *   1. Ideal     : fairness + seimbang + tanpa partner berulang
 *   2. Longgar keseimbangan : fairness + tanpa partner berulang (poin boleh beda)
 *   3. Longgar partner      : fairness (boleh partner berulang)
 *   4. Longgar fairness      : dari semua pemain (abaikan giliran)
 * Aturan kembali ketat sendirinya saat kondisi memungkinkan di acakan berikutnya.
 *
 * @returns {{teamA:Player[], teamB:Player[], note?:string, relaxed?:string[]} | {error:string}}
 */
function generateMatch() {
  if (state.players.length < 4) {
    return { error: "Butuh minimal 4 pemain untuk membuat match." };
  }

  const past = buildPastPartners();
  const resting = buildRestingPlayers(REST_MATCHES);

  // Coba dulu dengan aturan istirahat (pemain yang baru main dikecualikan).
  // Jika tidak cukup pemain untuk membentuk match, ulangi TANPA aturan
  // istirahat supaya match tetap bisa dibuat.
  let result = searchMatch(past, resting);
  if (result) return result;

  result = searchMatch(past, new Set());
  if (result) {
    if (result.relaxed.indexOf("istirahat pemain") === -1) {
      result.relaxed = ["istirahat pemain", ...result.relaxed];
    }
    return result;
  }

  return {
    error:
      "Tidak ada kombinasi 4 pemain yang bisa dibentuk sama sekali. " +
      "Pastikan ada minimal 4 pemain terdaftar.",
  };
}

/**
 * Jalankan pencarian match bertahap pada kumpulan pemain yang BUKAN sedang
 * istirahat (resting dikecualikan). Mengembalikan objek match atau null.
 */
function searchMatch(past, resting) {
  const available = state.players.filter((p) => !resting.has(p.id));
  if (available.length < 4) return null;

  const playCounts = buildPlayCounts();
  const minPlays = Math.min(...available.map((p) => playCounts[p.id] || 0));
  const eligible = available.filter(
    (p) => (playCounts[p.id] || 0) === minPlays
  );

  const stages = [
    { pool: eligible, rules: { balanced: true, noRepeatPartner: true }, relaxed: [] },
    { pool: eligible, rules: { balanced: false, noRepeatPartner: true }, relaxed: ["keseimbangan level"] },
    { pool: eligible, rules: { balanced: false, noRepeatPartner: false }, relaxed: ["keseimbangan level", "tanpa partner berulang"] },
    { pool: available, rules: { balanced: false, noRepeatPartner: false }, relaxed: ["keseimbangan level", "tanpa partner berulang", "pemerataan giliran"] },
  ];

  for (const stage of stages) {
    const candidates = collectCandidates(stage.pool, past, stage.rules);
    if (candidates.length === 0) continue;

    const best = pickBestCandidate(candidates);
    return {
      teamA: best.teamA,
      teamB: best.teamB,
      note: best.balanced ? "seimbang" : "tidak-seimbang",
      relaxed: stage.relaxed.slice(),
    };
  }
  return null;
}

/**
 * Pilih kandidat terbaik secara acak: utamakan yang seimbang DAN tanpa partner
 * berulang; jika tak ada, utamakan salah satunya; terakhir baru sisanya.
 */
function pickBestCandidate(candidates) {
  const tiers = [
    candidates.filter((c) => c.balanced && !c.repeated),
    candidates.filter((c) => c.balanced && c.repeated),
    candidates.filter((c) => !c.balanced && !c.repeated),
    candidates.filter((c) => !c.balanced && c.repeated),
  ];
  for (const tier of tiers) {
    if (tier.length > 0) return shuffle(tier)[0];
  }
  return shuffle(candidates)[0];
}

/** Semua kombinasi ukuran k dari array (untuk fallback, k kecil). */
function combinations(arr, k) {
  const res = [];
  const combo = [];
  (function rec(start) {
    if (combo.length === k) {
      res.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      rec(i + 1);
      combo.pop();
    }
  })(0);
  return res;
}

/** 3 cara membagi 4 pemain [a,b,c,d] menjadi dua pasang. */
function teamSplits(four) {
  const [a, b, c, d] = four;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

/* ---------------- Match preview & save ---------------- */
function showPreview(match) {
  pendingMatch = {
    teamA: match.teamA,
    teamB: match.teamB,
    court: pickRandomCourt(), // lapangan acak untuk match ini
  };

  const fill = (ulId, team) => {
    const ul = document.getElementById(ulId);
    ul.innerHTML = "";
    for (const p of team) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(p.name)}</span>
        <span class="badge badge-${levelClass(p.level)}">${p.level}</span>`;
      ul.appendChild(li);
    }
  };
  fill("team-a-list", match.teamA);
  fill("team-b-list", match.teamB);

  // Tampilkan total poin tiap tim + lapangan di judulnya.
  const courtLabel = pendingMatch.court ? ` — ${pendingMatch.court}` : "";
  document.querySelector("#match-preview .team-a h3").textContent =
    `Tim A (${teamPoints(match.teamA)} poin)${courtLabel}`;
  document.querySelector("#match-preview .team-b h3").textContent =
    `Tim B (${teamPoints(match.teamB)} poin)`;

  document.getElementById("match-preview").classList.remove("hidden");
  document.getElementById("match-confirm").classList.remove("hidden");
}

function hidePreview() {
  pendingMatch = null;
  document.getElementById("match-preview").classList.add("hidden");
  document.getElementById("match-confirm").classList.add("hidden");
}

function doRandom() {
  const msg = document.getElementById("random-message");
  if (state.players.length < 4) {
    showMsg(msg, "Butuh minimal 4 pemain untuk membuat match.", "error");
    hidePreview();
    return;
  }
  const result = generateMatch();
  if (result.error) {
    showMsg(msg, result.error, "error");
    hidePreview();
    return;
  }
  // Susun pesan: status keseimbangan + aturan apa saja yang terpaksa dilonggarkan.
  let text = "Match diacak. ";
  text += result.note === "seimbang" ? "Tim seimbang (poin sama)." : "Tim TIDAK seimbang (poin beda).";
  if (result.relaxed && result.relaxed.length > 0) {
    text += ` Aturan dilonggarkan sementara: ${result.relaxed.join(", ")}.`;
  }
  text += " Periksa lalu simpan.";

  // Jika ada pelonggaran, pakai gaya peringatan agar lebih kelihatan.
  const style = result.relaxed && result.relaxed.length > 0 ? "error" : "success";
  showMsg(msg, text, style);
  showPreview(result);
}

/** Simpan satu match (array id) ke tabel + perbarui tampilan. */
function commitMatch(teamAIds, teamBIds, court) {
  const now = new Date();
  const time = now.toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  state.matches.push({
    id: uid(),
    teamA: teamAIds,
    teamB: teamBIds,
    court: court || null,
    time,
  });
  save();
  renderMatches();
  renderPlayers(); // perbarui hitungan "sudah berapa kali main"
}

function saveMatch() {
  if (!pendingMatch) return;
  commitMatch(
    pendingMatch.teamA.map((p) => p.id),
    pendingMatch.teamB.map((p) => p.id),
    pendingMatch.court
  );
  hidePreview();
  showMsg(
    document.getElementById("random-message"),
    "Match tersimpan ke tabel.",
    "success"
  );
}

/* ---------------- Add Match Manual ---------------- */
const MANUAL_SLOTS = ["manual-a1", "manual-a2", "manual-b1", "manual-b2"];

/** Isi keempat dropdown manual dengan pemain terdaftar (pilihan dipertahankan). */
function renderManualSelects() {
  const sorted = state.players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "id"));

  for (const slotId of MANUAL_SLOTS) {
    const sel = document.getElementById(slotId);
    if (!sel) continue;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— pilih pemain —</option>';
    for (const p of sorted) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.level})`;
      sel.appendChild(opt);
    }
    // Pertahankan pilihan sebelumnya jika pemainnya masih ada.
    if (prev && sorted.some((p) => p.id === prev)) sel.value = prev;
  }
}

function clearManualSelects() {
  for (const slotId of MANUAL_SLOTS) {
    const sel = document.getElementById(slotId);
    if (sel) sel.value = "";
  }
}

function addManualMatch() {
  const msg = document.getElementById("manual-message");
  const ids = MANUAL_SLOTS.map((id) => document.getElementById(id).value);

  // Semua slot harus terisi.
  if (ids.some((v) => !v)) {
    showMsg(msg, "Pilih keempat pemain terlebih dulu.", "error");
    return;
  }
  // Tidak boleh ada pemain yang sama dipilih lebih dari sekali.
  if (new Set(ids).size !== 4) {
    showMsg(msg, "Setiap pemain hanya boleh dipilih sekali. Ada nama yang terduplikat.", "error");
    return;
  }

  const teamA = [ids[0], ids[1]];
  const teamB = [ids[2], ids[3]];

  // Peringatan (bukan blokir) jika pasangan sudah pernah terjadi.
  const past = buildPastPartners();
  const dupPairs = [];
  if (past.has(pairKey(teamA[0], teamA[1]))) {
    dupPairs.push(`${playerById(teamA[0]).name} & ${playerById(teamA[1]).name}`);
  }
  if (past.has(pairKey(teamB[0], teamB[1]))) {
    dupPairs.push(`${playerById(teamB[0]).name} & ${playerById(teamB[1]).name}`);
  }
  if (dupPairs.length > 0) {
    const ok = confirm(
      "Pasangan berikut sudah pernah satu tim sebelumnya:\n- " +
        dupPairs.join("\n- ") +
        "\n\nTetap tambahkan match manual ini?"
    );
    if (!ok) return;
  }

  commitMatch(teamA, teamB, pickRandomCourt());
  clearManualSelects();
  showMsg(msg, "Match manual ditambahkan ke tabel.", "success");
}

function deleteMatch(id) {
  if (!confirm("Hapus match ini? Pasangan partner-nya akan bisa diacak lagi.")) return;
  state.matches = state.matches.filter((m) => m.id !== id);
  save();
  renderMatches();
  renderPlayers(); // hitungan main ikut berkurang
}

/* ---------------- UI utils ---------------- */
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "form-message " + (type || "");
}

/* ---------------- Reset ---------------- */
function resetMatches() {
  if (!confirm("Hapus SEMUA match? Pemain tetap tersimpan.")) return;
  state.matches = [];
  save();
  renderMatches();
  renderPlayers(); // reset hitungan main ke 0
  hidePreview();
}

function resetAll() {
  if (!confirm("Hapus SEMUA data (pemain + match + lapangan)? Tindakan ini tidak bisa dibatalkan.")) return;
  state = { players: [], matches: [], courts: [] };
  save();
  renderPlayers();
  renderMatches();
  renderCourts();
  hidePreview();
}

/* ---------------- Init ---------------- */
function init() {
  load();
  renderPlayers();
  renderMatches();
  renderCourts();

  document.getElementById("player-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("player-name");
    const levelInput = document.getElementById("player-level");
    if (addPlayer(nameInput.value, levelInput.value)) {
      nameInput.value = "";
      nameInput.focus();
    }
  });

  document.getElementById("court-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("court-name");
    if (addCourt(input.value)) {
      input.value = "";
      input.focus();
    }
  });

  document.getElementById("random-btn").addEventListener("click", doRandom);
  document.getElementById("reroll-btn").addEventListener("click", doRandom);
  document.getElementById("save-match-btn").addEventListener("click", saveMatch);
  document.getElementById("reset-matches-btn").addEventListener("click", resetMatches);
  document.getElementById("reset-all-btn").addEventListener("click", resetAll);

  document.getElementById("manual-add-btn").addEventListener("click", addManualMatch);
  document.getElementById("manual-clear-btn").addEventListener("click", () => {
    clearManualSelects();
    showMsg(document.getElementById("manual-message"), "", "");
  });
}

document.addEventListener("DOMContentLoaded", init);
