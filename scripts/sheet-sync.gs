/**
 * Sound So Nice: keep the Playlist tab in step with the archive folder.
 *
 *  1. ADD: for every episode in the CFRU archive that has no row yet, appends a row with
 *     `date`, `time`, `mp3_url` and `in_this_show` (DEFAULT_IN_SHOW) filled in. Everything else
 *     is left blank for editors.
 *  2. SORT: keeps the tab in date order (newest first, earlier episode first within a day)
 *     so a day's Part 1, Part 2... read top to bottom.
 *
 * It never deletes rows and never overwrites your text. The only edits to existing cells are
 * (a) tidying the date and time cells into plain text (2026-11-21 and 21:00), which the
 * sort needs, and (b) moving whole rows when sorting.
 *
 * What counts as "already has a row" for an episode:
 *   - a row with the same date and the same time, or
 *   - a row whose mp3_url is that file, or
 *   - a date-only row (no time, no mp3_url) for that date. That row covers every episode that
 *     day, so nothing is added for the day.
 *
 * Setup: see "Keep the sheet filled automatically" in the README.
 */

var ARCHIVE_URL = 'https://archive.cfru.ca/show/name/Sound%20So%20Nice/';
var SHEET_NAME = 'Playlist';
var NEWEST_FIRST = true; // set to false for oldest first
// Pre-filled into the in_this_show column of each new row, in running order. Edit per episode in the sheet.
var DEFAULT_IN_SHOW = 'Feature, Hot In The Crates, Canadian Spotlight, DJ Mix';

// ---------- entry points ----------

/** Hourly (and "Add new episodes now" in the menu): add missing episodes, then sort. */
function syncEpisodes() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // another run is in progress
  try {
    var sheet = getSheet_();
    var c = columns_(sheet);
    var episodes = fetchEpisodes_();
    if (!episodes.length) throw new Error('No episodes found in the archive page; nothing changed.');

    tidyColumn_(sheet, c.date, normDate_);
    if (c.time) tidyColumn_(sheet, c.time, normTime_);

    // What the sheet already covers
    var lastRow = sheet.getLastRow();
    var width = Math.max(sheet.getLastColumn(), 1);
    var data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
    var covered = {};     // 'date|time' -> true
    var coveredFile = {}; // filename -> true
    var wholeDay = {};    // date -> true (date-only row)
    data.forEach(function (r) {
      var d = normDate_(r[c.date - 1]);
      var t = c.time ? normTime_(r[c.time - 1]) : '';
      var file = c.url ? fileFromUrl_(r[c.url - 1]) : '';
      if (file) coveredFile[file] = true;
      if (d && t) covered[d + '|' + t] = true;
      if (d && !t && !file) wholeDay[d] = true;
    });

    var missing = episodes.filter(function (e) {
      return !wholeDay[e.date] && !covered[e.date + '|' + e.time] && !coveredFile[e.file];
    });

    if (missing.length) {
      var rows = missing.map(function (e) {
        var row = new Array(width).fill('');
        row[c.date - 1] = e.date;
        if (c.time) row[c.time - 1] = e.time;
        if (c.url) row[c.url - 1] = e.url;
        if (c.inShow) row[c.inShow - 1] = DEFAULT_IN_SHOW;
        return row;
      });
      var start = lastRow + 1;
      sheet.getRange(start, c.date, rows.length, 1).setNumberFormat('@');
      if (c.time) sheet.getRange(start, c.time, rows.length, 1).setNumberFormat('@');
      sheet.getRange(start, 1, rows.length, width).setValues(rows);
    }
    sortPlaylist_(sheet);
  } finally {
    lock.releaseLock();
  }
}

/** "Sort by date now" in the menu, and also runs when the sheet is opened. */
function sortNow() {
  sortPlaylist_(getSheet_());
}

/** Run this once: sets up the hourly check. */
function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncEpisodes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncEpisodes').timeBased().everyHours(1).create();
}

