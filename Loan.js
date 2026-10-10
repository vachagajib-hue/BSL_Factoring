/* =====================================================================
   หน้า 2: รายงานข้อมูล Factoring (Loan)
   แหล่งข้อมูล: ชีต BSL_รายการรับเงิน และ BSL_จ่ายBSL (ส่งมาจาก Code.gs ในคีย์ res.bsl)
   ไฟล์นี้ทำงานแยกจาก script.js — script.js เรียก initLoanPage(res.bsl) หลังโหลดข้อมูลเสร็จ
   ===================================================================== */

// ---- ตำแหน่งคอลัมน์ (เริ่มนับ 0) ต้องตรงกับชีต ----
const LOAN_TX = { cycle: 1, debtor: 2, desc: 3, workMonth: 4, due: 5, invoice: 6, postpone: 7,
                  recvDate: 10, recvAmt: 11, note: 15 };
const LOAN_PAY = { cycle: 0, chq: 1, date: 2, amount: 3, note: 4, refundDate: 5, refundAmt: 6 };

const LOAN_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const LOAN_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                         'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const LOAN_STATUS_ORDER = ['เกินกำหนด', 'รับบางส่วน', 'รับแล้ว-รอยืนยันยอด', 'รอรับ', 'รอข้อมูล', 'รับแล้ว', 'เลื่อนจ่าย'];
const LOAN_STATUS_CLASS = {
    'เกินกำหนด': 'st-overdue', 'รับบางส่วน': 'st-partial', 'รับแล้ว-รอยืนยันยอด': 'st-confirm',
    'เลื่อนจ่าย': 'st-postpone', 'รับแล้ว': 'st-paid', 'รอรับ': 'st-wait', 'รอข้อมูล': 'st-nodata'
};

let LOAN = null;                 // ผลคำนวณทั้งหมดของหน้า 2
let loanChartCover = null, loanChartAging = null;


/* ---------------------------------------------------------------------
   รับข้อมูลโดยไม่ต้องแก้ script.js:
   ดักผลลัพธ์จาก fetch ที่ script.js เรียก Apps Script อยู่แล้ว (ไม่ยิง request ซ้ำ)
   --------------------------------------------------------------------- */
let LOAN_INITED = false;
(function loanHookFetch() {
    if (!window.fetch || window.__loanFetchHooked) return;
    window.__loanFetchHooked = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const p = origFetch(input, init);
        if (url.indexOf('script.google.com/macros') !== -1) {
            p.then(r => r.clone().json())
             .then(res => {
                 if (LOAN_INITED) return;
                 if (res && res.status === 'success') initLoanPage(res.bsl);
                 else initLoanPage(null, (res && res.message) || 'Apps Script ส่งข้อมูลกลับมาไม่ถูกต้อง');
             })
             .catch(err => { if (!LOAN_INITED) initLoanPage(null, 'เชื่อมต่อ Google Sheets ไม่สำเร็จ (' + err + ')'); });
        }
        return p;
    };
})();

