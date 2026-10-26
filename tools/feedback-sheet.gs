/**
 * The feedback inbox: a Google Apps Script web app that writes every message the game sends into the sheet it is
 * attached to. Paste this into the sheet's Extensions > Apps Script, then Deploy > New deployment > Web app,
 * "Execute as: Me", "Who has access: Anyone". The web app URL goes into FEEDBACK_URL in src/ui/feedback.ts.
 * Full steps: docs/feedback.md.
 *
 * The game posts one JSON object per message (FeedbackEntry in src/ui/feedback.ts) as text/plain.
 */

/** The sheet's columns, left to right, and the field of the message each one shows. */
var COLUMNS = [
  ['Received', null], ['Sent', 'sent'], ['Name', 'name'], ['About', 'about'], ['Feedback', 'message'], ['Where', 'where'],
  ['Machine', 'machine'], ['Round', 'round'], ['Money', 'money'], ['Score', 'score'], ['Goal', 'goal'], ['Run score', 'runScore'],
  ['Parts on table', 'parts'], ['Toolbox', 'toolbox'], ['Decals', 'decals'], ['Version', 'version'], ['Screen', 'screen'], ['ID', 'id'],
];
var MAX_CELL = 5000;

function doPost(e) {
  var entry;
  try { entry = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'not json' }); }
  if (!entry || typeof entry.message !== 'string' || !entry.message.trim()) return reply({ ok: false, error: 'no message' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS.map(function (c) { return c[0]; }));
    // a message the game sent twice (it retries what it could not confirm) is written once
    var idCol = COLUMNS.length, last = sheet.getLastRow();
    if (entry.id && last > 1) {
      var from = Math.max(2, last - 199);
      var ids = sheet.getRange(from, idCol, last - from + 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (ids[i][0] === String(entry.id)) return reply({ ok: true, duplicate: true });
    }
    sheet.appendRow(COLUMNS.map(function (c) { return c[1] === null ? new Date() : cell(entry[c[1]]); }));
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

/** Opening the web app's URL in a browser says it is alive. */
function doGet() {
  return reply({ ok: true, inbox: SpreadsheetApp.getActiveSpreadsheet().getName() });
}

/** Numbers stay numbers; text is capped, and text that would start a formula is kept as plain text. */
function cell(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v).slice(0, MAX_CELL);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
