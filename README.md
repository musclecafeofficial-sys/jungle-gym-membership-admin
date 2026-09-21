# Jungle Gym Membership Admin

Admin-only membership dashboard built for Supabase and GitHub Pages.

## Included

- Secure Supabase email/password login
- Current member counts
- Active, expired, expiring-soon and missing-date views
- Membership-category tabs and counts
- Search by name, member ID, identity number or phone
- Member profile with full renewal/payment history
- CSV export of the visible list
- Responsive desktop and mobile layout

## 1. Create the Supabase database

1. Open your Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. Go to **Authentication > Users** and create the administrator user.
4. Copy that user's UUID.
5. Run this in SQL Editor after replacing the UUID:

```sql
insert into public.admin_users (user_id, display_name)
values ('YOUR-AUTH-USER-UUID', 'Jungle Gym Admin');
```

## 2. Connect the web app

1. Open Supabase **Project Settings > API**.
2. Copy the Project URL and anon/public key.
3. Enter both values in `config.js`.

The anon key is designed for browser use. Row Level Security still blocks anyone who is not listed in `admin_users`. Never put the Supabase service-role key in this project.

## 3. Test locally

Run a local web server from this folder:

```bash
python -m http.server 8080
```

Open `http://localhost:8080` and sign in.

## 4. Publish through GitHub Pages

1. Create a private GitHub repository.
2. Upload all project files.
3. In GitHub, open **Settings > Pages**.
4. Select **Deploy from a branch**, branch `main`, folder `/root`.
5. Save and open the generated Pages link.

## Existing Google Sheet migration

Import the master `Form Responses 1` data into two tables:

- `members`: one row per person
- `membership_records`: one row for every payment or renewal

Matching priority must be identity number, then phone number, then admin-reviewed name matching. Receipt numbers are payment references and must not be used as permanent member IDs.

The current Google Form can remain in use. Automatic synchronization can be added with a Google Apps Script trigger after the existing data has been imported and checked.
