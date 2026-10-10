// review.html client. Data comes from <script id="data">. Nothing here
// writes to the project: decisions are exported as JSON and imported with
// `npm run decide -- --import=<file>`.
(() => {
  const DATA = JSON.parse(document.getElementById("data").textContent);
  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  };
  const fmt = (s) => {
    if (!Number.isFinite(s)) return "--:--.--";
    const m = Math.floor(s / 60);
    return String(m).padStart(2, "0") + ":" + (s - m * 60).toFixed(2).padStart(5, "0");
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ------------------------------------------------------------ state
  const storeKey = "talk-subtitle-review:" + DATA.project + ":" + DATA.cuts.fingerprint + ":" + (DATA.terms ? DATA.terms.fingerprint : "-");
  const fromFile = { cuts: clone(DATA.decisions.cuts), terms: clone(DATA.decisions.terms) };
  let state = clone(fromFile);
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (saved && saved.cuts && saved.terms && JSON.stringify(saved) !== JSON.stringify(fromFile)) {
      state = saved;
      restored = true;
    }
  } catch (_) { /* storage unavailable: start from the file */ }
  const persist = () => {
    try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (_) { /* ignore */ }
  };

  const cutRange = (c) => {
    const d = state.cuts[c.id];
    return { start: d && d.start !== undefined ? d.start : c.start, end: d && d.end !== undefined ? d.end : c.end };
  };
  const activeCuts = () =>
    DATA.cuts.items.filter((c) => state.cuts[c.id] && state.cuts[c.id].decision === "cut").map(cutRange).sort((a, b) => a.start - b.start);

  // ------------------------------------------------------------ player
  const video = $("#video");
  video.src = DATA.videoSrc;
  const timeEl = $("#time");
  const previewBox = $("#preview-cuts");
  let stopAt = null;
  let skipRanges = null; // ranges to skip during a one-off preview
  video.addEventListener("error", () => {
    $("#video-error").textContent =
      "動画を再生できません（" + DATA.videoSrc + "）。元動画を移動していないか確認し、必要なら npm run analyze をやり直してください。";
  });

  // requestAnimationFrame stops while the tab is in the background, so the
  // skip / stop checks also run on timeupdate (coarser, but never stalls).
  const check = () => {
    const t = video.currentTime;
    timeEl.textContent = fmt(t) + " / " + fmt(video.duration);
    const ranges = skipRanges || (previewBox.checked ? activeCuts() : []);
    if (!video.paused) {
      for (const r of ranges) {
        if (t >= r.start && t < r.end - 0.02) {
          video.currentTime = r.end;
          break;
        }
      }
      if (stopAt !== null && t >= stopAt) {
        video.pause();
        stopAt = null;
        skipRanges = null;
      }
    }
    highlightSegment(t);
  };
  video.addEventListener("timeupdate", check);
  const tick = () => {
    check();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const playRange = (start, end, skip) => {
    video.currentTime = Math.max(0, start);
    stopAt = end;
    skipRanges = skip || null;
    video.play();
  };
  $("#rate").addEventListener("change", (e) => { video.playbackRate = Number(e.target.value); });

  // ------------------------------------------------------------ tabs
  const tabs = [...document.querySelectorAll(".tabs button")];
  tabs.forEach((b) =>
    b.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.toggle("on", x === b));
      document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== b.dataset.tab));
    }),
  );

  // ------------------------------------------------------------ cut candidates
  const cutList = $("#cut-list");
  const filterSel = $("#cut-filter");
  const kindSel = $("#cut-kind");
  for (const [k, label] of Object.entries(DATA.cuts.kindLabels)) {
    if (DATA.cuts.items.some((c) => c.kind === k)) kindSel.append(h("option", { value: k }, label));
  }

  const decisionOf = (c) => (state.cuts[c.id] ? state.cuts[c.id].decision : "pending");
  const setCut = (id, decision) => {
    if (decision === "pending") delete state.cuts[id];
    else state.cuts[id] = Object.assign({}, state.cuts[id], { decision });
    persist();
    render();
  };

  function cutCard(c) {
    const dec = decisionOf(c);
    const r = cutRange(c);
    const adjusted = state.cuts[c.id] && state.cuts[c.id].start !== undefined;
    const startIn = h("input", { type: "number", step: "0.01", min: "0", value: r.start.toFixed(2) });
    const endIn = h("input", { type: "number", step: "0.01", min: "0", value: r.end.toFixed(2) });
    const applyRange = () => {
      const s = Number(startIn.value);
      const e = Number(endIn.value);
      if (!(s >= 0 && e > s)) {
        alertBox("開始は0以上、終了は開始より後にしてください。");
        return;
      }
      state.cuts[c.id] = Object.assign({ decision: "cut" }, state.cuts[c.id], { start: Math.round(s * 1000) / 1000, end: Math.round(e * 1000) / 1000 });
      persist();
      render();
    };
    const btn = (label, d) => h("button", { class: "btn" + (dec === d ? " sel-" + d : ""), onclick: () => setCut(c.id, d) }, label);
    return h(
      "div",
      { class: "card d-" + dec, id: "card-" + c.id },
      h(
        "div",
        { class: "head" },
        h("span", { class: "id" }, c.id),
        h("span", {}, DATA.cuts.kindLabels[c.kind]),
        h("span", { class: "time" }, fmt(r.start) + " – " + fmt(r.end)),
        h("span", { class: "hint" }, (r.end - r.start).toFixed(2) + "秒"),
        h("span", { class: "badge " + c.suggestion }, c.suggestion === "cut" ? "カット提案" : "確認のみ"),
        h("span", { class: "hint" }, "確度 " + c.confidence.toFixed(2)),
        adjusted ? h("span", { class: "badge" }, "範囲を調整済み") : null,
        c.round && c.round > 1 ? h("span", { class: "badge review" }, "追加候補") : null,
      ),
      h("div", { class: "reason" }, c.reason),
      h("div", { class: "ctx" }, c.context.before, " ", h("mark", {}, c.text || "（無音／文字なし）"), " ", c.context.after),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn", onclick: () => playRange(r.start, r.end) }, "▶ 区間だけ再生"),
        h("button", { class: "btn", onclick: () => playRange(r.start - 2, r.end + 2) }, "▶ 前後を再生"),
        h("button", { class: "btn", onclick: () => playRange(r.start - 3, r.end + 3, [r]) }, "▶ カット後を確認"),
        btn("カット", "cut"),
        btn("残す", "keep"),
        btn("未決定", "pending"),
      ),
      h(
        "div",
        { class: "actions" },
        h("span", { class: "hint" }, "範囲"),
        startIn,
        h("button", { class: "btn", onclick: () => { startIn.value = video.currentTime.toFixed(2); } }, "現在位置→開始"),
        endIn,
        h("button", { class: "btn", onclick: () => { endIn.value = video.currentTime.toFixed(2); } }, "現在位置→終了"),
        h("button", { class: "btn", onclick: applyRange }, "範囲を反映"),
        adjusted
          ? h("button", { class: "btn", onclick: () => { delete state.cuts[c.id].start; delete state.cuts[c.id].end; persist(); render(); } }, "元の範囲に戻す")
          : null,
      ),
    );
  }

  function renderCuts() {
    const f = filterSel.value;
    const k = kindSel.value;
    const items = DATA.cuts.items.filter((c) => (f === "all" || decisionOf(c) === f || (f === "suggest-cut" && c.suggestion === "cut")) && (k === "all" || c.kind === k));
    cutList.replaceChildren(...(items.length ? items.map(cutCard) : [h("div", { class: "empty" }, "該当する候補はありません。")]));
  }
  // Open on the undecided items while any remain.
  if (DATA.cuts.items.some((c) => !state.cuts[c.id])) filterSel.value = "pending";
  filterSel.addEventListener("change", renderCuts);
  kindSel.addEventListener("change", renderCuts);
  $("#bulk-cut-suggested").addEventListener("click", () => {
    for (const c of DATA.cuts.items) if (!state.cuts[c.id] && c.suggestion === "cut") state.cuts[c.id] = { decision: "cut" };
    persist();
    render();
  });
  $("#bulk-keep-rest").addEventListener("click", () => {
    for (const c of DATA.cuts.items) if (!state.cuts[c.id]) state.cuts[c.id] = { decision: "keep" };
    persist();
    render();
  });

  // ------------------------------------------------------------ terms
  const termList = $("#term-list");
  const termDecision = (t) => {
    const d = state.terms[t.id];
    return d ? d.decision : t.defaultDecision === "accept" ? "accept-default" : "pending";
  };
  function termCard(t) {
    const dec = termDecision(t);
    const d = state.terms[t.id];
    const rep = h("input", { type: "text", value: (d && d.replacement) || t.to, size: "18" });
    const set = (decision) => {
      if (decision === "pending") delete state.terms[t.id];
      else {
        const v = rep.value.trim();
        state.terms[t.id] = decision === "accept" && v && v !== t.to ? { decision, replacement: v } : { decision };
      }
      persist();
      render();
    };
    const cls = dec === "accept" || dec === "accept-default" ? "d-accept" : dec === "reject" ? "d-reject" : "d-pending";
    return h(
      "div",
      { class: "card " + cls },
      h(
        "div",
        { class: "head" },
        h("span", { class: "id" }, t.id),
        h("span", { class: "time" }, fmt(t.start)),
        h("span", {}, "「" + t.from + "」→「" + ((d && d.replacement) || t.to) + "」"),
        h("span", { class: "badge" }, t.layer === "shared" ? "共通辞書" : "案件辞書"),
        h("span", { class: "hint" }, "確度 " + t.confidence.toFixed(2)),
        dec === "accept-default" ? h("span", { class: "badge cut" }, "初期値：採用（登録済みの誤認識）") : null,
      ),
      h("div", { class: "reason" }, t.reason),
      h("div", { class: "ctx" }, t.context.before, h("mark", {}, t.from), t.context.after),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn", onclick: () => playRange(t.start - 2, t.end + 2) }, "▶ 再生"),
        h("span", { class: "hint" }, "置き換え"),
        rep,
        h("button", { class: "btn" + (dec === "accept" ? " sel-cut" : ""), onclick: () => set("accept") }, "採用"),
        h("button", { class: "btn" + (dec === "reject" ? " sel-keep" : ""), onclick: () => set("reject") }, "不採用"),
        h("button", { class: "btn" + (dec === "pending" ? " sel-pending" : ""), onclick: () => set("pending") }, "未決定"),
      ),
    );
  }
  function renderTerms() {
    if (!DATA.terms) {
      termList.replaceChildren(h("div", { class: "empty" }, "固有名詞の補正候補はまだありません（npm run terms）。"));
      return;
    }
    const found = DATA.terms.found.length
      ? h("div", { class: "hint" }, "正しく認識されていた語：" + DATA.terms.found.map((f) => f.surface + "×" + f.count).join("、"))
      : null;
    termList.replaceChildren(
      ...[found],
      ...(DATA.terms.items.length ? DATA.terms.items.map(termCard) : [h("div", { class: "empty" }, "補正候補はありません。")]),
    );
  }

  // ------------------------------------------------------------ transcript
  const segList = $("#seg-list");
  let segEls = [];
  function renderSegments() {
    const cuts = activeCuts();
    segEls = DATA.segments.map((s) => {
      const inCut = cuts.some((r) => r.start <= s.start + 0.05 && r.end >= s.end - 0.05);
      return h(
        "div",
        { class: "seg" + (inCut ? " in-cut" : ""), onclick: () => { video.currentTime = s.start; } },
        h("span", { class: "t" }, fmt(s.start)),
        s.corrected && s.corrected !== s.text
          ? h("span", { title: "補正前：" + s.text, class: "fix" }, s.corrected)
          : h("span", {}, s.text),
      );
    });
    segList.replaceChildren(...segEls);
  }
  let lastSeg = -1;
  function highlightSegment(t) {
    const i = DATA.segments.findIndex((s) => t >= s.start && t < s.end);
    if (i === lastSeg) return;
    if (segEls[lastSeg]) segEls[lastSeg].classList.remove("now");
    if (segEls[i]) segEls[i].classList.add("now");
    lastSeg = i;
  }

  // ------------------------------------------------------------ summary / export
  function renderSummary() {
    let cut = 0, keep = 0, pending = 0;
    for (const c of DATA.cuts.items) {
      const d = decisionOf(c);
      if (d === "cut") cut++;
      else if (d === "keep") keep++;
      else pending++;
    }
    const ranges = activeCuts();
    let total = 0, s = -1, e = -1;
    for (const r of ranges) {
      if (r.start > e) { if (e > s) total += e - s; s = r.start; e = r.end; } else e = Math.max(e, r.end);
    }
    if (e > s) total += e - s;
    const tp = DATA.terms ? DATA.terms.items.filter((t) => termDecision(t) === "pending").length : 0;
    $("#summary").textContent =
      "カット候補 " + DATA.cuts.items.length + "件：カット " + cut + "／残す " + keep + "／未決定 " + pending +
      "（カット合計 " + total.toFixed(1) + "秒）　固有名詞：未決定 " + tp + "件";
  }

  function exportData() {
    const cuts = {};
    for (const [id, d] of Object.entries(state.cuts)) {
      cuts[id] = { decision: d.decision };
      if (d.start !== undefined) { cuts[id].start = d.start; cuts[id].end = d.end; }
      if (d.note) cuts[id].note = d.note;
    }
    const terms = {};
    for (const [id, d] of Object.entries(state.terms)) {
      terms[id] = { decision: d.decision };
      if (d.replacement) terms[id].replacement = d.replacement;
    }
    return {
      kind: "talk-subtitle-decisions-export",
      project: DATA.project,
      cutsFingerprint: DATA.cuts.fingerprint,
      termsFingerprint: DATA.terms ? DATA.terms.fingerprint : null,
      exportedAt: new Date().toISOString(),
      cuts,
      terms,
    };
  }
  const fileName = "decisions-export-" + DATA.project + ".json";
  $("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2) + "\n"], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
  });
  $("#copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData(), null, 2));
      alertBox("コピーしました。チャットに貼り付けても取り込めます。");
    } catch (_) {
      alertBox("コピーできませんでした。「ファイルに書き出す」を使ってください。");
    }
  });
  $("#import-cmd").textContent = DATA.decideCommand + " --import=<ダウンロードした " + fileName + " のパス>";
  $("#reset-draft").addEventListener("click", () => {
    state = clone(fromFile);
    persist();
    $("#restored").hidden = true;
    render();
  });
  if (restored) $("#restored").hidden = false;

  function alertBox(msg) {
    const el = $("#notice");
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
  }

  function render() {
    renderCuts();
    renderTerms();
    renderSegments();
    renderSummary();
  }
  render();
})();
