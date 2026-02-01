// Admin view - Full access interface with authentication
import { supabase } from '../../shared/supabase.js';
import { initAuth, getAuthState, signOut, onAuthStateChange } from '../../shared/auth.js';

// App state
let spaces = [];
let assignments = [];
let photoRequests = [];
let authState = null;
let currentView = 'card';
let currentSort = { column: 'availability', direction: 'asc' };

// DOM elements
const loadingOverlay = document.getElementById('loadingOverlay');
const unauthorizedOverlay = document.getElementById('unauthorizedOverlay');
const appContent = document.getElementById('appContent');
const cardView = document.getElementById('cardView');
const tableView = document.getElementById('tableView');
const tableBody = document.getElementById('tableBody');
const cardViewBtn = document.getElementById('cardViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const searchInput = document.getElementById('searchInput');
const priceFilter = document.getElementById('priceFilter');
const bathFilter = document.getElementById('bathFilter');
const availFilter = document.getElementById('availFilter');
const visibilityFilter = document.getElementById('visibilityFilter');
const clearFilters = document.getElementById('clearFilters');
const roleBadge = document.getElementById('roleBadge');
const userInfo = document.getElementById('userInfo');
const manageUsersLink = document.getElementById('manageUsersLink');

// Modals
const photoRequestModal = document.getElementById('photoRequestModal');
const spaceDetailModal = document.getElementById('spaceDetailModal');
const photoUploadModal = document.getElementById('photoUploadModal');
const editSpaceModal = document.getElementById('editSpaceModal');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

async function init() {
  try {
    // Initialize auth
    await initAuth();
    authState = getAuthState();

    // Check authorization
    if (!authState.isAuthenticated) {
      // Not logged in - redirect to login
      window.location.href = '/GenAlpacaOps/login/?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }

    if (!authState.isAuthorized) {
      // Logged in but not authorized
      loadingOverlay.classList.add('hidden');
      unauthorizedOverlay.classList.remove('hidden');
      setupUnauthorizedHandlers();
      return;
    }

    // User is authorized - show the app
    loadingOverlay.classList.add('hidden');
    appContent.classList.remove('hidden');

    // Update UI based on role
    updateRoleUI();

    // Listen for auth changes
    onAuthStateChange((state) => {
      authState = state;
      if (!state.isAuthorized) {
        window.location.href = '/GenAlpacaOps/spaces/';
      }
      updateRoleUI();
    });

    // Load data and setup
    await loadData();
    setupEventListeners();
    render();
  } catch (error) {
    console.error('Init error:', error);
    loadingOverlay.innerHTML = `
      <div class="unauthorized-card">
        <h2>Error</h2>
        <p>${error.message}</p>
        <a href="/GenAlpacaOps/login/" class="btn-secondary">Try Again</a>
      </div>
    `;
  }
}

function setupUnauthorizedHandlers() {
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await signOut();
    window.location.href = '/GenAlpacaOps/spaces/';
  });
}

function updateRoleUI() {
  if (!authState) return;

  // Update role badge
  roleBadge.textContent = authState.role;
  roleBadge.className = 'role-badge ' + authState.role;

  // Update user info
  userInfo.textContent = authState.user?.displayName || authState.user?.email || '';

  // Show/hide admin-only features
  if (authState.isAdmin) {
    document.body.classList.add('is-admin');
    manageUsersLink.classList.remove('hidden');
  } else {
    document.body.classList.remove('is-admin');
    manageUsersLink.classList.add('hidden');
  }
}

