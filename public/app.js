(() => {
  "use strict";

  const CFG = Object.assign(
    { archiveBase: "https://archive.cfru.ca/show/name/Sound%20So%20Nice/", sheets: {}, fetchTimeoutMs: 6000 },
    window.SITE_CONFIG || {}
  );

  const DEFAULTS = {
    site_title: "Sound So Nice Radio",
    tagline: "",
    about: "",
    show_description: "",
    logo_url: "",
    default_hosts: "",
    default_in_show: "Feature, Hot In The Crates, Canadian Spotlight, DJ Mix",
    submit_text: "Are you an artist? Send us your music for a chance to be played on the show.",
    submit_email: "",
    submit_form_url: "",
    footer_text: "",
    footer_link_label: "",
    footer_link_url: "",
  };

  const $ = (id) => document.getElementById(id);

  // ---------- small helpers ----------

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  }

  // Only allow http(s) (and mailto when asked) so sheet content can't inject javascript: links.
  function safeUrl(u, { mailto = false } = {}) {
    if (!u) return "";
    try {
      const url = new URL(u, location.href);
      const ok = url.protocol === "https:" || url.protocol === "http:" || (mailto && url.protocol === "mailto:");
      return ok ? url.href : "";
    } catch (e) {
      return "";
    }
  }

  const pad = (n) => String(n).padStart(2, "0");

  function splitList(s) {
    return (s || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  }

  function isVisible(v) {
    return !/^(false|no|n|0|hide|hidden)$/i.test((v || "").trim());
  }

  // ---------- CSV ----------

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    return rows
      .slice(1)
      .filter((r) => r.some((v) => v.trim() !== ""))
      .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || "").trim()])));
  }

  // ---------- data loading ----------

  async function fetchText(url, opts = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CFG.fetchTimeoutMs);
    try {
      const res = await fetch(url, { signal: ctl.signal, ...opts });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function cacheGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function cacheSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } }

  // Order: live Google Sheet -> last good copy from this browser -> bundled /content CSV
  async function loadTable(name) {
    const url = CFG.sheets && CFG.sheets[name];
    const cacheKey = "sn:" + name;
    if (url) {
      try {
        const text = await fetchText(url, { cache: "no-cache" });
        cacheSet(cacheKey, text);
        return parseCSV(text);
      } catch (e) {
        console.warn(`Could not load "${name}" sheet, using fallback:`, e);
        const cached = cacheGet(cacheKey);
        if (cached) return parseCSV(cached);
      }
    }
    try {
      return parseCSV(await fetchText(`content/${name}.csv`));
    } catch (e) {
      return [];
    }
  }

  async function loadEpisodes() {
    try {
      const data = JSON.parse(await fetchText("episodes.json", { cache: "no-cache" }));
      return Array.isArray(data.episodes) ? data.episodes : [];
    } catch (e) {
      console.warn("Could not load episodes.json", e);
      return [];
    }
  }

  // ---------- date / time ----------

  function normDate(s) {
    s = (s || "").trim();
    if (!s) return "";
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // US-style M/D/YYYY, as Sheets often reformats
    if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
    const d = new Date(s);
    return isNaN(d) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Returns "HHMM" (24h) or "". Accepts 21:00, 21:00:00, 2100, 9:00 PM, 9pm.
  function normTime(s) {
    s = (s || "").trim();
    if (!s) return "";
    let m = s.match(/^(\d{1,2}):?(\d{2})(?::\d{2})?\s*([ap])?m?$/i);
    let h, min;
    if (m) { h = +m[1]; min = +m[2]; }
    else if ((m = s.match(/^(\d{1,2})\s*([ap])m?$/i))) { h = +m[1]; min = 0; }
    else return "";
    const ap = m[m.length - 1] && /^[ap]$/i.test(m[m.length - 1]) ? m[m.length - 1].toLowerCase() : "";
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return h > 23 || min > 59 ? "" : pad(h) + pad(min);
  }

  const dateObj = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (iso) => dateObj(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtDateLong = (iso) => dateObj(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  function fmtTime(hhmm) {
    const h = +hhmm.slice(0, 2), m = hhmm.slice(2);
    return `${h % 12 || 12}${m === "00" ? "" : ":" + m} ${h < 12 ? "AM" : "PM"}`;
  }
  function fmtClock(sec) {
    if (!isFinite(sec) || sec < 0) return "--:--";
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  // ---------- merge archive files with sheet rows ----------

  function mergeEpisodes(files, rows, settings) {
    const warnings = [];
    const episodes = files.map((f) => ({
      id: f.id,
      file: f.file,
      url: f.url,
      date: f.date,
      time: f.time.replace(":", ""),
      meta: null,
      visible: true,
      source: "archive",
    }));

    const byDate = new Map();
    for (const ep of episodes) {
      if (!byDate.has(ep.date)) byDate.set(ep.date, []);
      byDate.get(ep.date).push(ep);
    }

    const applyMeta = (ep, row) => {
      ep.meta = {
        title: row.title,
        themes: splitList(row.theme),
        hosts: splitList(row.hosts),
        guests: splitList(row.guests),
        dj: splitList(row.dj_mix),
        mixThemes: splitList(row.mix_themes),
        inShow: splitList(row.in_this_show),
        description: row.description,
        image: safeUrl(row.image),
      };
      ep.visible = isVisible(row.visible);
    };

    // Rows with a time are matched first, so a date-only row only covers the episodes left over that day.
    const ordered = rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => (normTime(b.row.time) ? 1 : 0) - (normTime(a.row.time) ? 1 : 0) || a.i - b.i);

    ordered.forEach(({ row, i }) => {
      const label = `Playlist row ${i + 2}`;
      const date = normDate(row.date);
      const time = normTime(row.time);
      let ep = null;

      if (row.mp3_url) {
        const name = decodeURIComponent((row.mp3_url.split("?")[0].split("/").pop() || ""));
        ep = episodes.find((e) => e.file === name);
        if (!ep) {
          const url = /^https?:\/\//i.test(row.mp3_url) ? safeUrl(row.mp3_url) : safeUrl(CFG.archiveBase + encodeURIComponent(row.mp3_url));
          if (!url) { warnings.push(`${label}: mp3_url is not a valid link.`); return; }
          ep = { id: "extra-" + i, file: name, url, date, time, meta: null, visible: true, source: "sheet" };
          episodes.push(ep);
        }
      } else if (date) {
        const candidates = byDate.get(date) || [];
        if (time) ep = candidates.find((e) => e.time === time) || null;
        else {
          // Date only: applies to every episode that day without its own timed row.
          const targets = candidates.filter((e) => !e.meta).sort((a, b) => a.time.localeCompare(b.time));
          if (candidates.length && !targets.length) {
            warnings.push(`${label} (${date}): this date already has details from an earlier row; ignoring this one.`);
            return;
          }
          if (targets.length) {
            targets.forEach((t) => applyMeta(t, row));
            return;
          }
        }
        if (!ep) {
          if (isVisible(row.visible) && date !== "2000-01-01") warnings.push(`${label} (${date}${time ? " " + time : ""}): no matching episode in the archive folder.`);
          return;
        }
      } else {
        warnings.push(`${label}: needs a date (or an mp3_url).`);
        return;
      }

      if (ep.meta) { warnings.push(`${label}: duplicate row for ${ep.id}; using the first one.`); return; }
      applyMeta(ep, row);
    });

    const shown = episodes.filter((e) => e.visible);
    shown.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    // Any day with more than one archived episode is split into Part 1, Part 2... in time order,
    // however the sheet rows for that day are written (or if there are none).
    const groups = new Map();
    for (const e of shown) {
      if (!e.date || e.source !== "archive") continue;
      if (!groups.has(e.date)) groups.set(e.date, []);
      groups.get(e.date).push(e);
    }
    for (const g of groups.values()) {
      g.sort((a, b) => a.time.localeCompare(b.time));
      g.forEach((e, n) => { e.part = g.length > 1 ? n + 1 : 0; });
    }

    const perDate = new Map();
    for (const e of shown) perDate.set(e.date, (perDate.get(e.date) || 0) + 1);
    const defaultHosts = splitList(settings.default_hosts);
    const defaultInShow = splitList(settings.default_in_show);

    for (const e of shown) {
      const m = e.meta || {};
      const multi = (perDate.get(e.date) || 0) > 1;
      const timeTxt = e.time ? fmtTime(e.time) : "";
      // Title format:
      //   [date] - Live                       (nothing else given)
      //   [date] - [title]                    [date] - [theme]
      //   [date] - [title] ([theme])
      // then " (w/ A, B)" if there are guests, and " - Part N" for split days.
      const dateTxt = e.date ? (multi && timeTxt && !e.part ? `${e.date} · ${timeTxt}` : e.date) : "";
      const themes = m.themes || [];
      const themeTxt = themes.join(", ");
      const guests = m.guests || [];
      const head = m.title ? (themeTxt ? `${m.title} (${themeTxt})` : m.title) : themeTxt || (dateTxt ? "Live" : "");
      let title = [dateTxt, head].filter(Boolean).join(" - ") || e.file;
      if (guests.length) title += ` (w/ ${guests.join(", ")})`;
      if (e.part) title += ` - Part ${e.part}`;
      e.title = title;
      // The now-playing panel shows theme and guests on their own lines, so its title leaves them out.
      // "Live" is only a placeholder: it is dropped when a theme will be shown on its own line instead.
      let panelTitle = [dateTxt, m.title || (dateTxt && !themes.length ? "Live" : "")].filter(Boolean).join(" - ") || e.file;
      if (e.part) panelTitle += ` - Part ${e.part}`;
      e.panelTitle = panelTitle;
      e.themes = themes;
      e.hosts = m.hosts && m.hosts.length ? m.hosts : defaultHosts;
      e.guests = m.guests || [];
      e.dj = m.dj || [];
      e.mixThemes = m.mixThemes || [];
      e.inShow = m.inShow && m.inShow.length ? m.inShow : defaultInShow;
      e.description = m.description || "";
      e.image = m.image || "";
      e.when = e.date ? fmtDateLong(e.date) + (timeTxt ? " · " + timeTxt : "") : "";
    }
    return { episodes: shown, all: episodes, warnings };
  }

  // ---------- settings & static sections ----------

  function applySettings(s) {
    document.title = s.site_title;
    $("site-title").textContent = s.site_title;
    $("tagline").textContent = s.tagline;

    const desc = $("show-desc");
    desc.textContent = s.show_description;
    desc.hidden = !s.show_description;

    // Logo: the sheet's logo_url, else the bundled one. The text title shows until/unless it loads.
    const logoUrl = safeUrl(s.logo_url || "assets/logo.jpg");
    const header = document.querySelector(".site-header");
    const logo = $("logo");
    if (logoUrl) {
      logo.alt = s.site_title;
      logo.addEventListener("load", () => header.classList.add("has-logo"));
      logo.addEventListener("error", () => header.classList.remove("has-logo"));
      logo.src = logoUrl;
    }

    if (s.about) { $("about").textContent = s.about; $("about-sec").hidden = false; }

    // Artist submissions: a form link and/or an email address. The section stays hidden if neither is set.
    const formUrl = safeUrl(s.submit_form_url);
    const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test((s.submit_email || "").trim()) ? s.submit_email.trim() : "";
    if (formUrl || email) {
      $("submit-text").textContent = s.submit_text;
      const actions = $("submit-actions");
      if (formUrl) actions.append(el("a", { class: "btn-submit", href: formUrl, target: "_blank", rel: "noopener", text: "Submit a track" }));
      if (email) {
        const subject = encodeURIComponent("Music submission for " + s.site_title);
        const body = encodeURIComponent("Artist name:\nTrack title:\nLink to the track (SoundCloud, Bandcamp, Dropbox, etc.):\nWhere you're from:\nAnything else we should know:\n");
        actions.append(el("a", { class: formUrl ? "btn-submit alt" : "btn-submit", href: `mailto:${email}?subject=${subject}&body=${body}`, text: formUrl ? "Or email us" : "Email us your track" }));
      }
      $("submit-sec").hidden = false;
    }

    const foot = $("footer-text");
    foot.textContent = s.footer_text || "";
    const link = safeUrl(s.footer_link_url);
    if (link) {
      if (s.footer_text) foot.append(" ");
      foot.append(el("a", { href: link, target: "_blank", rel: "noopener", text: s.footer_link_label || link }));
    }
  }

  function renderSocial(rows) {
    const items = rows
      .map((r) => ({ label: r.label, href: safeUrl(r.url, { mailto: true }), order: parseFloat(r.order) }))
      .filter((r) => r.label && r.href);
    items.sort((a, b) => (isNaN(a.order) ? 1e9 : a.order) - (isNaN(b.order) ? 1e9 : b.order));
    if (!items.length) return;
    const ul = $("social");
    for (const it of items) {
      ul.append(el("li", null, el("a", { href: it.href, target: "_blank", rel: "noopener", text: it.label })));
    }
    $("social-sec").hidden = false;
  }

  // ---------- player ----------

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function setupPlayer(episodes) {
    const audio = $("audio");
    const list = $("playlist");
    let idx = -1;

    if (!episodes.length) {
      $("np-title").textContent = "No episodes yet";
      $("pl-status").textContent = "Check back soon.";
      ["b-prev", "b-next", "b-play", "b-back", "b-fwd"].forEach((id) => ($(id).disabled = true));
      return;
    }

    // "Hosts: A, B, C · Mix by: D": guests are listed with the hosts here (empty parts are left out)
    const peopleLine = (ep) =>
      [["Hosts", [...new Set([...(ep.hosts || []), ...(ep.guests || [])])]], ["Mix by", ep.dj]]
        .filter(([, names]) => names && names.length)
        .map(([label, names]) =>
          `${label}: ${names.join(", ")}` + (label === "Mix by" && ep.mixThemes.length ? ` (${ep.mixThemes.join(", ")})` : ""))
        .join(" · ");

    // Playlist rows (static icons only; all text goes through textContent)
    const buttons = episodes.map((ep, i) => {
      const btn = el("button", { class: "ep", type: "button" },
        el("span", { class: "ep-icon" }),
        el("span", null,
          i === 0 ? el("span", { class: "badge", text: "Latest" }) : null,
          el("span", { class: "ep-title", text: ep.title }),
          el("span", { class: "ep-sub", text: peopleLine(ep) })
        )
      );
      btn.firstChild.innerHTML = ICON_PLAY;
      btn.addEventListener("click", () => {
        if (i === idx) togglePlay();
        else select(i, true);
      });
      list.append(el("li", null, btn));
      return btn;
    });

    // ----- search & filters -----
    const filters = { q: "", host: "", guest: "", dj: "" };
    const PEOPLE = [["host", "hosts", "f-host"], ["guest", "guests", "f-guest"], ["dj", "dj", "f-dj"]];
    const hasName = (names, key) => names.some((n) => n.toLowerCase() === key);

    function matches(ep) {
      if (filters.host && !hasName(ep.hosts, filters.host)) return false;
      if (filters.guest && !hasName(ep.guests, filters.guest)) return false;
      if (filters.dj && !hasName(ep.dj, filters.dj)) return false;
      if (filters.q) {
        const hay = [ep.title, ...ep.themes, ep.description, ep.when, ep.date, ...ep.hosts, ...ep.guests, ...ep.dj, ...ep.mixThemes, ...ep.inShow].join(" ").toLowerCase();
        if (!filters.q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    }

    // Nearest episode in the (filtered) list in direction dir, or -1
    function neighbor(dir) {
      for (let i = idx + dir; i >= 0 && i < episodes.length; i += dir) if (matches(episodes[i])) return i;
      return -1;
    }

    function updateNav() {
      $("b-prev").disabled = neighbor(-1) < 0;
      $("b-next").disabled = neighbor(1) < 0;
    }

    // Only the first PAGE matching episodes are listed; "Show more" reveals PAGE more.
    const PAGE = 10;
    let limit = PAGE;

    function applyFilters(keepLimit) {
      if (keepLimit !== true) limit = PAGE;
      let matched = 0;
      buttons.forEach((b, i) => {
        const ok = matches(episodes[i]);
        if (ok) matched++;
        b.parentElement.hidden = !ok || matched > limit;
      });
      const listed = Math.min(matched, limit);
      const active = filters.q || filters.host || filters.guest || filters.dj;
      $("f-clear").hidden = !active;
      $("pl-status").textContent = !matched ? "No episodes match your search."
        : active ? `Showing ${listed} of ${matched} matching episodes.`
        : matched > listed ? `Showing ${listed} of ${matched} episodes.` : "";
      const more = $("pl-more");
      more.hidden = matched <= listed;
      more.textContent = `Show ${Math.min(PAGE, matched - listed)} more`;
      updateNav();
    }

    $("pl-more").addEventListener("click", () => { limit += PAGE; applyFilters(true); });

    // Make sure the selected episode is in the visible part of the list.
    function ensureListed(i) {
      let rank = 0;
      for (let n = 0; n <= i; n++) if (matches(episodes[n])) rank++;
      if (matches(episodes[i]) && rank > limit) { limit = rank; applyFilters(true); }
    }

    function syncFilterUI() {
      $("f-q").value = filters.q;
      for (const [role, , id] of PEOPLE) $(id).value = filters[role];
    }

    function filterBy(role, name) {
      filters.q = filters.host = filters.guest = filters.dj = "";
      filters[role] = name.toLowerCase();
      syncFilterUI();
      applyFilters();
      const calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("pl-h").scrollIntoView({ behavior: calm ? "auto" : "smooth" });
    }

    function setupFilters() {
      for (const [role, field, id] of PEOPLE) {
        const names = new Map();
        for (const e of episodes) for (const n of e[field]) if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
        const select = $(id);
        if (!names.size) { select.parentElement.hidden = true; continue; }
        [...names].sort((a, b) => a[1].localeCompare(b[1])).forEach(([key, label]) => select.append(el("option", { value: key, text: label })));
        select.addEventListener("change", () => { filters[role] = select.value; applyFilters(); });
      }
      $("f-q").addEventListener("input", (e) => { filters.q = e.target.value.trim().toLowerCase(); applyFilters(); });
      $("f-clear").addEventListener("click", () => {
        filters.q = filters.host = filters.guest = filters.dj = "";
        syncFilterUI();
        applyFilters();
      });
      $("filters").addEventListener("submit", (e) => e.preventDefault());
      $("filters").hidden = false;
    }

    function setPlayingUI(playing) {
      $("i-play").hidden = playing;
      $("i-pause").hidden = !playing;
      $("b-play").setAttribute("aria-label", playing ? "Pause" : "Play");
      buttons.forEach((b, i) => {
        b.firstChild.innerHTML = i === idx && playing ? ICON_PAUSE : ICON_PLAY;
      });
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }

    function showMessage(text, isError) {
      const m = $("player-msg");
      m.textContent = text || "";
      m.hidden = !text;
      m.classList.toggle("error", !!isError);
    }

    function renderNowPlaying(ep) {
      $("np-title").textContent = ep.panelTitle;
      $("np-badge").hidden = ep !== episodes[0];
      const theme = $("np-theme");
      theme.textContent = ep.themes.length ? `Theme: ${ep.themes.join(", ")}` : "";
      theme.hidden = !ep.themes.length;

      const people = $("np-people");
      people.replaceChildren();
      for (const [label, names, role] of [["Hosts", ep.hosts, "host"], ["Guests", ep.guests, "guest"], ["Mix by", ep.dj, "dj"]]) {
        if (!names || !names.length) continue;
        people.append(
          el("div", { class: "row" },
            el("dt", { text: label }),
            names.map((n) => {
              const chip = el("button", { class: "chip", type: "button", title: `Show episodes with ${n}`, text: n });
              chip.addEventListener("click", () => filterBy(role, n));
              return el("dd", null, chip);
            })
          )
        );
      }

      // "DJ Mix" in the running order becomes "DJ Mix by <name> (<mix themes>)" when the row has those details.
      const show = $("np-show");
      show.replaceChildren(...ep.inShow.map((s) => {
        let text = s;
        if (/^dj\s*mix$/i.test(s.trim())) {
          if (ep.dj.length) text = `DJ Mix by ${ep.dj.join(", ")}`;
          if (ep.mixThemes.length) text += ` (${ep.mixThemes.join(", ")})`;
        }
        return el("li", null, el("span", { class: "item", text }));
      }));
      $("np-show-wrap").hidden = !ep.inShow.length;

      const desc = $("np-desc");
      desc.textContent = ep.description;
      desc.hidden = !ep.description;
    }

    function updateMediaSession(ep) {
      if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ep.title,
        artist: ep.hosts.join(", ") || document.title,
        album: document.title,
        artwork: ep.image ? [{ src: ep.image }] : [],
      });
    }

    // Share links look like  #20261121-2100&t=1h12m30s  (t also accepts plain seconds or 72m30s).
    function parseTime(v) {
      if (!v) return 0;
      if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(+v);
      const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(v);
      return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
    }
    function fmtShareTime(sec) {
      sec = Math.max(0, Math.floor(sec));
      const h = Math.floor(sec / 3600), mi = Math.floor((sec % 3600) / 60), s = sec % 60;
      return (h ? h + "h" : "") + (h || mi ? mi + "m" : "") + s + "s";
    }
    let pendingSeek = 0;
    function seekTo(sec) {
      if (!sec) return;
      if (audio.readyState >= 1) audio.currentTime = sec;
      else pendingSeek = sec;
    }

    function select(i, play, startAt) {
      if (i < 0 || i >= episodes.length) return;
      const ep = episodes[i];
      idx = i;
      pendingSeek = 0;
      ensureListed(i);
      if (audio.getAttribute("src") !== ep.url) {
        audio.src = ep.url;
        $("seek").value = 0;
        $("seek").max = 0;
        $("seek").disabled = true;
        $("t-cur").textContent = "0:00";
        $("t-dur").textContent = "--:--";
      }
      showMessage("");
      renderNowPlaying(ep);
      updateMediaSession(ep);
      buttons.forEach((b, n) => (n === i ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
      updateNav();
      try { history.replaceState(null, "", "#" + ep.id); } catch (e) { /* ignore */ }
      setPlayingUI(false);
      if (startAt) seekTo(startAt);
      if (play) audio.play().catch(() => {});
    }

    function shareLink() {
      const t = Math.floor(audio.currentTime || 0);
      return location.origin + location.pathname + "#" + episodes[idx].id + (t > 0 ? "&t=" + fmtShareTime(t) : "");
    }
    $("b-share").addEventListener("click", async () => {
      const link = shareLink();
      try {
        await navigator.clipboard.writeText(link);
        showMessage("Link copied: " + link);
      } catch (e) {
        window.prompt("Copy this link:", link);
      }
    });

    function togglePlay() {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    }

    $("b-play").addEventListener("click", togglePlay);
    $("b-prev").addEventListener("click", () => { const n = neighbor(-1); if (n >= 0) select(n, !audio.paused); });
    $("b-next").addEventListener("click", () => { const n = neighbor(1); if (n >= 0) select(n, !audio.paused); });
    $("b-back").addEventListener("click", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    $("b-fwd").addEventListener("click", () => {
      audio.currentTime = isFinite(audio.duration) ? Math.min(audio.duration, audio.currentTime + 30) : audio.currentTime + 30;
    });
    $("vol").addEventListener("input", (e) => { audio.volume = +e.target.value; });
    $("seek").addEventListener("input", (e) => { audio.currentTime = +e.target.value; });

    audio.addEventListener("play", () => setPlayingUI(true));
    audio.addEventListener("pause", () => setPlayingUI(false));
    audio.addEventListener("waiting", () => showMessage("Buffering…"));
    audio.addEventListener("playing", () => showMessage(""));
    audio.addEventListener("loadedmetadata", () => {
      $("seek").max = Math.floor(audio.duration) || 0;
      $("seek").disabled = !isFinite(audio.duration);
      $("t-dur").textContent = fmtClock(audio.duration);
      if (pendingSeek) {
        audio.currentTime = isFinite(audio.duration) ? Math.min(pendingSeek, audio.duration) : pendingSeek;
        pendingSeek = 0;
      }
    });
    audio.addEventListener("durationchange", () => {
      if (isFinite(audio.duration)) { $("seek").max = Math.floor(audio.duration); $("t-dur").textContent = fmtClock(audio.duration); }
    });
    audio.addEventListener("timeupdate", () => {
      $("seek").value = Math.floor(audio.currentTime);
      $("t-cur").textContent = fmtClock(audio.currentTime);
      $("share-time").textContent = fmtClock(audio.currentTime);
    });
    audio.addEventListener("ended", () => {
      const n = neighbor(1);
      if (n >= 0) select(n, true);
      else setPlayingUI(false);
    });
    audio.addEventListener("error", () => showMessage("Sorry, this episode couldn't be loaded. Try another one.", true));

    if ("mediaSession" in navigator) {
      const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (e) { /* unsupported */ } };
      set("play", () => audio.play().catch(() => {}));
      set("pause", () => audio.pause());
      set("previoustrack", () => { const n = neighbor(-1); if (n >= 0) select(n, true); });
      set("nexttrack", () => { const n = neighbor(1); if (n >= 0) select(n, true); });
      set("seekbackward", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
      set("seekforward", () => { audio.currentTime += 30; });
      set("seekto", (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
    }

    setupFilters();
    applyFilters();

    const [hashId, ...hashRest] = location.hash.slice(1).split("&");
    const hashT = parseTime((hashRest.map((p) => p.split("=")).find(([k]) => k === "t") || [])[1]);
    const fromHash = episodes.findIndex((e) => e.id === hashId);
    select(fromHash >= 0 ? fromHash : 0, false, fromHash >= 0 ? hashT : 0);
    if (fromHash >= 0 && hashT) {
      // Browsers usually block sound until the visitor interacts, so this may need one tap on Play.
      audio.play().catch(() => showMessage(`Press play to start at ${fmtClock(hashT)}.`));
    }
  }

  // ---------- admin helper (?admin) ----------

  function renderAdmin(all, warnings) {
    $("admin").hidden = false;
    const wrap = $("admin-warnings");
    if (warnings.length) {
      wrap.append(el("ul", null, warnings.map((w) => el("li", { text: w }))));
    } else {
      wrap.append(el("p", { class: "msg", text: "No problems found." }));
    }
    const table = $("admin-table");
    table.append(
      el("thead", null, el("tr", null, ["date", "time", "file", "sheet row", "shown"].map((h) => el("th", { text: h })))),
      el("tbody", null,
        [...all]
          .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
          .map((e) =>
            el("tr", null,
              el("td", { text: e.date || "" }),
              el("td", { text: e.time ? e.time.slice(0, 2) + ":" + e.time.slice(2) : "" }),
              el("td", { text: e.file }),
              el("td", { text: e.meta ? "✓ matched" + (e.part ? ` (part ${e.part})` : "") : "✗ none" }),
              el("td", { text: e.visible ? "yes" : "hidden" })
            )
          )
      )
    );
  }

  // ---------- go ----------

  async function init() {
    const [files, settingsRows, socialRows, playlistRows] = await Promise.all([
      loadEpisodes(),
      loadTable("settings"),
      loadTable("social"),
      loadTable("playlist"),
    ]);

    const settings = { ...DEFAULTS };
    for (const r of settingsRows) if (r.key && r.key in DEFAULTS) settings[r.key] = r.value || "";

    applySettings(settings);
    renderSocial(socialRows);

    const { episodes, all, warnings } = mergeEpisodes(files, playlistRows, settings);
    warnings.forEach((w) => console.warn(w));
    setupPlayer(episodes);
    if (new URLSearchParams(location.search).has("admin")) renderAdmin(all, warnings);
  }

  init().catch((err) => {
    console.error(err);
    $("np-title").textContent = "Something went wrong loading the site.";
  });
})();
