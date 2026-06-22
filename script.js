// --- Global State ---
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

let RAW_DATA1 = []; 
let SUMMARY_MAP = {}; 
let INITIAL_CHART_DATA = { chart1: [], chart2: [] }; 
let selectedNotes = new Set();
let uniqueNotesList = [];
let selectedMonths = new Set();
let uniqueMonthsList = [];
let selectedYears = new Set();
let uniqueYearsList = [];
let selectedStatuses = new Set();
let uniqueStatusList = [];
let advSelectedStatuses = new Set();
let advSelectedMonths = new Set();
let advSelectedYears = new Set();
let advUniqueStatusList = [];
let advUniqueMonthsList = [];
let advUniqueYearsList = [];

const KPI_DATA = [
    { title: "ชื่อบริษัท", amount: "กำลังโหลด...", color: "text-indigo-600", bg: "bg-indigo-50" },
    { title: "รายละเอียดงาน", amount: "กำลังโหลด...", color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "เครดิต", amount: "กำลังโหลด...", color: "text-amber-600", bg: "bg-amber-50" },
    { title: "วงเงินแต่ละหน้างาน", amount: "กำลังโหลด...", color: "text-blue-600", bg: "bg-blue-50" },
    { title: "วงเงินที่ใช้ไป", amount: "กำลังโหลด...", color: "text-purple-600", bg: "bg-purple-50" },
    { title: "วงเงินคงเหลือ", amount: "กำลังโหลด...", color: "text-rose-600", bg: "bg-rose-50" }
];

const API_URL = "https://script.google.com/macros/s/AKfycby2-H9fuh0eGdD0OurjJeqGOuo343puWMmcHERVz787V_hVZo1_Wv8HXLKfI7HC8BrJ/exec";

// Mapping คอลัมน์สำหรับ Data 1
let DATA1_COL = {
    date: 1,      // B - วันที่เบิกเงิน
    dueDate: 2,   // C - วันครบกำหนด
    tdCode: 4,    // E - เลข TD
    invoice: 5,   // F - เลขที่ IV
    bank: 6,      // G - ธนาคาร
    jobType: 7,   // H - ประเภทงาน
    debtor: 8,    // I - ชื่อลูกหนี้
    bill: 13,     // N - จำนวนเงิน (หน้าตั๋ว)
    used: 15,     // P - ยอดเบิกเงิน (ยอดรับซื้อ)
    remain: 16,   // Q - ยอดคงเหลือรับ 10%
    status: 17,   // R - สถานะ
    note: 19,     // T - หมายเหตุ
    payMonth: 21, // V - เดือนที่กำหนดชำระ
    cheque: 22    // W - เลขที่เช็ค
};

// --- Top Loading Bar ---
const TopLoader = {
    _raf: null, _progress: 0, _target: 0, _el: null, _bar: null,
    _getEl() {
        if (!this._el) this._el = document.getElementById('top-loader');
        if (!this._bar) this._bar = document.getElementById('top-loader-bar');
    },
    start() {
        this._getEl(); if (!this._el) return;
        this._progress = 0; this._target = 70;
        this._el.style.opacity = '1'; this._bar.style.width = '0%';
        cancelAnimationFrame(this._raf); this._animate();
    },
    _animate() {
        if (this._progress < this._target) {
            const step = (this._target - this._progress) * 0.04;
            this._progress = Math.min(this._progress + Math.max(step, 0.3), this._target);
            this._bar.style.width = this._progress + '%';
            this._raf = requestAnimationFrame(() => this._animate());
        }
    },
    finish() {
        this._getEl(); if (!this._el) return;
        cancelAnimationFrame(this._raf); this._progress = 100;
        this._bar.style.width = '100%';
        setTimeout(() => { this._el.style.opacity = '0'; }, 300);
    },
    fail() {
        this._getEl(); if (!this._el) return;
        cancelAnimationFrame(this._raf);
        this._bar.style.background = '#f43f5e'; this._bar.style.width = '100%';
        setTimeout(() => { this._el.style.opacity = '0'; }, 500);
    }
};

// --- Helpers ---
function normalizeName(name) {
    if (!name) return "";
    return name.toString().toLowerCase().replace(/\s+/g, "").replace(/[()\-\/._,]/g, "").trim();
}

function parseNumber(val) {
    if (val === undefined || val === null || val === "") return 0;
    if (typeof val === "number") return val;
    return parseFloat(val.toString().replace(/[^0-9.-]/g, "")) || 0;
}

function formatMoney(num) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDateParts(value) {
    if (value === undefined || value === null || value === "") return { d: "", m: "", y: "" };
    let dt = null;
    if (value instanceof Date) { dt = value; } 
    else if (typeof value === 'number' && value > 30000) { dt = new Date((value - 25569) * 86400 * 1000); } 
    else {
        const str = value.toString().trim();
        const p = str.split('/');
        
        // Handle Month/Year or Day/Month/Year formats (including Thai abbreviations)
        if (p.length === 2 || p.length === 3) {
            const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const fullMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            
            let d = "01", m = "", y = "";
            if (p.length === 3) {
                d = p[0].padStart(2, '0');
                m = p[1];
                y = p[2];
            } else {
                m = p[0];
                y = p[1];
            }
            
            // Resolve month from name or number
            let mIdx = -1;
            shortMonths.forEach((sm, i) => { if (m.includes(sm)) mIdx = i + 1; });
            if (mIdx === -1) fullMonths.forEach((fm, i) => { if (m.includes(fm)) mIdx = i + 1; });
            
            if (mIdx !== -1) {
                m = mIdx.toString().padStart(2, '0');
            } else if (!isNaN(parseInt(m))) {
                m = parseInt(m).toString().padStart(2, '0');
            }
            
            let yNum = parseInt(y);
            if (!isNaN(yNum)) {
                if (yNum > 2400) yNum -= 543;
                if (yNum < 100) yNum += 2000;
                y = yNum.toString();
            }
            
            if (m && y) return { d, m, y };
        }
        dt = new Date(str);
    }
    if (dt && !isNaN(dt.getTime())) {
        return { d: dt.getDate().toString().padStart(2, '0'), m: (dt.getMonth() + 1).toString().padStart(2, '0'), y: dt.getFullYear().toString() };
    }
    return { d: "", m: "", y: "" };
}

function findColumnIndex(headers, keywords, fallback) {
    if (!headers) return fallback;
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i].toString().toLowerCase();
        for (const kw of keywords) if (h.includes(kw.toLowerCase())) return i;
    }
    return fallback;
}

// --- Main Flow ---
document.addEventListener('DOMContentLoaded', () => {
    TopLoader.start();
    fetch(API_URL, { redirect: "follow" })
        .then(res => res.json())
        .then(res => {
            if (res.status === 'success') {
                processRealData(res.summary, res.details);
                TopLoader.finish();
            } else {
                TopLoader.fail();
                alert("Error: " + res.message);
            }
        })
        .catch(err => { TopLoader.fail(); console.error(err); });
});

function processRealData(summary, details) {
    const companyRows = summary.data.filter(row => row[0] && row[0].toString().trim() !== "" && row[0].toString().toLowerCase() !== "ชื่อบริษัท");
    
    let totalCredit = 0, validCount = 0;
    companyRows.forEach(row => {
        let c = parseFloat(row[2]); if (!isNaN(c)) { totalCredit += c; validCount++; }
    });

    const totalLimitRaw = parseFloat(summary.headers[3]) || 0;
    const totalUsedRaw = parseFloat(summary.headers[4]) || 0;
    const totalRemainingRaw = parseFloat(summary.headers[5]) || 0;

    KPI_DATA[0].amount = "รวม " + companyRows.length + " บริษัท"; KPI_DATA[0].list = companyRows.map(r => r[0]);
    KPI_DATA[1].amount = "รวม " + companyRows.length + " งาน";   KPI_DATA[1].list = companyRows.map(r => r[1]);
    KPI_DATA[2].amount = "เฉลี่ย " + (validCount > 0 ? Math.round(totalCredit / validCount) : 0) + " วัน"; KPI_DATA[2].list = companyRows.map(r => r[2] + " วัน");
    KPI_DATA[3].amount = formatMoney(totalLimitRaw);      KPI_DATA[3].list = companyRows.map(r => formatMoney(parseNumber(r[3])));
    KPI_DATA[4].amount = formatMoney(totalUsedRaw);       KPI_DATA[4].list = companyRows.map(r => formatMoney(parseNumber(r[4])));
    KPI_DATA[5].amount = formatMoney(totalRemainingRaw);  KPI_DATA[5].list = companyRows.map(r => formatMoney(parseNumber(r[5])));

    const usableCreditEl = document.getElementById('usable-credit-amount');
    if (usableCreditEl) {
        const usableCredit = totalRemainingRaw - totalUsedRaw;
        usableCreditEl.textContent = formatMoney(usableCredit);
        usableCreditEl.className = usableCredit < 0 ? 'text-2xl font-black text-rose-600' : 'text-2xl font-black text-slate-800';
    }

    renderKPIs(KPI_DATA);

    companyRows.forEach(row => {
        const norm = normalizeName(row[0]);
        if (norm) {
            SUMMARY_MAP[norm] = { 
                originalName: row[0], 
                limit: parseNumber(row[3]),
                used: parseNumber(row[4]) // คอลัมน์ E - วงเงินที่ใช้ไป (แหล่งข้อมูลที่ถูกต้องสำหรับกราฟแรก)
            };
        }
    });

    if (details && details.data) {
        DATA1_COL.debtor = findColumnIndex(details.headers, ['ลูกหนี้', 'ลูกค้า', 'บริษัท'], 8);
        DATA1_COL.status = findColumnIndex(details.headers, ['สถานะ'], 17);
        DATA1_COL.note = findColumnIndex(details.headers, ['หมายเหตุ'], 19);
        DATA1_COL.payMonth = findColumnIndex(details.headers, ['เดือนที่กำหนดชำระ', 'Payment Month'], 21);
        
        // ใช้ข้อมูลทั้งหมด (รวมทั้ง Paid และ Unpaid)
        RAW_DATA1 = details.data;
        
        const buildInitial = (dateCol, valCol1, valCol2) => {
            const map = {};
            let grandTotal1 = 0;
            let grandTotal2 = 0;
            Object.keys(SUMMARY_MAP).forEach(k => map[k] = { name: SUMMARY_MAP[k].originalName, limit: SUMMARY_MAP[k].limit, used: 0, remain: 0 });
            RAW_DATA1.forEach((row) => {
                if (!row[DATA1_COL.debtor]) return;
                const norm = normalizeName(row[DATA1_COL.debtor]);
                const v1 = parseNumber(row[valCol1]);
                const v2 = parseNumber(row[valCol2]);
                grandTotal1 += v1;
                grandTotal2 += v2;
                if (map[norm]) {
                    map[norm].used += v1;
                    map[norm].remain += v2;
                }
            });
            return { list: Object.values(map), t1: grandTotal1, t2: grandTotal2 };
        };

        const res2 = buildInitial(DATA1_COL.dueDate, DATA1_COL.bill, DATA1_COL.remain);
        
        // กราฟ 1: ดึงข้อมูลจาก SUMMARY_MAP (หน้าแรก คอลัมน์ E) โดยตรง เพื่อความถูกต้องสูงสุด
        INITIAL_CHART_DATA.chart1 = Object.values(SUMMARY_MAP).map(s => ({
            name: s.originalName,
            limit: s.limit,
            used: s.used
        }));

        INITIAL_CHART_DATA.chart2 = res2.list;
        INITIAL_CHART_DATA.chart2TotalN = res2.t1;
        INITIAL_CHART_DATA.chart2TotalQ = res2.t2;

        const elN = document.getElementById('total-due-n');
        const elQ = document.getElementById('total-remain-q');
        if (elN) elN.textContent = formatMoney(INITIAL_CHART_DATA.chart2TotalN);
        if (elQ) elQ.textContent = formatMoney(INITIAL_CHART_DATA.chart2TotalQ);

        updateChart1(INITIAL_CHART_DATA.chart1);
        updateChart2(INITIAL_CHART_DATA.chart2);
        
        // กรองและแสดงตารางครั้งแรก
        populateFilters(details.data);
        applyTableFilter();
        populateAdvanceFilters(details.data);
        applyAdvanceFilter();
    }
}

function renderKPIs(data) {
    const container = document.getElementById('kpi-container'); if (!container) return;
    container.innerHTML = data.map(kpi => `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow">
            <div class="flex items-center space-x-2">
                <div class="p-2 rounded-lg ${kpi.bg || 'bg-slate-50'} ${kpi.color}"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg></div>
                <h3 class="text-slate-500 font-bold text-sm uppercase truncate">${kpi.title}</h3>
            </div>
            <p class="text-xl font-black text-slate-800 mt-3">${kpi.amount}</p>
            <div class="mt-4 border-t border-slate-100 pt-3 space-y-1.5">
                ${(kpi.list || []).map(item => `<div class="text-xs font-bold text-slate-700 bg-slate-50 px-2 py-1.5 rounded border-l-2 ${kpi.color.replace('text-', 'border-')} truncate" title="${item}">${item}</div>`).join('')}
            </div>
        </div>
    `).join('');
}

function populateFilters(data) {
    const m1Set = new Set(), y1Set = new Set();
    const d2Set = new Set(), m2Set = new Set(), y2Set = new Set();
    const tmSet = new Set(), tySet = new Set(); // สำหรับตาราง
    const noteSet = new Set();
    const statusSet = new Set();
    
    data.forEach((row) => {
        const p1 = parseDateParts(row[DATA1_COL.date]); if (p1.m && p1.y) { m1Set.add(p1.m); y1Set.add(p1.y); }
        const p2 = parseDateParts(row[DATA1_COL.dueDate]); 
        if (p2.d && p2.m && p2.y) { 
            d2Set.add(p2.d); m2Set.add(p2.m); y2Set.add(p2.y); 
        }
        const pTable = parseDateParts(row[DATA1_COL.dueDate]);
        if (pTable.m && pTable.y) {
            tmSet.add(pTable.m); tySet.add(pTable.y);
        }
        
        // รวบรวมหมายเหตุสำหรับแถวที่ลูกหนี้ไม่ใช่หัวตารางและไม่ใช่แถวว่าง
        const debtorName = (row[DATA1_COL.debtor] || "").toString().trim();
        if (debtorName && debtorName !== "ลูกหนี้" && debtorName !== "ชื่อลูกหนี้" && debtorName !== "Debtor") {
            const noteVal = (row[DATA1_COL.note] || "").toString().trim();
            noteSet.add(noteVal === "" ? "(ไม่มีหมายเหตุ)" : noteVal);
            const statusVal = (row[DATA1_COL.status] || "").toString().trim();
            statusSet.add(statusVal === "" ? "(ไม่มีสถานะ)" : statusVal);
        }
    });

    const THAI_MONTHS = {
        '01': 'มกราคม', '02': 'กุมภาพันธ์', '03': 'มีนาคม', '04': 'เมษายน',
        '05': 'พฤษภาคม', '06': 'มิถุนายน', '07': 'กรกฎาคม', '08': 'สิงหาคม',
        '09': 'กันยายน', '10': 'ตุลาคม', '11': 'พฤศจิกายน', '12': 'ธันวาคม'
    };

    const fill = (id, set, handler) => {
        const el = document.getElementById(id); if (!el) return;
        const first = el.options[0]; el.innerHTML = ''; el.appendChild(first);
        Array.from(set).sort().forEach(v => { 
            const opt = document.createElement('option'); 
            opt.value = v; 
            opt.textContent = (id.includes('month') && THAI_MONTHS[v]) ? THAI_MONTHS[v] : v; 
            el.appendChild(opt); 
        });
        el.addEventListener('change', handler);
    };

    fill('f1-month', m1Set, applyFilter1); fill('f1-year', y1Set, applyFilter1);
    fill('f2-day', d2Set, applyFilter2); fill('f2-month', m2Set, applyFilter2); fill('f2-year', y2Set, applyFilter2);

    // ====== Status Checkbox Dropdown ======
    const statusDropdown = document.getElementById('status-filter-dropdown');
    if (statusDropdown) {
        statusDropdown.innerHTML = '';
        const sortedStatuses = Array.from(statusSet).sort();
        uniqueStatusList = sortedStatuses;
        selectedStatuses = new Set(sortedStatuses);

        const allStatusDiv = document.createElement('div');
        allStatusDiv.className = 'flex items-center gap-2 pb-2 mb-2 border-b border-slate-100 font-bold text-slate-700';
        allStatusDiv.innerHTML = `
            <input type="checkbox" id="status-all-chk" class="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
            <label for="status-all-chk" class="text-xs select-none cursor-pointer">เลือกทั้งหมด</label>
        `;
        statusDropdown.appendChild(allStatusDiv);

        sortedStatuses.forEach((s, idx) => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 hover:bg-slate-50 p-1 rounded transition-colors';
            div.innerHTML = `
                <input type="checkbox" id="status-chk-${idx}" value="${s}" class="status-chk-item w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
                <label for="status-chk-${idx}" class="text-xs select-none cursor-pointer text-slate-600">${s}</label>
            `;
            statusDropdown.appendChild(div);
        });

        const allStatusChk = document.getElementById('status-all-chk');
        const statusItems = statusDropdown.querySelectorAll('.status-chk-item');

        allStatusChk.addEventListener('change', () => {
            const checked = allStatusChk.checked;
            statusItems.forEach(chk => {
                chk.checked = checked;
                checked ? selectedStatuses.add(chk.value) : selectedStatuses.delete(chk.value);
            });
            updateStatusFilterUI();
            applyTableFilter();
        });

        statusItems.forEach(chk => {
            chk.addEventListener('change', () => {
                chk.checked ? selectedStatuses.add(chk.value) : selectedStatuses.delete(chk.value);
                allStatusChk.checked = Array.from(statusItems).every(i => i.checked);
                updateStatusFilterUI();
                applyTableFilter();
            });
        });

        updateStatusFilterUI();
    }

    // ====== Status Dropdown Toggle ======
    const statusBtn = document.getElementById('status-filter-btn');
    const statusDrop = document.getElementById('status-filter-dropdown');
    const statusArrow = document.getElementById('status-filter-arrow');
    if (statusBtn && statusDrop) {
        statusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = statusDrop.classList.contains('hidden');
            if (isHidden) {
                statusDrop.classList.remove('hidden');
                setTimeout(() => {
                    statusDrop.classList.remove('scale-95', 'opacity-0');
                    statusDrop.classList.add('scale-100', 'opacity-100');
                }, 10);
                if (statusArrow) statusArrow.classList.add('rotate-180');
            } else {
                statusDrop.classList.remove('scale-100', 'opacity-100');
                statusDrop.classList.add('scale-95', 'opacity-0');
                if (statusArrow) statusArrow.classList.remove('rotate-180');
                setTimeout(() => statusDrop.classList.add('hidden'), 150);
            }
        });
    }

    // ====== Year Checkbox Dropdown ======
    const yearDropdown = document.getElementById('year-filter-dropdown');
    if (yearDropdown) {
        yearDropdown.innerHTML = '';
        const sortedYears = Array.from(tySet).sort();
        uniqueYearsList = sortedYears;
        selectedYears = new Set(sortedYears);

        const allYearDiv = document.createElement('div');
        allYearDiv.className = 'flex items-center gap-2 pb-2 mb-2 border-b border-slate-100 font-bold text-slate-700';
        allYearDiv.innerHTML = `
            <input type="checkbox" id="year-all-chk" class="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
            <label for="year-all-chk" class="text-xs select-none cursor-pointer">เลือกทั้งหมด</label>
        `;
        yearDropdown.appendChild(allYearDiv);

        sortedYears.forEach((y, idx) => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 hover:bg-slate-50 p-1 rounded transition-colors';
            div.innerHTML = `
                <input type="checkbox" id="year-chk-${idx}" value="${y}" class="year-chk-item w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
                <label for="year-chk-${idx}" class="text-xs select-none cursor-pointer text-slate-600">${y}</label>
            `;
            yearDropdown.appendChild(div);
        });

        const allYearChk = document.getElementById('year-all-chk');
        const yearItems = yearDropdown.querySelectorAll('.year-chk-item');

        allYearChk.addEventListener('change', () => {
            const checked = allYearChk.checked;
            yearItems.forEach(chk => {
                chk.checked = checked;
                checked ? selectedYears.add(chk.value) : selectedYears.delete(chk.value);
            });
            updateYearFilterUI();
            applyTableFilter();
        });

        yearItems.forEach(chk => {
            chk.addEventListener('change', () => {
                chk.checked ? selectedYears.add(chk.value) : selectedYears.delete(chk.value);
                allYearChk.checked = Array.from(yearItems).every(i => i.checked);
                updateYearFilterUI();
                applyTableFilter();
            });
        });

        updateYearFilterUI();
    }

    // ====== Year Dropdown Toggle ======
    const yearBtn = document.getElementById('year-filter-btn');
    const yearDrop = document.getElementById('year-filter-dropdown');
    const yearArrow = document.getElementById('year-filter-arrow');
    if (yearBtn && yearDrop) {
        yearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = yearDrop.classList.contains('hidden');
            if (isHidden) {
                yearDrop.classList.remove('hidden');
                setTimeout(() => {
                    yearDrop.classList.remove('scale-95', 'opacity-0');
                    yearDrop.classList.add('scale-100', 'opacity-100');
                }, 10);
                if (yearArrow) yearArrow.classList.add('rotate-180');
            } else {
                yearDrop.classList.remove('scale-100', 'opacity-100');
                yearDrop.classList.add('scale-95', 'opacity-0');
                if (yearArrow) yearArrow.classList.remove('rotate-180');
                setTimeout(() => yearDrop.classList.add('hidden'), 150);
            }
        });
        yearDrop.addEventListener('click', e => e.stopPropagation());
    }

    // ====== Month Checkbox Dropdown ======
    const monthDropdown = document.getElementById('month-filter-dropdown');
    if (monthDropdown) {
        monthDropdown.innerHTML = '';

        const sortedMonths = Array.from(tmSet).sort();
        uniqueMonthsList = sortedMonths;
        selectedMonths = new Set(sortedMonths);

        // "เลือกทั้งหมด"
        const allMonthDiv = document.createElement('div');
        allMonthDiv.className = 'flex items-center gap-2 pb-2 mb-2 border-b border-slate-100 font-bold text-slate-700';
        allMonthDiv.innerHTML = `
            <input type="checkbox" id="month-all-chk" class="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
            <label for="month-all-chk" class="text-xs select-none cursor-pointer">เลือกทั้งหมด</label>
        `;
        monthDropdown.appendChild(allMonthDiv);

        sortedMonths.forEach((m, idx) => {
            const mLabel = THAI_MONTHS[m] || m;
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 hover:bg-slate-50 p-1 rounded transition-colors';
            div.innerHTML = `
                <input type="checkbox" id="month-chk-${idx}" value="${m}" class="month-chk-item w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
                <label for="month-chk-${idx}" class="text-xs select-none cursor-pointer text-slate-600">${mLabel}</label>
            `;
            monthDropdown.appendChild(div);
        });

        const allMonthChk = document.getElementById('month-all-chk');
        const monthItems = monthDropdown.querySelectorAll('.month-chk-item');

        allMonthChk.addEventListener('change', () => {
            const checked = allMonthChk.checked;
            monthItems.forEach(chk => {
                chk.checked = checked;
                checked ? selectedMonths.add(chk.value) : selectedMonths.delete(chk.value);
            });
            updateMonthFilterUI();
            applyTableFilter();
        });

        monthItems.forEach(chk => {
            chk.addEventListener('change', () => {
                chk.checked ? selectedMonths.add(chk.value) : selectedMonths.delete(chk.value);
                allMonthChk.checked = Array.from(monthItems).every(i => i.checked);
                updateMonthFilterUI();
                applyTableFilter();
            });
        });

        updateMonthFilterUI();
    }

    // ====== Month Dropdown Toggle ======
    const monthBtn = document.getElementById('month-filter-btn');
    const monthDrop = document.getElementById('month-filter-dropdown');
    const monthArrow = document.getElementById('month-filter-arrow');
    if (monthBtn && monthDrop) {
        monthBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = monthDrop.classList.contains('hidden');
            if (isHidden) {
                monthDrop.classList.remove('hidden');
                setTimeout(() => {
                    monthDrop.classList.remove('scale-95', 'opacity-0');
                    monthDrop.classList.add('scale-100', 'opacity-100');
                }, 10);
                if (monthArrow) monthArrow.classList.add('rotate-180');
            } else {
                monthDrop.classList.remove('scale-100', 'opacity-100');
                monthDrop.classList.add('scale-95', 'opacity-0');
                if (monthArrow) monthArrow.classList.remove('rotate-180');
                setTimeout(() => monthDrop.classList.add('hidden'), 150);
            }
        });
        monthDrop.addEventListener('click', e => e.stopPropagation());
    }

    // วาดหน้าตัวกรองหมายเหตุแบบเช็คบล็อก
    // ====== Note Dropdown Toggle ======
    const noteBtn = document.getElementById('note-filter-btn');
    const dropdown = document.getElementById('note-filter-dropdown');
    const noteArrow = document.getElementById('note-filter-arrow');
    if (noteBtn && dropdown) {
        noteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = dropdown.classList.contains('hidden');
            if (isHidden) {
                dropdown.classList.remove('hidden');
                setTimeout(() => {
                    dropdown.classList.remove('scale-95', 'opacity-0');
                    dropdown.classList.add('scale-100', 'opacity-100');
                }, 10);
                if (noteArrow) noteArrow.classList.add('rotate-180');
            } else {
                dropdown.classList.remove('scale-100', 'opacity-100');
                dropdown.classList.add('scale-95', 'opacity-0');
                if (noteArrow) noteArrow.classList.remove('rotate-180');
                setTimeout(() => dropdown.classList.add('hidden'), 150);
            }
        });
    }

    if (dropdown) {
        dropdown.innerHTML = '';
        
        // เรียงลำดับหมายเหตุ โดยให้ "(ไม่มีหมายเหตุ)" อยู่หัวแถว
        const sortedNotes = Array.from(noteSet).sort((a, b) => {
            if (a === "(ไม่มีหมายเหตุ)") return -1;
            if (b === "(ไม่มีหมายเหตุ)") return 1;
            return a.localeCompare(b, 'th');
        });
        
        uniqueNotesList = sortedNotes;
        selectedNotes = new Set(sortedNotes);
        
        // 1. เพิ่ม Checkbox "เลือกทั้งหมด"
        const selectAllDiv = document.createElement('div');
        selectAllDiv.className = 'flex items-center gap-2 pb-2 mb-2 border-b border-slate-100 font-bold text-slate-700';
        selectAllDiv.innerHTML = `
            <input type="checkbox" id="note-all-chk" class="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
            <label for="note-all-chk" class="text-xs select-none cursor-pointer">เลือกทั้งหมด</label>
        `;
        dropdown.appendChild(selectAllDiv);
        
        // 2. เพิ่ม Checkbox รายการหมายเหตุแต่ละอัน
        sortedNotes.forEach((note, index) => {
            const noteDiv = document.createElement('div');
            noteDiv.className = 'flex items-center gap-2 hover:bg-slate-50 p-1 rounded transition-colors';
            noteDiv.innerHTML = `
                <input type="checkbox" id="note-chk-${index}" value="${note}" class="note-chk-item w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
                <label for="note-chk-${index}" class="text-xs select-none cursor-pointer text-slate-600">${note}</label>
            `;
            dropdown.appendChild(noteDiv);
        });
        
        // 3. ผูก Event Listener
        const allChk = document.getElementById('note-all-chk');
        const items = dropdown.querySelectorAll('.note-chk-item');
        
        allChk.addEventListener('change', () => {
            const checked = allChk.checked;
            items.forEach(chk => {
                chk.checked = checked;
                if (checked) {
                    selectedNotes.add(chk.value);
                } else {
                    selectedNotes.delete(chk.value);
                }
            });
            updateNoteFilterUI();
            applyTableFilter();
        });
        
        items.forEach(chk => {
            chk.addEventListener('change', () => {
                if (chk.checked) {
                    selectedNotes.add(chk.value);
                } else {
                    selectedNotes.delete(chk.value);
                }
                
                // ตรวจสอบว่าเช็คเลือกครบทุกอันหรือไม่ เพื่ออัปเดตปุ่ม "เลือกทั้งหมด"
                const allChecked = Array.from(items).every(i => i.checked);
                allChk.checked = allChecked;
                
                updateNoteFilterUI();
                applyTableFilter();
            });
        });
        
        updateNoteFilterUI();
    }
}

