# GenAlpaca System Architecture

Comprehensive documentation for the GenAlpaca property management system.

## Overview

GenAlpaca manages rental spaces at GenAlpaca Residency (160 Still Forest Drive, Cedar Creek, TX). The system tracks spaces, tenants, bookings, payments, and photos.

## Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                   │
│                           │                                     │
│              ┌────────────┼────────────┐                        │
│              ▼            ▼            ▼                        │
│         Browser       Discord      Mobile                       │
│              │            │            │                        │
└──────────────┼────────────┼────────────┼────────────────────────┘
               │            │            │
               ▼            ▼            │
┌──────────────────┐  ┌──────────────┐   │
│  GitHub Pages    │  │  OpenClaw    │   │
│  (Admin UI)      │  │  (Discord)   │   │
│                  │  │              │   │
│  HTML/CSS/JS     │  │  DO Droplet  │   │
│  No backend      │  │              │   │
└────────┬─────────┘  └──────┬───────┘   │
         │                   │           │
         └─────────┬─────────┘           │
                   ▼                     ▼
         ┌─────────────────────────────────┐
         │           SUPABASE              │
         │                                 │
         │  ┌───────────┐ ┌─────────────┐  │
         │  │ PostgreSQL│ │   Storage   │  │
         │  │ Database  │ │ (housephotos)│  │
         │  └───────────┘ └─────────────┘  │
         │                                 │
         │  Project: aphrrfprbixmhissnjfn  │
         └─────────────────────────────────┘
```

## Hosting Locations

| Component | Host | URL/Location |
|-----------|------|--------------|
| Admin UI | GitHub Pages | https://rsonnad.github.io/GenAlpacaOps/ |
| Source Code | GitHub | https://github.com/rsonnad/GenAlpacaOps |
| Database | Supabase | https://aphrrfprbixmhissnjfn.supabase.co |
| Photo Storage | Supabase Storage | bucket: `housephotos` |
| OpenClaw Bot | DigitalOcean | Droplet (separate system) |
| Rental Agreements | Google Drive | Folder ID: 1IdMGhprT0LskK7g6zN9xw1O8ECtrS0eQ |

## Repository Structure

```
GenAlpacaOps/
├── index.html              # Landing page (redirects to spaces)
├── styles.css              # Global styling
├── app.js                  # Legacy (redirects)
├── 404.html                # GitHub Pages 404 handler
│
├── shared/                 # Shared modules
│   ├── supabase.js         # Supabase client singleton
│   ├── auth.js             # Authentication module
│   └── media-service.js    # Media upload/management service
│
├── login/                  # Login page
│   ├── index.html
│   └── app.js
│
├── spaces/                 # Consumer-facing spaces view
│   ├── index.html
│   └── app.js              # Public space listing (filtered)
│
└── spaces/admin/           # Admin dashboard
    ├── index.html          # Admin spaces view
    ├── app.js              # Admin spaces logic
    ├── manage.html         # Management dashboard (tabs)
    ├── media.html          # Media library page
    ├── media.js            # Media library logic
    ├── users.html          # User management
    └── users.js            # User management logic