// Load data from Supabase (staff/admin have access to all data via RLS)
async function loadData() {
  try {
    // Load spaces with all related data
    const { data: spacesData, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        *,
        parent:parent_id(name),
        space_amenities(amenity:amenity_id(name)),
        photo_spaces(photo:photo_id(id,url,caption),display_order)
      `)
      .order('name');

    if (spacesError) throw spacesError;

    // Load active assignments with people
    const { data: assignmentsData, error: assignmentsError } = await supabase
      .from('assignments')
      .select(`
        *,
        person:person_id(first_name, last_name, type, email, phone),
        assignment_spaces(space_id)
      `)
      .in('status', ['active', 'pending_contract', 'contract_sent'])
      .order('start_date');

    if (assignmentsError) throw assignmentsError;

    // Load photo requests
    const { data: requestsData, error: requestsError } = await supabase
      .from('photo_requests')
      .select('*')
      .in('status', ['pending', 'submitted']);

    if (requestsError) throw requestsError;

    spaces = spacesData || [];
    assignments = assignmentsData || [];
    photoRequests = requestsData || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Map assignments to spaces and compute availability windows
    spaces.forEach(space => {
      const spaceAssignments = assignments
        .filter(a => a.assignment_spaces?.some(as => as.space_id === space.id))
        .sort((a, b) => {
          const aStart = a.start_date ? new Date(a.start_date) : new Date(0);
          const bStart = b.start_date ? new Date(b.start_date) : new Date(0);
          return aStart - bStart;
        });

      const currentAssignment = spaceAssignments.find(a => {
        if (a.status !== 'active') return false;
        if (!a.end_date) return true;
        return new Date(a.end_date) >= today;
      });

      const availableFrom = currentAssignment?.end_date
        ? new Date(currentAssignment.end_date)
        : today;

      const nextAssignment = spaceAssignments.find(a => {
        if (a === currentAssignment) return false;
        if (!a.start_date) return false;
        const startDate = new Date(a.start_date);
        return startDate > availableFrom;
      });

      space.currentAssignment = currentAssignment || null;
      space.nextAssignment = nextAssignment || null;
      space.availableFrom = currentAssignment ? (currentAssignment.end_date ? new Date(currentAssignment.end_date) : null) : today;
      space.availableUntil = nextAssignment?.start_date ? new Date(nextAssignment.start_date) : null;

      space.amenities = space.space_amenities?.map(sa => sa.amenity?.name).filter(Boolean) || [];
      space.photos = (space.photo_spaces || [])
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map(ps => ({ ...ps.photo, display_order: ps.display_order }))
        .filter(p => p && p.url);
      space.photoRequests = photoRequests.filter(pr => pr.space_id === space.id);
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

  // Sign out
  document.getElementById('headerSignOutBtn').addEventListener('click', async () => {
    await signOut();
    window.location.href = '/GenAlpacaOps/spaces/';
  });

  // Filters
  searchInput.addEventListener('input', render);
  priceFilter.addEventListener('change', render);
  bathFilter.addEventListener('change', render);
  availFilter.addEventListener('change', render);
  visibilityFilter.addEventListener('change', render);
  clearFilters.addEventListener('click', resetFilters);

  // Table sorting
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });

  // Modal handlers
  document.getElementById('closeModal').addEventListener('click', () => {
    photoRequestModal.classList.add('hidden');
  });
  document.getElementById('closeDetailModal').addEventListener('click', () => {
    spaceDetailModal.classList.add('hidden');
  });
  document.getElementById('cancelPhotoRequest').addEventListener('click', () => {
    photoRequestModal.classList.add('hidden');
  });
  document.getElementById('submitPhotoRequest').addEventListener('click', handlePhotoRequestSubmit);

  photoRequestModal.addEventListener('click', (e) => {
    if (e.target === photoRequestModal) photoRequestModal.classList.add('hidden');
  });
  spaceDetailModal.addEventListener('click', (e) => {
    if (e.target === spaceDetailModal) spaceDetailModal.classList.add('hidden');
  });
  photoUploadModal.addEventListener('click', (e) => {
    if (e.target === photoUploadModal) photoUploadModal.classList.add('hidden');
  });

  // Upload modal handlers
  document.getElementById('closeUploadModal').addEventListener('click', () => {
    photoUploadModal.classList.add('hidden');
  });
  document.getElementById('cancelPhotoUpload').addEventListener('click', () => {
    photoUploadModal.classList.add('hidden');
  });
  document.getElementById('submitPhotoUpload').addEventListener('click', handlePhotoUpload);
  document.getElementById('photoFile').addEventListener('change', handleFilePreview);

  // Edit space modal handlers
  document.getElementById('closeEditModal').addEventListener('click', () => {
    editSpaceModal.classList.add('hidden');
  });
  document.getElementById('cancelEditSpace').addEventListener('click', () => {
    editSpaceModal.classList.add('hidden');
  });
  document.getElementById('submitEditSpace').addEventListener('click', handleEditSpaceSubmit);
  editSpaceModal.addEventListener('click', (e) => {
    if (e.target === editSpaceModal) editSpaceModal.classList.add('hidden');
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

// Filtering
function getFilteredSpaces() {
  let filtered = [...spaces];

  // Only show dwelling spaces
  filtered = filtered.filter(s => s.can_be_dwelling);

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

  // Availability filter
  const avail = availFilter.value;
  if (avail) {
    if (avail === 'available') {
      filtered = filtered.filter(s => !s.currentAssignment);
    } else if (avail === 'occupied') {
      filtered = filtered.filter(s => s.currentAssignment);
    }
  }

  // Visibility filter
  const visibility = visibilityFilter.value;
  if (visibility === 'listed') {
    filtered = filtered.filter(s => s.is_listed && !s.is_secret);
  } else if (visibility === 'unlisted') {
    filtered = filtered.filter(s => !s.is_listed);
  } else if (visibility === 'secret') {
    filtered = filtered.filter(s => s.is_secret);
  }

  // Sort
  filtered.sort((a, b) => {
    if (currentSort.column === 'availability') {
      const aEndDate = a.currentAssignment?.end_date ? new Date(a.currentAssignment.end_date) : null;
      const bEndDate = b.currentAssignment?.end_date ? new Date(b.currentAssignment.end_date) : null;
      const aOccupied = !!a.currentAssignment;
      const bOccupied = !!b.currentAssignment;

      if (!aOccupied && bOccupied) return currentSort.direction === 'asc' ? -1 : 1;
      if (aOccupied && !bOccupied) return currentSort.direction === 'asc' ? 1 : -1;

      if (!aOccupied && !bOccupied) return a.name.localeCompare(b.name);

      if (aEndDate && bEndDate) {
        if (aEndDate < bEndDate) return currentSort.direction === 'asc' ? -1 : 1;
        if (aEndDate > bEndDate) return currentSort.direction === 'asc' ? 1 : -1;
      }
      if (aEndDate && !bEndDate) return -1;
      if (!aEndDate && bEndDate) return 1;

      return a.name.localeCompare(b.name);
    }

    let aVal = a[currentSort.column];
    let bVal = b[currentSort.column];

    if (currentSort.column === 'occupant') {
      aVal = a.currentAssignment?.person?.first_name || '';
      bVal = b.currentAssignment?.person?.first_name || '';
    }

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
  visibilityFilter.value = '';
  render();
}

function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }

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
  const isAdmin = authState?.isAdmin;

  cardView.innerHTML = spacesToRender.map(space => {
    const occupant = space.currentAssignment?.person;
    const photo = space.photos[0];
    const isOccupied = !!space.currentAssignment;

    // Format availability window
    const formatDate = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
    const availFromStr = space.availableFrom && space.availableFrom > new Date()
      ? formatDate(space.availableFrom)
      : 'NOW';
    const availUntilStr = space.availableUntil ? formatDate(space.availableUntil) : 'INDEFINITELY';

    const fromBadgeClass = availFromStr === 'NOW' ? 'available' : 'occupied';
    const untilBadgeClass = availUntilStr === 'INDEFINITELY' ? 'available' : 'occupied';

    let badges = `<span class="badge ${fromBadgeClass}">Available: ${availFromStr}</span>`;
    badges += `<span class="badge ${untilBadgeClass} badge-right">Until: ${availUntilStr}</span>`;

    // Visibility badges
    if (space.is_secret) badges += '<span class="badge secret">Secret</span>';
    else if (!space.is_listed) badges += '<span class="badge unlisted">Unlisted</span>';

    const beds = getBedSummary(space);
    const bathText = space.bath_privacy ? `${space.bath_privacy} bath` : '';

    let occupantHtml = '';
    if (isOccupied && occupant) {
      const name = `${occupant.first_name} ${occupant.last_name || ''}`.trim();
      const endDate = space.currentAssignment.end_date
        ? new Date(space.currentAssignment.end_date).toLocaleDateString()
        : 'No end date';
      occupantHtml = `
        <div class="card-occupant">
          <strong>${name}</strong> · ${occupant.type}<br>
          <small>Until: ${endDate}</small>
        </div>
      `;
    }

    const pendingRequests = space.photoRequests?.filter(r => r.status === 'pending').length || 0;

    // Admin actions
    let actionsHtml = '';
    if (isAdmin) {
      actionsHtml = `
        <div class="card-actions">
          <button class="btn-edit" onclick="event.stopPropagation(); openEditSpace('${space.id}')">
            Edit
          </button>
          <button class="btn-small" onclick="event.stopPropagation(); openPhotoUpload('${space.id}', '${space.name.replace(/'/g, "\\'")}')">
            Upload
          </button>
          <button class="btn-small" onclick="event.stopPropagation(); openPhotoRequest('${space.id}', '${space.name.replace(/'/g, "\\'")}')">
            Request ${pendingRequests ? `(${pendingRequests})` : ''}
          </button>
        </div>
      `;
    }

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
          <div class="card-badges">${badges}</div>
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
          ${occupantHtml}
          ${actionsHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderTable(spacesToRender) {
  tableBody.innerHTML = spacesToRender.map(space => {
    const isOccupied = !!space.currentAssignment;
    const occupant = space.currentAssignment?.person;
    const beds = getBedSummary(space);

    const occupantName = occupant
      ? `${occupant.first_name} ${occupant.last_name || ''}`.trim()
      : '-';

    const endDate = space.currentAssignment?.end_date
      ? new Date(space.currentAssignment.end_date).toLocaleDateString()
      : '-';

    const formatDate = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
    const availFromStr = space.availableFrom && space.availableFrom > new Date()
      ? formatDate(space.availableFrom)
      : 'NOW';
    const availUntilStr = space.availableUntil ? formatDate(space.availableUntil) : 'INDEFINITELY';

    let statusBadge = isOccupied
      ? '<span class="badge occupied">Occupied</span>'
      : '<span class="badge available">Available</span>';

    if (space.is_secret) statusBadge += ' <span class="badge secret">Secret</span>';
    else if (!space.is_listed) statusBadge += ' <span class="badge unlisted">Unlisted</span>';

    return `
      <tr onclick="showSpaceDetail('${space.id}')" style="cursor:pointer;">
        <td><strong>${space.name}</strong>${space.location ? `<br><small style="color:var(--text-muted)">in ${space.location}</small>` : (space.parent ? `<br><small style="color:var(--text-muted)">in ${space.parent.name}</small>` : '')}</td>
        <td>${space.monthly_rate ? `$${space.monthly_rate}/mo` : '-'}</td>
        <td>${space.sq_footage || '-'}</td>
        <td>${beds || '-'}</td>
        <td>${space.bath_privacy || '-'}</td>
        <td>${space.amenities.slice(0, 3).join(', ') || '-'}</td>
        <td>${availFromStr}</td>
        <td>${availUntilStr}</td>
        <td>${occupantName}</td>
        <td>${endDate}</td>
        <td>${statusBadge}</td>
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

// Space detail modal
function showSpaceDetail(spaceId) {
  const space = spaces.find(s => s.id === spaceId);
  if (!space) return;

  const isAdmin = authState?.isAdmin;

  document.getElementById('detailSpaceName').textContent = space.name;

  const isOccupied = !!space.currentAssignment;
  const occupant = space.currentAssignment?.person;

  let photosHtml = '';
  if (space.photos.length) {
    const photoItems = space.photos.map((p, idx) => {
      const orderControls = isAdmin ? `
        <div class="photo-order-controls">
          <button onclick="event.stopPropagation(); movePhoto('${space.id}', '${p.id}', 'top')" title="Move to top">⇈</button>
          <button onclick="event.stopPropagation(); movePhoto('${space.id}', '${p.id}', 'up')" title="Move up">↑</button>
          <button onclick="event.stopPropagation(); movePhoto('${space.id}', '${p.id}', 'down')" title="Move down">↓</button>
          <button onclick="event.stopPropagation(); movePhoto('${space.id}', '${p.id}', 'bottom')" title="Move to bottom">⇊</button>
        </div>
      ` : '';
      return `
        <div class="detail-photo">
          <img src="${p.url}" alt="${p.caption || space.name}">
          ${orderControls}
        </div>
      `;
    }).join('');

    photosHtml = `
      <div class="detail-section detail-photos">
        <h3>Photos</h3>
        <div class="detail-photos-grid">
          ${photoItems}
        </div>
      </div>
    `;
  }

  let occupantHtml = '';
  if (isOccupied && occupant) {
    const a = space.currentAssignment;
    occupantHtml = `
      <div class="detail-section">
        <h3>Current Occupant</h3>
        <p><strong>${occupant.first_name} ${occupant.last_name || ''}</strong> (${occupant.type})</p>
        ${occupant.email ? `<p>Email: ${occupant.email}</p>` : ''}
        ${occupant.phone ? `<p>Phone: ${occupant.phone}</p>` : ''}
        <p>Rate: $${a.rate_amount}/${a.rate_term}</p>
        <p>Start: ${a.start_date ? new Date(a.start_date).toLocaleDateString() : 'N/A'}</p>
        <p>End: ${a.end_date ? new Date(a.end_date).toLocaleDateString() : 'No end date'}</p>
      </div>
    `;
  }

  let photoRequestsHtml = '';
  if (space.photoRequests?.length) {
    photoRequestsHtml = `
      <div class="detail-section photo-requests">
        <h3>Photo Requests</h3>
        ${space.photoRequests.map(pr => `
          <div class="photo-request-item">
            <div>
              <span class="request-status ${pr.status}">${pr.status}</span>
              <p style="margin-top:0.5rem">${pr.description}</p>
            </div>
          </div>
        `).join('')}
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
        ${space.gender_restriction && space.gender_restriction !== 'none' ? `<p><strong>Restriction:</strong> ${space.gender_restriction} only</p>` : ''}
      </div>
      <div class="detail-section">
        <h3>Amenities</h3>
        ${space.amenities.length
          ? `<p>${space.amenities.join(', ')}</p>`
          : '<p>No amenities listed</p>'
        }
      </div>
      ${occupantHtml}
    </div>
    ${space.description ? `
      <div class="detail-section detail-description">
        <h3>Description</h3>
        <p>${space.description}</p>
      </div>
    ` : ''}
    ${photoRequestsHtml}
    ${isAdmin ? `
      <div style="margin-top:1rem; display: flex; gap: 0.75rem;">
        <button class="btn-primary" onclick="openEditSpace('${space.id}'); spaceDetailModal.classList.add('hidden');">
          Edit Space
        </button>
        <button class="btn-secondary" onclick="openPhotoRequest('${space.id}', '${space.name.replace(/'/g, "\\'")}')">
          Request Photo
        </button>
      </div>
    ` : ''}
  `;

  spaceDetailModal.classList.remove('hidden');
}

// Photo request handling
let currentPhotoRequestSpaceId = null;

function openPhotoRequest(spaceId, spaceName) {
  if (!authState?.isAdmin) {
    alert('Only admins can request photos');
    return;
  }
  currentPhotoRequestSpaceId = spaceId;
  document.getElementById('modalSpaceName').textContent = spaceName;
  document.getElementById('photoDescription').value = '';
  photoRequestModal.classList.remove('hidden');
}

async function handlePhotoRequestSubmit() {
  const description = document.getElementById('photoDescription').value.trim();
  if (!description) {
    alert('Please describe the photo needed.');
    return;
  }

  try {
    const { error } = await supabase
      .from('photo_requests')
      .insert({
        space_id: currentPhotoRequestSpaceId,
        description: description,
        status: 'pending',
        requested_by: authState.appUser?.id || 'admin'
      });

    if (error) throw error;

    alert('Photo request submitted!');
    photoRequestModal.classList.add('hidden');

    await loadData();
    render();

  } catch (error) {
    console.error('Error submitting photo request:', error);
    alert('Failed to submit request. Check console for details.');
  }
}

// Photo ordering
async function movePhoto(spaceId, photoId, direction) {
  if (!authState?.isAdmin) {
    alert('Only admins can reorder photos');
    return;
  }

  const space = spaces.find(s => s.id === spaceId);
  if (!space) return;

  const photos = [...space.photos];
  const idx = photos.findIndex(p => p.id === photoId);
  if (idx === -1) return;

  let newIdx;
  switch (direction) {
    case 'top':
      newIdx = 0;
      break;
    case 'up':
      newIdx = Math.max(0, idx - 1);
      break;
    case 'down':
      newIdx = Math.min(photos.length - 1, idx + 1);
      break;
    case 'bottom':
      newIdx = photos.length - 1;
      break;
    default:
      return;
  }

  if (newIdx === idx) return;

  const [photo] = photos.splice(idx, 1);
  photos.splice(newIdx, 0, photo);

  try {
    for (let i = 0; i < photos.length; i++) {
      await supabase
        .from('photo_spaces')
        .update({ display_order: i })
        .eq('space_id', spaceId)
        .eq('photo_id', photos[i].id);
    }

    await loadData();
    render();
    showSpaceDetail(spaceId);

  } catch (error) {
    console.error('Error reordering photos:', error);
    alert('Failed to reorder photos.');
  }
}

// Photo upload handling
let currentUploadSpaceId = null;

function openPhotoUpload(spaceId, spaceName) {
  if (!authState?.isAdmin) {
    alert('Only admins can upload photos');
    return;
  }
  currentUploadSpaceId = spaceId;
  document.getElementById('uploadModalSpaceName').textContent = spaceName;
  document.getElementById('photoFile').value = '';
  document.getElementById('photoCaption').value = '';
  document.getElementById('uploadPreview').innerHTML = '';
  photoUploadModal.classList.remove('hidden');
}

function handleFilePreview(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('uploadPreview').innerHTML = `
      <img src="${e.target.result}" style="max-width:100%; max-height:200px; border-radius:var(--radius);">
    `;
  };
  reader.readAsDataURL(file);
}