function updateNoteFilterUI() {
    const label = document.getElementById('note-filter-label');
    if (!label) return;
    
    const dropdown = document.getElementById('note-filter-dropdown');
    const items = dropdown ? dropdown.querySelectorAll('.note-chk-item') : [];
    const totalCount = items.length;
    
    if (selectedNotes.size === 0) {
        label.textContent = 'ไม่มีการเลือก';
    } else if (selectedNotes.size === totalCount) {
        label.textContent = 'หมายเหตุ (ทั้งหมด)';
    } else {
        label.textContent = `หมายเหตุ (เลือก ${selectedNotes.size} รายการ)`;
    }
}

function updateMonthFilterUI() {
    const label = document.getElementById('month-filter-label');
    if (!label) return;
    const THAI_MONTHS = {
        '01': 'ม.ค.', '02': 'ก.พ.', '03': 'มี.ค.', '04': 'เม.ย.',
        '05': 'พ.ค.', '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.',
        '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.', '12': 'ธ.ค.'
    };
    const total = uniqueMonthsList.length;
    if (selectedMonths.size === 0) {
        label.textContent = 'เดือน (ไม่มีการเลือก)';
    } else if (selectedMonths.size === total) {
        label.textContent = 'เดือน (ทั้งหมด)';
    } else {
        const names = Array.from(selectedMonths).sort().map(m => THAI_MONTHS[m] || m).join(', ');
        label.textContent = names;
    }
}

function updateYearFilterUI() {
    const label = document.getElementById('year-filter-label');
    if (!label) return;
    const total = uniqueYearsList.length;
    if (selectedYears.size === 0) {
        label.textContent = 'ปี (ไม่มีการเลือก)';
    } else if (selectedYears.size === total) {
        label.textContent = 'ปี (ทั้งหมด)';
    } else {
        label.textContent = Array.from(selectedYears).sort().join(', ');
    }
}

function updateStatusFilterUI() {
    const label = document.getElementById('status-filter-label');
    if (!label) return;
    const total = uniqueStatusList.length;
    if (selectedStatuses.size === 0) {
        label.textContent = 'สถานะ (ไม่มีการเลือก)';
    } else if (selectedStatuses.size === total) {
        label.textContent = 'สถานะ (ทั้งหมด)';
    } else {
        label.textContent = Array.from(selectedStatuses).join(', ');
    }
}

function applyFilter1() {
    const m = document.getElementById('f1-month').value;
    const y = document.getElementById('f1-year').value;
    
    // ถ้าไม่ได้เลือกตัวกรอง (ทั้งหมด) ให้แสดงข้อมูลจาก SUMMARY_MAP (หน้าแรก คอลัมน์ E)
    if (!m && !y) {
        updateChart1(INITIAL_CHART_DATA.chart1);
        return;
    }

    const map = {};
    Object.keys(SUMMARY_MAP).forEach(k => map[k] = { 
        name: SUMMARY_MAP[k].originalName, 
        limit: SUMMARY_MAP[k].limit, 
        used: 0 
    });
    
    RAW_DATA1.forEach((row) => {
        const p = parseDateParts(row[DATA1_COL.date]);
        if ((!m || p.m === m.padStart(2, '0')) && (!y || p.y === y)) {
            const norm = normalizeName(row[DATA1_COL.debtor]);
            if (map[norm]) {
                map[norm].used += parseNumber(row[DATA1_COL.used]);
            }
        }
    });
    updateChart1(Object.values(map));
}

function applyFilter2() {
    const d = document.getElementById('f2-day').value;
    const m = document.getElementById('f2-month').value;
    const y = document.getElementById('f2-year').value;
    
    let chartData = [];
    let totalN = 0;
    let totalQ = 0;

    if (!d && !m && !y) { 
        chartData = INITIAL_CHART_DATA.chart2; 
        totalN = INITIAL_CHART_DATA.chart2TotalN || 0;
        totalQ = INITIAL_CHART_DATA.chart2TotalQ || 0;
    } else {
        const map = {};
        Object.keys(SUMMARY_MAP).forEach(k => map[k] = { name: SUMMARY_MAP[k].originalName, used: 0, remain: 0 });
        RAW_DATA1.forEach((row) => {
            const p = parseDateParts(row[DATA1_COL.dueDate]);
            if ((!d || p.d === d.padStart(2, '0')) && (!m || p.m === m.padStart(2, '0')) && (!y || p.y === y)) {
                const norm = normalizeName(row[DATA1_COL.debtor]);
                const valN = parseNumber(row[DATA1_COL.bill]);
                const valQ = parseNumber(row[DATA1_COL.remain]);
                totalN += valN; totalQ += valQ;
                if (map[norm]) { map[norm].used += valN; map[norm].remain += valQ; }
            }
        });
        chartData = Object.values(map).filter(c => c.used > 0 || c.remain > 0);
    }
    const elN = document.getElementById('total-due-n');
    const elQ = document.getElementById('total-remain-q');
    if (elN) elN.textContent = formatMoney(totalN);
    if (elQ) elQ.textContent = formatMoney(totalQ);
    updateChart2(chartData);
}

