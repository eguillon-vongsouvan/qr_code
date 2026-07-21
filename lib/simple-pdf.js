const PDFDocument = require('pdfkit-table');

async function buildAttendancePdfBuffer({ meta, presentRows, absentRows }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // En-tête
      doc.fontSize(20).font('Helvetica-Bold').text("Feuille de présence", { align: 'center' });
      doc.moveDown(1.5);

      // Informations de la séance
      doc.fontSize(11);
      meta.forEach(([key, val]) => {
        doc.font('Helvetica-Bold').text(`${key} : `, { continued: true })
           .font('Helvetica').text(val);
      });
      doc.moveDown(2);

      // Tableau des Présents
      const presentTable = {
        title: `Présents (${presentRows.length === 1 && presentRows[0][0] === '-' ? 0 : presentRows.length})`,
        headers: ["Prénom", "Nom", "Heure", "Statut"],
        rows: presentRows.length ? presentRows : [["-", "-", "-", "Aucun"]]
      };
      
      await doc.table(presentTable, { 
        width: 500,
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
        prepareRow: (row, indexColumn, indexRow, rectRow) => {
          doc.font("Helvetica").fontSize(10);
        }
      });
      doc.moveDown();

      // Tableau des Absents
      const absentTable = {
        title: `Absents (${absentRows.length === 1 && absentRows[0][0] === '-' ? 0 : absentRows.length})`,
        headers: ["Prénom", "Nom", "Heure", "Statut"],
        rows: absentRows.length ? absentRows : [["-", "-", "-", "Aucun"]]
      };

      await doc.table(absentTable, { 
        width: 500,
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
        prepareRow: (row, indexColumn, indexRow, rectRow) => {
          doc.font("Helvetica").fontSize(10);
        }
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildAttendancePdfBuffer };
