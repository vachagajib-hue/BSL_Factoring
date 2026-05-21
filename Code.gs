function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ดึงข้อมูลจากทั้ง 2 Sheet
    const summarySheet = ss.getSheetByName("ชื่อลูกหนี้");
    const dataSheet = ss.getSheetByName("Data1");
    
    if (!summarySheet || !dataSheet) {
      return buildResponse({ 
        status: "error", 
        message: "ไม่พบชีตชื่อ 'ชื่อลูกหนี้' หรือ 'Data1' กรุณาตรวจสอบชื่อชีตอีกครั้ง" 
      });
    }
    
    // 1. ดึงข้อมูลชีต "ชื่อลูกหนี้"
    const summaryValues = summarySheet.getDataRange().getValues();
    
    // 2. ดึงข้อมูลชีต "Data1"
    const dataValues = dataSheet.getDataRange().getValues();
    
    const responseData = {
      status: "success",
      summary: {
        headers: summaryValues.length > 0 ? summaryValues[0] : [],
        data: summaryValues.length > 1 ? summaryValues.slice(1) : []
      },
      details: {
        headers: dataValues.length > 0 ? dataValues[0] : [],
        data: dataValues.length > 1 ? dataValues.slice(1) : []
      }
    };
    
    return buildResponse(responseData);
      
  } catch (error) {
    return buildResponse({ 
      status: "error", 
      message: error.toString() 
    });
  } finally {
    lock.releaseLock();
  }
}

// ฟังก์ชันช่วยสร้าง Response พร้อม CORS Headers
function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
