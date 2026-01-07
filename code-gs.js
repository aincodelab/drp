/**
 * CONFIGURATION
 * https://docs.google.com/spreadsheets/d/1LA7GlBmkvQ8aounYsmkdkH_caS9n6G2BR7LawXxA2xY/edit?usp=sharing
 * https://drive.google.com/drive/folders/1V5ZvvAdmX0nYOlrYGdchHciOF4RZxXlI?usp=sharing
 */
const SS_ID = '1LA7GlBmkvQ8aounYsmkdkH_caS9n6G2BR7LawXxA2xY'; 
const FOLDER_ID = '1V5ZvvAdmX0nYOlrYGdchHciOF4RZxXlI'; 
const SHEET_DATA = 'Data';
const SHEET_ADMIN = 'Admin';

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const session = request.session; 
    const ss = SpreadsheetApp.openById(SS_ID);
    
    const sheetData = ss.getSheetByName(SHEET_DATA) || ss.insertSheet(SHEET_DATA);
    const sheetAdmin = ss.getSheetByName(SHEET_ADMIN) || ss.insertSheet(SHEET_ADMIN);

    // Inisialisasi Header jika baru
    if (sheetAdmin.getLastRow() === 0) {
      sheetAdmin.appendRow(['Username', 'Password', 'Role', 'Nama Lengkap']);
    }
    if (sheetData.getLastRow() === 0) {
      sheetData.appendRow(['ID', 'Waktu', 'Judul', 'Deskripsi', 'ImageID', 'ImageURL', 'Owner', 'OwnerName']);
    }

    let result;
    switch (action) {
      case 'register': result = registerUser(sheetAdmin, request.data); break;
      case 'login': result = loginUser(sheetAdmin, request.data); break;
      case 'read': result = readData(sheetData, session); break;
      case 'create': result = createData(sheetData, request.data, session); break;
      case 'update': result = updateData(sheetData, request.id, request.data, session); break;
      case 'delete': result = deleteData(sheetData, request.id, session); break;
      case 'readUsers': result = readUsers(sheetAdmin, session); break;
      case 'adminAddUser': result = adminAddUser(sheetAdmin, request.data, session); break;
      case 'adminUpdateUser': result = adminUpdateUser(sheetAdmin, request.username, request.data, session); break;
      case 'adminDeleteUser': result = adminDeleteUser(sheetAdmin, request.username, session); break;
      default: throw new Error('Aksi tidak valid');
    }

    return respond({ success: true, data: result });
  } catch (error) {
    return respond({ success: false, message: error.toString() });
  }
}

// --- LOGIKA PENGGUNA ---
function registerUser(sheet, data) {
  const users = sheet.getDataRange().getValues();
  const username = data.username.trim();
  const namaLengkap = (data.namaLengkap || username).trim();
  const exists = users.some(row => row[0].toLowerCase() === username.toLowerCase());
  if (exists) throw new Error('Username sudah digunakan');
  const role = users.length === 1 ? 'Admin' : 'User';
  sheet.appendRow([username, data.password, role, namaLengkap]);
  return { username, role, namaLengkap };
}

function loginUser(sheet, data) {
  const users = sheet.getDataRange().getValues();
  const user = users.find(row => row[0] === data.username.trim() && row[1] === data.password);
  if (!user) throw new Error('Kredensial salah');
  return { username: user[0], role: user[2], namaLengkap: user[3] };
}

function adminAddUser(sheet, data, session) {
  if (session.role !== 'Admin') throw new Error('Akses ditolak');
  return registerUser(sheet, data);
}

function adminUpdateUser(sheet, targetUser, data, session) {
  if (session.role !== 'Admin') throw new Error('Akses ditolak');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === targetUser) {
      if (data.password) sheet.getRange(i + 1, 2).setValue(data.password);
      if (data.role) sheet.getRange(i + 1, 3).setValue(data.role);
      if (data.namaLengkap) sheet.getRange(i + 1, 4).setValue(data.namaLengkap.trim());
      return { success: true };
    }
  }
}

function adminDeleteUser(sheet, targetUser, session) {
  if (session.role !== 'Admin' || targetUser === session.username) throw new Error('Akses ditolak');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === targetUser) { sheet.deleteRow(i + 1); return { success: true }; }
  }
}

function readUsers(sheet, session) {
  if (session.role !== 'Admin') return [];
  const data = sheet.getDataRange().getValues();
  data.shift();
  return data.map(row => ({ username: row[0], role: row[2], namaLengkap: row[3] }));
}

// --- LOGIKA DATA ---
function createData(sheet, data, session) {
  const ownerName = session.namaLengkap || session.username;
  let imageUrl = "", imageId = "";
  if (data.image) {
    const blob = Utilities.newBlob(Utilities.base64Decode(data.image.split(',')[1]), data.mimeType, "img_" + session.username + "_" + Date.now());
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    imageUrl = `https://lh3.googleusercontent.com/d/${file.getId()}`;
    imageId = file.getId();
  }
  sheet.appendRow([sheet.getLastRow() + 1, data.waktu, data.judul.trim(), data.deskripsi.trim(), imageId, imageUrl, session.username, ownerName]);
  return { success: true };
}

function readData(sheet, session) {
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map((row, index) => {
    let obj = { id: index + 2 };
    headers.forEach((h, i) => obj[h.toLowerCase()] = row[i]);
    obj.display_owner = obj.ownername || obj.owner;
    return obj;
  }).filter(item => session.role === 'Admin' || item.owner === session.username).reverse();
}

function updateData(sheet, id, data, session) {
  const row = parseInt(id);
  const owner = sheet.getRange(row, 7).getValue();
  if (session.role !== 'Admin' && owner !== session.username) throw new Error('Akses ditolak');
  if (data.image) {
    const oldId = sheet.getRange(row, 5).getValue();
    try { if(oldId) DriveApp.getFileById(oldId).setTrashed(true); } catch(e) {}
    const blob = Utilities.newBlob(Utilities.base64Decode(data.image.split(',')[1]), data.mimeType, "img_" + id);
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sheet.getRange(row, 5).setValue(file.getId());
    sheet.getRange(row, 6).setValue(`https://lh3.googleusercontent.com/d/${file.getId()}`);
  }
  sheet.getRange(row, 2).setValue(data.waktu);
  sheet.getRange(row, 3).setValue(data.judul.trim());
  sheet.getRange(row, 4).setValue(data.deskripsi.trim());
  return { success: true };
}

function deleteData(sheet, id, session) {
  const row = parseInt(id);
  const owner = sheet.getRange(row, 7).getValue();
  if (session.role !== 'Admin' && owner !== session.username) throw new Error('Akses ditolak');
  const imgId = sheet.getRange(row, 5).getValue();
  try { if(imgId) DriveApp.getFileById(imgId).setTrashed(true); } catch(e) {}
  sheet.deleteRow(row);
  return { success: true };
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}