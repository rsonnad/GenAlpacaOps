// User Management - Admin only
import { supabase } from '../../shared/supabase.js';
import { initAuth, getAuthState, signOut, onAuthStateChange } from '../../shared/auth.js';

let authState = null;
let users = [];
let invitations = [];

// DOM elements
const loadingOverlay = document.getElementById('loadingOverlay');
const unauthorizedOverlay = document.getElementById('unauthorizedOverlay');
const appContent = document.getElementById('appContent');
const userInfo = document.getElementById('userInfo');
const pendingSection = document.getElementById('pendingSection');
const usersSection = document.getElementById('usersSection');
const pendingCount = document.getElementById('pendingCount');
const usersCount = document.getElementById('usersCount');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

async function init() {
  try {
    await initAuth();
    authState = getAuthState();

    // Must be authenticated
    if (!authState.isAuthenticated) {
      window.location.href = '/GenAlpacaOps/login/?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }

    // Must be admin
    if (!authState.isAdmin) {
      loadingOverlay.classList.add('hidden');
      unauthorizedOverlay.classList.remove('hidden');
      return;
    }

    // Show the app
    loadingOverlay.classList.add('hidden');
    appContent.classList.remove('hidden');

    // Update user info
    userInfo.textContent = authState.user?.displayName || authState.user?.email || '';

    // Listen for auth changes
    onAuthStateChange((state) => {
      authState = state;
      if (!state.isAdmin) {
        window.location.href = '/GenAlpacaOps/spaces/admin/';
      }
    });

    // Load data
    await loadUsers();
    await loadInvitations();
    render();
    setupEventListeners();

  } catch (error) {
    console.error('Init error:', error);
    loadingOverlay.innerHTML = `
      <div class="unauthorized-card">
        <h2>Error</h2>
        <p>${error.message}</p>
        <a href="/GenAlpacaOps/spaces/admin/" class="btn-secondary">Back to Admin</a>
      </div>
    `;
  }
}

function setupEventListeners() {
  // Sign out
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await signOut();
    window.location.href = '/GenAlpacaOps/spaces/';
  });

  // Invite form
  document.getElementById('inviteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('inviteEmail').value.trim().toLowerCase();
    const role = document.getElementById('inviteRole').value;
    await inviteUser(email, role);
  });
}

async function loadUsers() {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading users:', error);
    return;
  }

  users = data || [];
}

async function loadInvitations() {
  const { data, error } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('status', 'pending')
    .order('invited_at', { ascending: false });

  if (error) {
    console.error('Error loading invitations:', error);
    return;
  }

  invitations = data || [];
}

async function inviteUser(email, role) {
  // Validate email
  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address');
    return;
  }

  // Check if user already exists
  const existing = users.find(u => u.email.toLowerCase() === email);
  if (existing) {
    alert('This user already has an account');
    return;
  }

  // Check if invitation already pending
  const pendingInvite = invitations.find(i => i.email.toLowerCase() === email);
  if (pendingInvite) {
    alert('An invitation is already pending for this email');
    return;
  }

  try {
    const { error } = await supabase
      .from('user_invitations')
      .insert({
        email: email,
        role: role,
        invited_by: authState.appUser?.id
      });

    if (error) throw error;

    alert(`Invitation sent to ${email}`);
    document.getElementById('inviteEmail').value = '';

    await loadInvitations();
    render();

  } catch (error) {
    console.error('Error inviting user:', error);
    alert('Failed to send invitation: ' + error.message);
  }
}

async function revokeInvitation(invitationId) {
  if (!confirm('Revoke this invitation?')) return;

  try {
    const { error } = await supabase
      .from('user_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId);

    if (error) throw error;

    await loadInvitations();
    render();

  } catch (error) {
    console.error('Error revoking invitation:', error);
    alert('Failed to revoke: ' + error.message);
  }
}

async function updateUserRole(userId, newRole) {
  try {
    const { error } = await supabase
      .from('app_users')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) throw error;

    await loadUsers();
    render();

  } catch (error) {
    console.error('Error updating role:', error);
    alert('Failed to update role: ' + error.message);
  }
}

async function removeUser(userId) {
  if (!confirm('Remove this user? They will no longer be able to access admin features.')) return;

  try {
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    await loadUsers();
    render();

  } catch (error) {
    console.error('Error removing user:', error);
    alert('Failed to remove user: ' + error.message);
  }
}

function render() {
  renderInvitations();
  renderUsers();
}

function renderInvitations() {
  pendingCount.textContent = invitations.length;

  if (invitations.length === 0) {
    pendingSection.innerHTML = `
      <div class="empty-state">
        No pending invitations
      </div>
    `;
    return;
  }

  pendingSection.innerHTML = `
    <table class="users-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th>Invited</th>
          <th>Expires</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${invitations.map(inv => `
          <tr>
            <td>${inv.email}</td>
            <td><span class="role-badge ${inv.role}">${inv.role}</span></td>
            <td>${new Date(inv.invited_at).toLocaleDateString()}</td>
            <td>${new Date(inv.expires_at).toLocaleDateString()}</td>
            <td>
              <button class="btn-danger" onclick="revokeInvitation('${inv.id}')">Revoke</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderUsers() {
  usersCount.textContent = users.length;

  if (users.length === 0) {
    usersSection.innerHTML = `
      <div class="empty-state">
        No users yet
      </div>
    `;
    return;
  }

  const currentUserId = authState.appUser?.id;

  usersSection.innerHTML = `
    <table class="users-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Last Login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => {
          const isCurrentUser = u.id === currentUserId;
          return `
            <tr>
              <td>
                ${u.display_name || '-'}
                ${isCurrentUser ? '<span class="you-tag">You</span>' : ''}
              </td>
              <td>${u.email}</td>
              <td>
                <select
                  class="role-select"
                  data-user-id="${u.id}"
                  ${isCurrentUser ? 'disabled' : ''}
                  onchange="updateUserRole('${u.id}', this.value)"
                >
                  <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
              </td>
              <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}</td>
              <td>
                ${isCurrentUser
                  ? '-'
                  : `<button class="btn-danger" onclick="removeUser('${u.id}')">Remove</button>`
                }
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// Make functions globally accessible
window.revokeInvitation = revokeInvitation;
window.updateUserRole = updateUserRole;
window.removeUser = removeUser;
