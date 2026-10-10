// review/subtitles.html client. Edits stay in this browser (localStorage) until
// exported and imported with `npm run subtitles -- import`.
(function () {
  "use strict";
  const DATA = JSON.parse(document.getElementById("data").textContent);
  const $ = (id) => document.getElementById(id);
  const video = $("video");
  const overlay = $("overlay");
  const subEl = $("sub");
  const STORE = "talk-subtitle-subs:" + DATA.project + ":" + DATA.draftFingerprint;

  // state: id → { text?, deleted?, ok? } (starts from input/subtitles.json)
  let state = {};
  for (const c of DATA.cues) if (c.edit) state[c.id] = Object.assign({}, c.edit);
  try {
    const saved = localStorage.getItem(STORE);
    if (saved) {
      state = JSON.parse(saved);
      $("restored").hidden = false;
    }
  } catch (e) { /* storage unavailable: start from the file */ }
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  };

  const fmt = (t) => {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
  };
  const width = (s) => {
    let w = 0;
    for (const ch of s) w += /[ -~｡-ﾟ]/.test(ch) ? 0.5 : 1;
    return w;
  };
  const textOf = (c) => (state[c.id] && state[c.id].text !== undefined ? state[c.id].text : c.draftText);
  const isDeleted = (c) => !!(state[c.id] && state[c.id].deleted);
  const isEdited = (c) => !!(state[c.id] && state[c.id].text !== undefined && state[c.id].text !== c.draftText);
  const isOk = (c) => !!(state[c.id] && (state[c.id].ok || isEdited(c)));
  const needsLook = (c) => c.review && !isOk(c) && !isDeleted(c);

  // ---- video + overlay in the preset's style ----
  video.src = DATA.videoSrc;
  video.addEventListener("error", () => { $("video-error").textContent = "動画を読み込めません: " + DATA.videoSrc + "（このページは案件フォルダの review/ に置いたまま開いてください）"; });
  const P = DATA.preset;
  function layoutOverlay() {
    const r = video.getBoundingClientRect();
    const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    // The picture inside the element (letterboxed when the aspect differs).
    const scale = Math.min(r.width / vw, r.height / vh);
    const w = vw * scale, h = vh * scale;
    const top = (r.height - h) / 2;
    const short = Math.min(w, h);
    const size = short * P.font.sizeRatio;
    subEl.style.fontFamily = '"' + P.font.family + '", "Yu Gothic UI", "Meiryo", sans-serif';
    subEl.style.fontWeight = P.font.weight;
    subEl.style.fontSize = size + "px";
    subEl.style.lineHeight = P.font.lineHeight;
    subEl.style.letterSpacing = P.font.letterSpacingEm + "em";
    subEl.style.color = P.color;
    subEl.style.maxWidth = w * P.position.maxWidthRatio + "px";
    if (P.stroke.enabled) subEl.style.webkitTextStroke = size * P.stroke.widthRatio + "px " + P.stroke.color;
    subEl.style.paintOrder = "stroke fill";
    if (P.shadow.enabled) subEl.style.textShadow = "0 0 " + P.shadow.blurEm + "em rgba(0,0,0," + P.shadow.opacity + ")";
    if (P.background.enabled) {
      subEl.style.background = P.background.color;
      subEl.style.padding = P.background.paddingEm[0] + "em " + P.background.paddingEm[1] + "em";
      subEl.style.borderRadius = P.background.radiusEm + "em";
    }
    const margin = h * P.position.marginRatio;
    if (P.position.anchor === "top") { overlay.style.top = top + margin + "px"; overlay.style.bottom = ""; }
    else { overlay.style.bottom = (r.height - top - h) + margin + "px"; overlay.style.top = ""; }
  }
  window.addEventListener("resize", layoutOverlay);
  video.addEventListener("loadedmetadata", layoutOverlay);

  let activeId = null;
  let stopAt = null;
  function tick() {
    const t = video.currentTime;
    $("time").textContent = fmt(t);
    const c = DATA.cues.find((x) => t >= x.start && t < x.end && !isDeleted(x));
    subEl.textContent = c ? textOf(c) : "";
    subEl.style.visibility = c ? "visible" : "hidden";
    const id = c ? c.id : null;
    if (id !== activeId) {
      const prev = activeId && document.querySelector('[data-id="' + activeId + '"]');
      if (prev) prev.classList.remove("active");
      const el = id && document.querySelector('[data-id="' + id + '"]');
      if (el) {
        el.classList.add("active");
        if ($("follow").checked && !video.paused) el.scrollIntoView({ block: "nearest" });
      }
      activeId = id;
    }
    if (stopAt !== null && t >= stopAt) { video.pause(); stopAt = null; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  $("rate").addEventListener("change", (e) => { video.playbackRate = Number(e.target.value); });

  // ---- list ----
  function summary() {
    const live = DATA.cues.filter((c) => !isDeleted(c));
    const look = DATA.cues.filter(needsLook).length;
    $("summary").textContent =
      "字幕 " + live.length + " 件（削除 " + (DATA.cues.length - live.length) + "）／要確認 " + DATA.cues.filter((c) => c.review).length +
      " 件のうち未確認 " + look + " 件／編集 " + DATA.cues.filter(isEdited).length + " 件";
  }

  function card(c) {
    const el = document.createElement("div");
    el.dataset.id = c.id;
    const head = document.createElement("div");
    head.className = "head";
    const id = document.createElement("span"); id.className = "id"; id.textContent = c.id;
    const tm = document.createElement("span"); tm.className = "time"; tm.textContent = fmt(c.start) + " – " + fmt(c.end);
    head.append(id, tm);
    const badges = document.createElement("span");
    head.append(badges);
    const ta = document.createElement("textarea");
    ta.rows = Math.max(1, textOf(c).split("\n").length);
    ta.value = textOf(c);
    const w = document.createElement("div"); w.className = "width";
    const heard = document.createElement("div"); heard.className = "heard"; heard.textContent = "文字起こし: " + c.heard;
    const flags = document.createElement("ul"); flags.className = "flags";
    for (const f of c.flags) {
      const li = document.createElement("li");
      li.textContent = f.note;
      if (f.review) li.className = "rv";
      flags.append(li);
    }
    if (c.fillersRemoved) {
      const li = document.createElement("li");
      li.textContent = "字幕から外したフィラー: " + c.fillersRemoved.join("、");
      flags.append(li);
    }
    const act = document.createElement("div"); act.className = "actions";
    const btn = (label, fn) => { const b = document.createElement("button"); b.className = "btn"; b.textContent = label; b.addEventListener("click", fn); act.append(b); return b; };
    btn("▶ 再生", () => { video.currentTime = Math.max(0, c.start - 0.3); stopAt = c.end + 0.2; video.play(); });
    const okBtn = btn("確認OK", () => { const s = state[c.id] || (state[c.id] = {}); if (s.ok) delete s.ok; else s.ok = true; tidy(c); });
    const delBtn = btn("削除", () => { const s = state[c.id] || (state[c.id] = {}); if (s.deleted) delete s.deleted; else s.deleted = true; tidy(c); });
    btn("元の案に戻す", () => { delete state[c.id]; ta.value = c.draftText; tidy(c); });
    ta.addEventListener("input", () => {
      const s = state[c.id] || (state[c.id] = {});
      if (ta.value === c.draftText) delete s.text; else s.text = ta.value;
      tidy(c, true);
    });
    function paint() {
      el.className = "card" + (isDeleted(c) ? " c-deleted" : needsLook(c) ? " c-review" : " c-ok") + (activeId === c.id ? " active" : "");
      badges.innerHTML = "";
      const add = (cls, label) => { const b = document.createElement("span"); b.className = "badge " + cls; b.textContent = label; badges.append(b); };
      if (needsLook(c)) add("review", "要確認");
      else if (c.review && !isDeleted(c)) add("ok", "確認済み");
      if (c.flags.some((f) => f.kind === "quote" || f.kind === "quote-review")) add("quote", "元投稿");
      if (c.flags.some((f) => f.kind === "term")) add("", "固有名詞");
      if (isEdited(c)) add("", "編集済み");
      if (isDeleted(c)) add("cut", "削除");
      ta.classList.toggle("edited", isEdited(c));
      okBtn.textContent = state[c.id] && state[c.id].ok ? "確認OKを外す" : "確認OK";
      delBtn.textContent = isDeleted(c) ? "削除を取り消す" : "削除";
      const lines = textOf(c).split("\n");
      const over = lines.length > DATA.maxLines || lines.some((l) => width(l) > DATA.maxChars);
      w.textContent = lines.map((l) => width(l)).join(" / ") + " 文字（1行 " + DATA.maxChars + " 文字・" + DATA.maxLines + " 行まで）";
      w.classList.toggle("over", over);
    }
    el._paint = paint;
    paint();
    el.append(head, ta, w, heard, flags, act);
    return el;
  }

  function tidy(c, keepFocus) {
    const s = state[c.id];
    if (s && !Object.keys(s).length) delete state[c.id];
    save();
    const el = document.querySelector('[data-id="' + c.id + '"]');
    if (el) el._paint();
    summary();
    if (!keepFocus) applyFilter();
  }

  const list = $("cue-list");
  for (const c of DATA.cues) list.append(card(c));
  function applyFilter() {
    const f = $("filter").value;
    for (const c of DATA.cues) {
      const el = document.querySelector('[data-id="' + c.id + '"]');
      const show = f === "all" || (f === "review" && needsLook(c)) || (f === "flagged" && c.review) ||
        (f === "quote" && c.flags.some((x) => x.kind === "quote" || x.kind === "quote-review")) || (f === "edited" && (isEdited(c) || isDeleted(c)));
      el.hidden = !show;
    }
  }
  $("filter").addEventListener("change", applyFilter);
  if (DATA.cues.some(needsLook)) $("filter").value = "review";
  applyFilter();
  summary();

  const dl = $("dropped");
  for (const d of DATA.dropped) {
    const li = document.createElement("li");
    li.textContent = "元 " + fmt(d.srcStart) + "「" + d.text + "」 " + (d.reason === "cut" ? "カット範囲" : "フィラー（字幕から外す）");
    dl.append(li);
  }

  // ---- export ----
  function exportJson() {
    return JSON.stringify({ kind: "talk-subtitle-subtitles-export", project: DATA.project, draftFingerprint: DATA.draftFingerprint, exportedAt: new Date().toISOString(), edits: state }, null, 2);
  }
  const fileName = "subtitles-export-" + DATA.project + ".json";
  $("import-cmd").textContent = DATA.importCommand.replace("<file>", "<ダウンロードした " + fileName + " のパス>");
  $("export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("copy").addEventListener("click", () => {
    navigator.clipboard.writeText(exportJson()).then(() => { $("copy").textContent = "コピーしました"; }, () => { $("copy").textContent = "コピーできませんでした"; });
  });
  $("reset-draft").addEventListener("click", () => {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
    location.reload();
  });
})();