async function handlePhotoUpload() {
  if (!authState?.isAdmin) {
    alert('Only admins can upload photos');
    return;
  }

  const file = document.getElementById('photoFile').files[0];
  const caption = document.getElementById('photoCaption').value.trim();

  if (!file) {
    alert('Please select an image.');
    return;
  }

  const submitBtn = document.getElementById('submitPhotoUpload');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';

  try {
    const ext = file.name.split('.').pop();
    const filename = `${currentUploadSpaceId}/${Date.now()}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('housephotos')
      .upload(filename, file);

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('housephotos')
      .getPublicUrl(filename);

    const publicUrl = urlData.publicUrl;

    const { data: photoData, error: photoError } = await supabase
      .from('photos')
      .insert({
        url: publicUrl,
        caption: caption || null,
        uploaded_by: authState.appUser?.id || 'admin'
      })
      .select()
      .single();

    if (photoError) throw photoError;

    const { error: linkError } = await supabase
      .from('photo_spaces')
      .insert({
        photo_id: photoData.id,
        space_id: currentUploadSpaceId
      });

    if (linkError) throw linkError;

    alert('Photo uploaded successfully!');
    photoUploadModal.classList.add('hidden');

    await loadData();
    render();

  } catch (error) {
    console.error('Error uploading photo:', error);
    alert('Failed to upload: ' + error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  }
}

// Edit space functionality
let currentEditSpaceId = null;

function openEditSpace(spaceId) {
  if (!authState?.isAdmin) {
    alert('Only admins can edit spaces');
    return;
  }

  const space = spaces.find(s => s.id === spaceId);
  if (!space) {
    alert('Space not found');
    return;
  }

  currentEditSpaceId = spaceId;
  document.getElementById('editSpaceName').textContent = space.name;
  document.getElementById('editSpaceId').value = spaceId;

  // Populate form fields
  document.getElementById('editName').value = space.name || '';
  document.getElementById('editLocation').value = space.location || '';
  document.getElementById('editDescription').value = space.description || '';
  document.getElementById('editMonthlyRate').value = space.monthly_rate || '';
  document.getElementById('editWeeklyRate').value = space.weekly_rate || '';
  document.getElementById('editNightlyRate').value = space.nightly_rate || '';
  document.getElementById('editSqFootage').value = space.sq_footage || '';
  document.getElementById('editMinResidents').value = space.min_residents || 1;
  document.getElementById('editMaxResidents').value = space.max_residents || '';
  document.getElementById('editBathPrivacy').value = space.bath_privacy || '';
  document.getElementById('editBathFixture').value = space.bath_fixture || '';
  document.getElementById('editGenderRestriction').value = space.gender_restriction || 'none';
  document.getElementById('editBedsKing').value = space.beds_king || 0;
  document.getElementById('editBedsQueen').value = space.beds_queen || 0;
  document.getElementById('editBedsDouble').value = space.beds_double || 0;
  document.getElementById('editBedsTwin').value = space.beds_twin || 0;
  document.getElementById('editBedsFolding').value = space.beds_folding || 0;
  document.getElementById('editBedsTrifold').value = space.beds_trifold || 0;
  document.getElementById('editIsListed').checked = space.is_listed || false;
  document.getElementById('editIsSecret').checked = space.is_secret || false;
  document.getElementById('editCanBeDwelling').checked = space.can_be_dwelling !== false;

  // Populate photos
  renderEditPhotos(space);

  editSpaceModal.classList.remove('hidden');
}

function renderEditPhotos(space) {
  const container = document.getElementById('editPhotosContainer');

  if (!space.photos || space.photos.length === 0) {
    container.innerHTML = '<div class="no-photos-message">No photos yet. Use the Upload button to add photos.</div>';
    return;
  }

  container.innerHTML = space.photos.map((photo, idx) => `
    <div class="edit-photo-item" data-photo-id="${photo.id}">
      <img src="${photo.url}" alt="${photo.caption || 'Photo ' + (idx + 1)}">
      <span class="photo-order">#${idx + 1}</span>
      <div class="photo-controls">
        <button onclick="event.stopPropagation(); movePhotoInEdit('${space.id}', '${photo.id}', 'up')" ${idx === 0 ? 'disabled' : ''}>↑ Up</button>
        <button onclick="event.stopPropagation(); movePhotoInEdit('${space.id}', '${photo.id}', 'down')" ${idx === space.photos.length - 1 ? 'disabled' : ''}>↓ Down</button>
        <button class="btn-delete" onclick="event.stopPropagation(); deletePhoto('${space.id}', '${photo.id}')">× Delete</button>
      </div>
    </div>
  `).join('');
}

async function handleEditSpaceSubmit() {
  if (!authState?.isAdmin) {
    alert('Only admins can edit spaces');
    return;
  }

  const spaceId = document.getElementById('editSpaceId').value;
  const name = document.getElementById('editName').value.trim();

  if (!name) {
    alert('Name is required');
    return;
  }

  const submitBtn = document.getElementById('submitEditSpace');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const updates = {
      name: name,
      location: document.getElementById('editLocation').value.trim() || null,
      description: document.getElementById('editDescription').value.trim() || null,
      monthly_rate: parseInt(document.getElementById('editMonthlyRate').value) || null,
      weekly_rate: parseInt(document.getElementById('editWeeklyRate').value) || null,
      nightly_rate: parseInt(document.getElementById('editNightlyRate').value) || null,
      sq_footage: parseInt(document.getElementById('editSqFootage').value) || null,
      min_residents: parseInt(document.getElementById('editMinResidents').value) || 1,
      max_residents: parseInt(document.getElementById('editMaxResidents').value) || null,
      bath_privacy: document.getElementById('editBathPrivacy').value || null,
      bath_fixture: document.getElementById('editBathFixture').value || null,
      gender_restriction: document.getElementById('editGenderRestriction').value || 'none',
      beds_king: parseInt(document.getElementById('editBedsKing').value) || 0,
      beds_queen: parseInt(document.getElementById('editBedsQueen').value) || 0,
      beds_double: parseInt(document.getElementById('editBedsDouble').value) || 0,
      beds_twin: parseInt(document.getElementById('editBedsTwin').value) || 0,
      beds_folding: parseInt(document.getElementById('editBedsFolding').value) || 0,
      beds_trifold: parseInt(document.getElementById('editBedsTrifold').value) || 0,
      is_listed: document.getElementById('editIsListed').checked,
      is_secret: document.getElementById('editIsSecret').checked,
      can_be_dwelling: document.getElementById('editCanBeDwelling').checked,
    };

    const { error } = await supabase
      .from('spaces')
      .update(updates)
      .eq('id', spaceId);

    if (error) throw error;

    alert('Space updated successfully!');
    editSpaceModal.classList.add('hidden');

    await loadData();
    render();

  } catch (error) {
    console.error('Error updating space:', error);
    alert('Failed to update space: ' + error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

// Move photo from edit modal
async function movePhotoInEdit(spaceId, photoId, direction) {
  await movePhoto(spaceId, photoId, direction);
  // Refresh the edit modal photos
  const space = spaces.find(s => s.id === spaceId);
  if (space) renderEditPhotos(space);
}

// Delete photo
async function deletePhoto(spaceId, photoId) {
  if (!authState?.isAdmin) {
    alert('Only admins can delete photos');
    return;
  }

  if (!confirm('Are you sure you want to delete this photo? This cannot be undone.')) {
    return;
  }

  try {
    // Remove the photo_spaces link
    const { error: unlinkError } = await supabase
      .from('photo_spaces')
      .delete()
      .eq('space_id', spaceId)
      .eq('photo_id', photoId);

    if (unlinkError) throw unlinkError;

    // Optionally delete the photo record itself
    // For now, we'll keep the photo record in case it's used elsewhere
    // const { error: deleteError } = await supabase
    //   .from('photos')
    //   .delete()
    //   .eq('id', photoId);

    alert('Photo removed!');

    await loadData();
    render();

    // Refresh the edit modal photos
    const space = spaces.find(s => s.id === spaceId);
    if (space) renderEditPhotos(space);

  } catch (error) {
    console.error('Error deleting photo:', error);
    alert('Failed to delete photo: ' + error.message);
  }
}

// Make functions globally accessible for onclick handlers
window.showSpaceDetail = showSpaceDetail;
window.openPhotoRequest = openPhotoRequest;
window.openPhotoUpload = openPhotoUpload;
window.movePhoto = movePhoto;
window.movePhotoInEdit = movePhotoInEdit;
window.deletePhoto = deletePhoto;
window.openEditSpace = openEditSpace;
