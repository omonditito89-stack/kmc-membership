// ============================================================
// dashboard.js  —  KMC Admin Dashboard Logic
// ============================================================

// ── STATE ─────────────────────────────────────────────────────
let profile = null;
let allMembers = [], allDioceses = [], allChurches = [];
let allPayments = [], allOffertory = [], allTithes = [];
let editingMemberId = null;
let payingMemberId = null;
let bulkRows = [];
let selectedTitheMemberId = null;

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  // Check auth session
  const session = await Auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const user = session.user;

  // Try to load admin profile — don't block if it fails
  try {
    profile = await Auth.getAdminProfile(user.id);
  } catch(e) {
    console.warn('Profile load failed, using fallback:', e);
  }

  // Fallback profile if DB lookup fails
  if (!profile) {
    profile = {
      full_name: user.email.split('@')[0],
      email: user.email,
      role: 'super_admin',
      is_active: true
    };
  }

  sessionStorage.setItem('kmc_profile', JSON.stringify(profile));

  // Set header
  document.getElementById('hdr-name').textContent = profile.full_name;
  document.getElementById('hdr-role').textContent = formatRole(profile.role);
  document.getElementById('hdr-avatar').textContent = profile.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  // Load all data
  await Promise.all([loadDioceses(), loadChurches()]);
  await Promise.all([loadMembers(), loadPayments(), loadOffertory(), loadTithes()]);

  renderDashboard();
  document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
}

function formatRole(r) {
  const map = { super_admin:'Super Admin', diocese_admin:'Diocese Admin', church_admin:'Church Admin', finance_officer:'Finance Officer', viewer:'Viewer' };
  return map[r] || r;
}

async function logout() {
  await Auth.signOut();
  sessionStorage.clear();
  window.location.href = 'login.html';
}

// ── LOAD DATA ─────────────────────────────────────────────────
async function loadDioceses() {
  try { allDioceses = await DB.getDioceses(); } catch(e) { console.error(e); }
  populateDioceseSelects();
}
async function loadChurches() {
  try { allChurches = await DB.getChurches(); } catch(e) { console.error(e); }
  populateChurchSelects();
}
async function loadMembers() {
  try {
    const filters = {};
    if (profile.role === 'diocese_admin' && profile.diocese) filters.diocese = profile.diocese;
    if (profile.role === 'church_admin' && profile.church) filters.church = profile.church;
    allMembers = await DB.getMembers(filters);
  } catch(e) { console.error(e); }
}
async function loadPayments() {
  try { allPayments = await DB.getPayments(); } catch(e) { console.error(e); }
}
async function loadOffertory() {
  try { allOffertory = await DB.getOffertory(); } catch(e) { console.error(e); }
}
async function loadTithes() {
  try { allTithes = await DB.getTithes(); } catch(e) { console.error(e); }
}

