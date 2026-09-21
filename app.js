const cfg = window.JUNGLE_GYM_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_PROJECT') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR_ANON');
const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const state = { rows: [], category: 'All', status: 'all', search: '' };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB') : 'Not recorded';
const money = value => value == null ? '—' : `Rs. ${Number(value).toLocaleString('en-LK')}`;

function statusOf(row) {
  if (!row.expiry_date) return 'missing';
  const today = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(`${row.expiry_date}T00:00:00`);
  const days = Math.ceil((expiry - today) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'active';
}

function displayStatus(row) {
  const s = statusOf(row);
  return {active:'Active',expired:'Expired',expiring:'Expiring soon',missing:'Missing date'}[s];
}

async function init() {
  if (!configured) {
    $('loginError').textContent = 'Setup required: add the Supabase URL and anon key to config.js.';
    return;
  }
  const { data: { session } } = await db.auth.getSession();
  if (session) showApp();
  db.auth.onAuthStateChange((_event, sessionNow) => sessionNow ? showApp() : showLogin());
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('loginError').textContent = '';
  if (!db) return init();
  const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) $('loginError').textContent = error.message;
});

$('logoutBtn').addEventListener('click', () => db.auth.signOut());
$('refreshBtn').addEventListener('click', loadData);
$('searchInput').addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); renderTable(); });
$('statusFilter').addEventListener('change', e => { state.status = e.target.value; renderTable(); });
$('exportBtn').addEventListener('click', exportCsv);
$('closeDialog').addEventListener('click', () => $('memberDialog').close());

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  button.classList.add('active'); state.status = button.dataset.filter; $('statusFilter').value = state.status;
  $('pageTitle').textContent = button.textContent === 'Dashboard' ? 'Membership Dashboard' : button.textContent;
  renderTable();
}));

function showLogin() { $('appView').classList.add('hidden'); $('loginView').classList.remove('hidden'); }
async function showApp() { $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); await loadData(); }

async function loadData() {
  const { data, error } = await db.from('current_memberships').select('*').order('full_name');
  if (error) return toast(error.message);
  state.rows = data || []; renderMetrics(); renderTabs(); renderTable();
}

function renderMetrics() {
  const counts = { total: state.rows.length, active: 0, expired: 0, expiring: 0, missing: 0 };
  state.rows.forEach(r => counts[statusOf(r)]++);
  $('metrics').innerHTML = [
    ['Total members',counts.total,''],['Active',counts.active,'active'],['Expired',counts.expired,'expired'],
    ['Expiring in 30 days',counts.expiring,'expiring'],['Missing expiry',counts.missing,'']
  ].map(([label,value,cls]) => `<article class="metric ${cls}"><span>${label}</span><strong>${value}</strong></article>`).join('');
}

function renderTabs() {
  const counts = state.rows.reduce((a,r) => { const key=r.plan_name||'Uncategorised'; a[key]=(a[key]||0)+1; return a; },{});
  const categories = [['All',state.rows.length],...Object.entries(counts).sort((a,b)=>a[0].localeCompare(b[0]))];
  $('categoryTabs').innerHTML = categories.map(([name,count]) => `<button class="tab ${state.category===name?'active':''}" data-category="${esc(name)}">${esc(name)} <span>${count}</span></button>`).join('');
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { state.category=b.dataset.category; renderTabs(); renderTable(); }));
}

function filteredRows() {
  return state.rows.filter(r => {
    const categoryOK = state.category === 'All' || (r.plan_name || 'Uncategorised') === state.category;
    const statusOK = state.status === 'all' || statusOf(r) === state.status;
    const haystack = [r.full_name,r.member_code,r.identity_number,r.phone].join(' ').toLowerCase();
    return categoryOK && statusOK && (!state.search || haystack.includes(state.search));
  });
}

function renderTable() {
  const rows = filteredRows();
  $('resultSummary').textContent = `${rows.length} member${rows.length===1?'':'s'} shown`;
  $('emptyState').classList.toggle('hidden', rows.length > 0);
  $('memberRows').innerHTML = rows.map(r => `<tr>
    <td><span class="member-name">${esc(r.full_name)}</span><span class="subtext">${esc(r.phone || 'No phone')}</span></td>
    <td>${esc(r.member_code || 'Pending')}</td><td>${esc(r.plan_name || '—')}</td><td>${dateText(r.start_date)}</td><td>${dateText(r.expiry_date)}</td>
    <td><span class="badge ${statusOf(r)}">${displayStatus(r)}</span></td><td><button class="view-btn" data-id="${r.member_id}">View</button></td></tr>`).join('');
  document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => openMember(b.dataset.id)));
}

async function openMember(memberId) {
  const member = state.rows.find(r => r.member_id === memberId); if (!member) return;
  $('dialogName').textContent = member.full_name;
  const details = [['Member ID',member.member_code||'Pending'],['NIC / Passport / DL',member.identity_number||'—'],['Phone',member.phone||'—'],['Email',member.email||'—'],['Current plan',member.plan_name||'—'],['Status',displayStatus(member)]];
  $('memberDetails').innerHTML = details.map(([k,v])=>`<div class="detail"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('');
  $('historyRows').innerHTML = '<tr><td colspan="5">Loading history…</td></tr>'; $('memberDialog').showModal();
  const { data, error } = await db.from('membership_records').select('plan_name,paid_amount,receipt_number,start_date,expiry_date').eq('member_id',memberId).order('start_date',{ascending:false});
  $('historyRows').innerHTML = error ? `<tr><td colspan="5">${esc(error.message)}</td></tr>` : (data||[]).map(x=>`<tr><td>${esc(x.plan_name)}</td><td>${money(x.paid_amount)}</td><td>${esc(x.receipt_number||'—')}</td><td>${dateText(x.start_date)}</td><td>${dateText(x.expiry_date)}</td></tr>`).join('');
}

function exportCsv() {
  const rows = filteredRows();
  const columns = [['Member Name','full_name'],['Member ID','member_code'],['Identity Number','identity_number'],['Phone','phone'],['Plan','plan_name'],['Start Date','start_date'],['Expiry Date','expiry_date']];
  const quote = v => `"${String(v??'').replaceAll('"','""')}"`;
  const csv = [columns.map(x=>quote(x[0])).join(','),...rows.map(r=>columns.map(x=>quote(r[x[1]])).join(','))].join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`jungle-gym-memberships-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

function toast(message) { $('toast').textContent=message; $('toast').classList.remove('hidden'); setTimeout(()=>$('toast').classList.add('hidden'),4000); }
init();