function applyTableFilter() {
    let filtered = [];
    let totalAmount = 0;

    RAW_DATA1.forEach((row) => {
        const pTable = parseDateParts(row[DATA1_COL.dueDate]);
        const noteVal = (row[DATA1_COL.note] || "").toString().trim();
        const noteKey = noteVal === "" ? "(ไม่มีหมายเหตุ)" : noteVal;
        
        const matchesMonth = selectedMonths.size === 0 || selectedMonths.has(pTable.m);
        const matchesYear  = selectedYears.size === 0  || selectedYears.has(pTable.y);
        const matchesNote  = selectedNotes.has(noteKey);
        const statusVal2   = (row[DATA1_COL.status] || "").toString().trim();
        const statusKey    = statusVal2 === "" ? "(ไม่มีสถานะ)" : statusVal2;
        const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(statusKey);

        if (matchesMonth && matchesYear && matchesNote && matchesStatus) {
            const pDue = pTable;
            const amt = parseNumber(row[DATA1_COL.bill]);
            totalAmount += amt;
            
            let shortDate = row[DATA1_COL.dueDate];
            if (pDue.d && pDue.m && pDue.y) {
                shortDate = `${pDue.d}/${pDue.m}/${pDue.y}`;
            }

            const payMonthDisplay = row[DATA1_COL.jobType] || "";

            filtered.push({
                c: shortDate,
                td: (row[DATA1_COL.tdCode] || "").toString().trim(),
                f: row[DATA1_COL.invoice],
                g: row[DATA1_COL.bank],
                h: payMonthDisplay,
                i: row[DATA1_COL.debtor],
                s: row[DATA1_COL.status],
                t: row[DATA1_COL.note],
                n: amt,
                _dateVal: (pDue.y && pDue.m && pDue.d) ? parseInt(pDue.y + pDue.m + pDue.d, 10) : 0
            });
        }
    });

    filtered.sort((a, b) => a._dateVal - b._dateVal);
    renderTable(filtered);

    const totalEl = document.getElementById('table-total-amount');
    if (totalEl) totalEl.textContent = formatMoney(totalAmount);

    // อัปเดต PDF subtitle
    const THAI_MONTHS_FULL = {
        '01': 'มกราคม', '02': 'กุมภาพันธ์', '03': 'มีนาคม', '04': 'เมษายน',
        '05': 'พฤษภาคม', '06': 'มิถุนายน', '07': 'กรกฎาคม', '08': 'สิงหาคม',
        '09': 'กันยายน', '10': 'ตุลาคม', '11': 'พฤศจิกายน', '12': 'ธันวาคม'
    };
    let subText = '';
    const mSelected = selectedMonths.size > 0 && selectedMonths.size < uniqueMonthsList.length;
    const ySelected = selectedYears.size > 0 && selectedYears.size < uniqueYearsList.length;
    if (mSelected || ySelected) {
        const mNames = mSelected ? Array.from(selectedMonths).sort().map(m => THAI_MONTHS_FULL[m] || m).join(', ') : '';
        const yNames = ySelected ? Array.from(selectedYears).sort().join(', ') : '';
        subText = `(ประจำเดือน ${mNames} ${yNames})`.replace(/\s+/g, ' ').trim();
    }
    const subEl = document.getElementById('pdf-subtitle');
    if (subEl) subEl.textContent = subText;
}

// =====================================================================
// ยอด Advance 90% — Filters & Table
// =====================================================================
function populateAdvanceFilters(data) {
    const THAI_MONTHS = {
        '01': 'มกราคม', '02': 'กุมภาพันธ์', '03': 'มีนาคม', '04': 'เมษายน',
        '05': 'พฤษภาคม', '06': 'มิถุนายน', '07': 'กรกฎาคม', '08': 'สิงหาคม',
        '09': 'กันยายน', '10': 'ตุลาคม', '11': 'พฤศจิกายน', '12': 'ธันวาคม'
    };
    const THAI_MONTHS_SHORT = {
        '01': 'ม.ค.', '02': 'ก.พ.', '03': 'มี.ค.', '04': 'เม.ย.',
        '05': 'พ.ค.', '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.',
        '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.', '12': 'ธ.ค.'
    };

    const tmSet = new Set(), tySet = new Set(), tsSet = new Set();
    data.forEach(row => {
        const p = parseDateParts(row[DATA1_COL.dueDate]);
        if (p.m && p.y) { tmSet.add(p.m); tySet.add(p.y); }
        const debtorName = (row[DATA1_COL.debtor] || "").toString().trim();
        if (debtorName && debtorName !== "ลูกหนี้" && debtorName !== "ชื่อลูกหนี้" && debtorName !== "Debtor") {
            const sv = (row[DATA1_COL.status] || "").toString().trim();
            tsSet.add(sv === "" ? "(ไม่มีสถานะ)" : sv);
        }
    });

    const buildCheckboxDropdown = (dropId, allChkId, itemClass, sortedValues, selectedSet, uniqueList, labelFn, updateUI) => {
        const dropdown = document.getElementById(dropId);
        if (!dropdown) return;
        dropdown.innerHTML = '';
        uniqueList.length = 0;
        sortedValues.forEach(v => uniqueList.push(v));
        sortedValues.forEach(v => selectedSet.add(v));

        const allDiv = document.createElement('div');
        allDiv.className = 'flex items-center gap-2 pb-2 mb-2 border-b border-slate-100 font-bold text-slate-700';
        allDiv.innerHTML = `<input type="checkbox" id="${allChkId}" class="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
            <label for="${allChkId}" class="text-xs select-none cursor-pointer">เลือกทั้งหมด</label>`;
        dropdown.appendChild(allDiv);

        sortedValues.forEach((v, idx) => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 hover:bg-slate-50 p-1 rounded transition-colors';
            div.innerHTML = `<input type="checkbox" id="${itemClass}-${idx}" value="${v}" class="${itemClass} w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" checked>
                <label for="${itemClass}-${idx}" class="text-xs select-none cursor-pointer text-slate-600">${labelFn(v)}</label>`;
            dropdown.appendChild(div);
        });

        const allChk = document.getElementById(allChkId);
        const items = dropdown.querySelectorAll('.' + itemClass);
        allChk.addEventListener('change', () => {
            items.forEach(chk => { chk.checked = allChk.checked; allChk.checked ? selectedSet.add(chk.value) : selectedSet.delete(chk.value); });
            updateUI(); applyAdvanceFilter();
        });
        items.forEach(chk => {
            chk.addEventListener('change', () => {
                chk.checked ? selectedSet.add(chk.value) : selectedSet.delete(chk.value);
                allChk.checked = Array.from(items).every(i => i.checked);
                updateUI(); applyAdvanceFilter();
            });
        });
        updateUI();
    };

    buildCheckboxDropdown('adv-status-filter-dropdown', 'adv-status-all-chk', 'adv-status-chk-item',
        Array.from(tsSet).sort(), advSelectedStatuses, advUniqueStatusList, v => v, updateAdvStatusUI);
    buildCheckboxDropdown('adv-month-filter-dropdown', 'adv-month-all-chk', 'adv-month-chk-item',
        Array.from(tmSet).sort(), advSelectedMonths, advUniqueMonthsList, v => THAI_MONTHS[v] || v, updateAdvMonthUI);
    buildCheckboxDropdown('adv-year-filter-dropdown', 'adv-year-all-chk', 'adv-year-chk-item',
        Array.from(tySet).sort(), advSelectedYears, advUniqueYearsList, v => v, updateAdvYearUI);

    // Toggle สำหรับ dropdown ทั้ง 3 ตัว
    [
        { btn: 'adv-status-filter-btn', drop: 'adv-status-filter-dropdown', arrow: 'adv-status-filter-arrow' },
        { btn: 'adv-month-filter-btn',  drop: 'adv-month-filter-dropdown',  arrow: 'adv-month-filter-arrow'  },
        { btn: 'adv-year-filter-btn',   drop: 'adv-year-filter-dropdown',   arrow: 'adv-year-filter-arrow'   },
    ].forEach(({ btn, drop, arrow }) => {
        const b = document.getElementById(btn);
        const d = document.getElementById(drop);
        const a = document.getElementById(arrow);
        if (!b || !d) return;
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = d.classList.contains('hidden');
            if (isHidden) {
                d.classList.remove('hidden');
                setTimeout(() => { d.classList.remove('scale-95', 'opacity-0'); d.classList.add('scale-100', 'opacity-100'); }, 10);
                if (a) a.classList.add('rotate-180');
            } else {
                d.classList.remove('scale-100', 'opacity-100'); d.classList.add('scale-95', 'opacity-0');
                if (a) a.classList.remove('rotate-180');
                setTimeout(() => d.classList.add('hidden'), 150);
            }
        });
    });
}

function updateAdvStatusUI() {
    const label = document.getElementById('adv-status-filter-label'); if (!label) return;
    if (advSelectedStatuses.size === 0) label.textContent = 'สถานะ (ไม่มีการเลือก)';
    else if (advSelectedStatuses.size === advUniqueStatusList.length) label.textContent = 'สถานะ (ทั้งหมด)';
    else label.textContent = Array.from(advSelectedStatuses).join(', ');
}
function updateAdvMonthUI() {
    const THAI_MONTHS_SHORT = { '01':'ม.ค.','02':'ก.พ.','03':'มี.ค.','04':'เม.ย.','05':'พ.ค.','06':'มิ.ย.','07':'ก.ค.','08':'ส.ค.','09':'ก.ย.','10':'ต.ค.','11':'พ.ย.','12':'ธ.ค.' };
    const label = document.getElementById('adv-month-filter-label'); if (!label) return;
    if (advSelectedMonths.size === 0) label.textContent = 'เดือน (ไม่มีการเลือก)';
    else if (advSelectedMonths.size === advUniqueMonthsList.length) label.textContent = 'เดือน (ทั้งหมด)';
    else label.textContent = Array.from(advSelectedMonths).sort().map(m => THAI_MONTHS_SHORT[m] || m).join(', ');
}
function updateAdvYearUI() {
    const label = document.getElementById('adv-year-filter-label'); if (!label) return;
    if (advSelectedYears.size === 0) label.textContent = 'ปี (ไม่มีการเลือก)';
    else if (advSelectedYears.size === advUniqueYearsList.length) label.textContent = 'ปี (ทั้งหมด)';
    else label.textContent = Array.from(advSelectedYears).sort().join(', ');
}

function applyAdvanceFilter() {
    let filtered = [];
    let totalAmount = 0;

    RAW_DATA1.forEach(row => {
        const p = parseDateParts(row[DATA1_COL.dueDate]);
        const statusVal = (row[DATA1_COL.status] || "").toString().trim();
        const statusKey = statusVal === "" ? "(ไม่มีสถานะ)" : statusVal;

        const matchesMonth  = advSelectedMonths.size === 0  || advSelectedMonths.has(p.m);
        const matchesYear   = advSelectedYears.size === 0   || advSelectedYears.has(p.y);
        const matchesStatus = advSelectedStatuses.size === 0 || advSelectedStatuses.has(statusKey);

        if (matchesMonth && matchesYear && matchesStatus) {
            const amt = parseNumber(row[DATA1_COL.used]); // คอลัมน์ P
            totalAmount += amt;
            let shortDate = row[DATA1_COL.dueDate];
            if (p.d && p.m && p.y) shortDate = `${p.d}/${p.m}/${p.y}`;
            filtered.push({
                c: shortDate,
                td: (row[DATA1_COL.tdCode] || "").toString().trim(),
                f: row[DATA1_COL.invoice],
                g: row[DATA1_COL.bank],
                h: row[DATA1_COL.jobType] || "",
                i: row[DATA1_COL.debtor],
                s: row[DATA1_COL.status],
                chq: (row[DATA1_COL.cheque] || "").toString().trim(),
                n: amt,
                _dateVal: (p.y && p.m && p.d) ? parseInt(p.y + p.m + p.d, 10) : 0
            });
        }
    });

    filtered.sort((a, b) => a._dateVal - b._dateVal);
    renderAdvanceTable(filtered);
    const totalEl = document.getElementById('advance-total-amount');
    if (totalEl) totalEl.textContent = formatMoney(totalAmount);
}