// ── NAVIGATION ────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + id + "'")) n.classList.add('active');
  });

  // Lazy render
  const renders = {
    members: renderMembers, dioceses: renderDioceses, churches: renderChurches,
    leadership: renderLeadership, subscriptions: renderSubscriptions,
    offertory: renderOffertory, tithes: renderTithes, reports: () => reportTab('membership', document.querySelector('.tab')),
    users: renderUsers
  };
  if (renders[id]) renders[id]();
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard() {
  const baptized = allMembers.filter(m => m.baptized === 'Yes');
  const leaders = allMembers.filter(m => m.leadership && m.leadership !== '');
  const offTotal = allOffertory.reduce((s,o) => s + (o.total_amount||0), 0);
  const titheTotal = allTithes.reduce((s,t) => s + (t.amount||0), 0);
  const online = allMembers.filter(m => m.registration_source === 'online');

  setEl('d-total', allMembers.length);
  setEl('d-baptized', baptized.length);
  setEl('d-churches', allChurches.length);
  setEl('d-dioceses', allDioceses.length);
  setEl('d-leaders', leaders.length);
  setEl('d-offertory', 'KES ' + fmt(offTotal));
  setEl('d-tithes', 'KES ' + fmt(titheTotal));
  setEl('d-online', online.length);

  // Gender chart
  const male = allMembers.filter(m => m.gender === 'Male').length;
  const female = allMembers.filter(m => m.gender === 'Female').length;
  const total = allMembers.length || 1;
  const malePct = Math.round(male/total*100);
  document.getElementById('dash-gender-chart').innerHTML = `
    <div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(var(--blue) 0% ${malePct}%,#8e44ad ${malePct}% 100%)"></div>
      <div class="donut-legend">
        <div class="legend-item"><div class="legend-dot" style="background:var(--blue)"></div>Male: ${male}</div>
        <div class="legend-item"><div class="legend-dot" style="background:#8e44ad"></div>Female: ${female}</div>
      </div>
    </div>`;

  // Diocese chart
  const dNames = allDioceses.map(d=>d.name);
  const maxD = Math.max(...dNames.map(d => allMembers.filter(m=>m.diocese===d).length), 1);
  document.getElementById('dash-diocese-chart').innerHTML = dNames.map((d,i) => {
    const cnt = allMembers.filter(m => m.diocese === d).length;
    const colors = ['green','blue','gold','orange','red'];
    return `<div class="bar-row"><div class="bar-label">${d.replace(' Diocese','')}</div><div class="bar-wrap"><div class="bar-fill ${colors[i%5]}" style="width:${Math.round(cnt/maxD*100)}%">${cnt}</div></div></div>`;
  }).join('');

  // Recent registrations
  const recent = [...allMembers].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,10);
  document.getElementById('dash-recent-tbody').innerHTML = recent.length ? recent.map(m => `
    <tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${m.id}</span></td>
      <td><strong>${m.firstname} ${m.lastname}</strong></td>
      <td>${m.church||'—'}</td>
      <td>${m.diocese||'—'}</td>
      <td><span class="badge ${m.registration_source==='online'?'badge-online':'badge-active'}">${m.registration_source||'admin'}</span></td>
      <td>${m.created_at?m.created_at.split('T')[0]:'—'}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--slate-light)">No members yet</td></tr>';
}

// ── MEMBERS ───────────────────────────────────────────────────
function renderMembers() {
  filterMembers();
  // Populate filter selects
  const dSel = document.getElementById('members-filter-diocese');
  dSel.innerHTML = '<option value="">All Dioceses</option>' + allDioceses.map(d=>`<option>${d.name}</option>`).join('');
  const cSel = document.getElementById('members-filter-church');
  cSel.innerHTML = '<option value="">All Churches</option>' + allChurches.map(c=>`<option>${c.name}</option>`).join('');
}

function filterMembers() {
  const q = (document.getElementById('members-search').value||'').toLowerCase();
  const diocese = document.getElementById('members-filter-diocese').value;
  const church = document.getElementById('members-filter-church').value;
  const status = document.getElementById('members-filter-status').value;

  let filtered = allMembers.filter(m => {
    if (diocese && m.diocese !== diocese) return false;
    if (church && m.church !== church) return false;
    if (status && m.status !== status) return false;
    if (q) {
      const name = `${m.firstname} ${m.middlename||''} ${m.lastname}`.toLowerCase();
      return name.includes(q) || (m.phone||'').includes(q) || (m.id||'').toLowerCase().includes(q) || (m.church||'').toLowerCase().includes(q);
    }
    return true;
  });

  setEl('members-count-label', `Members (${filtered.length})`);
  document.getElementById('members-tbody').innerHTML = filtered.length ? filtered.map(m => {
    const sub = getSubStatus(m);
    return `<tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${m.id}</span></td>
      <td><strong>${m.firstname} ${m.lastname}</strong>${m.middlename?`<br><span style="font-size:12px;color:var(--slate-light)">${m.middlename}</span>`:''}</td>
      <td><span class="badge badge-${m.gender==='Male'?'male':'female'}">${m.gender||'—'}</span></td>
      <td>${m.phone||'—'}</td>
      <td>${m.church||'—'}</td>
      <td>${m.diocese||'—'}</td>
      <td><span class="badge ${m.status==='Active'?'badge-active':'badge-inactive'}">${m.status||'—'}</span></td>
      <td><span class="badge ${sub.class}">${sub.label}</span></td>
      <td><span class="badge ${m.registration_source==='online'?'badge-online':'badge-active'}" style="font-size:10px">${m.registration_source||'admin'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="viewMember('${m.id}')">👁</button>
        <button class="btn btn-outline btn-sm" onclick="editMember('${m.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--slate-light)">No members found</td></tr>';
}

function viewMember(id) {
  const m = allMembers.find(x => x.id === id);
  if (!m) return;
  document.getElementById('mv-title').textContent = `${m.firstname} ${m.lastname} — ${m.id}`;
  const sub = getSubStatus(m);
  document.getElementById('mv-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--slate-light);letter-spacing:0.5px;margin-bottom:12px">Personal</div>
        ${mvRow('Gender', m.gender)} ${mvRow('DOB', m.dob)} ${mvRow('ID No', m.id_number)}
        ${mvRow('Marital', m.marital)} ${mvRow('Occupation', m.occupation)}
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--slate-light);letter-spacing:0.5px;margin:16px 0 12px">Contact</div>
        ${mvRow('Phone', m.phone)} ${mvRow('Alt Phone', m.phone2)} ${mvRow('Email', m.email)}
        ${mvRow('County', m.county)} ${mvRow('Address', m.address)}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--slate-light);letter-spacing:0.5px;margin-bottom:12px">Church</div>
        ${mvRow('Diocese', m.diocese)} ${mvRow('Church', m.church)}
        ${mvRow('Ministry', m.ministry)} ${mvRow('Joined', m.joined)}
        ${mvRow('Baptized', m.baptized)} ${mvRow('Date Baptized', m.baptized_date)}
        ${mvRow('Leadership', m.leadership||'None')}
        ${mvRow('Status', `<span class="badge ${m.status==='Active'?'badge-active':'badge-inactive'}">${m.status}</span>`)}
        ${mvRow('Subscription', `<span class="badge ${sub.class}">${sub.label} (KES ${fmt(m.paid_amount)})</span>`)}
        ${mvRow('Source', m.registration_source||'admin')}
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--slate-light);letter-spacing:0.5px;margin:16px 0 12px">Emergency</div>
        ${mvRow('Name', m.em_name)} ${mvRow('Relationship', m.em_relationship)} ${mvRow('Phone', m.em_phone)}
      </div>
    </div>`;
  document.getElementById('mv-edit-btn').onclick = () => { closeModal('modal-member-view'); editMember(id); };
  openModal('modal-member-view');
}

function mvRow(label, value) {
  if (!value || value === '' || value === null) return '';
  return `<div style="display:flex;gap:8px;margin-bottom:8px;font-size:13px"><span style="color:var(--slate-light);width:100px;flex-shrink:0">${label}:</span><span style="color:var(--forest);font-weight:500">${value}</span></div>`;
}

function editMember(id) {
  const m = allMembers.find(x => x.id === id);
  if (!m) return;
  editingMemberId = id;
  document.getElementById('register-page-title').textContent = 'Edit Member — ' + m.id;
  document.getElementById('save-member-btn').textContent = '💾 Update Member';

  const fields = {
    'f-firstname': m.firstname, 'f-middlename': m.middlename, 'f-lastname': m.lastname,
    'f-gender': m.gender, 'f-dob': m.dob, 'f-idno': m.id_number,
    'f-marital': m.marital, 'f-occupation': m.occupation,
    'f-phone': m.phone, 'f-phone2': m.phone2, 'f-email': m.email,
    'f-county': m.county, 'f-address': m.address,
    'f-diocese': m.diocese, 'f-ministry': m.ministry,
    'f-joined': m.joined, 'f-baptized': m.baptized, 'f-baptizeddate': m.baptized_date,
    'f-leadership': m.leadership, 'f-status': m.status,
    'f-emname': m.em_name, 'f-emrel': m.em_relationship, 'f-emphone': m.em_phone
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }
  filterChurchSelect('f-diocese', 'f-church');
  setTimeout(() => {
    const cEl = document.getElementById('f-church');
    if (cEl) cEl.value = m.church || '';
  }, 50);
  showPage('register');
  window.scrollTo({top:0,behavior:'smooth'});
}

async function saveMember() {
  const btn = document.getElementById('save-member-btn');
  const fn = document.getElementById('f-firstname').value.trim();
  const ln = document.getElementById('f-lastname').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const diocese = document.getElementById('f-diocese').value;
  const church = document.getElementById('f-church').value;
  const gender = document.getElementById('f-gender').value;

  if (!fn || !ln || !phone || !diocese || !church || !gender) {
    toast('Please fill in all required fields (First Name, Last Name, Phone, Diocese, Church, Gender).', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Saving…';

  const row = {
    firstname: fn, middlename: document.getElementById('f-middlename').value.trim(),
    lastname: ln, gender,
    dob: document.getElementById('f-dob').value || null,
    id_number: document.getElementById('f-idno').value.trim(),
    marital: document.getElementById('f-marital').value,
    occupation: document.getElementById('f-occupation').value.trim(),
    phone, phone2: document.getElementById('f-phone2').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    county: document.getElementById('f-county').value.trim(),
    address: document.getElementById('f-address').value.trim(),
    diocese, church,
    ministry: document.getElementById('f-ministry').value,
    joined: document.getElementById('f-joined').value || null,
    baptized: document.getElementById('f-baptized').value,
    baptized_date: document.getElementById('f-baptizeddate').value || null,
    leadership: document.getElementById('f-leadership').value,
    status: document.getElementById('f-status').value,
    em_name: document.getElementById('f-emname').value.trim(),
    em_relationship: document.getElementById('f-emrel').value.trim(),
    em_phone: document.getElementById('f-emphone').value.trim(),
    registration_source: editingMemberId ? undefined : 'admin'
  };
  if (editingMemberId) row.id = editingMemberId;

  try {
    await DB.saveMember(row);
    toast(editingMemberId ? 'Member updated successfully!' : 'Member registered successfully!', 'success');
    await loadMembers();
    clearMemberForm();
    showPage('members');
  } catch(e) {
    toast('Error: ' + (e.message || 'Save failed'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editingMemberId ? '💾 Update Member' : '💾 Save Member';
  }
}

function clearMemberForm() {
  editingMemberId = null;
  document.getElementById('register-page-title').textContent = 'Register New Member';
  document.getElementById('save-member-btn').textContent = '💾 Save Member';
  ['f-firstname','f-middlename','f-lastname','f-gender','f-dob','f-idno','f-marital','f-occupation',
   'f-phone','f-phone2','f-email','f-county','f-address','f-diocese','f-church','f-ministry',
   'f-joined','f-baptized','f-baptizeddate','f-leadership','f-status','f-emname','f-emrel','f-emphone']
  .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
}

async function deleteMember(id) {
  if (!confirm('Delete this member? This cannot be undone.')) return;
  try {
    await DB.deleteMember(id);
    allMembers = allMembers.filter(m => m.id !== id);
    toast('Member deleted.', 'success');
    filterMembers();
    renderDashboard();
  } catch(e) { toast('Delete failed: ' + e.message, 'error'); }
}

function exportMembersCSV() {
  const headers = ['Member No','First Name','Middle Name','Last Name','Gender','DOB','Phone','Email','Church','Diocese','Ministry','Leadership','Baptized','Status','Paid (KES)','Source'];
  const rows = allMembers.map(m => [m.id,m.firstname,m.middlename,m.lastname,m.gender,m.dob,m.phone,m.email,m.church,m.diocese,m.ministry,m.leadership,m.baptized,m.status,m.paid_amount||0,m.registration_source]);
  downloadCSV('KMC_Members.csv', headers, rows);
  toast('Members exported to CSV');
}

// ── BULK UPLOAD ───────────────────────────────────────────────
function downloadBulkTemplate() {
  const headers = ['firstname','middlename','lastname','gender','dob','phone','email','county','diocese','church','ministry','joined','baptized','leadership','status','occupation','marital'];
  const sample = ['John','Kamau','Mwangi','Male','1985-04-12','0722001001','john@gmail.com','Nairobi','Nairobi Diocese','Nairobi Central KMC','Men Fellowship','2010-01-01','Yes','Deacon','Active','Teacher','Married'];
  downloadCSV('KMC_BulkTemplate.csv', headers, [sample]);
  toast('Template downloaded');
}

function handleBulkFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    parseBulkCSV(text);
  };
  reader.readAsText(file);
}

function parseBulkCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) { toast('CSV is empty or invalid.', 'error'); return; }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());
  bulkRows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 3) continue;
    const row = {};
    headers.forEach((h,j) => row[h] = (vals[j]||'').trim());
    if (!row.firstname || !row.lastname || !row.phone) { errors.push(`Row ${i+1}: Missing firstname, lastname, or phone`); continue; }
    bulkRows.push({
      firstname: row.firstname, middlename: row.middlename||'', lastname: row.lastname,
      gender: row.gender||'', dob: row.dob||null, phone: row.phone, email: row.email||'',
      county: row.county||'', diocese: row.diocese||'', church: row.church||'',
      ministry: row.ministry||'', joined: row.joined||null,
      baptized: row.baptized||'', leadership: row.leadership||'', status: row.status||'Active',
      occupation: row.occupation||'', marital: row.marital||'',
      paid_amount: 0, registration_source: 'bulk'
    });
  }

  document.getElementById('bulk-info').style.display = 'block';
  document.getElementById('bulk-summary').textContent = `${bulkRows.length} valid rows ready for upload`;
  
  if (errors.length) {
    const errEl = document.getElementById('bulk-errors');
    errEl.style.display = 'block';
    errEl.innerHTML = '<strong>⚠️ Validation errors (these rows will be skipped):</strong><br>' + errors.join('<br>');
  }

  // Preview
  document.getElementById('bulk-preview').innerHTML = `
    <table style="font-size:12.5px">
      <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Diocese</th><th>Church</th><th>Status</th></tr></thead>
      <tbody>${bulkRows.slice(0,20).map((r,i) => `
        <tr><td>${i+1}</td><td>${r.firstname} ${r.lastname}</td><td>${r.phone}</td><td>${r.diocese||'—'}</td><td>${r.church||'—'}</td><td>${r.status}</td></tr>`).join('')}
      </tbody>
    </table>${bulkRows.length>20?`<div style="text-align:center;padding:10px;font-size:12px;color:var(--slate-light)">…and ${bulkRows.length-20} more rows</div>`:''}`;
}

function parseCSVLine(line) {
  const result = [], re = /("(?:[^"]|"")*"|[^,]*),?/g;
  let m;
  while ((m = re.exec(line)) && m[0]) {
    result.push(m[1].replace(/^"|"$/g,'').replace(/""/g,'"'));
  }
  return result;
}

async function uploadBulk() {
  if (!bulkRows.length) return;
  const btn = document.getElementById('bulk-upload-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Uploading…';
  try {
    const result = await DB.bulkInsertMembers(bulkRows);
    toast(`✅ ${result.length} members uploaded successfully!`, 'success');
    await loadMembers();
    clearBulk();
    renderDashboard();
  } catch(e) {
    toast('Upload failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Upload All';
  }
}

function clearBulk() {
  bulkRows = [];
  document.getElementById('bulk-info').style.display = 'none';
  document.getElementById('bulk-errors').style.display = 'none';
  document.getElementById('bulk-file').value = '';
}

// ── DIOCESES ──────────────────────────────────────────────────
function renderDioceses() {
  document.getElementById('dioceses-tbody').innerHTML = allDioceses.length ? allDioceses.map(d => {
    const churchCount = allChurches.filter(c => c.diocese === d.name).length;
    const memberCount = allMembers.filter(m => m.diocese === d.name).length;
    return `<tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${d.id}</span></td>
      <td><strong>${d.name}</strong></td>
      <td>${d.region||'—'}</td>
      <td>${d.bishop||'—'}</td>
      <td>${d.phone||'—'}</td>
      <td>${d.email||'—'}</td>
      <td><strong>${churchCount}</strong></td>
      <td><strong>${memberCount}</strong></td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="openDioceseModal('${d.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDiocese('${d.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--slate-light)">No dioceses yet</td></tr>';
}

