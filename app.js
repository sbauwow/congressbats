"use strict";

// Congress Avenue Bridge, Austin TX. Bats roost on the bridge deck here.
const LAT = 30.2615;
const LON = -97.7452;
const TZ = "America/Chicago";

// Paste the deployed Google Apps Script web-app URL here (ends in /exec) to send
// submissions to your Sheet. Until it's set, submissions are still saved locally
// in the visitor's browser so nothing is lost. See apps-script.gs for the code.
const SUBMIT_URL = "https://script.google.com/macros/s/AKfycbyHWLwTeOSx15PvWiB5XMsNTdiFGjDLgxFqejq3oMPQOqs7RN9WV7p4_Ppa78Fm8wK4/exec";

// Mexican free-tailed bats are in residence ~mid-March through early November,
// then migrate to Mexico for winter. Dates are approximate (weather-dependent).
const SEASON_START = { m: 2, d: 11 }; // Mar 11  (month is 0-indexed)
const SEASON_END = { m: 10, d: 5 };   // Nov 5
const PEAK_START = { m: 6, d: 15 };   // mid-Jul
const PEAK_END = { m: 8, d: 20 };     // mid-Sep  (pups flying — best viewing)

// ── sunset (NOAA / Wikipedia "sunrise equation") ─────────────────────────────
// Returns a UTC Date for sunset on the given calendar date at lat/lon, or null
// if the sun doesn't set. Accurate to ~1 minute, good enough for bat-watching.
function sunsetUTC(year, month0, day, lat, lon) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const jd = Date.UTC(year, month0, day) / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const Jstar = n - lon / 360;                                  // mean solar noon
  const M = (357.5291 + 0.98560028 * Jstar) % 360;             // mean anomaly
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad)
          + 0.0003 * Math.sin(3 * M * rad);                    // equation of center
  const lambda = (M + C + 180 + 102.9372) % 360;               // ecliptic longitude
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * rad)
                 - 0.0069 * Math.sin(2 * lambda * rad);        // solar transit
  const delta = Math.asin(Math.sin(lambda * rad) * Math.sin(23.4397 * rad));
  const cosOmega = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(delta))
                 / (Math.cos(lat * rad) * Math.cos(delta));
  if (cosOmega < -1 || cosOmega > 1) return null;
  const omega = Math.acos(cosOmega) * deg;                     // hour angle
  const Jset = Jtransit + omega / 360;
  return new Date((Jset - 2440587.5) * 86400000);
}

// ── seasonal emergence offset (minutes after sunset) ─────────────────────────
// Heuristic, anchored to a real sighting: on 2026-06-11 (doy 162) the colony had
// not emerged by 9:00 PM with sunset at 8:32 PM — i.e. >+28 min after sunset in
// mid-June. So at Congress Ave the bats emerge *after* sunset all season (the
// before-sunset daylight exits belong to Bracken Cave), earliest near the August
// pup-season peak when the colony is largest. Gaussian dip: ~+38 min at the
// season edges, down to ~+8 min at peak.
const EARLY_MIN = 15;   // the likely window opens this many min before the estimate
const LATE_MIN = 22;    // ...and closes this many min after it
function seasonalOffsetMin(doy) {
  const PEAK_DOY = 225;  // ~Aug 13
  const EDGE = 38;       // minutes after sunset at the season edges
  const DEPTH = 30;      // swing from edge toward the peak
  const SIGMA = 39;      // days
  return EDGE - DEPTH * Math.exp(-((doy - PEAK_DOY) ** 2) / (2 * SIGMA * SIGMA));
}

function dayOfYear(year, month0, day) {
  const start = Date.UTC(year, 0, 1);
  return Math.floor((Date.UTC(year, month0, day) - start) / 86400000) + 1;
}

// ── season helpers ────────────────────────────────────────────────────────────
function md(year, m, d) { return Date.UTC(year, m, d); }

function seasonStatus(year, month0, day) {
  const t = md(year, month0, day);
  const inSeason = t >= md(year, SEASON_START.m, SEASON_START.d)
                && t <= md(year, SEASON_END.m, SEASON_END.d);
  const inPeak = t >= md(year, PEAK_START.m, PEAK_START.d)
              && t <= md(year, PEAK_END.m, PEAK_END.d);
  return { inSeason, inPeak };
}