```

## Database Schema

### Core Tables

**spaces** - Rental units and event spaces
- `id` (uuid, PK)
- `name`, `description`, `location`
- `type` (free-form text: "Dwelling", "Amenity", "Event", etc.)
- `monthly_rate`, `weekly_rate`, `nightly_rate`
- `sq_footage`, `bath_privacy` (private/shared), `bath_fixture`
- `beds_king`, `beds_queen`, `beds_double`, `beds_twin`, `beds_folding`, `beds_trifold`
- `min_residents`, `max_residents`, `gender_restriction`
- `is_listed`, `is_secret`, `can_be_dwelling`, `can_be_event`, `is_archived`
- `parent_id` (self-reference for nested spaces)

**people** - Tenants, staff, guests
- `id` (uuid, PK)
- `first_name`, `last_name` (nullable)
- `type` (tenant, staff, airbnb_guest, house_guest)
- `email`, `phone`, `forwarding_address`

**assignments** - Bookings and leases
- `id` (uuid, PK)
- `person_id` (FK → people)
- `type` (dwelling, event)
- `status` (active, completed, cancelled, pending_contract, contract_sent)
- `start_date`, `end_date`
- `desired_departure_date` (early exit: when tenant wants to leave)
- `desired_departure_listed` (boolean: when true, early exit date affects consumer availability)
- `rate_amount`, `rate_term` (monthly, weekly, nightly, flat)
- `deposit_amount`, `is_free`

**assignment_spaces** - Junction: assignments ↔ spaces
- `assignment_id` (FK), `space_id` (FK)

### Media System (New)

The system has migrated from the legacy `photos` table to a unified `media` system with tagging support.

**media** - All media assets (images, videos, documents)
- `id` (uuid, PK)
- `url` (Supabase storage URL)
- `storage_path` (path in storage bucket)
- `mime_type`, `file_size`
- `width`, `height` (for images)
- `title`, `caption`
- `category` (mktg, projects, archive)
- `uploaded_by`, `created_at`, `updated_at`

**media_spaces** - Junction: media ↔ spaces
- `media_id` (FK), `space_id` (FK)
- `display_order` (integer for ordering)
- `is_primary` (boolean, primary image for space)

**media_tags** - Tag definitions
- `id` (uuid, PK)
- `name` (unique tag name)
- `color` (hex color for display)

**media_tag_assignments** - Junction: media ↔ tags
- `media_id` (FK), `tag_id` (FK)

### Legacy Photo System (Deprecated)

**photos** - Photo metadata (legacy, still used by consumer view)
- `id` (uuid, PK)
- `url` (Supabase storage URL)
- `caption`, `uploaded_by`

**photo_spaces** - Junction: photos ↔ spaces (legacy)
- `photo_id` (FK), `space_id` (FK)

**photo_requests** - Pending photo requests
- `id` (uuid, PK)
- `space_id` (FK)
- `description`, `status` (pending, submitted, approved, rejected)
- `requested_by`, `requested_at`
- `submitted_photo_url`, `submitted_by`, `submitted_at`
- `reviewed_at`, `rejection_reason`
- `fulfilled_by_photo_id` (FK → photos)

### Supporting Tables

**amenities** - Available amenities (A/C, HiFi Sound, etc.)
- `id` (uuid, PK), `name`, `description`

**space_amenities** - Junction: spaces ↔ amenities
- `space_id` (FK), `amenity_id` (FK)

**payments** - Rent payments
- `id` (uuid, PK)
- `assignment_id` (FK)
- `amount`, `payment_date`, `payment_method`
- `period_start`, `period_end`, `notes`

## Authentication & Security

### API Keys

**Supabase Anon Key** (safe to expose in frontend):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwaHJyZnByYml4bWhpc3NuamZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MzA0MjUsImV4cCI6MjA4NTUwNjQyNX0.yYkdQIq97GQgxK7yT2OQEPi5Tt-a7gM45aF8xjSD6wk
```

This key is embedded in `app.js` and `SKILL.md`. It's protected by Row Level Security (RLS).

### Row Level Security Policies

All tables have RLS enabled with public read access:
```sql
create policy "Public read access" on {table} for select using (true);
```

Storage bucket `housephotos` has public read/write:
```sql
create policy "Allow public uploads" on storage.objects for insert with check (bucket_id = 'housephotos');
create policy "Allow public reads" on storage.objects for select using (bucket_id = 'housephotos');
create policy "Allow public deletes" on storage.objects for delete using (bucket_id = 'housephotos');
```

### Media Upload Pipeline

Images are processed client-side before upload via `shared/media-service.js`:
1. **Validation**: Check file type and size limits
2. **Compression**: Images > 500KB are compressed (max 1920x1920, 85% quality)
3. **Upload**: Stored in Supabase Storage with path `{category}/{timestamp}-{randomId}.{ext}`
4. **Metadata**: Dimensions extracted and stored in `media` table
5. **Linking**: Associated with spaces via `media_spaces` junction table

### Access Control (Application Level)

The UI has two modes controlled by JavaScript:
- **Consumer mode**: Shows only `is_listed = true AND is_secret = false` spaces
- **Admin mode**: Shows all spaces, occupancy details, upload features

This is UI-level only, not enforced at database level. For true security, implement Supabase Auth.

## Current Spaces