function renderAdvanceTable(data) {
    const body = document.getElementById('advance-table-body'); if (!body) return;

    const validData = data.filter(r => {
        const name = (r.i || "").trim();
        return name && name !== "ลูกหนี้" && name !== "ชื่อลูกหนี้" && name !== "Debtor";
    });

    // --- ปุ่มซ่อน/แสดง tbody ---
    const toggleBtn = document.getElementById('adv-table-toggle-btn');
    const toggleLbl = document.getElementById('adv-table-toggle-lbl');
    const toggleIcon = document.getElementById('adv-table-toggle-icon');
    if (toggleBtn && !toggleBtn._bslBound) {
        toggleBtn._bslBound = true;
        toggleBtn.addEventListener('click', () => {
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? '' : 'none';
            if (toggleLbl) toggleLbl.textContent = isHidden ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด';
            if (toggleIcon) toggleIcon.style.transform = isHidden ? '' : 'rotate(-90deg)';
        });
    }

    if (validData.length === 0) {
        body.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 italic">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
        const sc = document.getElementById('advance-summary-container');
        if (sc) sc.innerHTML = '';
        return;
    }

    body.innerHTML = validData.map(r => {
        const tdDisplay = r.td || '-';
        const chqDisplay = r.chq || '-';
        return `
        <tr class="border-b border-slate-300 hover:bg-slate-50 transition-colors text-center">
            <td class="p-4 text-slate-500 font-medium border-r border-slate-300 whitespace-nowrap">${r.c}</td>
            <td class="p-4 font-bold text-violet-700 border-r border-slate-300 whitespace-nowrap">${tdDisplay}</td>
            <td class="p-4 font-bold text-slate-700 border-r border-slate-300 whitespace-nowrap">${r.f}</td>
            <td class="p-4 text-slate-600 border-r border-slate-300 whitespace-normal text-left">${r.g}</td>
            <td class="p-4 text-slate-500 border-r border-slate-300 whitespace-normal">${r.h}</td>
            <td class="p-4 font-bold text-indigo-600 border-r border-slate-300 whitespace-normal text-left">${r.i}</td>
            <td class="p-4 text-slate-500 border-r border-slate-300 whitespace-nowrap">${r.s || ''}</td>
            <td class="p-4 font-medium text-slate-600 border-r border-slate-300 whitespace-nowrap">${chqDisplay}</td>
            <td class="p-4 text-right font-black text-emerald-700 whitespace-nowrap">${formatMoney(r.n)}</td>
        </tr>
    `}).join('');

    // --- Pivot: แยกแถวตาม TD ---
    const summaryContainer = document.getElementById('advance-summary-container');
    if (summaryContainer) {
        const dateSet = new Set();
        const debtorOrder = [];
        const debtorSet = new Set();
        const pivotByDebtor = {};
        let grandTotal = 0;

        validData.forEach(r => {
            const name = r.i, date = r.c, amt = r.n;
            const tdKey = r.td || '-';
            const desc  = r.g || '';
            dateSet.add(date);
            if (!debtorSet.has(name)) { debtorSet.add(name); debtorOrder.push(name); }
            if (!pivotByDebtor[name]) pivotByDebtor[name] = [];
            let entry = pivotByDebtor[name].find(e => e.td === tdKey);
            if (!entry) { entry = { td: tdKey, desc, dateAmts: {} }; pivotByDebtor[name].push(entry); }
            entry.dateAmts[date] = (entry.dateAmts[date] || 0) + amt;
            grandTotal += amt;
        });

        const sortedDates = Array.from(dateSet).sort((a, b) => {
            const toNum = s => { const p = s.split('/'); return parseInt((p[2]||'0')+(p[1]||'00').padStart(2,'0')+(p[0]||'00').padStart(2,'0'),10); };
            return toNum(a) - toNum(b);
        });

        const dateTotals = {};
        sortedDates.forEach(d => {
            dateTotals[d] = debtorOrder.reduce((sum, name) => {
                return sum + (pivotByDebtor[name] || []).reduce((s, e) => s + (e.dateAmts[d] || 0), 0);
            }, 0);
        });

        const dateThs = sortedDates.map(d =>
            `<th class="p-2 border border-indigo-500 text-center whitespace-nowrap" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">${d}</th>`
        ).join('');

        let debtorRows = '';
        debtorOrder.forEach(name => {
            const entries = pivotByDebtor[name] || [];
            const debtorTotal = sortedDates.reduce((s, d) => s + entries.reduce((ss, e) => ss + (e.dateAmts[d] || 0), 0), 0);

            entries.forEach((entry, idx) => {
                const rowTotal = sortedDates.reduce((s, d) => s + (entry.dateAmts[d] || 0), 0);
                const cells = sortedDates.map(d => {
                    const amt = entry.dateAmts[d] || 0;
                    return `<td class="p-2 border border-slate-300 text-right whitespace-nowrap ${amt > 0 ? 'text-slate-700 font-medium' : 'text-slate-300'}">${amt > 0 ? formatMoney(amt) : '-'}</td>`;
                }).join('');

                if (idx === 0) {
                    debtorRows += `
                    <tr class="hover:bg-slate-50 border-b border-slate-200">
                        <td class="p-2 border border-slate-300" style="min-width:280px;">
                            <span class="block font-bold text-indigo-700 text-xs mb-1">${name}</span>
                            <div style="display:table;width:100%;table-layout:fixed;">
                                <span style="display:table-cell;width:120px;font-size:11px;font-weight:700;color:#7c3aed;white-space:nowrap;vertical-align:top;padding-right:6px;">${entry.td}</span>
                                <span style="display:table-cell;font-size:11px;color:#94a3b8;vertical-align:top;word-break:break-word;">${entry.desc}</span>
                            </div>
                        </td>
                        ${cells}
                        <td class="p-2 border border-slate-300 text-right font-bold text-indigo-700 whitespace-nowrap text-xs">${formatMoney(rowTotal)}</td>
                    </tr>`;
                } else {
                    debtorRows += `
                    <tr class="hover:bg-slate-50 border-b border-slate-200">
                        <td class="p-2 border border-slate-300" style="min-width:280px;">
                            <div style="display:table;width:100%;table-layout:fixed;border-left:2px solid #c4b5fd;padding-left:6px;">
                                <span style="display:table-cell;width:120px;font-size:11px;font-weight:700;color:#7c3aed;white-space:nowrap;vertical-align:top;padding-right:6px;">${entry.td}</span>
                                <span style="display:table-cell;font-size:11px;color:#94a3b8;vertical-align:top;word-break:break-word;">${entry.desc}</span>
                            </div>
                        </td>
                        ${cells}
                        <td class="p-2 border border-slate-300 text-right font-bold text-indigo-700 whitespace-nowrap text-xs">${formatMoney(rowTotal)}</td>
                    </tr>`;
                }
            });

            // Sub-total row
            const subCells = sortedDates.map(d => {
                const amt = entries.reduce((s, e) => s + (e.dateAmts[d] || 0), 0);
                return `<td class="p-2 border border-slate-300 text-right whitespace-nowrap font-bold text-indigo-700 text-xs" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#e0e7ff;">${amt > 0 ? formatMoney(amt) : '-'}</td>`;
            }).join('');
            debtorRows += `
                <tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#e0e7ff;">
                    <td class="p-2 border border-slate-300 text-indigo-700 font-bold text-xs whitespace-nowrap" style="background:#e0e7ff;">รวม ${name}</td>
                    ${subCells}
                    <td class="p-2 border border-slate-300 text-right font-black text-indigo-700 whitespace-nowrap text-xs" style="background:#e0e7ff;">${formatMoney(debtorTotal)}</td>
                </tr>`;
        });

        const footerCells = sortedDates.map(d =>
            `<td class="p-2 border border-indigo-400 text-right font-black whitespace-nowrap" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#3730a3;color:#fff;">${formatMoney(dateTotals[d])}</td>`
        ).join('');

        summaryContainer.innerHTML = `
            <div class="overflow-x-auto">
            <table class="border-collapse border border-slate-300 text-xs shadow-sm" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                <thead>
                    <tr class="bg-indigo-600 text-white font-bold" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                        <th class="p-2 border border-indigo-500 text-left whitespace-nowrap" style="min-width:260px;">ลูกหนี้ / เลข TD</th>
                        ${dateThs}
                        <th class="p-2 border border-indigo-500 text-center whitespace-nowrap">รวม</th>
                    </tr>
                </thead>
                <tbody>${debtorRows}</tbody>
                <tfoot>
                    <tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#3730a3;">
                        <td class="p-2 border border-indigo-400 font-black whitespace-nowrap" style="background:#3730a3;color:#fff;letter-spacing:0.05em;">รวมทั้งสิ้น</td>
                        ${footerCells}
                        <td class="p-2 border border-indigo-400 text-right font-black whitespace-nowrap" style="background:#3730a3;color:#fff;">${formatMoney(grandTotal)}</td>
                    </tr>
                </tfoot>
            </table>
            </div>`;
    }
}

let c1Inst = null, c2Inst = null;
const commonOptions = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 800, easing: 'easeOutQuart' },
    layout: { padding: { top: 30 } },
    plugins: { 
        legend: { position: 'top' },
        datalabels: { 
            anchor: 'end', align: 'top', offset: 4, color: '#475569', font: { weight: 'bold', size: 11 }, 
            formatter: v => v > 0 ? (v/1000000).toFixed(1) + 'M' : '' 
        }
    },
    scales: { y: { beginAtZero: true, grace: '15%', ticks: { callback: v => '฿' + (v/1000000) + 'M' } } }
};

function updateChart1(data) {
    if (c1Inst) {
        c1Inst.data.labels = data.map(x => x.name);
        c1Inst.data.datasets[0].data = data.map(x => x.limit);
        c1Inst.data.datasets[1].data = data.map(x => x.used);
        c1Inst.update();
    } else {
        c1Inst = new Chart(document.getElementById('comparisonChart'), {
            type: 'bar',
            data: {
                labels: data.map(x => x.name),
                datasets: [
                    { label: 'วงเงิน', data: data.map(x => x.limit), backgroundColor: '#6366f1' },
                    { label: 'ยอดเบิก', data: data.map(x => x.used), backgroundColor: '#f43f5e' }
                ]
            },
            options: commonOptions
        });
    }
}

function updateChart2(data) {
    if (c2Inst) {
        c2Inst.data.labels = data.map(x => x.name);
        c2Inst.data.datasets[0].data = data.map(x => x.used);
        c2Inst.data.datasets[1].data = data.map(x => x.remain);
        c2Inst.update();
    } else {
        c2Inst = new Chart(document.getElementById('trendChart'), {
            type: 'bar',
            data: {
                labels: data.map(x => x.name),
                datasets: [
                    { label: 'ยอดที่ต้องชำระ (N)', data: data.map(x => x.used), backgroundColor: '#f43f5e' },
                    { label: 'ยอดคงเหลือรับ 10% (Q)', data: data.map(x => x.remain), backgroundColor: '#10b981' }
                ]
            },
            options: commonOptions
        });
    }
}

