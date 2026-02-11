// ============================================================
// MyLife API — Google Apps Script Web App
// ============================================================
// SETUP INSTRUCTIONS:
// 1. Go to https://script.google.com
// 2. Create a new project, name it "MyLife API"
// 3. Replace the default Code.gs content with this entire file
// 4. Update SPREADSHEET_ID below with your sheet ID
// 5. Click Deploy → New deployment
// 6. Type: Web app
// 7. Execute as: Me
// 8. Who has access: Anyone
// 9. Click Deploy and copy the URL
// 10. Paste the URL in MyLife Settings
// ============================================================

const SPREADSHEET_ID = '1xJLum0jVVLREft96OSNJ7FLKGhT-wDDwbHBinj8a140';

// Column definitions for each sheet
const COLUMNS = {
  health: ['date', 'weight_kg', 'bmi', 'bp_systolic', 'bp_diastolic', 'heart_rate', 'blood_sugar', 'notes'],
  medications: ['date', 'name', 'dosage', 'time', 'category', 'taken'],
  appointments: ['date', 'time', 'doctor', 'specialty', 'location', 'notes'],
  fitness: ['date', 'type', 'exercise', 'duration_min', 'sets', 'reps', 'weight_kg', 'calories_burned', 'notes'],
  nutrition: ['date', 'meal', 'food', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'notes'],
  water: ['date', 'time', 'amount_ml'],
  sleep: ['date', 'bedtime', 'wake_time', 'hours', 'quality', 'notes'],
  mood: ['date', 'time', 'mood', 'stress', 'energy', 'gratitude', 'notes'],
  meditation: ['date', 'duration_min', 'type', 'notes'],
  habits: ['date', 'habit_id', 'completed'],
  habit_defs: ['id', 'name', 'icon', 'category', 'target', 'active'],
  goals: ['id', 'type', 'title', 'target', 'current', 'deadline', 'status'],
  profile: ['key', 'value']
};

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter;
    const action = params.action;

    let result;

    switch (action) {
      case 'read':
        result = handleRead(params);
        break;
      case 'write':
        result = handleWrite(JSON.parse(e.postData.contents));
        break;
      case 'append':
        result = handleAppend(JSON.parse(e.postData.contents));
        break;
      case 'update':
        result = handleUpdate(JSON.parse(e.postData.contents));
        break;
      case 'delete':
        result = handleDelete(JSON.parse(e.postData.contents));
        break;
      case 'ping':
        result = { success: true, message: 'MyLife API is running' };
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleRead(params) {
  const sheetName = params.sheet;
  if (!sheetName) return { success: false, error: 'Missing sheet parameter' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Sheet not found: ' + sheetName };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, data: [] };

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const values = dataRange.getValues();

  let rows = values.map((row, idx) => {
    const obj = { _rowIndex: idx + 2 };
    headers.forEach((h, i) => {
      let val = row[i];
      // Convert Date objects to strings
      if (val instanceof Date) {
        if (h === 'date') {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else if (h === 'time' || h === 'bedtime' || h === 'wake_time') {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
        }
      }
      obj[h] = val;
    });
    return obj;
  });

  // Filter by date range if provided
  const from = params.from;
  const to = params.to;
  if (from || to) {
    rows = rows.filter(r => {
      const d = String(r.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  // Filter by exact date
  if (params.date) {
    rows = rows.filter(r => String(r.date) === params.date);
  }

  // Limit
  if (params.limit) {
    rows = rows.slice(0, parseInt(params.limit));
  }

  return { success: true, data: rows };
}

function handleWrite(body) {
  const sheetName = body.sheet;
  const rows = body.rows;
  if (!sheetName || !rows) return { success: false, error: 'Missing sheet or rows' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Sheet not found: ' + sheetName };

  const cols = COLUMNS[sheetName];
  if (!cols) return { success: false, error: 'Unknown sheet: ' + sheetName };

  // Clear existing data (keep headers) and write new data
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clear();
  }

  if (rows.length > 0) {
    const data = rows.map(row => {
      if (Array.isArray(row)) return row;
      return cols.map(c => row[c] !== undefined ? row[c] : '');
    });
    sheet.getRange(2, 1, data.length, cols.length).setValues(data);
  }

  return { success: true, written: rows.length };
}

function handleAppend(body) {
  const sheetName = body.sheet;
  const rows = body.rows;
  if (!sheetName || !rows) return { success: false, error: 'Missing sheet or rows' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Sheet not found: ' + sheetName };

  const cols = COLUMNS[sheetName];
  if (!cols) return { success: false, error: 'Unknown sheet: ' + sheetName };

  const data = rows.map(row => {
    if (Array.isArray(row)) return row;
    return cols.map(c => row[c] !== undefined ? row[c] : '');
  });

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, data.length, cols.length).setValues(data);

  return { success: true, appended: data.length, startRow: lastRow + 1 };
}

function handleUpdate(body) {
  const sheetName = body.sheet;
  const rowIndex = body.rowIndex;
  const row = body.row;
  if (!sheetName || !rowIndex || !row) return { success: false, error: 'Missing sheet, rowIndex, or row' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Sheet not found: ' + sheetName };

  const cols = COLUMNS[sheetName];
  if (!cols) return { success: false, error: 'Unknown sheet: ' + sheetName };

  const data = Array.isArray(row) ? row : cols.map(c => row[c] !== undefined ? row[c] : '');
  sheet.getRange(rowIndex, 1, 1, cols.length).setValues([data]);

  return { success: true, updated: rowIndex };
}

function handleDelete(body) {
  const sheetName = body.sheet;
  const rowIndex = body.rowIndex;
  if (!sheetName || !rowIndex) return { success: false, error: 'Missing sheet or rowIndex' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Sheet not found: ' + sheetName };

  sheet.deleteRow(rowIndex);

  return { success: true, deleted: rowIndex };
}