/** Adds the menu and tidies the order whenever someone opens the sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Sound So Nice')
    .addItem('Add new episodes now', 'syncEpisodes')
    .addItem('Sort by date now', 'sortNow')
    .addToUi();
  try { sortNow(); } catch (e) { /* e.g. a view-only visitor: skip */ }
}

// ---------- helpers ----------

function getSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + SHEET_NAME + '"');
  return sheet;
}

/** 1-based column numbers for the headers we use (0 if absent). */
function columns_(sheet) {
  var heads = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var c = { date: heads.indexOf('date') + 1, time: heads.indexOf('time') + 1, url: heads.indexOf('mp3_url') + 1, inShow: heads.indexOf('in_this_show') + 1 };
  if (!c.date) throw new Error('The Playlist tab needs a column headed "date".');
  return c;
}

/** Episodes listed in the archive: [{date:'2026-11-21', time:'21:00', file, url}] */
function fetchEpisodes_() {
  var res = UrlFetchApp.fetch(ARCHIVE_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Archive returned HTTP ' + res.getResponseCode());
  var html = res.getContentText();
  var out = [], seen = {}, m;
  var hrefRe = /<a href="([^"]+\.mp3)"/gi;
  while ((m = hrefRe.exec(html))) {
    var file = decodeURIComponent(m[1]);
    var n = file.match(/\.(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})\d{2}[A-Za-z]{2,5}\.mp3$/);
    if (!n || seen[file]) continue;
    seen[file] = true;
    out.push({
      date: n[1] + '-' + n[2] + '-' + n[3],
      time: n[4] + ':' + n[5],
      file: file,
      url: ARCHIVE_URL + encodeURIComponent(file)
    });
  }
  return out;
}

/** Sort the data rows by date (and time within a day). */
function sortPlaylist_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  var c = columns_(sheet);
  tidyColumn_(sheet, c.date, normDate_);
  if (c.time) tidyColumn_(sheet, c.time, normTime_);
  var spec = [{ column: c.date, ascending: !NEWEST_FIRST }];
  if (c.time) spec.push({ column: c.time, ascending: true });
  sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).sort(spec);
}

/**
 * Turn real date/time values (or 8/29/2026, 9pm...) into plain text so they sort correctly.
 * Cells that are already in the right form, or that can't be understood, are left alone.
 */
function tidyColumn_(sheet, col, normalise) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var range = sheet.getRange(2, col, lastRow - 1, 1);
  var values = range.getValues();
  var formulas = range.getFormulas();
  for (var i = 0; i < values.length; i++) {
    if (formulas[i][0]) continue; // never touch a formula
    var v = values[i][0];
    if (v === '' || v === null) continue;
    var tidy = normalise(v);
    if (tidy && tidy !== v) {
      var cell = sheet.getRange(i + 2, col);
      cell.setNumberFormat('@');
      cell.setValue(tidy);
    }
  }
}

function pad2_(n) { return ('0' + n).slice(-2); }

/** -> 'yyyy-MM-dd' or '' */
function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var s = String(v === null || v === undefined ? '' : v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return m[3] + '-' + pad2_(m[1]) + '-' + pad2_(m[2]);
  return '';
}

/** -> 'HH:mm' (24-hour) or ''. Accepts 21:00, 21:00:00, 2100, 9:00 PM, 9pm. */
function normTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'HH:mm');
  var s = String(v === null || v === undefined ? '' : v).trim(), m, h, min, ap = '';
  if ((m = s.match(/^(\d{1,2}):?(\d{2})(?::\d{2})?\s*([ap])?m?$/i))) { h = +m[1]; min = +m[2]; ap = (m[3] || '').toLowerCase(); }
  else if ((m = s.match(/^(\d{1,2})\s*([ap])m?$/i))) { h = +m[1]; min = 0; ap = m[2].toLowerCase(); }
  else return '';
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h > 23 || min > 59 ? '' : pad2_(h) + ':' + pad2_(min);
}

function fileFromUrl_(url) {
  var s = String(url || '').trim();
  if (!s) return '';
  try { return decodeURIComponent(s.split('?')[0].split('/').pop()); } catch (e) { return ''; }
}
