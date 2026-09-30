/* Jungle Gym expired membership report. Uses locally hosted jsPDF and AutoTable. */
(() => {
  'use strict';

  function loadLogo(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) { reject(error); }
      };
      image.onerror = () => reject(new Error('The Jungle Gym logo could not be loaded. Refresh and try again.'));
      image.src = url;
    });
  }

  function create(rows, { logoData, generatedAt = new Date() }) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF tools did not load. Refresh and try again.');
    if (!logoData) throw new Error('The report requires the Jungle Gym logo.');
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    doc.setCreationDate(generatedAt);
    if (typeof doc.autoTable !== 'function') throw new Error('PDF table tools did not load. Refresh and try again.');
    doc.setProperties({ title: 'Jungle Gym - Expired Memberships Report', author: 'Jungle Gym', subject: 'Expired membership contact details' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 14;
    const date = generatedAt.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric' });
    const time = generatedAt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: false });
    const value = item => String(item ?? '').trim() || 'Not recorded';
    const ordered = [...rows].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')) || String(a.member_code || '').localeCompare(String(b.member_code || '')));

    doc.autoTable({
      startY: 51,
      margin: { top: 51, right: margin, bottom: 18, left: margin },
      head: [['No.', 'Member name', 'Membership ID', 'NIC / Passport / DL', 'Email address', 'Contact number']],
      body: ordered.map((row, index) => [String(index + 1), value(row.full_name), value(row.member_code), value(row.identity_number), value(row.email), value(row.phone)]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak', valign: 'middle', textColor: [23, 31, 23], lineColor: [224, 231, 224], lineWidth: .15 },
      headStyles: { fillColor: [23, 36, 24], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [244, 248, 239] },
      columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 66 }, 2: { cellWidth: 34 }, 3: { cellWidth: 43 }, 4: { cellWidth: 77 }, 5: { cellWidth: 37 } },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      didDrawPage: () => {
        doc.addImage(logoData, 'PNG', margin, 10, 27, 27);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(68, 101, 27);
        doc.text('JUNGLE GYM', margin + 34, 17);
        doc.setTextColor(23, 31, 23);
        doc.setFontSize(19);
        doc.text('Expired Memberships Report', margin + 34, 27);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(91, 104, 91);
        doc.text(`Generated: ${date} at ${time} (Sri Lanka)`, margin + 34, 35);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total expired members: ${ordered.length}`, width - margin, 35, { align: 'right' });
        doc.setDrawColor(142, 184, 58);
        doc.setLineWidth(.7);
        doc.line(margin, 43, width - margin, 43);
      }
    });

    const pages = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setDrawColor(219, 226, 219);
      doc.setLineWidth(.2);
      doc.line(margin, height - 14, width - margin, height - 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 111, 100);
      doc.text('Jungle Gym | Membership Administration', margin, height - 9);
      doc.text(`Page ${page} of ${pages}`, width - margin, height - 9, { align: 'right' });
    }
    return doc;
  }

  window.JungleGymExpiredReport = { create, loadLogo };
})();
