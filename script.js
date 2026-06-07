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
    invoice: 5,   // F - เลขที่ IV
    bank: 6,      // G - ธนาคาร
    jobType: 7,   // H - ประเภทงาน
    debtor: 8,    // I - ชื่อลูกหนี้
    bill: 13,     // N - จำนวนเงิน (หน้าตั๋ว)
    used: 15,     // P - ยอดเบิกเงิน (ยอดรับซื้อ)
    remain: 16,   // Q - ยอดคงเหลือรับ 10%
    status: 17,   // R - สถานะ
    note: 19,     // T - หมายเหตุ
    payMonth: 21  // V - เดือนที่กำหนดชำระ
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
    fill('table-filter-year', tySet, applyTableFilter);

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
        document.addEventListener('click', () => {
            if (!monthDrop.classList.contains('hidden')) {
                monthDrop.classList.remove('scale-100', 'opacity-100');
                monthDrop.classList.add('scale-95', 'opacity-0');
                if (monthArrow) monthArrow.classList.remove('rotate-180');
                setTimeout(() => monthDrop.classList.add('hidden'), 150);
            }
        });
    }

    // วาดหน้าตัวกรองหมายเหตุแบบเช็คบล็อก
    const dropdown = document.getElementById('note-filter-dropdown');
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
    const y = document.getElementById('table-filter-year').value;
    
    let filtered = [];
    let totalAmount = 0;

    RAW_DATA1.forEach((row) => {
        const pTable = parseDateParts(row[DATA1_COL.dueDate]);
        const noteVal = (row[DATA1_COL.note] || "").toString().trim();
        const noteKey = noteVal === "" ? "(ไม่มีหมายเหตุ)" : noteVal;
        
        const matchesMonth = selectedMonths.size === 0 || selectedMonths.has(pTable.m);
        const matchesYear = !y || pTable.y === y;
        const matchesNote = selectedNotes.has(noteKey);

        if (matchesMonth && matchesYear && matchesNote) {
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
    const ySelect = document.getElementById('table-filter-year');
    const yText = y ? ySelect.options[ySelect.selectedIndex].text : '';
    let subText = '';
    if (selectedMonths.size > 0 && selectedMonths.size < uniqueMonthsList.length) {
        const mNames = Array.from(selectedMonths).sort().map(m => THAI_MONTHS_FULL[m] || m).join(', ');
        subText = `(ประจำเดือน ${mNames} ${yText})`.trim();
    } else if (y) {
        subText = `(ปี ${yText})`.trim();
    }
    const subEl = document.getElementById('pdf-subtitle');
    if (subEl) subEl.textContent = subText;
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
    
    // กรองเอาแถวที่เป็นหัวข้อ (ลูกหนี้) หรือแถวว่างออกก่อนประมวลผล
    const validData = data.filter(r => {
        const name = (r.i || "").trim();
        return name && name !== "ลูกหนี้" && name !== "ชื่อลูกหนี้" && name !== "Debtor";
    });

    if (validData.length === 0) {
        body.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 italic">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
        if (summaryContainer) summaryContainer.innerHTML = '';
        return;
    }
    
    // แสดงข้อมูลในตารางหลัก
    body.innerHTML = validData.map(r => {
        const note = r.t || '';
        const noteClass = note.includes('ตัดจาก Fac ใหม่') ? 'text-rose-600 font-bold' : 'text-slate-500';
        
        return `
            <tr class="border-b border-slate-300 hover:bg-slate-50 transition-colors group text-center">
                <td class="p-4 text-slate-500 font-medium border-r border-slate-300 break-words whitespace-nowrap">${r.c}</td>
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

    // คำนวณสรุปยอดแบบ Pivot Table: แถว = ลูกหนี้, คอลัมน์ = วันที่ (เรียงน้อย→มาก)
    if (summaryContainer) {
        const dateSet = new Set();
        const debtorOrder = [];
        const debtorSet = new Set();
        const pivot = {};
        let grandTotal = 0;

        validData.forEach(r => {
            const name = r.i;
            const date = r.c;
            const amt  = r.n;
            dateSet.add(date);
            if (!debtorSet.has(name)) { debtorSet.add(name); debtorOrder.push(name); }
            if (!pivot[name]) pivot[name] = {};
            pivot[name][date] = (pivot[name][date] || 0) + amt;
            grandTotal += amt;
        });

        const sortedDates = Array.from(dateSet).sort((a, b) => {
            const toNum = s => {
                const p = s.split('/');
                return parseInt((p[2] || '0') + (p[1] || '00').padStart(2,'0') + (p[0] || '00').padStart(2,'0'), 10);
            };
            return toNum(a) - toNum(b);
        });

        const dateTotals = {};
        sortedDates.forEach(d => {
            dateTotals[d] = debtorOrder.reduce((s, name) => s + (pivot[name][d] || 0), 0);
        });

        const dateThs = sortedDates.map(d =>
            `<th class="p-2 border border-indigo-500 text-center whitespace-nowrap" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">${d}</th>`
        ).join('');

        const debtorRows = debtorOrder.map(name => {
            const rowTotal = sortedDates.reduce((s, d) => s + (pivot[name][d] || 0), 0);
            const cells = sortedDates.map(d => {
                const amt = pivot[name][d] || 0;
                return `<td class="p-2 border border-slate-300 text-right whitespace-nowrap ${amt > 0 ? 'text-slate-700 font-medium' : 'text-slate-300'}">${amt > 0 ? formatMoney(amt) : '-'}</td>`;
            }).join('');
            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-2 border border-slate-300 text-slate-600 font-medium whitespace-nowrap">${name}</td>
                    ${cells}
                    <td class="p-2 border border-slate-300 text-right font-black text-indigo-700 whitespace-nowrap">${formatMoney(rowTotal)}</td>
                </tr>`;
        }).join('');

        const footerCells = sortedDates.map(d =>
            `<td class="p-2 border border-slate-300 text-right font-black text-indigo-700 whitespace-nowrap" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">${formatMoney(dateTotals[d])}</td>`
        ).join('');

        const summaryHtml = `
            <div class="overflow-x-auto">
            <table class="border-collapse border border-slate-300 text-xs shadow-sm" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                <thead>
                    <tr class="bg-indigo-600 text-white font-bold" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                        <th class="p-2 border border-indigo-500 text-left whitespace-nowrap">ลูกหนี้</th>
                        ${dateThs}
                        <th class="p-2 border border-indigo-500 text-center whitespace-nowrap">รวม</th>
                    </tr>
                </thead>
                <tbody>${debtorRows}</tbody>
                <tfoot>
                    <tr class="bg-indigo-50 font-black" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                        <td class="p-2 border border-slate-300 text-indigo-700 uppercase tracking-wider whitespace-nowrap">รวมทั้งสิ้น</td>
                        ${footerCells}
                        <td class="p-2 border border-slate-300 text-right text-indigo-700 whitespace-nowrap">${formatMoney(grandTotal)}</td>
                    </tr>
                </tfoot>
            </table>
            </div>
        `;
        summaryContainer.innerHTML = summaryHtml;
    }
}

function exportToPDF() {
    // เปลี่ยนมาใช้ระบบ Print ของเบราว์เซอร์แทน เพื่อการจัดเรียงภาษาไทยที่สมบูรณ์ 100%
    // และแก้ปัญหาตัวหนังสือซ้อนทับกันในตาราง
    setTimeout(() => {
        window.print();
    }, 300);
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
    // ผูก event listener สำหรับตัวกรองหมายเหตุแบบกำหนดเอง (Dropdown Toggle และปิดเมื่อคลิกภายนอก)
    const noteBtn = document.getElementById('note-filter-btn');
    const noteDropdown = document.getElementById('note-filter-dropdown');
    const noteArrow = document.getElementById('note-filter-arrow');
    
    if (noteBtn && noteDropdown) {
        noteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = noteDropdown.classList.contains('hidden');
            if (isHidden) {
                noteDropdown.classList.remove('hidden');
                // เอฟเฟกต์ Fade-in & Scale-up (Micro-animation)
                setTimeout(() => {
                    noteDropdown.classList.remove('scale-95', 'opacity-0');
                    noteDropdown.classList.add('scale-100', 'opacity-100');
                }, 10);
                if (noteArrow) noteArrow.classList.add('rotate-180');
            } else {
                noteDropdown.classList.remove('scale-100', 'opacity-100');
                noteDropdown.classList.add('scale-95', 'opacity-0');
                if (noteArrow) noteArrow.classList.remove('rotate-180');
                setTimeout(() => {
                    noteDropdown.classList.add('hidden');
                }, 150);
            }
        });
        
        noteDropdown.addEventListener('click', (e) => {
            e.stopPropagation(); // กันการปิดตัวกรองเมื่อกดติ๊กใน dropdown
        });
        
        document.addEventListener('click', () => {
            if (!noteDropdown.classList.contains('hidden')) {
                noteDropdown.classList.remove('scale-100', 'opacity-100');
                noteDropdown.classList.add('scale-95', 'opacity-0');
                if (noteArrow) noteArrow.classList.remove('rotate-180');
                setTimeout(() => {
                    noteDropdown.classList.add('hidden');
                }, 150);
            }
        });
    }

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