// ---------------- Helpers ----------------
function loanEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function loanIsBlank(v) { return v === null || v === undefined || String(v).trim() === ''; }
function loanNum(v) {
    if (loanIsBlank(v)) return null;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? null : n;
}
function loanMoney(n) {
    return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function loanToDate(v) {
    if (loanIsBlank(v)) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) { let y = +m[3]; if (y > 2400) y -= 543; return new Date(y, +m[2] - 1, +m[1]); }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function loanFmtDate(d) {
    if (!d) return '-';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function loanThaiDate(d) { return `${d.getDate()} ${LOAN_MONTH_FULL[d.getMonth()]} ${d.getFullYear() + 543}`; }
function loanDays(a, b) { return Math.round((a - b) / 86400000); }
function loanCycleLabel(c) {
    const m = String(c || '').match(/^(\d{4})-(\d{2})$/);
    return m ? `${LOAN_MONTH_SHORT[+m[2] - 1]} ${+m[1] + 543}` : String(c || '-');
}
function loanToday() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
function loanBadge(st) { return `<span class="loan-badge ${LOAN_STATUS_CLASS[st] || 'st-nodata'}">${loanEsc(st)}</span>`; }

// ---------------- คำนวณ ----------------
function loanCompute(bsl) {
    const today = loanToday();

    // 1) รายการรับเงิน — คำนวณสถานะเองด้วยเงื่อนไขเดียวกับในชีต (ไม่พึ่ง TODAY() ใน Sheets)
    const rows = (bsl.transactions.data || []).map(r => {
        const invoice = loanNum(r[LOAN_TX.invoice]);
        const due = loanToDate(r[LOAN_TX.due]);
        const recvDate = loanToDate(r[LOAN_TX.recvDate]);
        const recvAmt = loanNum(r[LOAN_TX.recvAmt]);
        const postpone = String(r[LOAN_TX.postpone] || '').trim();
        let status, late = null;
        if (postpone) status = 'เลื่อนจ่าย';
        else if (invoice === null || !due) status = 'รอข้อมูล';
        else if (recvDate) status = recvAmt === null ? 'รับแล้ว-รอยืนยันยอด' : (recvAmt < invoice - 0.005 ? 'รับบางส่วน' : 'รับแล้ว');
        else status = today > due ? 'เกินกำหนด' : 'รอรับ';
        if (!postpone && due) late = recvDate ? loanDays(recvDate, due) : loanDays(today, due);
        return {
            cycle: String(r[LOAN_TX.cycle] || '').trim(),
            debtor: String(r[LOAN_TX.debtor] || '').trim(),
            desc: r[LOAN_TX.desc] || '',
            due, invoice, postpone, recvDate, recvAmt, status, late,
            expect: postpone ? 0 : (invoice || 0),
            note: r[LOAN_TX.note] || ''
        };
    });

    // 2) เช็คสั่งจ่าย BSL
    const pays = (bsl.payments.data || []).map(r => ({
        cycle: String(r[LOAN_PAY.cycle] || '').trim(),
        chq: String(r[LOAN_PAY.chq] || '').trim(),
        date: loanToDate(r[LOAN_PAY.date]),
        amount: loanNum(r[LOAN_PAY.amount]) || 0,
        refundDate: loanToDate(r[LOAN_PAY.refundDate]),
        refundAmt: loanNum(r[LOAN_PAY.refundAmt]) || 0
    })).filter(p => p.cycle);

    // 3) สรุปรายรอบ
    const cycleSet = new Set(pays.map(p => p.cycle));
    rows.forEach(r => r.cycle && cycleSet.add(r.cycle));
    const cycles = Array.from(cycleSet).sort().map(c => {
        const p = pays.find(x => x.cycle === c) || { amount: 0, chq: '', date: null, refundAmt: 0 };
        const rs = rows.filter(r => r.cycle === c);
        const expected = rs.reduce((s, r) => s + r.expect, 0);
        const received = rs.reduce((s, r) => s + (r.recvAmt || 0), 0);
        const outstanding = rs.filter(r => !r.postpone && !r.recvDate).reduce((s, r) => s + r.expect, 0);
        const refundExpected = Math.max(0, expected - p.amount);
        return {
            cycle: c, chq: p.chq, chqDate: p.date, cheque: p.amount, refundReceived: p.refundAmt,
            expected, received, outstanding, refundExpected,
            coverage: p.amount > 0 ? expected / p.amount : null,
            overdue: rs.filter(r => r.status === 'เกินกำหนด').length,
            noData: rs.filter(r => r.status === 'รอข้อมูล').length
        };
    });

    const upcoming = pays.filter(p => p.date && p.date >= today).sort((a, b) => a.date - b.date);
    return { today, rows, pays, cycles, upcoming, next: upcoming[0] || null, asOf: bsl.asOf };
}

// ---------------- Entry point (เรียกจาก script.js) ----------------
function initLoanPage(bsl, errMsg) {
    const asof = document.getElementById('loan-asof');
    const empty = document.getElementById('loan-empty');
    const content = document.getElementById('loan-content');
    if (!asof) return;
    if (LOAN_INITED && bsl === undefined) return;   // กันการเรียกซ้ำ
    LOAN_INITED = true;
    content.classList.remove('hidden');
    empty.classList.add('hidden');

    if (!bsl || !bsl.found) {
        content.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.innerHTML = errMsg
            ? `โหลดข้อมูลไม่สำเร็จ: ${loanEsc(errMsg)}`
            : (bsl === undefined
                ? `Apps Script ยังเป็นเวอร์ชันเก่า (ไม่มีข้อมูลหน้า Loan) — วาง Code.gs ใหม่ แล้วกด <b>Deploy → จัดการการทำให้ใช้งานได้ → แก้ไข → เวอร์ชันใหม่</b>`
                : `ไม่พบชีต <b>BSL_รายการรับเงิน</b> หรือ <b>BSL_จ่ายBSL</b> ใน Google Sheet — นำเข้าไฟล์ BSL_Factoring_Tracker.xlsx (เลือก "แทรกชีตใหม่")`);
        asof.textContent = 'ไม่มีข้อมูล';
        return;
    }

    LOAN = loanCompute(bsl);
    asof.textContent = `ข้อมูลจาก Google Sheets อัปเดตเมื่อ ${bsl.asOf || loanFmtDate(LOAN.today)} น.`;
    renderLoanHero();
    renderLoanKpis();
    renderLoanAlerts();
    renderLoanCharts();
    renderLoanChequeTable();
    setupLoanFilters();
    renderLoanTxTable();
}

// ---------------- Hero: เช็คฉบับถัดไป ----------------
function renderLoanHero() {
    const el = document.getElementById('loan-next-cheque');
    const n = LOAN.next;
    if (!n) {
        el.innerHTML = `<div class="loan-cheque-main"><div class="loan-cheque-label">เช็คสั่งจ่าย BSL ฉบับถัดไป</div>
            <p class="mt-3 text-slate-600">ไม่มีเช็คที่ยังไม่ถึงกำหนด — เพิ่มเช็คงวดถัดไปในชีต BSL_จ่ายBSL</p></div><div class="loan-cheque-side"></div>`;
        return;
    }
    const c = LOAN.cycles.find(x => x.cycle === n.cycle);
    const days = loanDays(n.date, LOAN.today);
    const pct = c && c.coverage !== null ? c.coverage * 100 : 0;
    const gap = c ? c.expected - n.amount : -n.amount;
    const color = pct >= 100 ? '#15803d' : pct >= 70 ? '#d97706' : '#dc2626';

    el.innerHTML = `
        <div class="loan-cheque-main">
            <div class="loan-cheque-label">เช็คสั่งจ่าย BSL ฉบับถัดไป (รอบ ${loanEsc(loanCycleLabel(n.cycle))})</div>
            <div class="loan-cheque-amount">฿${loanMoney(n.amount)}</div>
            <div class="loan-cheque-meta">
                <span>เลขที่เช็ค <b>${loanEsc(n.chq || '-')}</b></span>
                <span>วันที่เช็ค <b>${loanFmtDate(n.date)}</b></span>
            </div>
            <span class="loan-countdown ${days <= 30 ? 'is-urgent' : ''}">${days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${days} วันครบกำหนด`}</span>
        </div>
        <div class="loan-cheque-side">
            <div class="flex items-baseline justify-between gap-3">
                <span class="loan-cheque-label" style="color:#475569">ยอดคาดรับจากลูกหนี้ครอบคลุมหน้าเช็ค</span>
                <span class="loan-cover-pct" style="color:${color}">${pct.toFixed(1)}%</span>
            </div>
            <div class="loan-meter" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100">
                <span style="width:${Math.min(pct, 100)}%;background:${color}"></span>
            </div>
            <div class="loan-cover-row"><span>ยอดคาดรับในรอบ</span><b>${loanMoney(c ? c.expected : 0)}</b></div>
            <div class="loan-cover-row"><span>รับเงินแล้ว</span><b>${loanMoney(c ? c.received : 0)}</b></div>
            <div class="loan-cover-row"><span>${gap >= 0 ? 'เกินหน้าเช็ค (เงินคืน)' : 'ยังขาดจากหน้าเช็ค'}</span>
                <b style="color:${gap >= 0 ? '#15803d' : '#dc2626'}">${loanMoney(Math.abs(gap))}</b></div>
            ${c && c.noData ? `<p class="text-xs text-amber-700 mt-2">มี ${c.noData} รายการในรอบนี้ที่ยังไม่ได้กรอกยอดหรือวันคาดรับ</p>` : ''}
        </div>`;
}

// ---------------- KPI ----------------
function renderLoanKpis() {
    const future = LOAN.upcoming;
    const futureSum = future.reduce((s, p) => s + p.amount, 0);
    const overdue = LOAN.rows.filter(r => r.status === 'เกินกำหนด');
    const overdueSum = overdue.reduce((s, r) => s + r.expect, 0);
    const maxLate = overdue.reduce((m, r) => Math.max(m, r.late || 0), 0);
    const refundPending = LOAN.cycles.reduce((s, c) => s + Math.max(0, c.refundExpected - c.refundReceived), 0);
    const refundUncertain = LOAN.cycles.some(c => c.refundExpected > c.refundReceived && c.outstanding > 0);
    const noData = LOAN.rows.filter(r => r.status === 'รอข้อมูล').length;

    const cards = [
        { t: 'ภาระเช็ค BSL คงเหลือ', v: loanMoney(futureSum),
          n: future.length ? `${future.length} ฉบับ ถึง ${loanFmtDate(future[future.length - 1].date)}` : 'ไม่มีเช็คค้างจ่าย' },
        { t: 'ยอดค้างรับเกินกำหนด', v: loanMoney(overdueSum), red: overdueSum > 0,
          n: overdue.length ? `${overdue.length} รายการ นานสุด ${maxLate} วัน` : 'ไม่มีรายการเกินกำหนด' },
        { t: 'เงินคืนรอรับจาก BSL', v: loanMoney(refundPending),
          n: refundPending > 0 ? (refundUncertain ? 'ยังไม่แน่นอน เพราะยังมียอดค้างรับในรอบ' : 'ยอดรับเกินหน้าเช็ค รอ BSL โอนคืน') : 'ไม่มีเงินคืนค้างรับ' },
        { t: 'รายการรอข้อมูล', v: `${noData} รายการ`, amber: noData > 0,
          n: noData ? 'ต้องกรอกยอดตามใบแจ้งหนี้หรือวันคาดรับ' : 'ข้อมูลครบ' }
    ];
    document.getElementById('loan-kpis').innerHTML = cards.map(c => `
        <div class="loan-kpi">
            <div class="loan-kpi-title">${c.t}</div>
            <div class="loan-kpi-value" style="${c.red ? 'color:#dc2626' : c.amber ? 'color:#b45309' : ''}">${c.v}</div>
            <div class="loan-kpi-note">${loanEsc(c.n)}</div>
        </div>`).join('');
}

// ---------------- Alerts ----------------
function loanBuildAlerts() {
    const items = [];
    // 1) เช็คที่ยังไม่ถึงกำหนด แต่ยอดคาดรับไม่พอ (3 ฉบับถัดไป)
    const upcomingCycles = LOAN.upcoming.map(p => LOAN.cycles.find(c => c.cycle === p.cycle)).filter(Boolean);
    upcomingCycles.slice(0, 3).forEach(c => {
        if (c.expected < c.cheque) {
            items.push(c.expected === 0
                ? `รอบ ${loanCycleLabel(c.cycle)} เช็ค ${c.chq} วันที่ ${loanFmtDate(c.chqDate)} ยอด ${loanMoney(c.cheque)} — ยังไม่มีข้อมูลยอดคาดรับจากลูกหนี้`
                : `รอบ ${loanCycleLabel(c.cycle)} เช็ค ${c.chq} วันที่ ${loanFmtDate(c.chqDate)} — ยอดคาดรับครอบคลุม ${(c.coverage * 100).toFixed(1)}% ยังขาด ${loanMoney(c.cheque - c.expected)} บาท`);
        }
    });
    const restShort = upcomingCycles.slice(3).filter(c => c.expected < c.cheque).length;
    if (restShort) items.push(`รอบถัดไปอีก ${restShort} รอบ ยอดคาดรับยังต่ำกว่าหน้าเช็ค`);

    // 2) เกินกำหนดเกิน 7 วัน
    LOAN.rows.filter(r => r.status === 'เกินกำหนด' && r.late > 7)
        .sort((a, b) => b.late - a.late)
        .forEach(r => items.push(`${r.debtor} ยอด ${loanMoney(r.expect)} เกินกำหนด ${r.late} วัน (คาดรับ ${loanFmtDate(r.due)})`));

    // 3) เงินคืนที่ยังไม่แน่นอน
    LOAN.cycles.filter(c => c.refundExpected > c.refundReceived && c.outstanding > 0)
        .forEach(c => items.push(`เงินคืนรอบ ${loanCycleLabel(c.cycle)} ${loanMoney(c.refundExpected)} ยังไม่แน่นอน เพราะยังมียอดค้างรับ ${loanMoney(c.outstanding)}`));

    // 4) เลื่อนจ่ายแล้ว แต่ยังไม่ได้เพิ่มแถวในรอบใหม่ (Internal Control)
    LOAN.rows.filter(r => r.postpone).forEach(r => {
        const moved = LOAN.rows.some(x => x !== r && x.cycle === r.postpone && x.debtor === r.debtor
            && x.invoice !== null && Math.abs(x.invoice - (r.invoice || 0)) < 0.01);
        if (!moved) items.push(`${r.debtor} "${r.desc}" ระบุเลื่อนไปรอบ ${loanCycleLabel(r.postpone)} แต่ยังไม่มีแถวในรอบนั้น — ยอดนี้จะหายจากการติดตาม`);
    });
    return items;
}
function renderLoanAlerts() {
    const items = loanBuildAlerts();
    document.getElementById('loan-alerts').innerHTML = items.length
        ? `<div class="loan-alert is-red"><h3 class="text-rose-700">สิ่งที่ต้องติดตาม (${items.length})</h3>
              <ul class="list-disc pl-5">${items.map(i => `<li>${loanEsc(i)}</li>`).join('')}</ul></div>`
        : `<div class="loan-alert is-ok"><h3 class="text-emerald-700">ไม่มีรายการที่ต้องติดตาม</h3>
              <p class="text-sm text-slate-600">ยอดคาดรับครอบคลุมเช็คฉบับถัดไป และไม่มียอดเกินกำหนดเกิน 7 วัน</p></div>`;
}

// ---------------- Charts ----------------
function renderLoanCharts() {
    if (typeof Chart === 'undefined') return;
    const cy = LOAN.cycles;
    const noLabels = { datalabels: { display: false } };
    const moneyTick = v => '฿' + (v / 1000000).toFixed(0) + 'M';
    const tip = ctx => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y1' ? ctx.parsed.y.toFixed(1) + '%' : loanMoney(ctx.parsed.y ?? ctx.parsed.x)}`;

    const coverData = {
        labels: cy.map(c => loanCycleLabel(c.cycle)),
        datasets: [
            { type: 'bar', label: 'หน้าเช็ค BSL', data: cy.map(c => c.cheque), backgroundColor: '#94a3b8', yAxisID: 'y', order: 2 },
            { type: 'bar', label: 'ยอดคาดรับ', data: cy.map(c => c.expected), backgroundColor: '#2F5D50', yAxisID: 'y', order: 2 },
            { type: 'bar', label: 'รับเงินแล้ว', data: cy.map(c => c.received), backgroundColor: '#8fbfae', yAxisID: 'y', order: 2 },
            { type: 'line', label: '% ครอบคลุม', data: cy.map(c => c.coverage === null ? null : +(c.coverage * 100).toFixed(1)),
              borderColor: '#16a34a', backgroundColor: '#16a34a', yAxisID: 'y1', tension: 0.2, pointRadius: 4, order: 1 }
        ]
    };
    if (loanChartCover) { loanChartCover.data = coverData; loanChartCover.update(); }
    else loanChartCover = new Chart(document.getElementById('loanCoverageChart'), {
        data: coverData,
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { ...noLabels, legend: { position: 'top' }, tooltip: { callbacks: { label: tip } } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: moneyTick } },
                y1: { position: 'right', beginAtZero: true, suggestedMax: 120, grid: { drawOnChartArea: false },
                      ticks: { callback: v => v + '%' } }
            }
        }
    });

    // Aging: เฉพาะยอดที่ยังไม่ได้รับ
    const buckets = [
        { k: 'ยังไม่ถึงกำหนด', c: '#cbd5e1', f: d => d <= 0 },
        { k: 'เกิน 1–7 วัน', c: '#fbbf24', f: d => d >= 1 && d <= 7 },
        { k: 'เกิน 8–15 วัน', c: '#f97316', f: d => d >= 8 && d <= 15 },
        { k: 'เกิน 16–30 วัน', c: '#dc2626', f: d => d >= 16 && d <= 30 },
        { k: 'เกิน 30 วัน', c: '#7f1d1d', f: d => d > 30 }
    ];
    const open = LOAN.rows.filter(r => !r.postpone && !r.recvDate && r.expect > 0 && r.late !== null);
    const debtors = Array.from(new Set(open.map(r => r.debtor)));
    const agingData = {
        labels: debtors,
        datasets: buckets.map(b => ({
            label: b.k, backgroundColor: b.c,
            data: debtors.map(d => open.filter(r => r.debtor === d && b.f(r.late)).reduce((s, r) => s + r.expect, 0))
        }))
    };
    if (loanChartAging) { loanChartAging.data = agingData; loanChartAging.update(); }
    else loanChartAging = new Chart(document.getElementById('loanAgingChart'), {
        type: 'bar', data: agingData,
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { ...noLabels, legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                       tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${loanMoney(ctx.parsed.x)}` } } },
            scales: { x: { stacked: true, ticks: { callback: v => (v / 1000000).toFixed(1) + 'M' } }, y: { stacked: true } }
        }
    });
}

// ---------------- ตารางเช็คสั่งจ่าย BSL ----------------
function loanChequeStatus(c) {
    if (!c.chqDate) return '<span class="loan-badge st-nodata">ไม่มีวันที่เช็ค</span>';
    const d = loanDays(c.chqDate, LOAN.today);
    if (d < 0) return '<span class="loan-badge st-postpone">ครบกำหนดแล้ว</span>';
    if (d === 0) return '<span class="loan-badge st-overdue">ครบกำหนดวันนี้</span>';
    if (d <= 30) return `<span class="loan-badge st-overdue">อีก ${d} วัน</span>`;
    return `<span class="loan-badge st-wait">อีก ${d} วัน</span>`;
}
function renderLoanChequeTable() {
    const cy = LOAN.cycles.filter(c => c.cheque > 0 || c.chq);
    const nextCycle = LOAN.next ? LOAN.next.cycle : null;
    const tot = k => cy.reduce((s, c) => s + (c[k] || 0), 0);
    const body = cy.map(c => {
        const diff = c.expected - c.cheque;
        return `<tr class="${c.cycle === nextCycle ? 'is-current' : ''}">
            <td class="ctr font-bold">${loanEsc(loanCycleLabel(c.cycle))}</td>
            <td class="ctr">${loanEsc(c.chq || '-')}</td>
            <td class="ctr">${loanFmtDate(c.chqDate)}</td>
            <td class="num font-bold">${loanMoney(c.cheque)}</td>
            <td class="num">${loanMoney(c.expected)}</td>
            <td class="num">${c.coverage === null ? '-' : (c.coverage * 100).toFixed(1) + '%'}</td>
            <td class="num" style="color:${diff >= 0 ? '#15803d' : '#dc2626'}">${loanMoney(diff)}</td>
            <td class="num">${c.refundReceived ? loanMoney(c.refundReceived) : '-'}</td>
            <td class="ctr">${loanChequeStatus(c)}</td>
        </tr>`;
    }).join('');
    const totDiff = tot('expected') - tot('cheque');
    document.getElementById('loan-cheque-table').innerHTML = `
        <thead><tr><th>รอบ BSL</th><th>เลขที่เช็ค</th><th>วันที่เช็ค</th><th>ยอดจ่าย BSL</th><th>ยอดคาดรับ</th>
            <th>% ครอบคลุม</th><th>ส่วนต่าง</th><th>เงินคืนรับจริง</th><th>สถานะเช็ค</th></tr></thead>
        <tbody>${body || '<tr><td colspan="9" class="ctr text-slate-400 p-6">ยังไม่มีข้อมูลเช็คในชีต BSL_จ่ายBSL</td></tr>'}</tbody>
        <tfoot><tr><td class="ctr" colspan="3">รวม ${cy.length} ฉบับ</td>
            <td class="num">${loanMoney(tot('cheque'))}</td><td class="num">${loanMoney(tot('expected'))}</td><td></td>
            <td class="num" style="color:${totDiff >= 0 ? '#15803d' : '#dc2626'}">${loanMoney(totDiff)}</td>
            <td class="num">${loanMoney(tot('refundReceived'))}</td><td></td></tr></tfoot>`;
}

// ---------------- ตารางรายการรับเงิน ----------------
function setupLoanFilters() {
    const fc = document.getElementById('loan-f-cycle');
    const fs = document.getElementById('loan-f-status');
    const cycles = Array.from(new Set(LOAN.rows.map(r => r.cycle).filter(Boolean))).sort();
    const statuses = LOAN_STATUS_ORDER.filter(s => LOAN.rows.some(r => r.status === s));
    fc.innerHTML = '<option value="">ทุกรอบ</option>' + cycles.map(c => `<option value="${loanEsc(c)}">${loanEsc(loanCycleLabel(c))}</option>`).join('');
    fs.innerHTML = '<option value="">ทุกสถานะ</option>' + statuses.map(s => `<option value="${loanEsc(s)}">${loanEsc(s)}</option>`).join('');
    if (!fc._bound) {
        fc.addEventListener('change', renderLoanTxTable);
        fs.addEventListener('change', renderLoanTxTable);
        fc._bound = true;
    }
}
function renderLoanTxTable() {
    const cyc = document.getElementById('loan-f-cycle').value;
    const st = document.getElementById('loan-f-status').value;
    const list = LOAN.rows
        .filter(r => r.debtor && (!cyc || r.cycle === cyc) && (!st || r.status === st))
        .sort((a, b) => a.cycle.localeCompare(b.cycle) || ((a.due ? a.due.getTime() : 9e15) - (b.due ? b.due.getTime() : 9e15)));
    const body = list.map(r => `<tr>
        <td class="ctr">${loanEsc(loanCycleLabel(r.cycle))}</td>
        <td class="font-bold text-slate-800">${loanEsc(r.debtor)}</td>
        <td>${loanEsc(r.desc)}</td>
        <td class="ctr">${loanFmtDate(r.due)}</td>
        <td class="num" style="${r.postpone ? 'color:#94a3b8;text-decoration:line-through' : ''}">${r.invoice === null ? '-' : loanMoney(r.invoice)}</td>
        <td class="ctr">${loanFmtDate(r.recvDate)}</td>
        <td class="num">${r.recvAmt === null ? '-' : loanMoney(r.recvAmt)}</td>
        <td class="num" style="color:${r.late > 0 && !r.recvDate ? '#dc2626' : '#475569'}">${r.late === null ? '-' : r.late}</td>
        <td class="ctr">${loanBadge(r.status)}</td>
        <td class="text-slate-500">${loanEsc(r.note)}</td>
    </tr>`).join('');
    const sumExp = list.reduce((s, r) => s + r.expect, 0);
    const sumRecv = list.reduce((s, r) => s + (r.recvAmt || 0), 0);
    document.getElementById('loan-tx-table').innerHTML = `
        <thead><tr><th>รอบ BSL</th><th>ลูกหนี้</th><th>รายละเอียด</th><th>วันคาดรับ</th><th>ยอดตามใบแจ้งหนี้</th>
            <th>วันเงินเข้า</th><th>ยอดเงินเข้า</th><th>วันล่าช้า</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead>
        <tbody>${body || '<tr><td colspan="10" class="ctr text-slate-400 p-6">ไม่มีรายการตามตัวกรองที่เลือก</td></tr>'}</tbody>
        <tfoot><tr><td colspan="4">รวม ${list.length} รายการ (ไม่นับยอดที่เลื่อนจ่าย)</td>
            <td class="num">${loanMoney(sumExp)}</td><td></td><td class="num">${loanMoney(sumRecv)}</td><td colspan="3"></td></tr></tfoot>`;
}

// ---------------- Tabs ----------------
function loanShowPage(id) {
    ['page1', 'page2'].forEach(p => {
        const panel = document.getElementById(p);
        const tab = document.querySelector(`.bsl-tab[data-page="${p}"]`);
        if (!panel || !tab) return;
        const on = p === id;
        panel.classList.toggle('hidden', !on);
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    // ปุ่มเฉพาะหน้า 1
    ['btnDailyPDF', 'btnToggleDetailTables'].forEach(bid => {
        const b = document.getElementById(bid);
        if (b) b.classList.toggle('hidden', id !== 'page1');
    });
    // หน้า 2 เป็นหน้าเริ่มต้น — ลิงก์ตรงไปหน้า 1 ใช้ #overview
    if (history.replaceState) history.replaceState(null, '', id === 'page1' ? '#overview' : location.pathname + location.search);
    if (id === 'page2') { if (loanChartCover) loanChartCover.resize(); if (loanChartAging) loanChartAging.resize(); }
    if (id === 'page1' && typeof c1Inst !== 'undefined') { if (c1Inst) c1Inst.resize(); if (c2Inst) c2Inst.resize(); }
}

// ---------------- PDF รายงานหน้า 2 ----------------
function loanGeneratePDF() {
    if (!LOAN) { alert('ข้อมูลยังโหลดไม่เสร็จ กรุณารอสักครู่'); return; }
    const t = LOAN.today;
    const kpiHtml = document.getElementById('loan-kpis').innerText ? Array.from(document.querySelectorAll('#loan-kpis .loan-kpi')).map(k =>
        `<td><div class="k-t">${loanEsc(k.querySelector('.loan-kpi-title').textContent)}</div>
             <div class="k-v">${loanEsc(k.querySelector('.loan-kpi-value').textContent)}</div>
             <div class="k-n">${loanEsc(k.querySelector('.loan-kpi-note').textContent)}</div></td>`).join('') : '';
    const alerts = loanBuildAlerts();
    let chartImg = '';
    try { if (loanChartCover) chartImg = loanChartCover.toBase64Image('image/png', 1); } catch (e) { /* ข้ามรูปกราฟ */ }
    const chequeTable = document.getElementById('loan-cheque-table').outerHTML;
    const open = LOAN.rows.filter(r => !r.postpone && !r.recvDate && r.expect > 0)
        .sort((a, b) => (b.late || 0) - (a.late || 0));
    const openRows = open.map(r => `<tr><td>${loanEsc(loanCycleLabel(r.cycle))}</td><td>${loanEsc(r.debtor)}</td><td>${loanEsc(r.desc)}</td>
        <td class="ctr">${loanFmtDate(r.due)}</td><td class="num">${loanMoney(r.expect)}</td>
        <td class="num">${r.late === null ? '-' : r.late}</td><td class="ctr">${loanEsc(r.status)}</td></tr>`).join('');
    const openSum = open.reduce((s, r) => s + r.expect, 0);

    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) { alert('เบราว์เซอร์บล็อก popup กรุณาอนุญาต popup สำหรับเว็บไซต์นี้'); return; }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title> </title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  body { font-family: 'Sarabun', sans-serif; color: #1e293b; margin: 0; padding: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sign { background: linear-gradient(180deg,#ef4444 0%,#e11d2e 55%,#b91c1c 100%); padding: 4px 20px 10px; position: relative; }
  .sign .corner { text-align: right; font-size: 10px; font-weight: 700; color: #fff; letter-spacing: .18em; }
  .sign .row { display: flex; align-items: center; gap: 18px; }
  .sign .line { flex: 1; height: 4px; background: #fff; }
  .sign .title { font-size: 30px; font-weight: 800; color: #fff; font-style: italic; text-shadow: 0 2px 0 #64748b; }
  .sign .fin { position: absolute; right: 20px; bottom: 6px; font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .25em; font-style: italic; }
  .strip1 { height: 8px; background: linear-gradient(180deg,#cbd5e1,#94a3b8); } .strip2 { height: 4px; background: #475569; }
  h1 { text-align: center; font-size: 18px; margin: 12px 0 2px; } .sub { text-align: center; font-size: 12px; color: #475569; margin-bottom: 12px; }
  h2 { font-size: 13px; color: #2F5D50; margin: 14px 0 6px; border-left: 4px solid #2F5D50; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #2F5D50; color: #fff; padding: 6px; border: 1px solid #3f7466; }
  td { border: 1px solid #cbd5e1; padding: 5px 7px; } .num { text-align: right; white-space: nowrap; } .ctr { text-align: center; }
  tfoot td { background: #f1f5f9; font-weight: 800; } tr.is-current td { background: #fff7ed; }
  .kpi td { width: 25%; vertical-align: top; } .k-t { font-size: 10px; color: #64748b; font-weight: 700; }
  .k-v { font-size: 16px; font-weight: 800; } .k-n { font-size: 9px; color: #64748b; }
  .loan-badge { font-weight: 700; } ul { margin: 0; padding-left: 18px; font-size: 11px; } li { padding: 2px 0; }
  .chart { text-align: center; } .chart img { max-width: 100%; max-height: 240px; }
  .avoid { page-break-inside: avoid; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 48px; text-align: center; font-size: 10px; color: #64748b; font-weight: 700; }
  .sigs div { border-top: 1px solid #94a3b8; padding-top: 6px; margin: 0 24px; }
</style></head><body>
  <div class="sign"><div class="corner">บริษัท รถเจาะไทย จำกัด</div>
    <div class="row"><div class="line"></div><div class="title">ThaiDrill</div><div class="line"></div></div>
    <div class="fin">Finance</div></div>
  <div class="strip1"></div><div class="strip2"></div>
  <h1>รายงานข้อมูล Factoring (Loan) — BSL</h1>
  <div class="sub">บริษัท รถเจาะไทย จำกัด ข้อมูล ณ วันที่ ${loanThaiDate(t)}</div>
  <table class="kpi avoid"><tr>${kpiHtml}</tr></table>
  <div class="avoid"><h2>สิ่งที่ต้องติดตาม</h2>
    ${alerts.length ? `<ul>${alerts.map(a => `<li>${loanEsc(a)}</li>`).join('')}</ul>` : '<p style="font-size:11px">ไม่มีรายการที่ต้องติดตาม</p>'}</div>
  ${chartImg ? `<div class="avoid chart"><h2>หน้าเช็ค BSL เทียบยอดรับจากลูกหนี้ รายรอบ</h2><img src="${chartImg}" alt=""></div>` : ''}
  <div class="avoid"><h2>ตารางเช็คสั่งจ่าย BSL</h2>${chequeTable}</div>
  <div><h2>ยอดค้างรับจากลูกหนี้ (ยังไม่มีวันที่เงินเข้า)</h2>
    <table><thead><tr><th>รอบ</th><th>ลูกหนี้</th><th>รายละเอียด</th><th>วันคาดรับ</th><th>ยอด</th><th>วันล่าช้า</th><th>สถานะ</th></tr></thead>
    <tbody>${openRows || '<tr><td colspan="7" class="ctr">ไม่มียอดค้างรับ</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">รวม ${open.length} รายการ</td><td class="num">${loanMoney(openSum)}</td><td colspan="2"></td></tr></tfoot></table></div>
  <div class="sigs avoid"><div>ผู้จัดทำ</div><div>ผู้ตรวจสอบ</div><div>ผู้อนุมัติ</div></div>
<script>
  window.addEventListener('load', function () {
    var go = function () { setTimeout(function () { window.focus(); window.print(); }, 300); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else setTimeout(go, 600);
  });
<\/script></body></html>`);
    w.document.close();
}

// ---------------- Bind ----------------
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.bsl-tab').forEach(tab => {
        tab.addEventListener('click', () => loanShowPage(tab.dataset.page));
        tab.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = tab.dataset.page === 'page1' ? 'page2' : 'page1';
            loanShowPage(next);
            document.querySelector(`.bsl-tab[data-page="${next}"]`).focus();
        });
    });
    // แจ้งเมื่อ Google Sheets ตอบช้า
    const t0 = Date.now();
    const slowTimer = setInterval(() => {
        if (LOAN_INITED) { clearInterval(slowTimer); return; }
        const sec = Math.round((Date.now() - t0) / 1000);
        const el = document.getElementById('loan-asof');
        if (el && sec >= 8) el.textContent = `กำลังโหลดข้อมูลจาก Google Sheets… (${sec} วินาที)`;
        if (sec >= 60) {
            clearInterval(slowTimer);
            initLoanPage(null, 'Google Sheets ไม่ตอบกลับภายใน 60 วินาที — กด F5 เพื่อลองใหม่');
        }
    }, 1000);
    const btn = document.getElementById('btnLoanPDF');
    if (btn) btn.addEventListener('click', loanGeneratePDF);
    // หน้าเริ่มต้น = หน้า 2 (รายงานข้อมูล Factoring (Loan)); เปิดหน้า 1 ตรงได้ด้วย #overview
    loanShowPage(location.hash === '#overview' ? 'page1' : 'page2');
});
