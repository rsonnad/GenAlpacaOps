// Supabase configuration - UPDATE THESE
const SUPABASE_URL = 'https://aphrrfprbixmhissnjfn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HLlDPlIFASwZ2b8RmqpGng_zDvmJGYF';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// App state
let spaces = [];
let assignments = [];
let photoRequests = [];
let isAdminMode = false;
let currentView = 'card';
let currentSort = { column: 'name', direction: 'asc' };

// DOM elements
const cardView = document.getElementById('cardView');
const tableView = document.getElementById('tableView');
const tableBody = document.getElementById('tableBody');
const cardViewBtn = document.getElementById('cardViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const adminToggle = document.getElementById('adminToggle');
const modeBadge = document.getElementById('modeBadge');
const searchInput = document.getElementById('searchInput');
const priceFilter = document.getElementById('priceFilter');
const bathFilter = document.getElementById('bathFilter');
const availFilter = document.getElementById('availFilter');
const visibilityFilter = document.getElementById('visibilityFilter');
const clearFilters = document.getElementById('clearFilters');

// Modals
const photoRequestModal = document.getElementById('photoRequestModal');
const spaceDetailModal = document.getElementById('spaceDetailModal');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupEventListeners();
  render();
});

// Load data from Supabase
async function loadData() {
  try {
    // Load spaces with parent info and amenities
    const { data: spacesData, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        *,
        parent:parent_id(name),
        space_amenities(amenity:amenity_id(name)),
        photo_spaces(photo:photo_id(url, caption))
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
      .eq('status', 'active');
    
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
    
    // Map assignments to spaces
    spaces.forEach(space => {
      const assignment = assignments.find(a => 
        a.assignment_spaces?.some(as => as.space_id === space.id)
      );
      space.currentAssignment = assignment || null;
      space.amenities = space.space_amenities?.map(sa => sa.amenity?.name).filter(Boolean) || [];
      space.photos = space.photo_spaces?.map(ps => ps.photo).filter(Boolean) || [];
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
  
  // Admin toggle
  adminToggle.addEventListener('click', toggleAdminMode);
  
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
  
  // Modal close handlers
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
  
  // Close modals on backdrop click
  photoRequestModal.addEventListener('click', (e) => {
    if (e.target === photoRequestModal) photoRequestModal.classList.add('hidden');
  });
  spaceDetailModal.addEventListener('click', (e) => {
    if (e.target === spaceDetailModal) spaceDetailModal.classList.add('hidden');
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

function toggleAdminMode() {
  isAdminMode = !isAdminMode;
  document.body.classList.toggle('admin-mode', isAdminMode);
  adminToggle.classList.toggle('active', isAdminMode);
  adminToggle.textContent = isAdminMode ? 'Exit Admin' : 'Enter Admin';
  modeBadge.textContent = isAdminMode ? 'Admin' : 'Consumer';
  modeBadge.classList.toggle('admin', isAdminMode);
  render();
}

// Filtering
function getFilteredSpaces() {
  let filtered = [...spaces];
  
  // Consumer mode: only show listed, non-secret dwelling spaces
  if (!isAdminMode) {
    filtered = filtered.filter(s => s.is_listed && !s.is_secret && s.can_be_dwelling);
  } else {
    // Admin can still filter by dwelling
    filtered = filtered.filter(s => s.can_be_dwelling);
  }
  
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
  
  // Visibility filter (admin only)
  if (isAdminMode) {
    const visibility = visibilityFilter.value;
    if (visibility === 'listed') {
      filtered = filtered.filter(s => s.is_listed && !s.is_secret);
    } else if (visibility === 'unlisted') {
      filtered = filtered.filter(s => !s.is_listed);
    } else if (visibility === 'secret') {
      filtered = filtered.filter(s => s.is_secret);
    }
  }
  
  // Sort
  filtered.sort((a, b) => {
    let aVal = a[currentSort.column];
    let bVal = b[currentSort.column];
    
    // Handle occupant sorting
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

function renderCards(spaces) {
  cardView.innerHTML = spaces.map(space => {
    const isOccupied = !!space.currentAssignment;
    const occupant = space.currentAssignment?.person;
    const photo = space.photos[0];
    
    let badges = '';
    if (isOccupied) {
      badges += '<span class="badge occupied">Occupied</span>';
    } else {
      badges += '<span class="badge available">Available</span>';
    }
    if (isAdminMode) {
      if (space.is_secret) badges += '<span class="badge secret">Secret</span>';
      else if (!space.is_listed) badges += '<span class="badge unlisted">Unlisted</span>';
    }
    
    const beds = getBedSummary(space);
    const bathText = space.bath_privacy ? `${space.bath_privacy} bath` : '';
    
    let occupantHtml = '';
    if (isAdminMode && isOccupied) {
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
          ${space.parent ? `<div class="card-parent">in ${space.parent.name}</div>` : ''}
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
          <div class="card-actions">
            <button class="btn-small" onclick="event.stopPropagation(); openPhotoRequest('${space.id}', '${space.name}')">
              📷 Request Photo ${pendingRequests ? `(${pendingRequests})` : ''}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTable(spaces) {
  tableBody.innerHTML = spaces.map(space => {
    const isOccupied = !!space.currentAssignment;
    const occupant = space.currentAssignment?.person;
    const beds = getBedSummary(space);
    
    const occupantName = occupant 
      ? `${occupant.first_name} ${occupant.last_name || ''}`.trim()
      : '-';
    
    const endDate = space.currentAssignment?.end_date
      ? new Date(space.currentAssignment.end_date).toLocaleDateString()
      : '-';
    
    let statusBadge = isOccupied 
      ? '<span class="badge occupied">Occupied</span>'
      : '<span class="badge available">Available</span>';
    
    if (isAdminMode) {
      if (space.is_secret) statusBadge += ' <span class="badge secret">Secret</span>';
      else if (!space.is_listed) statusBadge += ' <span class="badge unlisted">Unlisted</span>';
    }
    
    return `
      <tr onclick="showSpaceDetail('${space.id}')" style="cursor:pointer;">
        <td><strong>${space.name}</strong>${space.parent ? `<br><small style="color:var(--text-muted)">in ${space.parent.name}</small>` : ''}</td>
        <td>${space.monthly_rate ? `$${space.monthly_rate}/mo` : '-'}</td>
        <td>${space.sq_footage || '-'}</td>
        <td>${beds || '-'}</td>
        <td>${space.bath_privacy || '-'}</td>
        <td>${space.amenities.slice(0, 3).join(', ') || '-'}</td>
        <td class="admin-only">${occupantName}</td>
        <td class="admin-only">${endDate}</td>
        <td class="admin-only">${statusBadge}</td>
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
  
  document.getElementById('detailSpaceName').textContent = space.name;
  
  const isOccupied = !!space.currentAssignment;
  const occupant = space.currentAssignment?.person;
  
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
  
  let occupantHtml = '';
  if (isAdminMode && isOccupied) {
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
  if (isAdminMode && space.photoRequests?.length) {
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
    ${isAdminMode ? `
      <div style="margin-top:1rem;">
        <button class="btn-primary" onclick="openPhotoRequest('${space.id}', '${space.name}')">
          📷 Request Photo
        </button>
      </div>
    ` : ''}
  `;
  
  spaceDetailModal.classList.remove('hidden');
}

// Photo request handling
let currentPhotoRequestSpaceId = null;

function openPhotoRequest(spaceId, spaceName) {
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
        requested_by: 'admin' // Could be a real user ID later
      });
    
    if (error) throw error;
    
    alert('Photo request submitted!');
    photoRequestModal.classList.add('hidden');
    
    // Reload data to reflect new request
    await loadData();
    render();
    
  } catch (error) {
    console.error('Error submitting photo request:', error);
    alert('Failed to submit request. Check console for details.');
  }
}

// Make functions globally accessible
window.showSpaceDetail = showSpaceDetail;
window.openPhotoRequest = openPhotoRequest;
