-- Performance Indexes Migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/aphrrfprbixmhissnjfn/sql
--
-- These indexes optimize the most common query patterns identified in the codebase review.
-- Expected improvements: 2-5x faster queries on filtered/sorted operations.

-- =============================================
-- SPACES TABLE INDEXES
-- =============================================

-- Index for consumer view filtering (is_listed, is_secret)
-- Used by: spaces/app.js, app.js when filtering visible spaces
CREATE INDEX IF NOT EXISTS idx_spaces_listed_secret
ON spaces(is_listed, is_secret);

-- Index for dwelling filter
-- Used by: filtering can_be_dwelling spaces
CREATE INDEX IF NOT EXISTS idx_spaces_dwelling_listed
ON spaces(can_be_dwelling, is_listed)
WHERE is_archived IS NOT TRUE;

-- Index for parent lookups
-- Used by: hierarchical space queries, parent area filters
CREATE INDEX IF NOT EXISTS idx_spaces_parent_id
ON spaces(parent_id)
WHERE parent_id IS NOT NULL;

-- Index for archived filter
-- Used by: excluding archived spaces in all views
CREATE INDEX IF NOT EXISTS idx_spaces_archived
ON spaces(is_archived)
WHERE is_archived = TRUE;

-- =============================================
-- ASSIGNMENTS TABLE INDEXES
-- =============================================

-- Composite index for active assignment lookups
-- Used by: availability calculation, finding current occupants
CREATE INDEX IF NOT EXISTS idx_assignments_status_dates
ON assignments(status, start_date, end_date);

-- Index for person assignments
-- Used by: finding all assignments for a person
CREATE INDEX IF NOT EXISTS idx_assignments_person_id
ON assignments(person_id);

-- Index for active assignments only (partial index)
-- Used by: most common query pattern - finding active leases
CREATE INDEX IF NOT EXISTS idx_assignments_active
ON assignments(start_date, end_date)
WHERE status = 'active';

-- =============================================
-- JUNCTION TABLE INDEXES
-- =============================================

-- Index for assignment_spaces lookups by space
-- Used by: finding all assignments for a specific space
CREATE INDEX IF NOT EXISTS idx_assignment_spaces_space_id
ON assignment_spaces(space_id);

-- Index for assignment_spaces lookups by assignment
-- Used by: finding all spaces in an assignment
CREATE INDEX IF NOT EXISTS idx_assignment_spaces_assignment_id
ON assignment_spaces(assignment_id);

-- Index for media_spaces lookups by space
-- Used by: loading photos for a space, ordering photos
CREATE INDEX IF NOT EXISTS idx_media_spaces_space_id
ON media_spaces(space_id, display_order);

-- Index for media_spaces primary photo lookup
-- Used by: finding primary photo for space cards
CREATE INDEX IF NOT EXISTS idx_media_spaces_primary
ON media_spaces(space_id)
WHERE is_primary = TRUE;

-- =============================================
-- RENTAL APPLICATIONS INDEXES
-- =============================================

-- Index for application status filtering
-- Used by: kanban board, pipeline queries
CREATE INDEX IF NOT EXISTS idx_rental_applications_status
ON rental_applications(application_status);

-- Index for non-archived applications
-- Used by: most application queries exclude archived
CREATE INDEX IF NOT EXISTS idx_rental_applications_active
ON rental_applications(application_status, submitted_at DESC)
WHERE is_archived IS NOT TRUE;

-- Index for person's applications
-- Used by: finding applications by person
CREATE INDEX IF NOT EXISTS idx_rental_applications_person
ON rental_applications(person_id);

-- =============================================
-- EVENT HOSTING REQUESTS INDEXES
-- =============================================

-- Index for event request status
-- Used by: event pipeline, filtering by status
CREATE INDEX IF NOT EXISTS idx_event_requests_status
ON event_hosting_requests(request_status);

-- Index for event date range queries
-- Used by: finding events in a date range
CREATE INDEX IF NOT EXISTS idx_event_requests_date
ON event_hosting_requests(event_date);

-- Index for non-archived event requests
CREATE INDEX IF NOT EXISTS idx_event_requests_active
ON event_hosting_requests(request_status, submitted_at DESC)
WHERE is_archived IS NOT TRUE;

-- =============================================
-- MEDIA TABLE INDEXES
-- =============================================

-- Index for media category filtering
-- Used by: media library filtering
CREATE INDEX IF NOT EXISTS idx_media_category
ON media(category);

-- Index for media by upload date
-- Used by: sorting media by recency
CREATE INDEX IF NOT EXISTS idx_media_created
ON media(created_at DESC);

-- =============================================
-- PAYMENT TABLES INDEXES
-- =============================================

-- Index for payments by assignment
-- Used by: payment history for a lease
CREATE INDEX IF NOT EXISTS idx_payments_assignment
ON payments(assignment_id, payment_date DESC);

-- Index for payment sender mappings
-- Used by: AI payment matching cache lookup
CREATE INDEX IF NOT EXISTS idx_payment_sender_normalized
ON payment_sender_mappings(sender_name_normalized);

-- Index for pending payments
-- Used by: admin review queue
CREATE INDEX IF NOT EXISTS idx_pending_payments_unresolved
ON pending_payments(created_at DESC)
WHERE resolved_at IS NULL;

-- =============================================
-- PEOPLE TABLE INDEXES
-- =============================================

-- Index for person type filtering
-- Used by: filtering tenants, staff, guests
CREATE INDEX IF NOT EXISTS idx_people_type
ON people(type);

-- Index for person name search
-- Used by: searching people by name
CREATE INDEX IF NOT EXISTS idx_people_name
ON people(first_name, last_name);

-- =============================================
-- VERIFICATION QUERY
-- =============================================

-- Run this to verify indexes were created:
-- SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;