function renderTable(data) {
    const body = document.getElementById('table-body'); if (!body) return;
    const summaryContainer = document.getElementById('debtor-summary-container');

    const validData = data.filter(r => {
        const name = (r.i || "").trim();
        return name && name !== "ลูกหนี้" && name !== "ชื่อลูกหนี้" && name !== "Debtor";
    });

    // --- ปุ่มซ่อน/แสดง tbody ---
    const toggleBtn = document.getElementById('main-table-toggle-btn');
    const toggleLbl = document.getElementById('main-table-toggle-lbl');
    const toggleIcon = document.getElementById('main-table-toggle-icon');
    if (toggleBtn && !toggleBtn._bslBound) {
        toggleBtn._bslBound = true;
        toggleBtn.addEventListener('click', () => {
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? '' : 'none';
            if (toggleLbl) toggleLbl.textContent = isHidden ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด';
            if (toggleIcon) toggleIcon.style.transform = isHidden ? '' : 'rotate(-90deg)';
        });
    }

    if (validData.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 italic">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
        if (summaryContainer) summaryContainer.innerHTML = '';
        return;
    }

    body.innerHTML = validData.map(r => {
        const note = r.t || '';
        const noteClass = note.includes('ตัดจาก Fac ใหม่') ? 'text-rose-600 font-bold' : 'text-slate-500';
        const tdDisplay = r.td || '-';
        return `
            <tr class="border-b border-slate-300 hover:bg-slate-50 transition-colors group text-center">
                <td class="p-4 text-slate-500 font-medium border-r border-slate-300 break-words whitespace-nowrap">${r.c}</td>
                <td class="p-4 font-bold text-violet-700 border-r border-slate-300 break-words whitespace-nowrap">${tdDisplay}</td>
                <td class="p-4 font-bold text-slate-700 border-r border-slate-300 break-words whitespace-nowrap">${r.f}</td>
                <td class="p-4 text-slate-600 border-r border-slate-300 break-words whitespace-normal text-left">${r.g}</td>
                <td class="p-4 text-slate-500 border-r border-slate-300 break-words whitespace-normal">${r.h}</td>
                <td class="p-4 font-bold text-indigo-600 border-r border-slate-300 break-words whitespace-normal text-left">${r.i}</td>
                <td class="p-4 text-slate-500 border-r border-slate-300 break-words whitespace-nowrap">${r.s || ''}</td>
                <td class="p-4 ${noteClass} border-r border-slate-300 break-words whitespace-normal">${note}</td>
                <td class="p-4 text-right font-black text-slate-800 break-words whitespace-nowrap">${formatMoney(r.n)}</td>
            </tr>
        `;
    }).join('');

    // --- Pivot: แยกแถวตาม TD แต่ละงาน ---
    if (summaryContainer) {
        const dateSet = new Set();
        const debtorOrder = [];
        const debtorSet = new Set();
        // pivot[debtor] = [ { td, desc, dateAmts:{date:amt}, rowTotal } ]
        const pivotByDebtor = {};
        let grandTotal = 0;

        validData.forEach(r => {
            const name = r.i, date = r.c, amt = r.n;
            const tdKey = r.td || '-';
            const desc  = r.g || '';
            dateSet.add(date);
            if (!debtorSet.has(name)) { debtorSet.add(name); debtorOrder.push(name); }
            if (!pivotByDebtor[name]) pivotByDebtor[name] = [];
            let entry = pivotByDebtor[name].find(e => e.td === tdKey);
            if (!entry) { entry = { td: tdKey, desc, dateAmts: {} }; pivotByDebtor[name].push(entry); }
            entry.dateAmts[date] = (entry.dateAmts[date] || 0) + amt;
            grandTotal += amt;
        });

        const sortedDates = Array.from(dateSet).sort((a, b) => {
            const toNum = s => { const p = s.split('/'); return parseInt((p[2]||'0')+(p[1]||'00').padStart(2,'0')+(p[0]||'00').padStart(2,'0'),10); };
            return toNum(a) - toNum(b);
        });

        const dateTotals = {};
        sortedDates.forEach(d => {
            dateTotals[d] = debtorOrder.reduce((sum, name) => {
                return sum + (pivotByDebtor[name] || []).reduce((s, e) => s + (e.dateAmts[d] || 0), 0);
            }, 0);
        });

        const dateThs = sortedDates.map(d =>
            `<th class="p-2 border border-indigo-500 text-center whitespace-nowrap" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">${d}</th>`
        ).join('');

        let debtorRows = '';
        debtorOrder.forEach(name => {
            const entries = pivotByDebtor[name] || [];
            const debtorTotal = sortedDates.reduce((s, d) => s + entries.reduce((ss, e) => ss + (e.dateAmts[d] || 0), 0), 0);

            entries.forEach((entry, idx) => {
                const rowTotal = sortedDates.reduce((s, d) => s + (entry.dateAmts[d] || 0), 0);
                const cells = sortedDates.map(d => {
                    const amt = entry.dateAmts[d] || 0;
                    return `<td class="p-2 border border-slate-300 text-right whitespace-nowrap ${amt > 0 ? 'text-slate-700 font-medium' : 'text-slate-300'}">${amt > 0 ? formatMoney(amt) : '-'}</td>`;
                }).join('');

                if (idx === 0) {
                    debtorRows += `
                    <tr class="hover:bg-slate-50 border-b border-slate-200">
                        <td class="p-2 border border-slate-300" style="min-width:280px;">
                            <span class="block font-bold text-indigo-700 text-xs mb-1">${name}</span>
                            <div style="display:table;width:100%;table-layout:fixed;">
                                <span style="display:table-cell;width:120px;font-size:11px;font-weight:700;color:#7c3aed;white-space:nowrap;vertical-align:top;padding-right:6px;">${entry.td}</span>
                                <span style="display:table-cell;font-size:11px;color:#94a3b8;vertical-align:top;word-break:break-word;">${entry.desc}</span>
                            </div>
                        </td>
                        ${cells}
                        <td class="p-2 border border-slate-300 text-right font-bold text-emerald-700 whitespace-nowrap text-xs">${formatMoney(rowTotal)}</td>
                    </tr>`;
                } else {
                    debtorRows += `
                    <tr class="hover:bg-slate-50 border-b border-slate-200">
                        <td class="p-2 border border-slate-300" style="min-width:280px;">
                            <div style="display:table;width:100%;table-layout:fixed;border-left:2px solid #6ee7b7;padding-left:6px;">
                                <span style="display:table-cell;width:120px;font-size:11px;font-weight:700;color:#7c3aed;white-space:nowrap;vertical-align:top;padding-right:6px;">${entry.td}</span>
                                <span style="display:table-cell;font-size:11px;color:#94a3b8;vertical-align:top;word-break:break-word;">${entry.desc}</span>
                            </div>
                        </td>
                        ${cells}
                        <td class="p-2 border border-slate-300 text-right font-bold text-emerald-700 whitespace-nowrap text-xs">${formatMoney(rowTotal)}</td>
                    </tr>`;
                }
            });

            // Sub-total row ต่อลูกหนี้
            const subCells = sortedDates.map(d => {
                const amt = entries.reduce((s, e) => s + (e.dateAmts[d] || 0), 0);
                return `<td class="p-2 border border-slate-300 text-right whitespace-nowrap font-bold text-emerald-700 text-xs" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#d1fae5;">${amt > 0 ? formatMoney(amt) : '-'}</td>`;
            }).join('');
            debtorRows += `
                <tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#d1fae5;">
                    <td class="p-2 border border-slate-300 text-emerald-700 font-bold text-xs whitespace-nowrap" style="background:#d1fae5;">รวม ${name}</td>
                    ${subCells}
                    <td class="p-2 border border-slate-300 text-right font-black text-emerald-700 whitespace-nowrap text-xs" style="background:#d1fae5;">${formatMoney(debtorTotal)}</td>
                </tr>`;
        });

        const footerCells = sortedDates.map(d =>
            `<td class="p-2 border border-emerald-400 text-right font-black whitespace-nowrap" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#065f46;color:#fff;">${formatMoney(dateTotals[d])}</td>`
        ).join('');

        summaryContainer.innerHTML = `
            <div class="overflow-x-auto">
            <table class="border-collapse border border-slate-300 text-xs shadow-sm" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                <thead>
                    <tr class="bg-indigo-600 text-white font-bold" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                        <th class="p-2 border border-indigo-500 text-left whitespace-nowrap" style="min-width:260px;">ลูกหนี้ / เลข TD</th>
                        ${dateThs}
                        <th class="p-2 border border-indigo-500 text-center whitespace-nowrap">รวม</th>
                    </tr>
                </thead>
                <tbody>${debtorRows}</tbody>
                <tfoot>
                    <tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#065f46;">
                        <td class="p-2 border border-emerald-400 font-black whitespace-nowrap" style="background:#065f46;color:#fff;letter-spacing:0.05em;">รวมทั้งสิ้น</td>
                        ${footerCells}
                        <td class="p-2 border border-emerald-400 text-right font-black whitespace-nowrap" style="background:#065f46;color:#fff;">${formatMoney(grandTotal)}</td>
                    </tr>
                </tfoot>
            </table>
            </div>
        `;
    }
}

function exportToPDF() {
    // เปลี่ยนมาใช้ระบบ Print ของเบราว์เซอร์แทน เพื่อการจัดเรียงภาษาไทยที่สมบูรณ์ 100%
    // และแก้ปัญหาตัวหนังสือซ้อนทับกันในตาราง
    setTimeout(() => {
        window.print();
    }, 300);
}