| Space | Location | Rate | Status |
|-------|----------|------|--------|
| Skyloft | The House | $1,600/mo | Occupied until Mar 3 |
| Master Pasture Suite | The House | $1,395/mo | Occupied |
| Pequneo Largo Suite | The House | $1,095/mo | Occupied |
| Fuego Trailer | Front Yard | $875/mo | Occupied |
| Big Room (Spartan) | Front Yard | $695/mo | Available |
| Little Room (Spartan) | Front Yard | $595/mo | Occupied |
| Magic Bus | Front Yard | $600/mo | Occupied until Mar 4 |
| Cabin East | Back Pasture | $500/mo | Available |
| Cabin West | Back Pasture | $500/mo | Available |
| Odyssey Static Van | Front Yard | $350/mo | Available |
| Skyloft Beds 1-5 | The House | $300/mo each | Part of Skyloft |

## Key Workflows

### Consumer Views Available Space
1. Browser loads GitHub Pages
2. JS fetches spaces from Supabase
3. Filters to `is_listed=true, is_secret=false`
4. Shows availability based on assignment end dates

### Admin Uploads Media
1. Navigate to admin view or Media Library
2. Click "Add images" or upload button
3. Select file(s), add caption/tags
4. Client compresses image if > 500KB
5. Uploads to Supabase Storage (`housephotos` bucket)
6. Creates record in `media` table with dimensions
7. Links to space via `media_spaces` junction
8. Supports drag-and-drop reordering of photos

### OpenClaw Answers "Who lives in Skyloft?"
1. Discord user asks question
2. OpenClaw uses SKILL.md for API reference
3. Queries: `GET /rest/v1/spaces?name=ilike.*Skyloft*`
4. Gets space_id, queries assignments
5. Returns tenant info

### New Booking Created
1. Add person to `people` table
2. Create assignment with dates, rate
3. Link via `assignment_spaces`
4. UI automatically shows updated availability

## Deployment

### Making UI Changes
```bash
cd ~/Downloads/genalpaca-admin
# edit files
git add .
git commit -m "Description"
git push
# Wait 1-2 min, hard refresh browser
```

### Database Changes
1. Go to Supabase Dashboard → SQL Editor
2. Run migrations
3. UI reflects changes immediately (no redeploy needed)

### Adding New Spaces
```sql
insert into spaces (name, monthly_rate, can_be_dwelling, is_listed, ...)
values ('New Space', 500, true, true, ...);
```

## External Integrations

### Google Drive
- Rental agreements stored in Drive
- Folder: `1IdMGhprT0LskK7g6zN9xw1O8ECtrS0eQ`
- Used for reference, not programmatic access

### OpenClaw (Discord Bot)
- Separate system on DigitalOcean
- Uses SKILL.md for API knowledge
- Can query/update Supabase directly

### Media Library
- Centralized media management at `/spaces/admin/manage.html`
- Supports tagging, filtering, and bulk operations
- Images stored in Supabase Storage with automatic compression

## Contacts & Accounts

| Service | Account |
|---------|---------|
| GitHub | rsonnad |
| Supabase | (Rahul's account) |
| DigitalOcean | (Rahul's account) |

## Recent Features

### Space Archiving
Spaces can be soft-deleted via archive/unarchive. Archived spaces have `is_archived = true` and are filtered out of all views.

### Admin UI Improvements
- **Lightbox**: Click any photo to view full-size in overlay
- **Drag-and-drop**: Reorder photos by dragging
- **Toast notifications**: Non-blocking success/error messages
- **Table view**: Alternative list view with thumbnails
- **Inline tag editing**: Add tags directly in the UI

### Management Dashboard
Located at `/spaces/admin/manage.html` with tabs for:
- **Spaces**: Space management with archive/unarchive
  - Filters: Search text, Parent Area dropdown, Dwelling/Non-dwelling checkboxes
  - Shows thumbnails, type badge, and Edit button for each space
  - Edit button links to main admin page with `?edit=<id>` to auto-open modal
- **Media**: Full media library with tagging and filtering
- **Users**: User management (future)

### Early Exit Feature
When a tenant wants to leave before their assignment ends:
1. Admin sets `desired_departure_date` in the space detail modal
2. Date is saved but NOT yet visible to consumers
3. Admin clicks "List" button to publish the early exit
4. Only when `desired_departure_listed=true` does the date affect consumer availability
5. Changing the date resets `desired_departure_listed` to false (requires re-listing)

## Related Documentation

- `README.md` - Quick setup
- `API.md` - Full REST API reference
- `SKILL.md` - OpenClaw integration
- Supabase Dashboard - https://supabase.com/dashboard/project/aphrrfprbixmhissnjfn