// ── formatting (always Austin local, DST-correct via Intl) ───────────────────
const fmtTime = new Intl.DateTimeFormat("en-US",
  { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("en-US",
  { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });

// Current Y/M/D *in Austin*, regardless of the viewer's own timezone.
function austinToday() {
  const parts = new Intl.DateTimeFormat("en-CA",
    { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const g = (t) => +parts.find((p) => p.type === t).value;
  return { year: g("year"), month0: g("month") - 1, day: g("day") };
}

// ── projection for one night ──────────────────────────────────────────────────
function projectNight(year, month0, day) {
  const sset = sunsetUTC(year, month0, day, LAT, LON);
  const { inSeason, inPeak } = seasonStatus(year, month0, day);
  const offset = seasonalOffsetMin(dayOfYear(year, month0, day));
  const emerge = sset ? new Date(sset.getTime() + offset * 60000) : null;
  const early = emerge ? new Date(emerge.getTime() - EARLY_MIN * 60000) : null;
  const late = emerge ? new Date(emerge.getTime() + LATE_MIN * 60000) : null;
  const dateUTC = new Date(md(year, month0, day));
  return { year, month0, day, dateUTC, sunset: sset, emerge, early, late,
           offset, inSeason, inPeak };
}

// Build a list of nights starting from Austin "today".
function upcomingNights(count) {
  const { year, month0, day } = austinToday();
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = Date.UTC(year, month0, day + i); // UTC math rolls months/years safely
    const d = new Date(t);
    out.push(projectNight(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return out;
}

function offsetPhrase(offset) {
  const m = Math.round(Math.abs(offset));
  if (m <= 3) return "right around sunset";
  return `about ${m} min ${offset < 0 ? "before" : "after"} sunset`;
}

// ── render ────────────────────────────────────────────────────────────────────
function render() {
  const nights = upcomingNights(8);
  const tonight = nights[0];
  const root = document.getElementById("app");

  let bannerClass = "banner";
  let bannerText;
  if (!tonight.inSeason) {
    const t = tonight.dateUTC.getTime();
    const before = t < md(tonight.year, SEASON_START.m, SEASON_START.d);
    bannerText = before
      ? "The bats are wintering in Mexico. Nightly flights resume in mid-March."
      : "The bats have left for Mexico for the winter. They return in mid-March.";
    bannerClass += " off";
  } else if (tonight.inPeak) {
    bannerText = "Peak season — the colony is at its largest and emergences are most dramatic.";
    bannerClass += " peak";
  } else {
    bannerText = "Bats are in residence. Clear, calm evenings give the best flights.";
  }

  const tonightBlock = tonight.inSeason && tonight.emerge
    ? `<div class="time">${fmtTime.format(tonight.emerge)}</div>
       <div class="range">likely between <b>${fmtTime.format(tonight.early)}</b>
         and <b>${fmtTime.format(tonight.late)}</b></div>
       <div class="sub">projected emergence &middot; ${offsetPhrase(tonight.offset)}</div>
       <div class="sunset">Sunset tonight: ${fmtTime.format(tonight.sunset)}</div>`
    : `<div class="time off">—</div>
       <div class="sub">no flights tonight</div>
       <div class="sunset">Sunset tonight: ${fmtTime.format(tonight.sunset)}</div>`;

  const rows = nights.slice(1, 8).map((n) => {
    const right = n.inSeason && n.emerge
      ? `<span class="r-time">${fmtTime.format(n.emerge)}</span>
         <span class="r-note">${fmtTime.format(n.early)} – ${fmtTime.format(n.late)}</span>`
      : `<span class="r-time off">—</span><span class="r-note">off-season</span>`;
    return `<li><span class="r-day">${fmtDay.format(n.dateUTC)}</span>${right}</li>`;
  }).join("");

  root.innerHTML = `
    <header>
      <h1>When the Bats Fly</h1>
      <p class="place">Congress Avenue Bridge &middot; Austin, Texas</p>
    </header>

    <section class="tonight">
      <div class="label">Tonight</div>
      ${tonightBlock}
    </section>

    <div class="${bannerClass}">${bannerText}</div>

    <section class="week">
      <div class="label">Next nights</div>
      <ul class="nights">${rows}</ul>
    </section>

    <section class="report">
      <div class="label">Saw them fly? Help the forecast</div>
      <p class="report-intro">The projection is only a model. Tell us when the
        bats actually emerged and we'll tune it with real Austin data.</p>
      <form id="report-form" novalidate>
        <div class="field">
          <label for="r-date">Night</label>
          <input type="date" id="r-date" required>
        </div>
        <div class="field">
          <label for="r-time">Time they flew</label>
          <input type="time" id="r-time" required>
        </div>
        <div class="field">
          <label for="r-notes">Notes <span>(weather, how sure, optional)</span></label>
          <input type="text" id="r-notes" maxlength="140"
                 placeholder="e.g. clear and calm, big steady stream">
        </div>
        <button type="submit" id="r-submit">Submit sighting</button>
        <p id="r-status" class="report-status" role="status"></p>
      </form>
    </section>

    <section class="about">
      <div class="label">About the bats</div>
      <p>Each evening from spring through fall, as many as <b>1.5 million</b>
        Mexican free-tailed bats (<i>Tadarida brasiliensis</i>) pour out from the
        crevices under the Congress Avenue Bridge — the largest urban bat colony
        in North America.</p>
      <ul class="facts">
        <li><b>They came for the bridge.</b> A 1980 reconstruction left deck
          crevices that happen to be perfect bat roosts. Austin wanted them gone
          at first; education turned them into a beloved attraction that now draws
          an estimated 100,000 visitors a year.</li>
        <li><b>It's a maternity colony.</b> Mostly females, arriving from central
          Mexico in March. Each gives birth to a single pup around June; the pups
          are flying by August, which is why late summer brings the biggest,
          longest emergences.</li>
        <li><b>Serious appetites.</b> The colony eats an estimated 10,000+ pounds
          of insects every night, including crop pests like corn earworm moths —
          free pest control worth real money to Texas farmers.</li>
        <li><b>Built to fly.</b> Long, narrow wings make them one of the fastest
          mammals in level flight — ground speeds over 100 mph have been recorded.
          They forage thousands of feet up and miles from the bridge, navigating
          by echolocation.</li>
        <li><b>Gone by winter.</b> As nights cool in October and November they
          migrate back to Mexico, returning the following spring.</li>
      </ul>
      <p class="watch"><b>Watching tips:</b> stand on the bridge sidewalks or the
        lawn on the south-east bank. Come a bit before the projected time, keep
        noise down, and skip the flash. Clear, calm evenings are best; cold or
        rainy nights can delay or cancel the flight entirely.</p>
    </section>

    <footer>
      <p>An estimate from sunset plus a seasonal offset, not a measured time.
         Real emergence shifts with weather, the colony's size, and the bats'
         own mood. Arrive ~30 minutes before for the best odds.</p>
      <p class="fine">Times are Austin local (Central). Season dates approximate.</p>
    </footer>`;

  wireReportForm();
}

// ── sighting submission ───────────────────────────────────────────────────────
function loadSubmissions() {
  try { return JSON.parse(localStorage.getItem("bat_submissions") || "[]"); }
  catch (e) { return []; }
}

function wireReportForm() {
  const form = document.getElementById("report-form");
  if (!form) return;
  const today = austinToday();
  const iso = `${today.year}-${String(today.month0 + 1).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const dateEl = document.getElementById("r-date");
  dateEl.value = iso;
  dateEl.max = iso;  // can't report a future night

  const status = document.getElementById("r-status");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = dateEl.value;
    const time = document.getElementById("r-time").value;
    const notes = document.getElementById("r-notes").value.trim();
    if (!date || !time) {
      status.textContent = "Please give both the night and the time.";
      status.className = "report-status err";
      return;
    }
    // Attach our prediction for that night so the row is model-fitting-ready.
    const [y, m, d] = date.split("-").map(Number);
    const p = projectNight(y, m - 1, d);
    const record = {
      date, time, notes,
      predicted: p.emerge ? fmtTime.format(p.emerge) : null,
      predictedOffsetMin: Math.round(p.offset),
      sunset: p.sunset ? fmtTime.format(p.sunset) : null,
      submittedAt: new Date().toISOString(),
      tz: TZ,
    };
    const all = loadSubmissions();
    all.push(record);
    try { localStorage.setItem("bat_submissions", JSON.stringify(all)); } catch (e) {}

    if (SUBMIT_URL) {
      // Apps Script doesn't send CORS headers; a no-cors text/plain POST is a
      // "simple" request (no preflight) so it goes through fire-and-forget.
      fetch(SUBMIT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(record),
      }).catch(() => {});
      status.textContent = "Thanks! Your sighting was submitted.";
    } else {
      status.textContent = "Saved on this device. (Central collection isn't wired up yet.)";
    }
    status.className = "report-status ok";
    form.reset();
    dateEl.value = iso;
  });
}

if (typeof document !== "undefined") render();

// Allow Node to import the pure functions for testing.
if (typeof module !== "undefined") {
  module.exports = { sunsetUTC, seasonalOffsetMin, dayOfYear, projectNight,
                     austinToday, upcomingNights, LAT, LON };
}
