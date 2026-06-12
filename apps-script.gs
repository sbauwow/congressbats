// Congress Ave bat-sighting collector - Google Apps Script web app.
//
// SETUP
//   1. Create a Google Sheet to hold the data (any blank sheet).
//   2. Extensions menu > Apps Script. Delete the boilerplate, paste this file.
//   3. Deploy > New deployment > select type "Web app".
//        Execute as:      Me
//        Who has access:  Anyone
//      Deploy, authorize when prompted, copy the Web app URL (it ends in exec).
//   4. Paste that URL into SUBMIT_URL at the top of app.js.
//
// The page sends JSON as text-plain with mode no-cors (a "simple" request, so
// there is no CORS preflight that Apps Script cannot answer). doPost reads the
// raw body. Re-deploy a NEW version after any edit here or the URL won't change.

const SHEET_NAME = "sightings";
const HEADERS = ["submittedAt", "date", "time", "predicted",
                 "predictedOffsetMin", "sunset", "notes", "tz"];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    sheet.appendRow(HEADERS.map(function (h) {
      return data[h] != null ? data[h] : "";
    }));
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("Bat sighting collector is running.");
}
