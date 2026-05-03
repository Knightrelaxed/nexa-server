const googleWorkspace = require('../infrastructure/Google_Workspace');

/**
 * Handle generic spreadsheet intents (CREATE_OR_APPEND, DELETE)
 * 
 * @param {Object} data 
 * @param {string} data.action "CREATE_OR_APPEND" | "DELETE"
 * @param {string} data.table_name Name of the spreadsheet
 * @param {Object} data.data Key-value pairs of the row data
 * @returns {Object} Result object with status and message
 */
async function processSpreadsheetIntent(data) {
  const { action, table_name, data: rowData } = data;

  if (!table_name) {
    return { status: 'FAILED', message: 'Nama tabel tidak spesifik.' };
  }

  try {
    if (action === 'DELETE') {
      const fileId = await googleWorkspace.findSpreadsheetByTitle(table_name);
      if (fileId) {
        await googleWorkspace.deleteGenericSpreadsheet(fileId);
        return { status: 'SUCCESS', message: `✅ Tabel "${table_name}" berhasil dihapus dari Google Drive.` };
      } else {
        return { status: 'FAILED', message: `⚠️ Tabel "${table_name}" tidak ditemukan.` };
      }
    }

    if (action === 'CREATE_OR_APPEND') {
      if (!rowData || Object.keys(rowData).length === 0) {
        return { status: 'FAILED', message: 'Data yang akan disimpan kosong.' };
      }

      let spreadsheetId = await googleWorkspace.findSpreadsheetByTitle(table_name);
      let headers = [];
      let isNew = false;
      let url = '';

      if (!spreadsheetId) {
        // Create new spreadsheet
        console.log(`[SPREADSHEET] Tabel "${table_name}" tidak ditemukan. Membuat baru...`);
        headers = Object.keys(rowData);
        
        // Add timestamp as the first column automatically for auditing
        if (!headers.includes('Timestamp')) {
          headers.unshift('Timestamp');
          rowData['Timestamp'] = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        }

        const result = await googleWorkspace.createGenericSpreadsheet(table_name, headers);
        spreadsheetId = result.id;
        url = result.url;
        isNew = true;
      } else {
        // Fetch existing headers
        headers = await googleWorkspace.getSpreadsheetHeaders(spreadsheetId);
        url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
        
        // Auto-inject timestamp if the header exists
        if (headers.includes('Timestamp') && !rowData['Timestamp']) {
          rowData['Timestamp'] = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        }
      }

      // Map rowData object to array based on headers
      const values = headers.map(header => {
        // Use regex to allow case-insensitive and slight variation matching
        const key = Object.keys(rowData).find(k => k.toLowerCase().trim() === header.toLowerCase().trim());
        return key ? rowData[key] : '';
      });

      // Append the row
      await googleWorkspace.appendGenericRow(spreadsheetId, values);

      if (isNew) {
        return { 
          status: 'SUCCESS', 
          message: `✅ Tabel baru "${table_name}" berhasil dibuat dan data disimpan.\n\nLink: ${url}` 
        };
      } else {
        return { 
          status: 'SUCCESS', 
          message: `✅ Data berhasil ditambahkan ke tabel "${table_name}".\n\nLink: ${url}` 
        };
      }
    }

    return { status: 'FAILED', message: `Aksi tidak dikenali: ${action}` };
  } catch (error) {
    console.error('[SPREADSHEET_MANAGER] Error:', error.message);
    return { status: 'FAILED', message: `Terjadi kesalahan saat memproses tabel: ${error.message}` };
  }
}

module.exports = {
  processSpreadsheetIntent
};
