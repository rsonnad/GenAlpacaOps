// Admin view - Full access interface with authentication
import { supabase } from '../../shared/supabase.js';
import { initAuth, getAuthState, signOut, onAuthStateChange } from '../../shared/auth.js';
import { mediaService } from '../../shared/media-service.js';

// App state
let spaces = [];
let assignments = [];
let photoRequests = [];
let authState = null;
let currentView = 'card';
let currentSort = { column: 'availability', direction: 'asc' };
let allTags = [];
let storageUsage = null;

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
    // Load spaces with all related data (using new media tables)
    const { data: spacesData, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        *,
        parent:parent_id(name),
        space_amenities(amenity:amenity_id(name)),
        media_spaces(
          display_order,
          is_primary,
          media:media_id(
            id,
            url,
            caption,
            title,
            media_type,
            category,
            file_size_bytes,
            media_tag_assignments(tag:tag_id(id,name,color,tag_group))
          )
        )
      `)
      .order('name');

    if (spacesError) throw spacesError;

    // Load all tags for tagging UI
    allTags = await mediaService.getTags();

    // Check storage usage
    storageUsage = await mediaService.getStorageUsage();

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

      // Process media (new system) - flatten and add tags
      space.photos = (space.media_spaces || [])
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map(ms => {
          if (!ms.media) return null;
          return {
            ...ms.media,
            display_order: ms.display_order,
            is_primary: ms.is_primary,
            tags: ms.media.media_tag_assignments?.map(mta => mta.tag).filter(Boolean) || []
          };
        })
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

  // Media picker tab switching
  document.querySelectorAll('.media-picker-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMediaPickerTab(btn.dataset.tab));
  });

  // Library tab handlers
  document.getElementById('cancelLibrarySelect')?.addEventListener('click', () => {
    photoUploadModal.classList.add('hidden');
  });
  document.getElementById('submitLibrarySelect')?.addEventListener('click', handleLibrarySelect);
  document.getElementById('libraryCategoryFilter')?.addEventListener('change', (e) => {
    activeLibraryFilters.category = e.target.value;
    loadLibraryMedia();
  });

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

// Photo ordering (detail view)
async function movePhoto(spaceId, mediaId, direction) {
  if (!authState?.isAdmin) {
    alert('Only admins can reorder photos');
    return;
  }

  const space = spaces.find(s => s.id === spaceId);
  if (!space) return;

  const photos = [...space.photos];
  const idx = photos.findIndex(p => p.id === mediaId);
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
    const mediaIds = photos.map(p => p.id);
    await mediaService.reorderInSpace(spaceId, mediaIds);

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
let currentUploadContext = null; // 'dwelling', 'event', 'projects', etc.
let selectedLibraryMedia = new Set();
let libraryMedia = [];
let activeLibraryFilters = { tags: [], category: '' };

function openPhotoUpload(spaceId, spaceName, context = 'dwelling') {
  if (!authState?.isAdmin) {
    alert('Only admins can upload photos');
    return;
  }
  currentUploadSpaceId = spaceId;
  currentUploadContext = context;
  selectedLibraryMedia.clear();
  selectedUploadFiles = [];

  document.getElementById('uploadModalSpaceName').textContent = spaceName;
  document.getElementById('photoFile').value = '';
  document.getElementById('photoBulkCaption').value = '';
  document.getElementById('uploadPreviewGrid').innerHTML = '';
  document.getElementById('bulkTagSection')?.classList.add('hidden');
  document.getElementById('uploadProgress')?.classList.add('hidden');

  // Set default category based on context
  const categorySelect = document.getElementById('photoCategory');
  if (categorySelect) {
    categorySelect.value = context === 'projects' ? 'projects' : 'mktg';
  }

  // Populate tags with context-aware defaults
  renderUploadTags();

  // Show auto-tag hint
  const autoTagHint = document.getElementById('autoTagHint');
  if (autoTagHint) {
    const autoTags = getAutoTagsForContext(context);
    autoTagHint.textContent = autoTags.length
      ? `Auto-tagged: ${autoTags.join(', ')}`
      : '';
  }

  // Show storage usage
  updateStorageIndicator();

  // Reset to upload tab
  switchMediaPickerTab('upload');

  // Load library for the library tab
  loadLibraryMedia();

  // Render tag filter chips
  renderLibraryTagFilter();

  photoUploadModal.classList.remove('hidden');
}

function getAutoTagsForContext(context) {
  switch (context) {
    case 'dwelling':
      return ['listing'];
    case 'event':
      return ['listing'];
    case 'projects':
      return ['in-progress'];
    case 'social':
      return ['social'];
    default:
      return ['listing'];
  }
}

function switchMediaPickerTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.media-picker-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.getElementById('uploadTab').classList.toggle('active', tabName === 'upload');
  document.getElementById('libraryTab').classList.toggle('active', tabName === 'library');
}

function renderUploadTags() {
  const container = document.getElementById('uploadTagsContainer');
  if (!container) return;

  // Get auto-tags for current context
  const autoTags = getAutoTagsForContext(currentUploadContext);

  // Group tags by tag_group
  const grouped = {};
  allTags.forEach(tag => {
    const group = tag.tag_group || 'other';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(tag);
  });

  // Render grouped checkboxes
  container.innerHTML = Object.entries(grouped).map(([group, tags]) => `
    <div class="tag-group">
      <div class="tag-group-label">${group}</div>
      <div class="tag-checkboxes">
        ${tags.map(tag => {
          const isAuto = autoTags.includes(tag.name);
          return `
            <label class="tag-checkbox" style="--tag-color: ${tag.color || '#666'}">
              <input type="checkbox" value="${tag.name}" ${isAuto ? 'checked' : ''}>
              <span class="tag-chip">${tag.name}</span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function updateStorageIndicator() {
  const indicator = document.getElementById('storageIndicator');
  if (!indicator || !storageUsage) return;

  const percent = storageUsage.percent_used || 0;
  const used = mediaService.formatBytes(storageUsage.current_bytes || 0);
  const limit = mediaService.formatBytes(storageUsage.limit_bytes || 0);

  let colorClass = 'storage-ok';
  if (percent >= 90) colorClass = 'storage-critical';
  else if (percent >= 70) colorClass = 'storage-warning';

  indicator.innerHTML = `
    <div class="storage-bar ${colorClass}">
      <div class="storage-fill" style="width: ${Math.min(percent, 100)}%"></div>
    </div>
    <div class="storage-text">${used} / ${limit} (${percent.toFixed(1)}%)</div>
  `;
}

// Library tab functions
async function loadLibraryMedia() {
  try {
    libraryMedia = await mediaService.search({
      category: activeLibraryFilters.category || null,
      tags: activeLibraryFilters.tags,
      limit: 100,
    });
    renderLibraryGrid();
  } catch (error) {
    console.error('Error loading library:', error);
    libraryMedia = [];
    renderLibraryGrid();
  }
}

function renderLibraryTagFilter() {
  const container = document.getElementById('libraryTagFilter');
  if (!container) return;

  // Show purpose and room tags as filter chips
  const filterableTags = allTags.filter(t =>
    ['purpose', 'room', 'condition'].includes(t.tag_group)
  );

  container.innerHTML = filterableTags.map(tag => `
    <button type="button"
      class="tag-filter-chip ${activeLibraryFilters.tags.includes(tag.name) ? 'active' : ''}"
      data-tag="${tag.name}"
      onclick="toggleLibraryTagFilter('${tag.name}')"
    >${tag.name}</button>
  `).join('');
}

function toggleLibraryTagFilter(tagName) {
  const idx = activeLibraryFilters.tags.indexOf(tagName);
  if (idx >= 0) {
    activeLibraryFilters.tags.splice(idx, 1);
  } else {
    activeLibraryFilters.tags.push(tagName);
  }
  renderLibraryTagFilter();
  loadLibraryMedia();
}

function renderLibraryGrid() {
  const container = document.getElementById('libraryMediaGrid');
  if (!container) return;

  if (!libraryMedia || libraryMedia.length === 0) {
    container.innerHTML = `
      <div class="library-empty">
        <p>No media found${activeLibraryFilters.tags.length ? ' matching filters' : ''}.</p>
        <p style="font-size: 0.8rem; margin-top: 0.5rem;">Try uploading new media or adjusting filters.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = libraryMedia.map(media => {
    const isSelected = selectedLibraryMedia.has(media.id);
    const tagsHtml = media.tags?.slice(0, 3).map(t => `<span class="tag-chip">${t.name}</span>`).join('') || '';

    return `
      <div class="library-media-item ${isSelected ? 'selected' : ''}"
           data-media-id="${media.id}"
           onclick="toggleLibraryMediaSelection('${media.id}')">
        <img src="${media.url}" alt="${media.caption || 'Media'}">
        ${tagsHtml ? `<div class="media-info">${tagsHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  updateLibrarySelectButton();
}

function toggleLibraryMediaSelection(mediaId) {
  if (selectedLibraryMedia.has(mediaId)) {
    selectedLibraryMedia.delete(mediaId);
  } else {
    selectedLibraryMedia.add(mediaId);
  }
  renderLibraryGrid();
}

function updateLibrarySelectButton() {
  const btn = document.getElementById('submitLibrarySelect');
  if (!btn) return;

  const count = selectedLibraryMedia.size;
  btn.disabled = count === 0;
  btn.textContent = `Add Selected (${count})`;
}

async function handleLibrarySelect() {
  if (selectedLibraryMedia.size === 0) return;

  const submitBtn = document.getElementById('submitLibrarySelect');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';

  try {
    // Get current max display_order for the space
    const space = spaces.find(s => s.id === currentUploadSpaceId);
    let displayOrder = space?.photos?.length || 0;

    // Link each selected media to the space
    for (const mediaId of selectedLibraryMedia) {
      await mediaService.linkToSpace(mediaId, currentUploadSpaceId, displayOrder);
      displayOrder++;
    }

    alert(`Added ${selectedLibraryMedia.size} media item(s) to space.`);
    photoUploadModal.classList.add('hidden');

    await loadData();
    render();

  } catch (error) {
    console.error('Error adding media from library:', error);
    alert('Failed to add media: ' + error.message);
  } finally {
    submitBtn.disabled = false;
    updateLibrarySelectButton();
  }
}

// Track selected files for upload
let selectedUploadFiles = [];

function handleFilePreview(e) {
  const files = Array.from(e.target.files);
  if (!files.length) {
    selectedUploadFiles = [];
    renderUploadPreviews();
    return;
  }

  selectedUploadFiles = files.map((file, idx) => ({
    file,
    id: `file-${Date.now()}-${idx}`,
    caption: '',
    preview: null
  }));

  // Load previews for each file
  selectedUploadFiles.forEach((item, idx) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      item.preview = e.target.result;
      renderUploadPreviews();
    };
    reader.readAsDataURL(item.file);
  });

  renderUploadPreviews();
}

function renderUploadPreviews() {
  const grid = document.getElementById('uploadPreviewGrid');
  const bulkSection = document.getElementById('bulkTagSection');
  const fileCountEl = document.getElementById('fileCount');
  const submitBtn = document.getElementById('submitPhotoUpload');

  if (!grid) return;

  // Update file count and show/hide bulk section
  const count = selectedUploadFiles.length;
  if (fileCountEl) fileCountEl.textContent = count;
  if (bulkSection) bulkSection.classList.toggle('hidden', count <= 1);
  if (submitBtn) submitBtn.textContent = count > 1 ? `Upload All (${count})` : 'Upload';

  if (count === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = selectedUploadFiles.map((item, idx) => `
    <div class="upload-preview-item" data-file-id="${item.id}">
      ${item.preview
        ? `<img src="${item.preview}" alt="Preview ${idx + 1}">`
        : `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:var(--bg);color:var(--text-muted);font-size:0.75rem;">Loading...</div>`
      }
      <span class="preview-index">${idx + 1}</span>
      <button type="button" class="preview-remove" onclick="removeUploadFile('${item.id}')" title="Remove">×</button>
      <div class="preview-caption">
        <input type="text"
          placeholder="Caption..."
          value="${item.caption}"
          onchange="updateFileCaption('${item.id}', this.value)"
          onclick="event.stopPropagation()">
      </div>
    </div>
  `).join('');
}

function removeUploadFile(fileId) {
  selectedUploadFiles = selectedUploadFiles.filter(f => f.id !== fileId);
  renderUploadPreviews();

  // Also clear the file input if all removed
  if (selectedUploadFiles.length === 0) {
    document.getElementById('photoFile').value = '';
  }
}

function updateFileCaption(fileId, caption) {
  const item = selectedUploadFiles.find(f => f.id === fileId);
  if (item) item.caption = caption;
}

async function handlePhotoUpload() {
  if (!authState?.isAdmin) {
    alert('Only admins can upload photos');
    return;
  }

  // Check if we have files to upload
  if (selectedUploadFiles.length === 0) {
    alert('Please select at least one image.');
    return;
  }

  const bulkCaption = document.getElementById('photoBulkCaption')?.value.trim() || '';
  const category = document.getElementById('photoCategory')?.value || 'mktg';

  // Get selected tags (apply to all)
  const selectedTags = [];
  document.querySelectorAll('#uploadTagsContainer input[type="checkbox"]:checked').forEach(cb => {
    selectedTags.push(cb.value);
  });

  const submitBtn = document.getElementById('submitPhotoUpload');
  const progressContainer = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressText = document.getElementById('uploadProgressText');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';

  // Show progress for multiple files
  if (selectedUploadFiles.length > 1 && progressContainer) {
    progressContainer.classList.remove('hidden');
  }

  let successCount = 0;
  let failCount = 0;
  const totalFiles = selectedUploadFiles.length;

  try {
    for (let i = 0; i < selectedUploadFiles.length; i++) {
      const item = selectedUploadFiles[i];

      // Update progress
      if (progressFill) progressFill.style.width = `${((i) / totalFiles) * 100}%`;
      if (progressText) progressText.textContent = `Uploading ${i + 1} of ${totalFiles}...`;

      // Use per-file caption if set, otherwise bulk caption
      const caption = item.caption || bulkCaption;

      try {
        const result = await mediaService.upload(item.file, {
          category,
          caption,
          tags: selectedTags,
          spaceId: currentUploadSpaceId,
        });

        if (result.success) {
          successCount++;
        } else {
          console.error(`Failed to upload ${item.file.name}:`, result.error);
          failCount++;
        }
      } catch (err) {
        console.error(`Error uploading ${item.file.name}:`, err);
        failCount++;
      }
    }

    // Final progress
    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = 'Complete!';

    // Show results
    if (failCount === 0) {
      if (successCount === 1) {
        alert('Photo uploaded successfully!');
      } else {
        alert(`${successCount} photos uploaded successfully!`);
      }
    } else {
      alert(`Uploaded ${successCount} of ${totalFiles} photos.\n${failCount} failed - check console for details.`);
    }

    // Refresh storage usage
    storageUsage = await mediaService.getStorageUsage();
    if (storageUsage && storageUsage.percent_used >= 80) {
      alert(`Warning: Storage is ${storageUsage.percent_used.toFixed(1)}% full.`);
    }

    photoUploadModal.classList.add('hidden');

    await loadData();
    render();

  } catch (error) {
    console.error('Error during upload:', error);
    alert('Upload failed: ' + error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = selectedUploadFiles.length > 1 ? `Upload All (${selectedUploadFiles.length})` : 'Upload';
    if (progressContainer) progressContainer.classList.add('hidden');
    selectedUploadFiles = [];
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

  container.innerHTML = space.photos.map((photo, idx) => {
    // Show tags if available
    const tagsHtml = photo.tags?.length
      ? `<div class="photo-tags">${photo.tags.slice(0, 3).map(t => `<span class="photo-tag">${t.name}</span>`).join('')}</div>`
      : '';

    // Show primary badge
    const primaryBadge = photo.is_primary ? '<span class="photo-tag" style="background: var(--accent);">Primary</span>' : '';

    return `
      <div class="edit-photo-item" data-photo-id="${photo.id}">
        <img src="${photo.url}" alt="${photo.caption || 'Photo ' + (idx + 1)}">
        ${tagsHtml}
        <span class="photo-order">#${idx + 1} ${primaryBadge}</span>
        <div class="photo-controls">
          <button type="button" onclick="event.preventDefault(); event.stopPropagation(); movePhotoInEdit('${space.id}', '${photo.id}', 'up')" ${idx === 0 ? 'disabled' : ''}>↑ Up</button>
          <button type="button" onclick="event.preventDefault(); event.stopPropagation(); movePhotoInEdit('${space.id}', '${photo.id}', 'down')" ${idx === space.photos.length - 1 ? 'disabled' : ''}>↓ Down</button>
          <button type="button" class="btn-delete" onclick="event.preventDefault(); event.stopPropagation(); removePhotoFromSpace('${space.id}', '${photo.id}')">× Remove</button>
        </div>
      </div>
    `;
  }).join('');
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

// Move photo from edit modal (optimistic update for performance)
async function movePhotoInEdit(spaceId, mediaId, direction) {
  if (!authState?.isAdmin) {
    alert('Only admins can reorder photos');
    return;
  }

  const space = spaces.find(s => s.id === spaceId);
  if (!space) return;

  const photos = [...space.photos];
  const idx = photos.findIndex(p => p.id === mediaId);
  if (idx === -1) return;

  let newIdx;
  switch (direction) {
    case 'up':
      newIdx = Math.max(0, idx - 1);
      break;
    case 'down':
      newIdx = Math.min(photos.length - 1, idx + 1);
      break;
    default:
      return;
  }

  if (newIdx === idx) return;

  // Optimistic update - move in local array immediately
  const [photo] = photos.splice(idx, 1);
  photos.splice(newIdx, 0, photo);
  space.photos = photos;

  // Re-render immediately for snappy UI
  renderEditPhotos(space);

  // Sync to database in background using media service
  try {
    const mediaIds = photos.map(p => p.id);
    await mediaService.reorderInSpace(spaceId, mediaIds);
  } catch (error) {
    console.error('Error saving photo order:', error);
    // Silently fail - the visual order is already updated
  }
}

// Remove photo from space (unlinks, doesn't delete the actual media file)
async function removePhotoFromSpace(spaceId, mediaId) {
  if (!authState?.isAdmin) {
    alert('Only admins can remove photos');
    return;
  }

  try {
    // Use media service to unlink
    await mediaService.unlinkFromSpace(mediaId, spaceId);

    // Update local data without full reload (keeps modal open)
    const space = spaces.find(s => s.id === spaceId);
    if (space) {
      space.photos = space.photos.filter(p => p.id !== mediaId);
      renderEditPhotos(space);
    }

  } catch (error) {
    console.error('Error removing photo:', error);
    alert('Failed to remove photo: ' + error.message);
  }
}

// Permanently delete media (removes file from storage too)
async function deleteMedia(mediaId) {
  if (!authState?.isAdmin) {
    alert('Only admins can delete media');
    return;
  }

  if (!confirm('Permanently delete this media? This cannot be undone.')) {
    return;
  }

  try {
    const result = await mediaService.delete(mediaId);
    if (!result.success) {
      throw new Error(result.error);
    }

    await loadData();
    render();
    alert('Media deleted successfully.');
  } catch (error) {
    console.error('Error deleting media:', error);
    alert('Failed to delete: ' + error.message);
  }
}

// Make functions globally accessible for onclick handlers
window.showSpaceDetail = showSpaceDetail;
window.openPhotoRequest = openPhotoRequest;
window.openPhotoUpload = openPhotoUpload;
window.movePhoto = movePhoto;
window.movePhotoInEdit = movePhotoInEdit;
window.removePhotoFromSpace = removePhotoFromSpace;
window.deleteMedia = deleteMedia;
window.openEditSpace = openEditSpace;
window.mediaService = mediaService;
window.toggleLibraryTagFilter = toggleLibraryTagFilter;
window.toggleLibraryMediaSelection = toggleLibraryMediaSelection;
window.switchMediaPickerTab = switchMediaPickerTab;
window.removeUploadFile = removeUploadFile;
window.updateFileCaption = updateFileCaption;
