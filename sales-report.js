/* Monthly payment history and printable sales report. */
(() => {
  'use strict';
  const value = v => String(v ?? '').trim() || 'Not recorded';
  function bounds(month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
    const [year, m] = month.split('-').map(Number);
    return { start: `${month}-01`, end: `${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01` };
  }
  function cents(amount) {
    if (amount == null || String(amount).trim() === '') return null;
    const number = Number(amount);
    if (!Number.isFinite(number)) throw new Error('A payment has an invalid amount.');
    return Math.round(number * 100);
  }
  const money = amount => (amount / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const label = month => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Colombo' });
  async function fetchRows(db, month) {
    const { start, end } = bounds(month);
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('membership_records')
        .select('*,member:members(full_name,member_code,phone)')
        .gte('payment_date', start).lt('payment_date', end)
        .order('payment_date').order('id').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    return rows.map(row => {
      const member = Array.isArray(row.member) ? row.member[0] : row.member;
      return { name: value(member?.full_name), memberId: value(member?.member_code), package: value(row.plan_name), phone: value(member?.phone), receipt: value(row.receipt_number), paymentDate: row.payment_date, amount: cents(row.paid_amount), staff: value(row.issued_by_staff) };
    });
  }
  function date(value) { const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Not recorded'; }
  function total(rows) { return rows.reduce((sum, row) => sum + (row.amount ?? 0), 0); }
  function create(rows, { month, logoData, generatedAt = new Date() }) {
    bounds(month);
    if (!logoData) throw new Error('The Jungle Gym logo could not be loaded.');
    if (!window.jspdf?.jsPDF) throw new Error('PDF tools did not load. Refresh and try again.');
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    if (!doc.autoTable) throw new Error('PDF table tools did not load.');
    doc.setCreationDate(generatedAt);
    doc.setProperties({ title: `Jungle Gym - Monthly Sales Report - ${label(month)}`, author: 'Jungle Gym' });
    const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
    const missing = rows.filter(row => row.amount == null).length;
    const generated = generatedAt.toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' });
    doc.autoTable({
      startY: 54, margin: { top: 54, left: 14, right: 14, bottom: 18 },
      head: [['No.', 'Member name', 'Membership ID', 'Package', 'Phone number', 'Receipt number', 'Payment date', 'Amount (LKR)', 'Staff member']],
      body: rows.length ? rows.map((r, i) => [i + 1, r.name, r.memberId, r.package, r.phone, r.receipt, date(r.paymentDate), r.amount == null ? 'Not recorded' : money(r.amount), r.staff]) : [[{ content: 'No payments recorded for this month.', colSpan: 9 }]],
      foot: [[{ content: 'TOTAL RECORDED SALES (LKR)', colSpan: 7, styles: { halign: 'right' } }, money(total(rows)), '']],
      showFoot: 'lastPage', showHead: 'everyPage', rowPageBreak: 'avoid', theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', valign: 'middle', textColor: [23,31,23], lineWidth: .15, lineColor: [224,231,224] },
      headStyles: { fillColor: [23,36,24], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [229,241,210], textColor: [23,36,24], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244,248,239] },
      columnStyles: { 0:{cellWidth:10,cellPadding:2},1:{cellWidth:43},2:{cellWidth:31},3:{cellWidth:36},4:{cellWidth:27},5:{cellWidth:26},6:{cellWidth:26},7:{cellWidth:32,halign:'right'},8:{cellWidth:38} },
      didDrawPage: () => {
        doc.addImage(logoData, 'PNG', 14, 10, 27, 27);
        doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(68,101,27); doc.text('JUNGLE GYM',48,17);
        doc.setTextColor(23,31,23); doc.setFontSize(19); doc.text('Monthly Sales Report',48,27);
        doc.setFontSize(10); doc.text(`Payment month: ${label(month)}`,48,35);
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(91,104,91);
        doc.text(`Generated: ${generated} (Sri Lanka) | ${rows.length} membership records`,48,42);
        if (missing) doc.text(`${missing} record(s) without amounts are excluded from the total.`,width-14,49,{align:'right'});
        doc.setDrawColor(142,184,58); doc.setLineWidth(.7); doc.line(14,46,width-14,46);
      }
    });
    const pages = doc.internal.getNumberOfPages();
    for (let p=1; p<=pages; p++) {
      doc.setPage(p); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,111,100);
      doc.setDrawColor(219,226,219); doc.line(14,height-14,width-14,height-14);
      doc.text('Jungle Gym | Sales based on recorded payment dates',14,height-9);
      doc.text(`Page ${p} of ${pages}`,width-14,height-9,{align:'right'});
    }
    return doc;
  }
  window.JungleGymSalesReport = { bounds, cents, money, date, label, fetchRows, total, create };
})();
