// ============================================================
// kmc-config.js  —  Supabase connection + shared utilities
// Include this BEFORE any page script
// ============================================================

// ── CONFIGURE YOUR SUPABASE PROJECT HERE ──────────────────────
const SUPABASE_URL  = 'https://hgpfmdgxupdesakalfyr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhncGZtZGd4dXBkZXNha2FsZnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjcwOTMsImV4cCI6MjA5NjUwMzA5M30.kXdwfQUY8IGh9TBEhO-o8NO3-3LGLIpKSYgWy4O-Nlc';
// ──────────────────────────────────────────────────────────────

// Load Supabase JS from CDN (v2)
// Already included via <script> tag in each HTML page

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── AUTH HELPERS ──────────────────────────────────────────────
const Auth = {
  async signIn(email, password) {
    return await _sb.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    return await _sb.auth.signOut();
  },
  async getUser() {
    const { data } = await _sb.auth.getUser();
    return data?.user || null;
  },
  async getSession() {
    const { data } = await _sb.auth.getSession();
    return data?.session || null;
  },
  async getAdminProfile(userId) {
    const { data } = await _sb.from('admin_users').select('*').eq('auth_id', userId).single();
    return data;
  },
  // Guard: redirect to login if not authenticated
  async requireAuth(redirectTo = 'login.html') {
    const user = await Auth.getUser();
    if (!user) { window.location.href = redirectTo; return null; }
    const profile = await Auth.getAdminProfile(user.id);
    if (!profile || !profile.is_active) {
      await Auth.signOut();
      window.location.href = redirectTo;
      return null;
    }
    return profile;
  }
};

// ── DATABASE HELPERS ──────────────────────────────────────────
const DB = {
  // DIOCESES
  async getDioceses() {
    const { data, error } = await _sb.from('dioceses').select('*').order('name');
    if (error) throw error;
    return data || [];
  },
  async saveDiocese(row) {
    if (row.id) {
      const { id, created_at, ...rest } = row;
      const { data, error } = await _sb.from('dioceses').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await _sb.from('dioceses').insert(row).select().single();
      if (error) throw error;
      return data;
    }
  },
  async deleteDiocese(id) {
    const { error } = await _sb.from('dioceses').delete().eq('id', id);
    if (error) throw error;
  },

  // CHURCHES
  async getChurches(dioceseName = null) {
    let q = _sb.from('churches').select('*').order('name');
    if (dioceseName) q = q.eq('diocese', dioceseName);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async saveChurch(row) {
    if (row.id) {
      const { id, created_at, ...rest } = row;
      const { data, error } = await _sb.from('churches').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await _sb.from('churches').insert(row).select().single();
      if (error) throw error;
      return data;
    }
  },
  async deleteChurch(id) {
    const { error } = await _sb.from('churches').delete().eq('id', id);
    if (error) throw error;
  },

  // MEMBERS
  async getMembers(filters = {}) {
    let q = _sb.from('members').select('*').order('created_at', { ascending: false });
    if (filters.diocese) q = q.eq('diocese', filters.diocese);
    if (filters.church)  q = q.eq('church', filters.church);
    if (filters.status)  q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async getMember(id) {
    const { data, error } = await _sb.from('members').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  async saveMember(row) {
    if (row.id) {
      const { id, created_at, ...rest } = row;
      const { data, error } = await _sb.from('members').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await _sb.from('members').insert(row).select().single();
      if (error) throw error;
      return data;
    }
  },
  async deleteMember(id) {
    const { error } = await _sb.from('members').delete().eq('id', id);
    if (error) throw error;
  },
  async bulkInsertMembers(rows) {
    const { data, error } = await _sb.from('members').insert(rows).select();
    if (error) throw error;
    return data || [];
  },

  // PAYMENTS
  async getPayments(filters = {}) {
    let q = _sb.from('payments').select('*').order('created_at', { ascending: false });
    if (filters.member_id) q = q.eq('member_id', filters.member_id);
    if (filters.year)      q = q.eq('financial_year', filters.year);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async savePayment(row) {
    const { data, error } = await _sb.from('payments').insert(row).select().single();
    if (error) throw error;
    // Update member paid_amount
    const member = await DB.getMember(row.member_id);
    const newPaid = (member.paid_amount || 0) + row.amount;
    await _sb.from('members').update({ paid_amount: newPaid }).eq('id', row.member_id);
    return data;
  },

  // OFFERTORY
  async getOffertory(filters = {}) {
    let q = _sb.from('offertory').select('*').order('service_date', { ascending: false });
    if (filters.church_name) q = q.eq('church_name', filters.church_name);
    if (filters.diocese)     q = q.eq('diocese', filters.diocese);
    if (filters.from)        q = q.gte('service_date', filters.from);
    if (filters.to)          q = q.lte('service_date', filters.to);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async saveOffertory(row) {
    if (row.id) {
      const { id, created_at, total_amount, tithe_total, grand_total, ...rest } = row;
      const { data, error } = await _sb.from('offertory').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { total_amount, tithe_total, grand_total, ...rest } = row;
      const { data, error } = await _sb.from('offertory').insert(rest).select().single();
      if (error) throw error;
      return data;
    }
  },
  async deleteOffertory(id) {
    const { error } = await _sb.from('offertory').delete().eq('id', id);
    if (error) throw error;
  },

  // TITHES
  async getTithes(filters = {}) {
    let q = _sb.from('tithes').select('*').order('tithe_date', { ascending: false });
    if (filters.church_name) q = q.eq('church_name', filters.church_name);
    if (filters.diocese)     q = q.eq('diocese', filters.diocese);
    if (filters.member_id)   q = q.eq('member_id', filters.member_id);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async saveTithe(row) {
    const { data, error } = await _sb.from('tithes').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  // ADMIN USERS
  async getAdminUsers() {
    const { data, error } = await _sb.from('admin_users').select('*').order('full_name');
    if (error) throw error;
    return data || [];
  },
  async saveAdminUser(row) {
    if (row.id) {
      const { id, created_at, ...rest } = row;
      const { data, error } = await _sb.from('admin_users').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await _sb.from('admin_users').insert(row).select().single();
      if (error) throw error;
      return data;
    }
  }
};

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type = '') {
  let el = document.getElementById('_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    el.style.cssText = `position:fixed;bottom:24px;right:24px;background:#1a3a2a;color:#fff;
      padding:14px 20px;border-radius:10px;font-size:13.5px;z-index:9999;
      transform:translateY(100px);opacity:0;transition:all .3s;max-width:320px;
      box-shadow:0 8px 40px rgba(26,58,42,.15);font-family:'DM Sans',sans-serif`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === 'error' ? '#c0392b' : type === 'success' ? '#27ae60' : '#1a3a2a';
  el.style.transform = 'translateY(0)';
  el.style.opacity = '1';
  setTimeout(() => { el.style.transform = 'translateY(100px)'; el.style.opacity = '0'; }, 3500);
}

// ── SUBSCRIPTION STATUS ───────────────────────────────────────
function getSubStatus(member) {
  if (member.baptized !== 'Yes') return { label: 'N/A', class: 'badge-inactive' };
  const paid = member.paid_amount || 0;
  if (paid >= 600) return { label: 'Paid', class: 'badge-paid' };
  if (paid > 0)    return { label: 'Partial', class: 'badge-partial' };
  return { label: 'Unpaid', class: 'badge-unpaid' };
}

// ── CSV EXPORT ────────────────────────────────────────────────
function downloadCSV(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map(r => r.map(v => '"' + (v || '').toString().replace(/"/g, '""') + '"').join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

// ── NUMBER FORMATTER ──────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 });
