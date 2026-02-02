// Consumer view - Public spaces listing
import { supabase } from '../shared/supabase.js';

// App state
let spaces = [];
let currentView = 'card';

// DOM elements
const cardView = document.getElementById('cardView');
const tableView = document.getElementById('tableView');
const tableBody = document.getElementById('tableBody');
const cardViewBtn = document.getElementById('cardViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const searchInput = document.getElementById('searchInput');
const parentFilter = document.getElementById('parentFilter');
const bathFilter = document.getElementById('bathFilter');
const clearFilters = document.getElementById('clearFilters');
const spaceDetailModal = document.getElementById('spaceDetailModal');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check for direct space ID in URL (for secret space links)
  const urlParams = new URLSearchParams(window.location.search);
  const directSpaceId = urlParams.get('id');

  await loadData();
  setupEventListeners();
  render();

  // If direct ID provided, show that space's detail modal
  if (directSpaceId) {
    showSpaceDetail(directSpaceId);
  }
});

// Load data from Supabase with retry logic
async function loadData(retryCount = 0) {
  const maxRetries = 3;

  try {
    // Load spaces
    const { data: spacesData, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        id, name, description, location, monthly_rate,
        sq_footage, bath_privacy, bath_fixture,
        beds_king, beds_queen, beds_double, beds_twin, beds_folding, beds_trifold,
        min_residents, max_residents, is_listed, is_secret,
        parent:parent_id(name),
        space_amenities(amenity:amenity_id(name)),
        media_spaces(display_order, is_primary, media:media_id(id, url, caption))
      `)
      .eq('can_be_dwelling', true)
      .order('monthly_rate', { ascending: false, nullsFirst: false })
      .order('name');

    if (spacesError) throw spacesError;

    // Load active assignments (just dates, no personal info)
    const { data: assignmentsData, error: assignmentsError } = await supabase
      .from('assignments')
      .select(`
        id,
        start_date,
        end_date,
        desired_departure_date,
        desired_departure_listed,
        status,
        assignment_spaces(space_id)
      `)
      .in('status', ['active', 'pending_contract', 'contract_sent']);

    if (assignmentsError) throw assignmentsError;

    const assignments = assignmentsData || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Process spaces
    spaces = (spacesData || []).filter(s => !s.is_archived);

    spaces.forEach(space => {
      space.amenities = space.space_amenities?.map(sa => sa.amenity?.name).filter(Boolean) || [];
      space.photos = (space.media_spaces || [])
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map(ms => ms.media ? { ...ms.media, display_order: ms.display_order, is_primary: ms.is_primary } : null)
        .filter(p => p && p.url);

      // Compute availability from assignments
      const spaceAssignments = assignments
        .filter(a => a.assignment_spaces?.some(as => as.space_id === space.id))
        .sort((a, b) => {
          const aStart = a.start_date ? new Date(a.start_date) : new Date(0);
          const bStart = b.start_date ? new Date(b.start_date) : new Date(0);
          return aStart - bStart;
        });

      // Find current assignment (active and either no end date or end date >= today)
      const currentAssignment = spaceAssignments.find(a => {
        if (a.status !== 'active') return false;
        // Only use desired_departure_date if it's listed (published for consumers)
        const effectiveEndDate = (a.desired_departure_listed && a.desired_departure_date) || a.end_date;
        if (!effectiveEndDate) return true;
        return new Date(effectiveEndDate) >= today;
      });

      // Get effective end date (only use desired_departure_date if listed)
      const getEffectiveEndDate = (assignment) => {
        if (!assignment) return null;
        if (assignment.desired_departure_listed && assignment.desired_departure_date) {
          return assignment.desired_departure_date;
        }
        return assignment.end_date;
      };

      // Find next assignment (starts after current ends)
      const effectiveEndDate = getEffectiveEndDate(currentAssignment);
      const availableFrom = effectiveEndDate
        ? new Date(effectiveEndDate)
        : today;

      const nextAssignment = spaceAssignments.find(a => {
        if (a === currentAssignment) return false;
        if (!a.start_date) return false;
        const startDate = new Date(a.start_date);
        return startDate > availableFrom;
      });

      space.isAvailable = !currentAssignment;
      space.availableFrom = currentAssignment
        ? (effectiveEndDate ? new Date(effectiveEndDate) : null)
        : today;
      space.availableUntil = nextAssignment?.start_date
        ? new Date(nextAssignment.start_date)
        : null;
    });

  } catch (error) {
    console.error('Error loading data:', error);

    // Retry on AbortError (network issues)
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      if (retryCount < maxRetries) {
        console.log(`Retrying... (attempt ${retryCount + 2}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return loadData(retryCount + 1);
      }
    }

    // Show user-friendly message
    cardView.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <p>Unable to load spaces. Please refresh the page.</p>
        <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;">
          Refresh
        </button>
      </div>
    `;
  }
}

// Setup event listeners
function setupEventListeners() {
  // View toggle
  cardViewBtn.addEventListener('click', () => setView('card'));
  tableViewBtn.addEventListener('click', () => setView('table'));

  // Filters
  searchInput.addEventListener('input', render);
  parentFilter.addEventListener('change', render);
  bathFilter.addEventListener('change', render);
  clearFilters.addEventListener('click', resetFilters);

  // Populate parent filter dropdown
  populateParentFilter();

  // Table sorting
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });

  // Modal close
  document.getElementById('closeDetailModal').addEventListener('click', () => {
    spaceDetailModal.classList.add('hidden');
    // Remove ID from URL when closing modal
    const url = new URL(window.location);
    url.searchParams.delete('id');
    window.history.replaceState({}, '', url);
  });

  spaceDetailModal.addEventListener('click', (e) => {
    if (e.target === spaceDetailModal) {
      spaceDetailModal.classList.add('hidden');
      const url = new URL(window.location);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url);
    }
  });
}

// View management
function setView(view) {
  currentView = view;
  cardViewBtn.classList.toggle('active', view === 'card');
  tableViewBtn.classList.toggle('active', view === 'table');
  cardView.classList.toggle('hidden', view !== 'card');
  tableView.classList.toggle('hidden', view !== 'table');
}

// Filtering - only show listed, non-secret spaces in the listing
function getFilteredSpaces() {
  // Filter to only listed, non-secret spaces for browsing
  let filtered = spaces.filter(s => s.is_listed && !s.is_secret);

  // Search
  const search = searchInput.value.toLowerCase();
  if (search) {
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(search) ||
      (s.description && s.description.toLowerCase().includes(search))
    );
  }

  // Parent filter
  const parent = parentFilter.value;
  if (parent) {
    filtered = filtered.filter(s => s.parent?.name === parent);
  }

  // Bath filter
  const bath = bathFilter.value;
  if (bath) {
    filtered = filtered.filter(s => s.bath_privacy === bath);
  }

  // Sort: available first, then by monthly_rate descending, then by name
  filtered.sort((a, b) => {
    // Available spaces come first
    if (a.isAvailable && !b.isAvailable) return -1;
    if (!a.isAvailable && b.isAvailable) return 1;

    // Then sort by monthly_rate descending (highest first)
    const aRate = a.monthly_rate || 0;
    const bRate = b.monthly_rate || 0;
    if (aRate !== bRate) return bRate - aRate;

    // Then by name
    return (a.name || '').localeCompare(b.name || '');
  });

  return filtered;
}

function resetFilters() {
  searchInput.value = '';
  parentFilter.value = '';
  bathFilter.value = '';
  render();
}

// Populate parent filter dropdown from loaded spaces
function populateParentFilter() {
  const parents = new Set();
  spaces.forEach(s => {
    if (s.parent?.name) {
      parents.add(s.parent.name);
    }
  });

  // Sort parent names alphabetically
  const sortedParents = Array.from(parents).sort();

  // Clear existing options except first
  while (parentFilter.options.length > 1) {
    parentFilter.remove(1);
  }

  // Add parent options
  sortedParents.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    parentFilter.appendChild(option);
  });
}

function handleSort(column) {
  // For now, just re-render (sorting is handled in getFilteredSpaces)
  render();
}

// Rendering
function render() {
  const filtered = getFilteredSpaces();
  renderCards(filtered);
  renderTable(filtered);
}

// Helper to format dates
function formatDate(d) {
  if (!d) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderCards(spacesToRender) {
  cardView.innerHTML = spacesToRender.map(space => {
    const photo = space.photos[0];
    const beds = getBedSummary(space);
    const bathText = space.bath_privacy ? `${space.bath_privacy} bath` : '';

    // Availability display
    const availFromStr = space.isAvailable ? 'NOW' : (space.availableFrom ? formatDate(space.availableFrom) : 'TBD');
    const availUntilStr = space.availableUntil ? formatDate(space.availableUntil) : 'INDEFINITELY';

    const fromBadgeClass = space.isAvailable ? 'available' : 'occupied';
    const untilBadgeClass = availUntilStr === 'INDEFINITELY' ? 'available' : 'occupied';

    return `
      <div class="space-card" onclick="showSpaceDetail('${space.id}')">
        <div class="card-image">
          ${photo
            ? `<img src="${photo.url}" alt="${space.name}">`
            : `<div class="no-photo">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                No photos
              </div>`
          }
          <div class="card-badges">
            <span class="badge ${fromBadgeClass}">Available: ${availFromStr}</span>
            <span class="badge ${untilBadgeClass} badge-right">Until: ${availUntilStr}</span>
          </div>
        </div>
        <div class="card-body">
          <div class="card-title">${space.name}</div>
          ${space.location ? `<div class="card-parent">in ${space.location}</div>` : (space.parent ? `<div class="card-parent">in ${space.parent.name}</div>` : '')}
          <div class="card-details">
            ${space.sq_footage ? `<span>${space.sq_footage} sq ft</span>` : ''}
            ${beds ? `<span>${beds}</span>` : ''}
            ${bathText ? `<span>${bathText}</span>` : ''}
          </div>
          <div class="card-price">
            ${space.monthly_rate ? `$${space.monthly_rate}<span>/mo</span>` : '<span>Contact for rates</span>'}
          </div>
          ${space.amenities.length ? `
            <div class="card-amenities">
              ${space.amenities.slice(0, 4).map(a => `<span class="amenity-tag">${a}</span>`).join('')}
              ${space.amenities.length > 4 ? `<span class="amenity-tag">+${space.amenities.length - 4}</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderTable(spacesToRender) {
  tableBody.innerHTML = spacesToRender.map(space => {
    const beds = getBedSummary(space);

    const availFromStr = space.isAvailable ? 'NOW' : (space.availableFrom ? formatDate(space.availableFrom) : 'TBD');
    const availUntilStr = space.availableUntil ? formatDate(space.availableUntil) : 'INDEFINITELY';
    const fromBadgeClass = space.isAvailable ? 'available' : 'occupied';

    return `
      <tr onclick="showSpaceDetail('${space.id}')" style="cursor:pointer;">
        <td><strong>${space.name}</strong>${space.location ? `<br><small style="color:var(--text-muted)">in ${space.location}</small>` : (space.parent ? `<br><small style="color:var(--text-muted)">in ${space.parent.name}</small>` : '')}</td>
        <td>${space.monthly_rate ? `$${space.monthly_rate}/mo` : '-'}</td>
        <td>${space.sq_footage || '-'}</td>
        <td>${beds || '-'}</td>
        <td>${space.bath_privacy || '-'}</td>
        <td>${space.amenities.slice(0, 3).join(', ') || '-'}</td>
        <td><span class="badge ${fromBadgeClass}">Available: ${availFromStr}</span></td>
        <td>Until: ${availUntilStr}</td>
      </tr>
    `;
  }).join('');
}

// Helpers
function getBedSummary(space) {
  const beds = [];
  if (space.beds_king) beds.push(`${space.beds_king} king`);
  if (space.beds_queen) beds.push(`${space.beds_queen} queen`);
  if (space.beds_double) beds.push(`${space.beds_double} double`);
  if (space.beds_twin) beds.push(`${space.beds_twin} twin`);
  if (space.beds_folding) beds.push(`${space.beds_folding} folding`);
  if (space.beds_trifold) beds.push(`${space.beds_trifold} trifold`);
  return beds.join(', ');
}

// Space detail modal - works for both listed and secret spaces via direct link
function showSpaceDetail(spaceId) {
  const space = spaces.find(s => s.id === spaceId);
  if (!space) {
    // Space not found - might be a secret space we need to fetch directly
    fetchAndShowSpace(spaceId);
    return;
  }

  displaySpaceDetail(space);
}

async function fetchAndShowSpace(spaceId) {
  try {
    const { data: space, error } = await supabase
      .from('spaces')
      .select(`
        id, name, description, location, monthly_rate,
        sq_footage, bath_privacy, bath_fixture,
        beds_king, beds_queen, beds_double, beds_twin, beds_folding, beds_trifold,
        min_residents, max_residents, is_listed, is_secret,
        parent:parent_id(name),
        space_amenities(amenity:amenity_id(name)),
        media_spaces(display_order, is_primary, media:media_id(id, url, caption))
      `)
      .eq('id', spaceId)
      .eq('can_be_dwelling', true)
      .single();

    if (error || !space) {
      alert('Space not found');
      return;
    }

    // Process the space data
    space.amenities = space.space_amenities?.map(sa => sa.amenity?.name).filter(Boolean) || [];
    space.photos = (space.media_spaces || [])
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map(ms => ms.media ? { ...ms.media, display_order: ms.display_order, is_primary: ms.is_primary } : null)
      .filter(p => p && p.url);

    // For directly fetched spaces, assume available (we don't load assignments for single fetch)
    space.isAvailable = true;
    space.availableFrom = new Date();
    space.availableUntil = null;

    displaySpaceDetail(space);
  } catch (error) {
    console.error('Error fetching space:', error);
    alert('Failed to load space');
  }
}

function displaySpaceDetail(space) {
  document.getElementById('detailSpaceName').textContent = space.name;

  // Update URL with space ID for shareable links
  const url = new URL(window.location);
  url.searchParams.set('id', space.id);
  window.history.replaceState({}, '', url);

  let photosHtml = '';
  if (space.photos.length) {
    photosHtml = `
      <div class="detail-section detail-photos">
        <h3>Photos</h3>
        <div class="detail-photos-grid">
          ${space.photos.map(p => `
            <div class="detail-photo">
              <img src="${p.url}" alt="${p.caption || space.name}">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Availability info
  const availFromStr = space.isAvailable ? 'Now' : (space.availableFrom ? formatDate(space.availableFrom) : 'TBD');
  const availUntilStr = space.availableUntil ? formatDate(space.availableUntil) : 'Indefinitely';

  document.getElementById('spaceDetailBody').innerHTML = `
    ${photosHtml}
    <div class="detail-grid">
      <div class="detail-section">
        <h3>Details</h3>
        <p><strong>Rate:</strong> ${space.monthly_rate ? `$${space.monthly_rate}/mo` : 'Contact for rates'}</p>
        <p><strong>Size:</strong> ${space.sq_footage ? `${space.sq_footage} sq ft` : 'N/A'}</p>
        <p><strong>Beds:</strong> ${getBedSummary(space) || 'N/A'}</p>
        <p><strong>Bathroom:</strong> ${space.bath_privacy || 'N/A'}${space.bath_fixture ? ` (${space.bath_fixture})` : ''}</p>
        <p><strong>Capacity:</strong> ${space.min_residents || 1}-${space.max_residents || '?'} residents</p>
      </div>
      <div class="detail-section">
        <h3>Availability</h3>
        <p><strong>Available from:</strong> ${availFromStr}</p>
        <p><strong>Available until:</strong> ${availUntilStr}</p>
      </div>
      <div class="detail-section">
        <h3>Amenities</h3>
        ${space.amenities.length
          ? `<p>${space.amenities.join(', ')}</p>`
          : '<p>No amenities listed</p>'
        }
      </div>
    </div>
    ${space.description ? `
      <div class="detail-section detail-description">
        <h3>Description</h3>
        <p>${space.description}</p>
      </div>
    ` : ''}
    <div class="detail-section">
      <p style="color: var(--text-muted);">
        Interested in this space? Contact us for availability and scheduling a tour.
      </p>
    </div>
  `;

  spaceDetailModal.classList.remove('hidden');
}

// Make functions globally accessible for onclick handlers
window.showSpaceDetail = showSpaceDetail;
