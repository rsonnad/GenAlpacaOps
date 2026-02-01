// Consumer view - Public spaces listing
import { supabase } from '../shared/supabase.js';

// App state
let spaces = [];
let currentView = 'card';
let currentSort = { column: 'availability', direction: 'asc' };

// DOM elements
const cardView = document.getElementById('cardView');
const tableView = document.getElementById('tableView');
const tableBody = document.getElementById('tableBody');
const cardViewBtn = document.getElementById('cardViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const searchInput = document.getElementById('searchInput');
const priceFilter = document.getElementById('priceFilter');
const bathFilter = document.getElementById('bathFilter');
const availFilter = document.getElementById('availFilter');
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

// Load data from Supabase (public query - RLS filters to listed + secret spaces)
async function loadData() {
  try {
    // Load spaces - RLS will filter to:
    // - Listed, non-secret spaces (for browsing)
    // - Secret spaces (accessible by direct ID)
    const { data: spacesData, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        id, name, description, location, monthly_rate,
        sq_footage, bath_privacy, bath_fixture,
        beds_king, beds_queen, beds_double, beds_twin, beds_folding, beds_trifold,
        min_residents, max_residents, is_listed, is_secret,
        parent:parent_id(name),
        space_amenities(amenity:amenity_id(name)),
        photo_spaces(photo:photo_id(id,url,caption),display_order)
      `)
      .eq('can_be_dwelling', true)
      .order('name');

    if (spacesError) throw spacesError;

    spaces = spacesData || [];

    // Process spaces
    spaces.forEach(space => {
      // For public view, we don't load assignments (no occupancy info)
      // Availability is assumed based on listing status
      space.amenities = space.space_amenities?.map(sa => sa.amenity?.name).filter(Boolean) || [];
      space.photos = (space.photo_spaces || [])
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map(ps => ({ ...ps.photo, display_order: ps.display_order }))
        .filter(p => p && p.url);
    });

  } catch (error) {
    console.error('Error loading data:', error);
    alert('Failed to load data. Check console for details.');
  }
}

// Setup event listeners
function setupEventListeners() {
  // View toggle
  cardViewBtn.addEventListener('click', () => setView('card'));
  tableViewBtn.addEventListener('click', () => setView('table'));

  // Filters
  searchInput.addEventListener('input', render);
  priceFilter.addEventListener('change', render);
  bathFilter.addEventListener('change', render);
  availFilter.addEventListener('change', render);
  clearFilters.addEventListener('click', resetFilters);

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

  // Price filter
  const price = priceFilter.value;
  if (price) {
    filtered = filtered.filter(s => {
      const rate = s.monthly_rate || 0;
      if (price === '0-400') return rate < 400;
      if (price === '400-700') return rate >= 400 && rate < 700;
      if (price === '700-1000') return rate >= 700 && rate < 1000;
      if (price === '1000+') return rate >= 1000;
      return true;
    });
  }

  // Bath filter
  const bath = bathFilter.value;
  if (bath) {
    filtered = filtered.filter(s => s.bath_privacy === bath);
  }

  // Note: Availability filter doesn't work for public view since we don't load assignments
  // We could show all as "Contact for availability" or remove this filter

  // Sort
  filtered.sort((a, b) => {
    let aVal = a[currentSort.column];
    let bVal = b[currentSort.column];

    if (aVal === null || aVal === undefined) aVal = '';
    if (bVal === null || bVal === undefined) bVal = '';

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return filtered;
}

function resetFilters() {
  searchInput.value = '';
  priceFilter.value = '';
  bathFilter.value = '';
  availFilter.value = '';
  render();
}

function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }

  // Update header classes
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === column) {
      th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });

  render();
}

// Rendering
function render() {
  const filtered = getFilteredSpaces();
  renderCards(filtered);
  renderTable(filtered);
}

function renderCards(spacesToRender) {
  cardView.innerHTML = spacesToRender.map(space => {
    const photo = space.photos[0];
    const beds = getBedSummary(space);
    const bathText = space.bath_privacy ? `${space.bath_privacy} bath` : '';

    // For public view, all listed spaces are available (no assignment data)
    const availFromStr = 'NOW';
    const availUntilStr = 'INDEFINITELY';

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
            <span class="badge available">Available: ${availFromStr}</span>
            <span class="badge available badge-right">Until: ${availUntilStr}</span>
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

    return `
      <tr onclick="showSpaceDetail('${space.id}')" style="cursor:pointer;">
        <td><strong>${space.name}</strong>${space.location ? `<br><small style="color:var(--text-muted)">in ${space.location}</small>` : (space.parent ? `<br><small style="color:var(--text-muted)">in ${space.parent.name}</small>` : '')}</td>
        <td>${space.monthly_rate ? `$${space.monthly_rate}/mo` : '-'}</td>
        <td>${space.sq_footage || '-'}</td>
        <td>${beds || '-'}</td>
        <td>${space.bath_privacy || '-'}</td>
        <td>${space.amenities.slice(0, 3).join(', ') || '-'}</td>
        <td><span class="badge available">Available: NOW</span></td>
        <td>Until: INDEFINITELY</td>
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
        photo_spaces(photo:photo_id(id,url,caption),display_order)
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
    space.photos = (space.photo_spaces || [])
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map(ps => ({ ...ps.photo, display_order: ps.display_order }))
      .filter(p => p && p.url);

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