function openDioceseModal(editId = null) {
  document.getElementById('d-edit-id').value = editId || '';
  document.getElementById('diocese-modal-title').textContent = editId ? 'Edit Diocese' : 'Add Diocese';
  const d = editId ? allDioceses.find(x=>x.id===editId) : null;
  ['d-name','d-region','d-bishop','d-phone','d-email','d-address','d-established','d-notes'].forEach(id => {
    const key = id.replace('d-','').replace('-','_');
    const el = document.getElementById(id);
    if(el) el.value = d ? (d[key] || d[id.replace('d-','')] || '') : '';
  });
  openModal('modal-diocese');
}

async function saveDiocese() {
  const name = document.getElementById('d-name').value.trim();
  if (!name) { toast('Diocese name is required.', 'error'); return; }
  const editId = document.getElementById('d-edit-id').value;
  const row = {
    name, region: document.getElementById('d-region').value.trim(),
    bishop: document.getElementById('d-bishop').value.trim(),
    phone: document.getElementById('d-phone').value.trim(),
    email: document.getElementById('d-email').value.trim(),
    address: document.getElementById('d-address').value.trim(),
    established: document.getElementById('d-established').value || null,
    notes: document.getElementById('d-notes').value.trim()
  };
  if (editId) row.id = editId;
  try {
    await DB.saveDiocese(row);
    toast(editId ? 'Diocese updated!' : 'Diocese added!', 'success');
    await loadDioceses();
    closeModal('modal-diocese');
    renderDioceses();
    renderDashboard();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteDiocese(id) {
  if (!confirm('Delete this diocese? Churches and members in this diocese will lose their diocese link.')) return;
  try {
    await DB.deleteDiocese(id);
    allDioceses = allDioceses.filter(d => d.id !== id);
    toast('Diocese deleted.', 'success');
    renderDioceses();
    renderDashboard();
  } catch(e) { toast('Delete failed: ' + e.message, 'error'); }
}

// ── CHURCHES ──────────────────────────────────────────────────
function renderChurches() {
  document.getElementById('churches-tbody').innerHTML = allChurches.length ? allChurches.map(c => {
    const memberCount = allMembers.filter(m => m.church === c.name).length;
    return `<tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${c.id}</span></td>
      <td><strong>${c.name}</strong></td>
      <td>${c.diocese||'—'}</td>
      <td>${c.pastor||'—'}</td>
      <td>${c.county||'—'}</td>
      <td>${c.phone||'—'}</td>
      <td><strong>${memberCount}</strong></td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="openChurchModal('${c.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteChurch('${c.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--slate-light)">No churches yet</td></tr>';
}

function openChurchModal(editId = null) {
  document.getElementById('c-edit-id').value = editId || '';
  document.getElementById('church-modal-title').textContent = editId ? 'Edit Church' : 'Add Church';
  // Populate diocese select
  document.getElementById('c-diocese').innerHTML = '<option value="">Select Diocese</option>' +
    allDioceses.map(d => `<option>${d.name}</option>`).join('');
  const c = editId ? allChurches.find(x=>x.id===editId) : null;
  if (c) {
    document.getElementById('c-name').value = c.name || '';
    document.getElementById('c-diocese').value = c.diocese || '';
    document.getElementById('c-pastor').value = c.pastor || '';
    document.getElementById('c-county').value = c.county || '';
    document.getElementById('c-subcounty').value = c.sub_county || '';
    document.getElementById('c-phone').value = c.phone || '';
    document.getElementById('c-email').value = c.email || '';
    document.getElementById('c-address').value = c.address || '';
    document.getElementById('c-established').value = c.established || '';
    document.getElementById('c-notes').value = c.notes || '';
  } else {
    ['c-name','c-pastor','c-county','c-subcounty','c-phone','c-email','c-address','c-established','c-notes'].forEach(id => { document.getElementById(id).value=''; });
    document.getElementById('c-diocese').value = '';
  }
  openModal('modal-church');
}

async function saveChurch() {
  const name = document.getElementById('c-name').value.trim();
  const diocese = document.getElementById('c-diocese').value;
  if (!name || !diocese) { toast('Church name and diocese are required.', 'error'); return; }
  const editId = document.getElementById('c-edit-id').value;
  const diocObj = allDioceses.find(d=>d.name===diocese);
  const row = {
    name, diocese, diocese_id: diocObj ? diocObj.id : null,
    pastor: document.getElementById('c-pastor').value.trim(),
    county: document.getElementById('c-county').value.trim(),
    sub_county: document.getElementById('c-subcounty').value.trim(),
    phone: document.getElementById('c-phone').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    address: document.getElementById('c-address').value.trim(),
    established: document.getElementById('c-established').value || null,
    notes: document.getElementById('c-notes').value.trim()
  };
  if (editId) row.id = editId;
  try {
    await DB.saveChurch(row);
    toast(editId ? 'Church updated!' : 'Church added!', 'success');
    await loadChurches();
    closeModal('modal-church');
    renderChurches();
    renderDashboard();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteChurch(id) {
  if (!confirm('Delete this church?')) return;
  try {
    await DB.deleteChurch(id);
    allChurches = allChurches.filter(c => c.id !== id);
    toast('Church deleted.', 'success');
    renderChurches();
  } catch(e) { toast('Delete failed: ' + e.message, 'error'); }
}

// ── LEADERSHIP ────────────────────────────────────────────────
function renderLeadership() {
  const leaders = allMembers.filter(m => m.leadership && m.leadership !== '');
  const count = r => leaders.filter(m => m.leadership === r).length;
  setEl('l-bishops', count('Bishop')); setEl('l-pastors', count('Pastor'));
  setEl('l-deacons', count('Deacon')); setEl('l-deaconesses', count('Deaconess'));
  setEl('l-elders', count('Elder'));
  document.getElementById('leadership-tbody').innerHTML = leaders.length ? leaders.map(m => `
    <tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${m.id}</span></td>
      <td><strong>${m.firstname} ${m.lastname}</strong></td>
      <td><span class="badge badge-active">${m.leadership}</span></td>
      <td>${m.church||'—'}</td>
      <td>${m.diocese||'—'}</td>
      <td>${m.phone||'—'}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--slate-light)">No leaders found</td></tr>';
}

// ── SUBSCRIPTIONS ─────────────────────────────────────────────
let subFilter = 'all';
function subTab(filter, el) {
  subFilter = filter;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderSubscriptions();
}

function renderSubscriptions() {
  const baptized = allMembers.filter(m => m.baptized === 'Yes');
  const expected = baptized.length * 600;
  const collected = baptized.reduce((s,m) => s + (m.paid_amount||0), 0);
  const paidCount = baptized.filter(m => (m.paid_amount||0) >= 600).length;
  const unpaidCount = baptized.filter(m => !(m.paid_amount||0)).length;

  setEl('sub-expected', 'KES ' + fmt(expected));
  setEl('sub-collected', 'KES ' + fmt(collected));
  setEl('sub-outstanding', 'KES ' + fmt(expected-collected));
  setEl('sub-paid-count', paidCount);
  setEl('sub-unpaid-count', unpaidCount);

  let filtered = baptized;
  if (subFilter === 'paid')    filtered = baptized.filter(m => (m.paid_amount||0)>=600);
  if (subFilter === 'partial') filtered = baptized.filter(m => (m.paid_amount||0)>0 && (m.paid_amount||0)<600);
  if (subFilter === 'unpaid')  filtered = baptized.filter(m => !(m.paid_amount||0));

  document.getElementById('subscriptions-tbody').innerHTML = filtered.length ? filtered.map(m => {
    const sub = getSubStatus(m);
    const bal = Math.max(0, 600 - (m.paid_amount||0));
    return `<tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${m.id}</span></td>
      <td><strong>${m.firstname} ${m.lastname}</strong></td>
      <td>${m.church||'—'}</td>
      <td>${m.diocese||'—'}</td>
      <td>✝️ Yes</td>
      <td><strong>KES ${fmt(m.paid_amount)}</strong></td>
      <td>${bal>0?`<span style="color:var(--red)">KES ${fmt(bal)}</span>`:'<span style="color:var(--green)">✅ Paid</span>'}</td>
      <td><span class="badge ${sub.class}">${sub.label}</span></td>
      <td><button class="btn btn-gold btn-sm" onclick="quickPay('${m.id}')">💳 Record</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--slate-light)">No records</td></tr>';
}

function quickPay(memberId) {
  showPage('payments');
  setTimeout(() => {
    const m = allMembers.find(x=>x.id===memberId);
    if(m) {
      selectPaymentMember(m);
      document.getElementById('pay-amount').value = Math.max(0, 600-(m.paid_amount||0));
    }
  }, 100);
}

// ── PAYMENTS ──────────────────────────────────────────────────
function searchPaymentMember() {
  const q = document.getElementById('pay-search').value.toLowerCase();
  const suggestions = document.getElementById('pay-suggestions');
  if (!q || q.length < 2) { suggestions.style.display = 'none'; return; }
  const matches = allMembers.filter(m => {
    const name = `${m.firstname} ${m.lastname}`.toLowerCase();
    return name.includes(q) || m.id.toLowerCase().includes(q) || (m.phone||'').includes(q);
  }).slice(0, 8);
  if (!matches.length) { suggestions.style.display = 'none'; return; }
  suggestions.style.display = 'block';
  suggestions.innerHTML = matches.map(m => `
    <div onclick="selectPaymentMember(${JSON.stringify(m).replace(/"/g,'&quot;')})" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;hover:background:var(--cream)">
      <strong>${m.firstname} ${m.lastname}</strong> <span style="color:var(--slate-light);font-size:12px">${m.id}</span><br>
      <span style="font-size:12px;color:var(--slate-light)">${m.church||'—'} · ${m.phone||''}</span>
    </div>`).join('');
}

function selectPaymentMember(m) {
  payingMemberId = m.id;
  document.getElementById('pay-search').value = `${m.firstname} ${m.lastname} (${m.id})`;
  document.getElementById('pay-suggestions').style.display = 'none';
  const sub = getSubStatus(m);
  const remaining = Math.max(0, 600 - (m.paid_amount||0));
  document.getElementById('pay-member-info').style.display = 'block';
  document.getElementById('pay-member-info').innerHTML = `
    <strong>${m.firstname} ${m.lastname}</strong> · ${m.church||'—'}<br>
    Paid: KES ${fmt(m.paid_amount)} · Balance: KES ${fmt(remaining)} · 
    <span class="badge ${sub.class}">${sub.label}</span>`;
  if (!document.getElementById('pay-amount').value) document.getElementById('pay-amount').value = remaining;
}

async function recordPayment() {
  if (!payingMemberId) { toast('Please select a member first.', 'error'); return; }
  const amount = parseFloat(document.getElementById('pay-amount').value);
  if (!amount || amount <= 0) { toast('Enter a valid amount.', 'error'); return; }
  const m = allMembers.find(x => x.id === payingMemberId);
  if (!m) return;

  try {
    const payment = await DB.savePayment({
      member_id: payingMemberId,
      member_name: `${m.firstname} ${m.lastname}`,
      amount,
      method: document.getElementById('pay-method').value,
      payment_date: document.getElementById('pay-date').value,
      financial_year: document.getElementById('pay-year').value,
      reference: document.getElementById('pay-ref').value.trim(),
      recorded_by: profile.full_name
    });

    // Update local
    const idx = allMembers.findIndex(x => x.id === payingMemberId);
    if (idx >= 0) allMembers[idx].paid_amount = (allMembers[idx].paid_amount||0) + amount;
    allPayments.unshift(payment);

    // Show receipt
    document.getElementById('receipt-area').innerHTML = `
      <div class="receipt">
        <div class="receipt-header">
          <strong style="font-family:'Playfair Display',serif;font-size:18px">KMC</strong><br>
          <span style="font-size:11px;color:var(--slate-light)">Kenya Mennonite Church</span>
          <div style="font-weight:700;font-size:14px;margin-top:8px">SUBSCRIPTION RECEIPT</div>
        </div>
        <div class="receipt-row"><span>Receipt No.</span><span style="font-family:'DM Mono',monospace">${payment.receipt_no||'—'}</span></div>
        <div class="receipt-row"><span>Date</span><span>${payment.payment_date}</span></div>
        <div class="receipt-row"><span>Member</span><span>${m.firstname} ${m.lastname}</span></div>
        <div class="receipt-row"><span>Member No.</span><span style="font-family:'DM Mono',monospace">${m.id}</span></div>
        <div class="receipt-row"><span>Church</span><span>${m.church||'—'}</span></div>
        <div class="receipt-row"><span>Method</span><span>${payment.method}</span></div>
        ${payment.reference?`<div class="receipt-row"><span>Reference</span><span style="font-family:'DM Mono',monospace">${payment.reference}</span></div>`:''}
        <div class="receipt-row"><span>Year</span><span>${payment.financial_year}</span></div>
        <div class="receipt-total"><span>AMOUNT PAID</span><span>KES ${fmt(amount)}</span></div>
        <div style="text-align:center;margin-top:12px;font-size:11px;color:var(--slate-light)">Thank you for your faithful giving</div>
      </div>`;

    toast('Payment recorded! ✅', 'success');
    payingMemberId = null;
    document.getElementById('pay-search').value = '';
    document.getElementById('pay-member-info').style.display = 'none';
    document.getElementById('pay-amount').value = '';
    document.getElementById('pay-ref').value = '';
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

// ── OFFERTORY ─────────────────────────────────────────────────
function renderOffertory() {
  const churchFilter = document.getElementById('off-filter-church').value;
  const typeFilter = document.getElementById('off-filter-type').value;
  const monthFilter = document.getElementById('off-filter-month').value;

  let data = allOffertory;
  if (churchFilter) data = data.filter(o => o.church_name === churchFilter);
  if (typeFilter)   data = data.filter(o => o.service_type === typeFilter);
  if (monthFilter)  data = data.filter(o => o.service_date && o.service_date.startsWith(monthFilter));

  const totOff = data.reduce((s,o)=>s+(o.total_amount||0),0);
  const totTithe = data.reduce((s,o)=>s+(o.tithe_total||0),0);
  const totGrand = data.reduce((s,o)=>s+(o.grand_total||0),0);
  setEl('off-total', 'KES ' + fmt(totOff));
  setEl('off-tithe', 'KES ' + fmt(totTithe));
  setEl('off-grand', 'KES ' + fmt(totGrand));
  setEl('off-services', data.length);

  document.getElementById('offertory-tbody').innerHTML = data.length ? data.map(o => `
    <tr>
      <td>${o.service_date||'—'}</td>
      <td><strong>${o.church_name}</strong></td>
      <td>${o.diocese||'—'}</td>
      <td><span class="badge badge-active" style="font-size:10px">${o.service_type}</span></td>
      <td>${o.attendance||'—'}</td>
      <td><strong>KES ${fmt(o.total_amount)}</strong></td>
      <td><strong>KES ${fmt(o.tithe_total)}</strong></td>
      <td style="font-weight:700;color:var(--forest)">KES ${fmt(o.grand_total)}</td>
      <td>${o.recorded_by||'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="openOffertoryModal('${o.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteOffertory('${o.id}')">🗑</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--slate-light)">No offertory records yet</td></tr>';
}

function openOffertoryModal(editId = null) {
  document.getElementById('off-edit-id').value = editId || '';
  document.getElementById('off-modal-title').textContent = editId ? 'Edit Offertory Record' : 'Record Offertory';
  document.getElementById('off-church').innerHTML = '<option value="">Select Church</option>' +
    allChurches.map(c=>`<option value="${c.name}" data-diocese="${c.diocese}">${c.name}</option>`).join('');
  if (editId) {
    const o = allOffertory.find(x=>x.id===editId);
    if (o) {
      document.getElementById('off-church').value = o.church_name;
      document.getElementById('off-date').value = o.service_date;
      document.getElementById('off-type').value = o.service_type;
      document.getElementById('off-desc').value = o.service_description||'';
      document.getElementById('off-attendance').value = o.attendance||'';
      document.getElementById('off-cash').value = o.cash_amount||0;
      document.getElementById('off-mpesa').value = o.mpesa_amount||0;
      document.getElementById('off-cheque').value = o.cheque_amount||0;
      document.getElementById('off-tithe-cash').value = o.tithe_cash||0;
      document.getElementById('off-tithe-mpesa').value = o.tithe_mpesa||0;
      document.getElementById('off-notes').value = o.notes||'';
      updateOffTotal();
    }
  } else {
    ['off-cash','off-mpesa','off-cheque','off-tithe-cash','off-tithe-mpesa'].forEach(id=>document.getElementById(id).value=0);
    document.getElementById('off-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('off-desc').value=''; document.getElementById('off-attendance').value=''; document.getElementById('off-notes').value='';
    updateOffTotal();
  }
  openModal('modal-offertory');
}

function updateOffTotal() {
  const cash = parseFloat(document.getElementById('off-cash').value)||0;
  const mpesa = parseFloat(document.getElementById('off-mpesa').value)||0;
  const cheque = parseFloat(document.getElementById('off-cheque').value)||0;
  const tcash = parseFloat(document.getElementById('off-tithe-cash').value)||0;
  const tmpesa = parseFloat(document.getElementById('off-tithe-mpesa').value)||0;
  const offTotal = cash+mpesa+cheque, titheTotal = tcash+tmpesa;
  document.getElementById('off-total-display').value = 'KES ' + fmt(offTotal);
  document.getElementById('off-tithe-display').value = 'KES ' + fmt(titheTotal);
  document.getElementById('off-grand-display').value = 'KES ' + fmt(offTotal+titheTotal);
}

async function saveOffertory() {
  const churchEl = document.getElementById('off-church');
  const churchName = churchEl.value;
  const serviceDate = document.getElementById('off-date').value;
  if (!churchName || !serviceDate) { toast('Church and service date are required.', 'error'); return; }
  const churchObj = allChurches.find(c=>c.name===churchName);
  const editId = document.getElementById('off-edit-id').value;

  const row = {
    church_name: churchName, diocese: churchObj?.diocese||'',
    service_date: serviceDate,
    service_type: document.getElementById('off-type').value,
    service_description: document.getElementById('off-desc').value.trim(),
    attendance: parseInt(document.getElementById('off-attendance').value)||null,
    cash_amount: parseFloat(document.getElementById('off-cash').value)||0,
    mpesa_amount: parseFloat(document.getElementById('off-mpesa').value)||0,
    cheque_amount: parseFloat(document.getElementById('off-cheque').value)||0,
    tithe_cash: parseFloat(document.getElementById('off-tithe-cash').value)||0,
    tithe_mpesa: parseFloat(document.getElementById('off-tithe-mpesa').value)||0,
    notes: document.getElementById('off-notes').value.trim(),
    recorded_by: profile.full_name
  };
  if (editId) row.id = editId;

  try {
    const saved = await DB.saveOffertory(row);
    if (editId) { allOffertory = allOffertory.map(o=>o.id===editId?saved:o); }
    else { allOffertory.unshift(saved); }
    toast('Offertory record saved!', 'success');
    closeModal('modal-offertory');
    renderOffertory();
    renderDashboard();
  } catch(e) { toast('Error: '+e.message, 'error'); }
}

async function deleteOffertory(id) {
  if (!confirm('Delete this offertory record?')) return;
  try {
    await DB.deleteOffertory(id);
    allOffertory = allOffertory.filter(o=>o.id!==id);
    toast('Record deleted.', 'success');
    renderOffertory();
    renderDashboard();
  } catch(e) { toast('Delete failed: '+e.message, 'error'); }
}

// ── TITHES ────────────────────────────────────────────────────
function renderTithes() {
  const churchFilter = document.getElementById('tithe-filter-church').value;
  const monthFilter = document.getElementById('tithe-filter-month').value;

  let data = allTithes;
  if (churchFilter) data = data.filter(t=>t.church_name===churchFilter);
  if (monthFilter)  data = data.filter(t=>t.tithe_date&&t.tithe_date.startsWith(monthFilter));

  const totCash = data.filter(t=>t.method==='Cash').reduce((s,t)=>s+(t.amount||0),0);
  const totMpesa = data.filter(t=>t.method==='M-Pesa').reduce((s,t)=>s+(t.amount||0),0);
  const totAll = data.reduce((s,t)=>s+(t.amount||0),0);
  setEl('tithe-total','KES '+fmt(totAll));
  setEl('tithe-cash','KES '+fmt(totCash));
  setEl('tithe-mpesa','KES '+fmt(totMpesa));
  setEl('tithe-count',data.length);

  document.getElementById('tithes-tbody').innerHTML = data.length ? data.map(t=>`
    <tr>
      <td>${t.tithe_date||'—'}</td>
      <td><strong>${t.church_name}</strong></td>
      <td>${t.diocese||'—'}</td>
      <td>${t.is_anonymous?'<em style="color:var(--slate-light)">Anonymous</em>':t.member_name||'—'}</td>
      <td><strong>KES ${fmt(t.amount)}</strong></td>
      <td>${t.method||'—'}</td>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${t.reference||'—'}</span></td>
      <td>${t.month_year||'—'}</td>
    </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--slate-light)">No tithe records yet</td></tr>';
}

function openTitheModal() {
  selectedTitheMemberId = null;
  document.getElementById('t-church').innerHTML = '<option value="">Select Church</option>' +
    allChurches.map(c=>`<option>${c.name}</option>`).join('');
  document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
  const now = new Date();
  document.getElementById('t-monthyear').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('t-member-search').value=''; document.getElementById('t-amount').value='';
  document.getElementById('t-ref').value=''; document.getElementById('t-notes').value='';
  document.getElementById('t-anon').checked=false;
  openModal('modal-tithe');
}

function searchTitheMember() {
  const q = document.getElementById('t-member-search').value.toLowerCase();
  const sug = document.getElementById('t-member-suggestions');
  if (!q || q.length < 2) { sug.style.display='none'; return; }
  const matches = allMembers.filter(m=>{
    const name=`${m.firstname} ${m.lastname}`.toLowerCase();
    return name.includes(q)||m.id.toLowerCase().includes(q);
  }).slice(0,6);
  if (!matches.length) { sug.style.display='none'; return; }
  sug.style.display='block';
  sug.innerHTML = matches.map(m=>`<div onclick="selectTitheMember('${m.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px">
    <strong>${m.firstname} ${m.lastname}</strong> <span style="color:var(--slate-light);font-size:12px">${m.id}</span></div>`).join('');
}

function selectTitheMember(id) {
  selectedTitheMemberId = id;
  const m = allMembers.find(x=>x.id===id);
  if(m) document.getElementById('t-member-search').value=`${m.firstname} ${m.lastname}`;
  document.getElementById('t-member-suggestions').style.display='none';
  // Auto-fill church if empty
  if(m && m.church && !document.getElementById('t-church').value) document.getElementById('t-church').value=m.church;
}

async function saveTithe() {
  const church = document.getElementById('t-church').value;
  const amount = parseFloat(document.getElementById('t-amount').value);
  const date = document.getElementById('t-date').value;
  if (!church||!amount||!date) { toast('Church, amount, and date are required.', 'error'); return; }
  const churchObj = allChurches.find(c=>c.name===church);
  const isAnon = document.getElementById('t-anon').checked;
  const mv = document.getElementById('t-monthyear').value;
  const monthYear = mv ? new Date(mv+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : '';

  const row = {
    church_name: church, diocese: churchObj?.diocese||'',
    member_id: isAnon ? null : (selectedTitheMemberId||null),
    member_name: isAnon ? null : (selectedTitheMemberId ? allMembers.find(m=>m.id===selectedTitheMemberId)?.firstname+' '+allMembers.find(m=>m.id===selectedTitheMemberId)?.lastname : document.getElementById('t-member-search').value.trim()||null),
    is_anonymous: isAnon,
    amount, method: document.getElementById('t-method').value,
    reference: document.getElementById('t-ref').value.trim(),
    tithe_date: date, month_year: monthYear,
    notes: document.getElementById('t-notes').value.trim(),
    recorded_by: profile.full_name
  };

  try {
    const saved = await DB.saveTithe(row);
    allTithes.unshift(saved);
    toast('Tithe recorded!', 'success');
    closeModal('modal-tithe');
    renderTithes();
    renderDashboard();
  } catch(e) { toast('Error: '+e.message, 'error'); }
}

// ── REPORTS ───────────────────────────────────────────────────
function reportTab(tab, el) {
  ['membership','financial','church','diocese','offertory'].forEach(t=>{
    const el=document.getElementById('rep-'+t); if(el) el.style.display='none';
  });
  document.querySelectorAll('#page-reports .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('rep-'+tab).style.display='block';

  if (tab==='membership') renderMembershipReport();
  if (tab==='financial')  renderFinancialReport();
  if (tab==='church')     renderChurchReport();
  if (tab==='diocese')    renderDioceseReport();
  if (tab==='offertory')  renderOffertoryReport();
}

function renderMembershipReport() {
  const total=allMembers.length, male=allMembers.filter(m=>m.gender==='Male').length;
  const female=allMembers.filter(m=>m.gender==='Female').length;
  setEl('rm-total',total); setEl('rm-male',male); setEl('rm-female',female);
  setEl('rm-baptized',allMembers.filter(m=>m.baptized==='Yes').length);
  setEl('rm-active',allMembers.filter(m=>m.status==='Active').length);
  const t=total||1, mPct=Math.round(male/t*100);
  document.getElementById('rep-gender-chart').innerHTML=`<div class="donut-wrap"><div class="donut" style="background:conic-gradient(var(--blue) 0% ${mPct}%,#8e44ad ${mPct}% 100%)"></div><div class="donut-legend"><div class="legend-item"><div class="legend-dot" style="background:var(--blue)"></div>Male: ${male}</div><div class="legend-item"><div class="legend-dot" style="background:#8e44ad"></div>Female: ${female}</div></div></div>`;
  const ministries=['Women Ministry','Youth Ministry','Men Fellowship','Sunday School','Teenager Ministry','Choir','Evangelism','Missions'];
  const maxM=Math.max(...ministries.map(m=>allMembers.filter(x=>x.ministry===m).length),1);
  const colors=['green','blue','gold','orange','red'];
  document.getElementById('rep-ministry-chart').innerHTML=ministries.map((m,i)=>{
    const cnt=allMembers.filter(x=>x.ministry===m).length;
    return`<div class="bar-row"><div class="bar-label" style="width:110px;font-size:11px;text-align:right">${m}</div><div class="bar-wrap"><div class="bar-fill ${colors[i%5]}" style="width:${Math.round(cnt/maxM*100)}%">${cnt}</div></div></div>`;
  }).join('');
}

function renderFinancialReport() {
  const baptized=allMembers.filter(m=>m.baptized==='Yes');
  const exp=baptized.length*600, coll=baptized.reduce((s,m)=>s+(m.paid_amount||0),0);
  setEl('rf-expected','KES '+fmt(exp));
  setEl('rf-collected','KES '+fmt(coll));
  setEl('rf-balance','KES '+fmt(exp-coll));
  setEl('rf-rate',(exp?Math.round(coll/exp*100):0)+'%');
  document.getElementById('rf-payments-tbody').innerHTML=allPayments.length?allPayments.map(p=>`
    <tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${p.receipt_no||'—'}</span></td>
      <td>${p.member_name||'—'}</td><td><strong>KES ${fmt(p.amount)}</strong></td>
      <td>${p.method||'—'}</td><td>${p.payment_date||'—'}</td><td>${p.financial_year||'—'}</td>
    </tr>`).join(''):'<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--slate-light)">No payments yet</td></tr>';
}

function renderChurchReport() {
  document.getElementById('rep-church-tbody').innerHTML = allChurches.length ? allChurches.map(c=>{
    const ms=allMembers.filter(m=>m.church===c.name);
    const offTotal=allOffertory.filter(o=>o.church_name===c.name).reduce((s,o)=>s+(o.total_amount||0),0);
    const titheTotal=allTithes.filter(t=>t.church_name===c.name).reduce((s,t)=>s+(t.amount||0),0);
    return`<tr><td><strong>${c.name}</strong></td><td>${c.diocese||'—'}</td><td>${ms.length}</td>
      <td>${ms.filter(m=>m.gender==='Male').length}</td><td>${ms.filter(m=>m.gender==='Female').length}</td>
      <td>${ms.filter(m=>m.baptized==='Yes').length}</td>
      <td>${ms.filter(m=>(m.paid_amount||0)>=600).length}</td>
      <td><strong>KES ${fmt(offTotal)}</strong></td>
      <td><strong>KES ${fmt(titheTotal)}</strong></td></tr>`;
  }).join('') : '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--slate-light)">No churches yet</td></tr>';
}

function renderDioceseReport() {
  document.getElementById('rep-diocese-tbody').innerHTML = allDioceses.length ? allDioceses.map(d=>{
    const churches=allChurches.filter(c=>c.diocese===d.name).length;
    const ms=allMembers.filter(m=>m.diocese===d.name);
    const rev=ms.reduce((s,m)=>s+(m.paid_amount||0),0);
    return`<tr><td><strong>${d.name}</strong></td><td>${d.region||'—'}</td><td>${churches}</td>
      <td>${ms.length}</td><td>${ms.filter(m=>m.baptized==='Yes').length}</td>
      <td>${ms.filter(m=>(m.paid_amount||0)>=600).length}</td>
      <td><strong>KES ${fmt(rev)}</strong></td></tr>`;
  }).join('') : '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--slate-light)">No dioceses yet</td></tr>';
}

function renderOffertoryReport() {
  document.getElementById('rep-offertory-tbody').innerHTML = allChurches.length ? allChurches.map(c=>{
    const ofs=allOffertory.filter(o=>o.church_name===c.name);
    const offTotal=ofs.reduce((s,o)=>s+(o.total_amount||0),0);
    const titheTotal=ofs.reduce((s,o)=>s+(o.tithe_total||0),0);
    const grand=offTotal+titheTotal;
    if (!ofs.length) return '';
    return`<tr><td><strong>${c.name}</strong></td><td>${c.diocese||'—'}</td><td>${ofs.length}</td>
      <td><strong>KES ${fmt(offTotal)}</strong></td><td><strong>KES ${fmt(titheTotal)}</strong></td>
      <td style="font-weight:700;color:var(--forest)">KES ${fmt(grand)}</td></tr>`;
  }).filter(Boolean).join('') || '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--slate-light)">No offertory records yet</td></tr>';
}

function exportPaymentsCSV() {
  const headers=['Receipt No','Member','Amount','Method','Date','Year'];
  const rows=allPayments.map(p=>[p.receipt_no,p.member_name,p.amount,p.method,p.payment_date,p.financial_year]);
  downloadCSV('KMC_Payments.csv',headers,rows);
}

function exportChurchReportCSV() {
  const headers=['Church','Diocese','Total','Male','Female','Baptized','Paid','Offertory (KES)','Tithes (KES)'];
  const rows=allChurches.map(c=>{
    const ms=allMembers.filter(m=>m.church===c.name);
    const off=allOffertory.filter(o=>o.church_name===c.name).reduce((s,o)=>s+(o.total_amount||0),0);
    const tit=allTithes.filter(t=>t.church_name===c.name).reduce((s,t)=>s+(t.amount||0),0);
    return[c.name,c.diocese,ms.length,ms.filter(m=>m.gender==='Male').length,ms.filter(m=>m.gender==='Female').length,ms.filter(m=>m.baptized==='Yes').length,ms.filter(m=>(m.paid_amount||0)>=600).length,off,tit];
  });
  downloadCSV('KMC_ChurchReport.csv',headers,rows);
}

function exportOffertoryCSV() {
  const headers=['Date','Church','Diocese','Service Type','Attendance','Cash','M-Pesa','Cheque','Offertory Total','Tithe Cash','Tithe MPesa','Tithe Total','Grand Total'];
  const rows=allOffertory.map(o=>[o.service_date,o.church_name,o.diocese,o.service_type,o.attendance,o.cash_amount,o.mpesa_amount,o.cheque_amount,o.total_amount,o.tithe_cash,o.tithe_mpesa,o.tithe_total,o.grand_total]);
  downloadCSV('KMC_Offertory.csv',headers,rows);
}

// ── USERS ─────────────────────────────────────────────────────
async function renderUsers() {
  const users = await DB.getAdminUsers().catch(()=>[]);
  document.getElementById('users-tbody').innerHTML = users.length ? users.map(u=>`
    <tr>
      <td><strong>${u.full_name}</strong></td>
      <td>${u.email}</td>
      <td><span class="badge badge-active">${formatRole(u.role)}</span></td>
      <td>${u.diocese||'—'}</td>
      <td>${u.church||'—'}</td>
      <td><span class="badge ${u.is_active?'badge-active':'badge-inactive'}">${u.is_active?'Active':'Inactive'}</span></td>
      <td>${u.last_login?u.last_login.split('T')[0]:'Never'}</td>
      <td><button class="btn btn-outline btn-sm" onclick="openUserModal('${u.id}')">✏️ Edit</button></td>
    </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--slate-light)">No admin users configured yet</td></tr>';
}

function openUserModal(editId = null) {
  document.getElementById('u-edit-id').value = editId||'';
  document.getElementById('user-modal-title').textContent = editId?'Edit Admin User':'Add Admin User';
  document.getElementById('u-diocese').innerHTML = '<option value="">All (national)</option>'+allDioceses.map(d=>`<option>${d.name}</option>`).join('');
  document.getElementById('u-church').innerHTML = '<option value="">All in diocese</option>'+allChurches.map(c=>`<option>${c.name}</option>`).join('');
  if (editId) {
    DB.getAdminUsers().then(users=>{
      const u=users.find(x=>x.id===editId);
      if(u){
        document.getElementById('u-name').value=u.full_name;
        document.getElementById('u-email').value=u.email;
        document.getElementById('u-role').value=u.role;
        document.getElementById('u-active').value=String(u.is_active);
        document.getElementById('u-diocese').value=u.diocese||'';
        document.getElementById('u-church').value=u.church||'';
        toggleUserScope();
      }
    });
  } else {
    document.getElementById('u-name').value=''; document.getElementById('u-email').value='';
    document.getElementById('u-role').value='viewer'; document.getElementById('u-active').value='true';
  }
  toggleUserScope();
  openModal('modal-user');
}

function toggleUserScope() {
  const role = document.getElementById('u-role').value;
  document.getElementById('u-diocese-group').style.display = ['diocese_admin','church_admin'].includes(role)?'block':'none';
  document.getElementById('u-church-group').style.display = role==='church_admin'?'block':'none';
}

async function saveUser() {
  const name=document.getElementById('u-name').value.trim();
  const email=document.getElementById('u-email').value.trim();
  if(!name||!email){toast('Name and email are required.','error');return;}
  const editId=document.getElementById('u-edit-id').value;
  const row={
    full_name:name, email,
    role:document.getElementById('u-role').value,
    is_active:document.getElementById('u-active').value==='true',
    diocese:document.getElementById('u-diocese').value||null,
    church:document.getElementById('u-church').value||null
  };
  if(editId) row.id=editId;
  try{
    await DB.saveAdminUser(row);
    toast(editId?'User updated!':'User added!','success');
    closeModal('modal-user');
    renderUsers();
  }catch(e){toast('Error: '+e.message,'error');}
}

// ── HELPERS ───────────────────────────────────────────────────
function populateDioceseSelects() {
  ['f-diocese','members-filter-diocese'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    const cur=el.value;
    const prefix=id.includes('filter')?'<option value="">All Dioceses</option>':'<option value="">Select Diocese</option>';
    el.innerHTML=prefix+allDioceses.map(d=>`<option>${d.name}</option>`).join('');
    el.value=cur;
  });
  // Offertory church filters
  ['off-filter-church','tithe-filter-church'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.innerHTML='<option value="">All Churches</option>'+allChurches.map(c=>`<option>${c.name}</option>`).join('');
  });
}

function populateChurchSelects() {
  const el=document.getElementById('members-filter-church');
  if(el) el.innerHTML='<option value="">All Churches</option>'+allChurches.map(c=>`<option>${c.name}</option>`).join('');
  ['off-filter-church','tithe-filter-church'].forEach(id=>{
    const el2=document.getElementById(id);
    if(el2) el2.innerHTML='<option value="">All Churches</option>'+allChurches.map(c=>`<option>${c.name}</option>`).join('');
  });
}

function filterChurchSelect(dioceseSelectId, churchSelectId) {
  const diocese = document.getElementById(dioceseSelectId).value;
  const cSel = document.getElementById(churchSelectId);
  const filtered = allChurches.filter(c => !diocese || c.diocese === diocese);
  cSel.innerHTML = '<option value="">Select Church</option>' + filtered.map(c=>`<option>${c.name}</option>`).join('');
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function setEl(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.classList.remove('open'); });
});

// ── START ─────────────────────────────────────────────────────
init();
