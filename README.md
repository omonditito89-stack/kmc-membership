# KMC — Kenya Mennonite Church Membership Information System
### Complete Supabase-Connected Web Application

---

## 📁 File Structure

```
kmc-system/
├── index.html             ← Landing page (entry point)
├── login.html             ← Admin authentication
├── dashboard.html         ← Full admin dashboard
├── dashboard.js           ← All dashboard logic
├── kmc-config.js          ← Supabase connection + shared utilities
├── register-public.html   ← Public member self-registration
└── supabase/
    └── schema.sql         ← Full database schema (run this first)
```

---

## 🚀 Setup in 6 Steps

### Step 1 — Create a Supabase Project
1. Go to **https://supabase.com** and sign up (free)
2. Click **New Project** → choose a name (e.g. `kmc-membership`) → set a database password → click Create
3. Wait ~2 minutes for the project to spin up

### Step 2 — Run the Database Schema
1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Open `supabase/schema.sql` from this folder
4. Paste the entire contents into the SQL editor
5. Click **Run** (▶)
6. You should see "Success" — all tables, policies, and sample data are created

### Step 3 — Get Your API Keys
1. In Supabase, go to **Project Settings → API**
2. Copy your **Project URL** (looks like `https://abcdefghij.supabase.co`)
3. Copy your **anon / public** key (a long JWT string)

### Step 4 — Configure the App
Open `kmc-config.js` and replace these two lines:

```javascript
const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';
```

With your actual values:

```javascript
const SUPABASE_URL  = 'https://abcdefghij.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Step 5 — Create Your First Admin User
1. In Supabase → **Authentication → Users** → click **Invite User**
2. Enter the admin's email, click Send Invite
3. The user clicks the link in their email and sets a password
4. Copy that user's **UUID** from the Users table
5. Go to **Table Editor → admin_users** → click **Insert Row**:
   - `auth_id`: paste the UUID from step 4
   - `full_name`: e.g. "Rev. John Mwangi"
   - `email`: same email as step 2
   - `role`: `super_admin`
   - `is_active`: `true`
6. Click **Save**

### Step 6 — Deploy (Free)
**Option A — Netlify (recommended, 1 minute):**
1. Go to **https://netlify.com** → sign up free
2. Drag the entire `kmc-system/` folder onto the Netlify deploy zone
3. Your site is live at a URL like `https://kmc-membership.netlify.app`

**Option B — GitHub Pages:**
1. Create a GitHub repo, push all files to it
2. Go to repo Settings → Pages → set Source to `main` branch
3. Your site is live at `https://yourusername.github.io/kmc-system/`

---

## 👤 User Roles

| Role | Members | Churches | Dioceses | Offertory/Tithes | Payments | Users |
|------|---------|----------|----------|-----------------|----------|-------|
| Super Admin | Full | Full | Full | Full | Full | Full |
| Diocese Admin | Diocese-scoped | Diocese-scoped | View | Diocese-scoped | View | No |
| Church Admin | Church-scoped | View | No | Church-scoped | View | No |
| Finance Officer | View | No | No | Full | Full | No |
| Viewer | View | View | View | View | No | No |

---

## 📋 Features

### 👥 Member Management
- Full registration form (personal, contact, church, emergency)
- Edit members without deleting — all fields editable
- Search by name, phone, ID, church
- Filter by diocese, church, status
- View full member profile in modal
- Export all members to CSV

### 📝 Public Online Registration
- 4-step form (Personal → Contact → Church → Emergency)
- No login required — accessible to anyone with the link
- Data flows **directly** to the Supabase database
- Member gets their auto-generated ID on success
- Source tagged as `online` so admins can identify self-registrations

### 📤 Bulk CSV Upload
- Download template with correct column headers
- Upload CSV of any size
- Validates required fields (firstname, lastname, phone)
- Preview first 20 rows before uploading
- Skips invalid rows, reports errors
- All bulk records tagged as `bulk` source