function exportAdvanceToPDF() {
    // ดึงข้อมูลที่กรองอยู่จาก advance table body
    const body = document.getElementById('advance-table-body');
    const summaryContainer = document.getElementById('advance-summary-container');
    const totalEl = document.getElementById('advance-total-amount');
    if (!body) return;

    // สร้างรายการ filter label สำหรับ subtitle
    const filterParts = [];
    const statusLabel = document.getElementById('adv-status-filter-label');
    const monthLabel  = document.getElementById('adv-month-filter-label');
    const yearLabel   = document.getElementById('adv-year-filter-label');
    if (statusLabel && !statusLabel.textContent.includes('ทั้งหมด')) filterParts.push(statusLabel.textContent);
    if (monthLabel  && !monthLabel.textContent.includes('ทั้งหมด'))  filterParts.push(monthLabel.textContent);
    if (yearLabel   && !yearLabel.textContent.includes('ทั้งหมด'))   filterParts.push(yearLabel.textContent);
    const filterDesc = filterParts.length > 0 ? filterParts.join(' | ') : 'ทั้งหมด';

    // ดึง HTML ของ tbody และ summary (pivot) ที่ render แล้ว
    const tbodyHtml = body.innerHTML;
    const summaryHtml = summaryContainer ? summaryContainer.innerHTML : '';
    const grandTotal = totalEl ? totalEl.textContent : '0.00';

    // วันที่พิมพ์
    const now = new Date();
    const printDate = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()+543}`;

    const previewWin = window.open('', '_blank', 'width=1200,height=900');
    if (!previewWin) {
        alert('เบราว์เซอร์บล็อก popup กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
        return;
    }

    previewWin.document.open();
    previewWin.document.write(`<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title>รายงาน Advance 90%</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
    @page { size: A4 landscape; margin: 10mm 8mm; }
    @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        .no-print { display: none !important; }
    }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Sarabun', sans-serif; padding: 10px; color: #1e293b; font-size: 11px; }

    /* ===== Header Banner ===== */
    .adv-banner {
        background: linear-gradient(180deg, #10b981 0%, #059669 55%, #047857 100%);
        padding: 4px 20px 10px; position: relative; margin-bottom: 0;
    }
    .adv-company-corner {
        text-align: right; font-size: 10px; font-weight: 700; color: #fff;
        letter-spacing: 0.18em; text-shadow: 1px 1px 0 rgba(6,95,70,0.6); margin-bottom: 2px;
    }
    .adv-main-row {
        display: flex; align-items: center; justify-content: center; gap: 18px; padding: 2px 0;
    }
    .adv-line {
        flex: 1; height: 4px; background: #fff;
        box-shadow: 0 1px 2px rgba(0,0,0,0.2); border-radius: 1px;
    }
    .adv-title {
        font-size: 28px; font-weight: 900; color: #fff; letter-spacing: 0.01em;
        line-height: 1; font-style: italic; white-space: nowrap;
        text-shadow: -1px 0 0 #a7f3d0, 1px 0 0 #6ee7b7, 0 2px 0 #065f46, 0 3px 3px rgba(0,0,0,0.4);
    }
    .adv-finance-tag {
        position: absolute; right: 20px; bottom: 6px;
        font-size: 11px; font-weight: 700; color: #fff;
        letter-spacing: 0.25em; text-transform: uppercase; font-style: italic;
        opacity: 0.95; text-shadow: 1px 1px 0 rgba(6,95,70,0.55);
    }
    .adv-gray-strip {
        height: 8px; background: linear-gradient(180deg, #6ee7b7 0%, #34d399 100%);
    }
    .adv-shadow-strip {
        height: 4px; background: linear-gradient(180deg, #059669 0%, #047857 100%);
    }
    .adv-report-title {
        text-align: center; font-size: 15px; font-weight: 700; color: #0f172a;
        padding: 10px 16px 2px; letter-spacing: 0.02em;
    }
    .adv-report-subtitle {
        text-align: center; font-size: 11px; color: #475569; font-weight: 600;
        padding-bottom: 10px;
    }
    .adv-report-subtitle b { color: #047857; }
    .print-date { text-align: right; font-size: 10px; color: #94a3b8; padding-bottom: 8px; }

    /* ===== Main Table ===== */
    .pdf-table { width: 100%; border-collapse: collapse; font-size: 10px; color: #334155; table-layout: fixed; }
    .pdf-table th, .pdf-table td {
        border: 1px solid #cbd5e1; padding: 5px 7px;
        text-align: left; vertical-align: middle; word-wrap: break-word; line-height: 1.35;
    }
    .pdf-table th {
        background: #059669; font-weight: 700; text-align: center; color: #fff;
    }
    .pdf-table th.td-col { background: #047857; }
    @media print { .pdf-table th { background: #059669 !important; color: #fff !important; } .pdf-table th.td-col { background: #047857 !important; } }
    .numeric { text-align: right !important; white-space: nowrap; }
    .td-cell { color: #7c3aed; font-weight: 700; }
    .debtor-cell { color: #4338ca; font-weight: 700; }

    /* ===== Pivot Table ===== */
    .pivot-wrap { margin-top: 16px; page-break-inside: avoid; }
    .pivot-wrap h4 { font-size: 12px; font-weight: 700; color: #047857; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .pivot-wrap table { border-collapse: collapse; font-size: 10px; }
    .pivot-wrap th { background: #4f46e5; color: #fff; padding: 5px 8px; border: 1px solid #4338ca; white-space: nowrap; }
    @media print { .pivot-wrap th { background: #4f46e5 !important; color: #fff !important; } }
    .pivot-wrap td { border: 1px solid #cbd5e1; padding: 4px 8px; }

    /* ===== Grand Total ===== */
    .pdf-grand { display: flex; justify-content: flex-end; margin-top: 12px; }
    .pdf-grand-box {
        background: #ecfdf5; border: 1px solid #6ee7b7; padding: 10px 18px;
        border-radius: 6px; font-size: 13px; font-weight: 700; color: #047857;
    }

    /* ===== Signatures ===== */
    .pdf-signatures {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px;
        margin-top: 40px; text-align: center; font-size: 10px;
        color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;
    }
    .pdf-sig-box { border-top: 1px solid #94a3b8; padding-top: 8px; margin: 0 12px; }
</style>
</head>
<body>
    <div>
        <div class="adv-banner">
            <div class="adv-company-corner">บริษัท รถเจาะไทย จำกัด</div>
            <div class="adv-main-row">
                <div class="adv-line"></div>
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                    <div class="adv-title">ThaiDrill</div>
                    <div style="width:90%;height:3px;background:#fff;border-radius:1px;box-shadow:0 1px 2px rgba(0,0,0,0.25);"></div>
                </div>
                <div class="adv-line"></div>
            </div>
            <div class="adv-finance-tag">Finance</div>
        </div>
        <div class="adv-gray-strip"></div>
        <div class="adv-shadow-strip"></div>
        <div class="adv-report-title">รายงานยอด Advance 90%</div>
        <div class="adv-report-subtitle">ตัวกรอง: <b>${filterDesc}</b></div>
        <div class="print-date">พิมพ์วันที่: ${printDate}</div>
    </div>

    <table class="pdf-table">
        <thead>
            <tr>
                <th style="width:10%;">วันที่ครบกำหนด</th>
                <th class="td-col" style="width:8%;">เลข TD</th>
                <th style="width:9%;">เลขที่ IV</th>
                <th style="width:16%;">รายละเอียด</th>
                <th style="width:7%;">ประจำเดือน</th>
                <th style="width:15%;">ลูกหนี้</th>
                <th style="width:8%;">สถานะ</th>
                <th style="width:10%;">เลขที่เช็ค</th>
                <th class="numeric" style="width:17%;">ยอด Advance 90%</th>
            </tr>
        </thead>
        <tbody>${tbodyHtml}</tbody>
    </table>

    <div class="pdf-grand">
        <div class="pdf-grand-box">ยอดรวมทั้งสิ้น: ฿ ${grandTotal}</div>
    </div>

    ${summaryHtml ? `<div class="pivot-wrap"><h4>ตารางสรุปยอด Advance 90% แยกตามลูกหนี้</h4>${summaryHtml}</div>` : ''}

    <div class="pdf-signatures">
        <div><div class="pdf-sig-box">ผู้จัดทำ</div></div>
        <div><div class="pdf-sig-box">ผู้ตรวจสอบ</div></div>
        <div><div class="pdf-sig-box">ผู้อนุมัติ</div></div>
    </div>

<script>
(function(){
    function doPrint(){
        try { window.focus(); window.print(); } catch(e){ console.error(e); }
    }
    function ready(cb){
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function(){ setTimeout(cb, 350); });
        } else {
            setTimeout(cb, 700);
        }
    }
    window.addEventListener('load', function(){ ready(doPrint); });
})();
<\/script>
</body></html>`);
    previewWin.document.close();
}

/* =====================================================================
   Daily PDF Report — เลือกวันที่หลายวัน → เปิดหน้า PDF preview ใน Chrome
   ===================================================================== */
let bslSelectedDates = new Set();
let bslCalYear = new Date().getFullYear();
let bslCalMonth = new Date().getMonth();
let bslCalSelectsBuilt = false;

function bslToDateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function bslGetDatesWithData() {
    const set = new Set();
    if (!Array.isArray(RAW_DATA1) || RAW_DATA1.length === 0) return set;
    RAW_DATA1.forEach(row => {
        const p = parseDateParts(row[DATA1_COL.dueDate]);
        if (p.y && p.m && p.d) set.add(`${p.y}-${p.m}-${p.d}`);
    });
    return set;
}

function bslPopulateCalSelects() {
    if (bslCalSelectsBuilt) return;
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const monthSel = document.getElementById('calMonthSel');
    const yearSel = document.getElementById('calYearSel');
    if (!monthSel || !yearSel) return;

    monthSel.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');

    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear - 5; y <= currentYear + 10; y++) years.push(y);
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y + 543}</option>`).join('');

    monthSel.addEventListener('change', () => {
        bslCalMonth = parseInt(monthSel.value, 10);
        bslRenderCalendar();
    });
    yearSel.addEventListener('change', () => {
        bslCalYear = parseInt(yearSel.value, 10);
        bslRenderCalendar();
    });

    bslCalSelectsBuilt = true;
}

function bslRenderCalendar() {
    bslPopulateCalSelects();
    const monthSel = document.getElementById('calMonthSel');
    const yearSel = document.getElementById('calYearSel');
    if (monthSel) monthSel.value = bslCalMonth;
    if (yearSel) yearSel.value = bslCalYear;

    const grid = document.getElementById('pdfCalGrid');
    if (!grid) return;

    const datesWithData = bslGetDatesWithData();
    const firstDay = new Date(bslCalYear, bslCalMonth, 1).getDay();
    const lastDate = new Date(bslCalYear, bslCalMonth + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="bsl-cal-day empty"></div>';
    for (let d = 1; d <= lastDate; d++) {
        const key = bslToDateKey(bslCalYear, bslCalMonth, d);
        const hasData = datesWithData.has(key);
        const selected = bslSelectedDates.has(key);
        const cls = ['bsl-cal-day'];
        if (hasData) cls.push('has-data');
        if (selected) cls.push('selected');
        html += `<div class="${cls.join(' ')}" data-key="${key}">${d}</div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.bsl-cal-day:not(.empty)').forEach(el => {
        el.addEventListener('click', () => {
            const k = el.dataset.key;
            if (bslSelectedDates.has(k)) {
                bslSelectedDates.delete(k);
                el.classList.remove('selected');
            } else {
                bslSelectedDates.add(k);
                el.classList.add('selected');
            }
            bslUpdateCalBar();
        });
    });
    bslUpdateCalBar();
}

function bslUpdateCalBar() {
    const bar = document.getElementById('calSelectedBar');
    if (!bar) return;
    if (bslSelectedDates.size === 0) {
        bar.textContent = 'ยังไม่ได้เลือกวันที่';
    } else {
        bar.textContent = `เลือกแล้ว ${bslSelectedDates.size} วัน`;
    }
}

function openBslPDFModal() {
    bslSelectedDates.clear();
    const overlay = document.getElementById('pdfModal');
    if (overlay) overlay.classList.add('show');
    bslRenderCalendar();
}

function closeBslPDFModal() {
    const overlay = document.getElementById('pdfModal');
    if (overlay) overlay.classList.remove('show');
}

function bslGeneratePDFPreview() {
    if (bslSelectedDates.size === 0) {
        alert('กรุณาเลือกวันที่อย่างน้อย 1 วัน');
        return;
    }

    const selectedRows = [];
    let grandTotal = 0;
    const debtorTotals = {};

    RAW_DATA1.forEach(row => {
        const p = parseDateParts(row[DATA1_COL.dueDate]);
        if (!p.y || !p.m || !p.d) return;
        const key = `${p.y}-${p.m}-${p.d}`;
        if (!bslSelectedDates.has(key)) return;

        const debtor = (row[DATA1_COL.debtor] || '').toString().trim();
        if (!debtor || debtor === 'ลูกหนี้' || debtor === 'ชื่อลูกหนี้' || debtor === 'Debtor') return;

        const amt = parseNumber(row[DATA1_COL.bill]);
        selectedRows.push({
            dueDate: `${p.d}/${p.m}/${p.y}`,
            invoice: row[DATA1_COL.invoice] || '',
            bank: row[DATA1_COL.bank] || '',
            jobType: row[DATA1_COL.jobType] || '',
            debtor: debtor,
            status: row[DATA1_COL.status] || '',
            note: row[DATA1_COL.note] || '',
            amount: amt,
            _sortKey: parseInt(`${p.y}${p.m}${p.d}`, 10)
        });
        grandTotal += amt;
        debtorTotals[debtor] = (debtorTotals[debtor] || 0) + amt;
    });

    if (selectedRows.length === 0) {
        alert('ไม่พบข้อมูลในวันที่ที่เลือก');
        return;
    }
    selectedRows.sort((a, b) => a._sortKey - b._sortKey);

    // สร้างข้อความวันที่
    const monthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const sortedDates = Array.from(bslSelectedDates).sort();
    let dateDesc;
    if (sortedDates.length === 1) {
        const [y, m, d] = sortedDates[0].split('-').map(Number);
        dateDesc = `${d} ${monthsFull[m - 1]} ${y + 543}`;
    } else {
        // ถ้าทุกวันอยู่ในเดือนเดียวกัน → "11, 20 พฤษภาคม 2569"
        const sameMonthYear = sortedDates.every(s => {
            const a = sortedDates[0].split('-');
            const b = s.split('-');
            return a[0] === b[0] && a[1] === b[1];
        });
        if (sameMonthYear) {
            const [y, m] = sortedDates[0].split('-').map(Number);
            const days = sortedDates.map(s => parseInt(s.split('-')[2], 10)).join(', ');
            dateDesc = `${days} ${monthsFull[m - 1]} ${y + 543}`;
        } else {
            dateDesc = sortedDates.map(s => {
                const [y, m, d] = s.split('-').map(Number);
                return `${d}/${m}/${y + 543}`;
            }).join(', ');
        }
    }

    const tableRows = selectedRows.map(r => `
        <tr>
            <td style="text-align:center; white-space:nowrap;">${r.dueDate}</td>
            <td style="text-align:center;">${r.invoice}</td>
            <td>${r.bank}</td>
            <td>${r.jobType}</td>
            <td>${r.debtor}</td>
            <td style="text-align:center;">${r.status}</td>
            <td>${r.note}</td>
            <td class="numeric">${formatMoney(r.amount)}</td>
        </tr>`).join('');

    const debtorRows = Object.entries(debtorTotals).map(([name, amt]) => `
        <tr>
            <td>${name}</td>
            <td class="numeric">${formatMoney(amt)}</td>
        </tr>`).join('');

    const previewWin = window.open('', '_blank', 'width=1200,height=900');
    if (!previewWin) {
        alert('เบราว์เซอร์บล็อก popup กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
        return;
    }

    previewWin.document.open();
    previewWin.document.write(`<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title> </title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
    @page { size: A4 portrait; margin: 12mm 8mm; }
    @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Sarabun', sans-serif; padding: 12px; color: #1e293b; }
    .pdf-title { text-align: center; font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .pdf-subtitle { text-align: center; font-size: 13px; color: #475569; margin-bottom: 16px; font-weight: 600; }

    /* ====== ThaiDrill Signboard Header ====== */
    .td-signboard-wrap { margin-bottom: 14px; }
    .td-signboard {
        background: #e11d2e;
        background-image: linear-gradient(180deg, #ef4444 0%, #e11d2e 55%, #b91c1c 100%);
        padding: 4px 20px 10px; position: relative;
    }
    .td-company-corner {
        text-align: right; font-size: 10px; font-weight: 700; color: #fff;
        letter-spacing: 0.18em; text-shadow: 1px 1px 0 rgba(127,29,29,0.6); margin-bottom: 2px;
    }
    .td-main-row {
        display: flex; align-items: center; justify-content: center;
        gap: 18px; padding: 2px 0;
    }
    .td-line {
        flex: 1; height: 4px; background: #fff;
        box-shadow: 0 1px 2px rgba(0,0,0,0.2), inset 0 -1px 0 rgba(203,213,225,0.6);
        border-radius: 1px;
    }
    .td-title-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .td-title {
        font-size: 30px; font-weight: 900; color: #fff;
        letter-spacing: 0.01em; line-height: 1; font-style: italic; white-space: nowrap;
        text-shadow:
            -1px 0 0 #cbd5e1, 1px 0 0 #94a3b8, 0 1px 0 #94a3b8,
            0 2px 0 #64748b, 0 3px 3px rgba(0,0,0,0.4);
    }
    .td-title-underline {
        width: 90%; height: 3px; background: #fff;
        box-shadow: 0 1px 2px rgba(0,0,0,0.25), inset 0 -1px 0 rgba(203,213,225,0.6);
        border-radius: 1px;
    }
    .td-finance-tag {
        position: absolute; right: 20px; bottom: 6px;
        font-size: 11px; font-weight: 700; color: #fff;
        letter-spacing: 0.25em; text-transform: uppercase; font-style: italic;
        text-shadow: 1px 1px 0 rgba(127,29,29,0.55); opacity: 0.95;
    }
    .td-gray-strip {
        height: 8px; background: #94a3b8;
        background-image: linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%);
    }
    .td-shadow-strip {
        height: 4px; background: #475569;
        background-image: linear-gradient(180deg, #64748b 0%, #334155 100%);
    }
    .td-report-title {
        text-align: center; font-size: 17px; font-weight: 700; color: #0f172a;
        padding: 12px 16px 4px; letter-spacing: 0.02em;
    }
    .td-report-title b { color: #b91c1c; font-weight: 800; }
    .td-report-title .rpt-brand { color: #b91c1c; font-weight: 800; font-style: italic; }
    @media print {
        .td-signboard, .td-gray-strip, .td-shadow-strip,
        .td-line, .td-title, .td-title-underline, .td-finance-tag, .td-company-corner {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
    .pdf-table { width: 100%; border-collapse: collapse; font-size: 10px; color: #334155; table-layout: fixed; }
    .pdf-table th, .pdf-table td {
        border: 1px solid #cbd5e1; padding: 6px 8px;
        text-align: left; vertical-align: middle; word-wrap: break-word; line-height: 1.4;
    }
    .pdf-table th {
        background: #4f46e5; font-weight: 700; text-align: center;
        vertical-align: middle; color: #ffffff;
    }
    @media print { .pdf-table th { background: #4f46e5 !important; color: #ffffff !important; } }
    .numeric { text-align: right !important; white-space: nowrap; }
    .pdf-summary { margin-top: 16px; }
    .pdf-summary h4 {
        font-size: 12px; font-weight: 700; color: #1e3a8a;
        margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .pdf-summary table { width: 60%; min-width: 320px; border-collapse: collapse; font-size: 10px; }
    .pdf-summary td { border: 1px solid #cbd5e1; padding: 5px 10px; }
    .pdf-summary tfoot td { background: #eef2ff; font-weight: 700; color: #4338ca; }
    .pdf-grand { display: flex; justify-content: flex-end; margin-top: 12px; }
    .pdf-grand-box {
        background: #eef2ff; border: 1px solid #c7d2fe; padding: 10px 18px;
        border-radius: 6px; font-size: 13px; font-weight: 700; color: #4338ca;
    }
    .pdf-signatures {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px;
        margin-top: 60px; text-align: center; font-size: 10px;
        color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;
    }
    .pdf-sig-box { border-top: 1px solid #94a3b8; padding-top: 8px; margin: 0 12px; }
</style>
</head>
<body>
    <div class="td-signboard-wrap">
        <div class="td-signboard">
            <div class="td-company-corner">บริษัท รถเจาะไทย จำกัด</div>
            <div class="td-main-row">
                <div class="td-line"></div>
                <div class="td-title-wrap">
                    <div class="td-title">ThaiDrill</div>
                    <div class="td-title-underline"></div>
                </div>
                <div class="td-line"></div>
            </div>
            <div class="td-finance-tag">Finance</div>
        </div>
        <div class="td-gray-strip"></div>
        <div class="td-shadow-strip"></div>
        <div class="td-report-title">รายงานครบกำหนดชำระ <span class="rpt-brand">ThaiDrill</span> ประจำวันที่ <b>${dateDesc}</b></div>
    </div>
    <table class="pdf-table">
        <thead>
            <tr>
                <th style="width:11%;">วันครบกำหนด</th>
                <th style="width:11%;">เลขที่ IV</th>
                <th style="width:13%;">รายละเอียด</th>
                <th style="width:9%;">ประจำเดือน</th>
                <th style="width:16%;">ลูกหนี้</th>
                <th style="width:9%;">สถานะ</th>
                <th style="width:18%;">หมายเหตุ</th>
                <th class="numeric" style="width:13%;">จำนวนเงิน</th>
            </tr>
        </thead>
        <tbody>${tableRows}</tbody>
    </table>
    <div class="pdf-grand">
        <div class="pdf-grand-box">ยอดรวมทั้งสิ้น: ฿ ${formatMoney(grandTotal)}</div>
    </div>
    <div class="pdf-summary">
        <h4>สรุปยอดตามลูกหนี้</h4>
        <table>
            <tbody>${debtorRows}</tbody>
            <tfoot>
                <tr><td>รวมทั้งสิ้น</td><td class="numeric">${formatMoney(grandTotal)}</td></tr>
            </tfoot>
        </table>
    </div>
    <div class="pdf-signatures">
        <div><div class="pdf-sig-box">ผู้จัดทำ</div></div>
        <div><div class="pdf-sig-box">ผู้ตรวจสอบ</div></div>
        <div><div class="pdf-sig-box">ผู้อนุมัติ</div></div>
    </div>
<script>
(function(){
    function doPrint(){
        try { window.focus(); window.print(); } catch(e){ console.error(e); }
    }
    function ready(cb){
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function(){ setTimeout(cb, 300); });
        } else {
            setTimeout(cb, 600);
        }
    }
    window.addEventListener('load', function(){ ready(doPrint); });
})();
<\/script>
</body></html>`);
    previewWin.document.close();
    closeBslPDFModal();
}

// ผูก event listeners ของ Daily PDF Report
document.addEventListener('DOMContentLoaded', () => {
    // ปิด dropdown ทุกตัวเมื่อคลิกภายนอก (รวมเป็นตัวเดียว)
    document.addEventListener('click', (e) => {
        [
            { drop: 'note-filter-dropdown',        arrow: 'note-filter-arrow',        btn: 'note-filter-btn'        },
            { drop: 'month-filter-dropdown',       arrow: 'month-filter-arrow',       btn: 'month-filter-btn'       },
            { drop: 'year-filter-dropdown',        arrow: 'year-filter-arrow',        btn: 'year-filter-btn'        },
            { drop: 'status-filter-dropdown',      arrow: 'status-filter-arrow',      btn: 'status-filter-btn'      },
            { drop: 'adv-status-filter-dropdown',  arrow: 'adv-status-filter-arrow',  btn: 'adv-status-filter-btn'  },
            { drop: 'adv-month-filter-dropdown',   arrow: 'adv-month-filter-arrow',   btn: 'adv-month-filter-btn'   },
            { drop: 'adv-year-filter-dropdown',    arrow: 'adv-year-filter-arrow',    btn: 'adv-year-filter-btn'    },
        ].forEach(({ drop, arrow, btn }) => {
            const el = document.getElementById(drop);
            const ar = document.getElementById(arrow);
            const b  = document.getElementById(btn);
            if (!el || el.classList.contains('hidden')) return;
            // ปิดเฉพาะเมื่อคลิกอยู่นอก dropdown และนอกปุ่ม
            if (!el.contains(e.target) && b && !b.contains(e.target)) {
                el.classList.remove('scale-100', 'opacity-100');
                el.classList.add('scale-95', 'opacity-0');
                if (ar) ar.classList.remove('rotate-180');
                setTimeout(() => el.classList.add('hidden'), 150);
            }
        });
    });

    const btnOpen = document.getElementById('btnDailyPDF');
    if (btnOpen) btnOpen.addEventListener('click', openBslPDFModal);

    const btnClose = document.getElementById('closePdfModal');
    if (btnClose) btnClose.addEventListener('click', closeBslPDFModal);

    const overlay = document.getElementById('pdfModal');
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeBslPDFModal();
    });

    const btnGen = document.getElementById('btnGeneratePdf');
    if (btnGen) btnGen.addEventListener('click', bslGeneratePDFPreview);

    const btnPrev = document.getElementById('calPrev');
    if (btnPrev) btnPrev.addEventListener('click', () => {
        bslCalMonth--;
        if (bslCalMonth < 0) { bslCalMonth = 11; bslCalYear--; }
        bslRenderCalendar();
    });

    const btnNext = document.getElementById('calNext');
    if (btnNext) btnNext.addEventListener('click', () => {
        bslCalMonth++;
        if (bslCalMonth > 11) { bslCalMonth = 0; bslCalYear++; }
        bslRenderCalendar();
    });

    const btnSelAll = document.getElementById('calSelAll');
    if (btnSelAll) btnSelAll.addEventListener('click', () => {
        const datesWithData = bslGetDatesWithData();
        datesWithData.forEach(k => {
            const [y, m] = k.split('-').map(Number);
            if (y === bslCalYear && m - 1 === bslCalMonth) bslSelectedDates.add(k);
        });
        bslRenderCalendar();
    });

    const btnClear = document.getElementById('calClear');
    if (btnClear) btnClear.addEventListener('click', () => {
        bslSelectedDates.clear();
        bslRenderCalendar();
    });
});
