# CLAUDE.md - GenAlpaca Project Context

This file provides context for Claude (AI assistant) when working on this codebase.

## Project Overview

GenAlpaca is a property management system for GenAlpaca Residency (160 Still Forest Drive, Cedar Creek, TX). It manages rental spaces, tenants, bookings, payments, and photos.

**Tech Stack:**
- Frontend: Vanilla HTML/CSS/JavaScript (no framework)
- Backend: Supabase (PostgreSQL + Storage + Auth)
- Hosting: GitHub Pages (static site)
- Bot: OpenClaw Discord bot (separate DigitalOcean droplet)

**Live URLs:**
- Consumer view: https://rsonnad.github.io/GenAlpacaOps/spaces/
- Admin view: https://rsonnad.github.io/GenAlpacaOps/spaces/admin/
- Repository: https://github.com/rsonnad/GenAlpacaOps

## Architecture

```
Browser → GitHub Pages (static HTML/JS) → Supabase (database + storage)
                                       ↗
Discord → OpenClaw Bot (DO Droplet) ──┘
```

No server-side code - all logic runs client-side. Supabase handles data persistence.

## Key Files

### Shared Modules (`/shared/`)
- `supabase.js` - Supabase client singleton (anon key embedded)
- `auth.js` - Authentication module for admin access
- `media-service.js` - Media upload, compression, tagging service

### Consumer View (`/spaces/`)
- `app.js` - Public listing with real availability from assignments
- Shows only `is_listed=true AND is_secret=false` spaces
- Sorts: available first → highest price → name
- Loads assignment dates (no personal info) for availability display

### Admin View (`/spaces/admin/`)
- `app.js` - Full admin dashboard with all spaces
- `manage.html` - Management tabs (Spaces, Media, Users)
- `media.js` - Media library with tagging and filtering
- Shows occupant info, visibility controls, edit capabilities

## Database Schema (Supabase)

### Core Tables
```
spaces          - Rental units (name, rates, beds, baths, visibility flags)
people          - Tenants/guests (name, contact, type)
assignments     - Bookings (person_id, dates, rate, status)
assignment_spaces - Junction: which spaces are in which assignments
```

### Media System (New - use this, not legacy photos)
```
media           - All media files (url, dimensions, caption, category)
media_spaces    - Junction: media ↔ spaces (with display_order, is_primary)
media_tags      - Tag definitions (name, color)
media_tag_assignments - Junction: media ↔ tags
```

### Legacy (Deprecated - don't use for new features)
```
photos          - Old photo storage
photo_spaces    - Old photo-space links
```

### Key Columns on `spaces`
- `is_listed` - Show in consumer view
- `is_secret` - Only accessible via direct URL with ?id=
- `can_be_dwelling` - Filter for rental listings
- `is_archived` - Soft delete (filtered out everywhere)

## Common Patterns

### Fetching Spaces with Media
```javascript
const { data } = await supabase
  .from('spaces')
  .select(`
    *,
    media_spaces(display_order, is_primary, media:media_id(id, url, caption))
  `)
  .eq('can_be_dwelling', true)
  .order('monthly_rate', { ascending: false, nullsFirst: false });
```

### Computing Availability
```javascript
// Load active assignments
const { data: assignments } = await supabase
  .from('assignments')
  .select('id, start_date, end_date, status, assignment_spaces(space_id)')
  .in('status', ['active', 'pending_contract', 'contract_sent']);

// For each space, find current assignment
const currentAssignment = spaceAssignments.find(a => {
  if (a.status !== 'active') return false;
  if (!a.end_date) return true;
  return new Date(a.end_date) >= today;
});
space.isAvailable = !currentAssignment;
```

### Uploading Media
```javascript
import { mediaService } from '../shared/media-service.js';

// Upload with automatic compression
const media = await mediaService.uploadMedia(file, {
  category: 'mktg',
  caption: 'Room photo'
});

// Link to space
await mediaService.linkMediaToSpace(media.id, spaceId, displayOrder);
```

## Sorting & Display Rules

### Consumer View
1. Available spaces first (isAvailable = true)
2. Then by monthly_rate descending (highest price first)
3. Then by name alphabetically

### Admin View
1. By monthly_rate descending
2. Then by name

### Availability Display
- Available now: "Available: NOW"
- Occupied with end date: "Available: Mar 15" (when it becomes available)
- Occupied indefinitely: "Available: TBD"

## Deployment

```bash
# Make changes locally
git add .
git commit -m "Description"
git push
# Wait 1-2 min for GitHub Pages deployment
# Hard refresh browser (Cmd+Shift+R)
```

## Important Conventions

1. **Use `media_spaces` not `photo_spaces`** - The old photo system is deprecated
2. **Filter archived spaces** - Always add `.filter(s => !s.is_archived)` client-side
3. **Don't expose personal info in consumer view** - Load assignment dates only, not person details
4. **Toast notifications in admin** - Use `showToast(message, type)` not `alert()`
5. **Lightbox for images** - Use `openLightbox(url)` for full-size image viewing

## Supabase Details

- Project ID: `aphrrfprbixmhissnjfn`
- URL: `https://aphrrfprbixmhissnjfn.supabase.co`
- Storage bucket: `housephotos`
- Anon key is in `shared/supabase.js` (safe to expose, RLS protects data)

## External Systems

### OpenClaw (Discord Bot)
- Separate codebase on DigitalOcean
- Uses `SKILL.md` for API knowledge
- Queries Supabase directly for tenant/space info

### Google Drive
- Rental agreements stored in folder `1IdMGhprT0LskK7g6zN9xw1O8ECtrS0eQ`
- Not programmatically accessed

## Recent Changes to Be Aware Of

1. **Consumer view now loads real availability** - Fetches assignments to show actual dates
2. **Media system migration** - Using `media`/`media_spaces` tables instead of `photos`/`photo_spaces`
3. **Space archiving** - `is_archived` flag for soft deletes
4. **Image compression** - Client-side compression for images > 500KB

## Testing Changes

1. Consumer view: https://rsonnad.github.io/GenAlpacaOps/spaces/
2. Admin view: https://rsonnad.github.io/GenAlpacaOps/spaces/admin/
3. Check both card view and table view
4. Test on mobile (responsive breakpoint at 768px)
5. Verify availability badges show correct dates

## Helpful Documentation

- `architecture.md` - Full system documentation
- `API.md` - REST API reference for Supabase
- `SKILL.md` - OpenClaw bot integration guide