### 🏛️ Diocese Management (Edit without delete)
- Add, edit, or delete dioceses
- Edit bishop name, region, phone, email, address, notes
- Edit does NOT delete — updates in place
- Shows church and member counts per diocese

### ⛪ Church Management (Edit without delete)
- Add, edit, or delete churches
- Edit pastor, county, sub-county, contact details, notes
- Edit does NOT delete — updates in place
- Links to diocese for filtering

### 🙏 Offertory Recording
- Record after every service (Sunday, Mid-Week, Special, Revival, etc.)
- Separate fields: Cash, M-Pesa, Cheque
- **Offertory total** auto-calculated
- **Tithes** recorded in same form (Tithe Cash + Tithe M-Pesa)
- **Grand Total** = Offertory + Tithes
- Filter by church, service type, month
- Edit past records without deleting

### 📿 Tithe Records
- Individual tithe entries per member or anonymous
- Link to member (optional) or mark anonymous
- Method: Cash, M-Pesa, Bank Transfer, Cheque
- M-Pesa code / reference field
- Month/Year tagging for reporting
- Filter by church and month

### 💰 Subscription Management
- KES 600 annual subscription per baptized member
- Visual status: Paid / Partial / Unpaid
- Quick-pay button links directly to payment form
- Receipt generated on every payment
- Export payment history

### 📊 Reports
- **Membership**: gender distribution, ministry breakdown, totals
- **Financial**: expected vs collected, payment history
- **By Church**: members, baptized, paid, offertory, tithes
- **By Diocese**: churches, members, baptized, paid, subscription revenue
- **Offertory Summary**: totals per church with CSV export

### 🔐 Multi-Diocesan Admin Sync
- Each admin user scoped to national / diocese / church level
- Supabase Row Level Security enforces data isolation
- Role-based UI: menus and data filtered by user's scope
- Session stored securely — redirect to login if unauthenticated

---

## 🛠️ Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework) |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (email/password) |
| Hosting | Netlify / GitHub Pages / any static host |
| Fonts | Google Fonts (Playfair Display + DM Sans) |
| Supabase SDK | `@supabase/supabase-js` v2 via CDN |

---

## 🔒 Security Notes

- **Row Level Security (RLS)** is enabled on all tables
- Anonymous users can only INSERT members with `registration_source = 'online'`
- Anonymous users can only READ dioceses and churches (for the public registration form)
- All admin operations require a valid Supabase session
- Admin profiles are verified against the `admin_users` table on every login
- Inactive admin accounts are blocked at login

---

## 📱 CSV Bulk Upload Format

Column order (headers required in row 1):

```
firstname, middlename, lastname, gender, dob, phone, email, county, 
diocese, church, ministry, joined, baptized, leadership, status, occupation, marital
```

- `gender`: `Male` or `Female`
- `dob`, `joined`: `YYYY-MM-DD` format
- `baptized`: `Yes` or `No`
- `status`: `Active`, `Inactive`, `Transferred`, or `Deceased`
- `diocese` and `church` must match existing records exactly

---

## 🆘 Troubleshooting

**"Could not load dioceses" on public registration form**
→ Check your Supabase URL and anon key in `kmc-config.js`
→ Ensure the `schema.sql` was run successfully

**Login says "Your account is not configured as an admin"**
→ You must add a row in the `admin_users` table in Supabase with the user's `auth_id`

**Members not showing after bulk upload**
→ Check the browser console for errors
→ Ensure diocese and church names in your CSV match exactly what's in the database

**RLS policy errors**
→ Re-run the schema.sql (it uses `if not exists` so it's safe to re-run)
→ Check Supabase → Table Editor → each table has RLS enabled

---

## 📞 Support

System designed for Kenya Mennonite Church (KMC) national office.
For technical issues, refer to Supabase documentation at **https://supabase.com/docs**
