// Authentication module for Google SSO with role-based access control
import { supabase } from './supabase.js';

// Auth state
let currentUser = null;
let currentAppUser = null;
let currentRole = 'public';
let authStateListeners = [];

/**
 * Initialize authentication and check for existing session
 * @returns {Promise<{user: object|null, role: string}>}
 */
export async function initAuth() {
  // Check for existing session
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error);
  }

  if (session) {
    await handleAuthChange(session);
  }

  // Listen for auth changes (login, logout, token refresh)
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event);

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      await handleAuthChange(session);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentAppUser = null;
      currentRole = 'public';
      notifyListeners();
    }
  });

  return { user: currentUser, role: currentRole };
}

/**
 * Handle auth state changes - fetch user role from app_users
 */
async function handleAuthChange(session) {
  if (!session?.user) {
    currentUser = null;
    currentAppUser = null;
    currentRole = 'public';
    notifyListeners();
    return;
  }

  currentUser = session.user;

  // Fetch user record from app_users table
  const { data: appUser, error } = await supabase
    .from('app_users')
    .select('id, role, display_name, email')
    .eq('auth_user_id', session.user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error('Error fetching app_user:', error);
  }

  if (appUser) {
    currentAppUser = appUser;
    currentRole = appUser.role;
    currentUser.displayName = appUser.display_name || currentUser.user_metadata?.full_name || currentUser.email;

    // Update last login timestamp
    await supabase
      .from('app_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('auth_user_id', session.user.id);
  } else {
    // User not in app_users - check for pending invitation
    const userEmail = session.user.email?.toLowerCase();
    const { data: invitation, error: invError } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('email', userEmail)
      .eq('status', 'pending')
      .single();

    if (invitation && !invError) {
      // Found a pending invitation - automatically create app_users record
      const displayName = session.user.user_metadata?.full_name || userEmail.split('@')[0];

      const { data: newAppUser, error: createError } = await supabase
        .from('app_users')
        .insert({
          auth_user_id: session.user.id,
          email: userEmail,
          display_name: displayName,
          role: invitation.role,
          invited_by: invitation.invited_by,
        })
        .select()
        .single();

      if (!createError && newAppUser) {
        // Mark invitation as accepted
        await supabase
          .from('user_invitations')
          .update({ status: 'accepted' })
          .eq('id', invitation.id);

        currentAppUser = newAppUser;
        currentRole = newAppUser.role;
        currentUser.displayName = displayName;
      } else {
        console.error('Error creating app_user from invitation:', createError);
        currentAppUser = null;
        currentRole = 'unauthorized';
        currentUser.displayName = session.user.user_metadata?.full_name || session.user.email;
      }
    } else {
      // No invitation - unauthorized
      currentAppUser = null;
      currentRole = 'unauthorized';
      currentUser.displayName = session.user.user_metadata?.full_name || session.user.email;
    }
  }

  notifyListeners();
}

/**
 * Sign in with Google OAuth
 * @param {string} redirectTo - URL to redirect to after sign in
 */
export async function signInWithGoogle(redirectTo) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || window.location.origin + '/GenAlpacaOps/spaces/admin/',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Sign in error:', error);
    throw error;
  }

  return data;
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign out error:', error);
    throw error;
  }

  currentUser = null;
  currentAppUser = null;
  currentRole = 'public';
  notifyListeners();
}

/**
 * Get the current authentication state
 * @returns {{user: object|null, appUser: object|null, role: string, isAuthenticated: boolean, isAdmin: boolean, isStaff: boolean, isAuthorized: boolean}}
 */
export function getAuthState() {
  return {
    user: currentUser,
    appUser: currentAppUser,
    role: currentRole,
    isAuthenticated: currentUser !== null,
    isAdmin: currentRole === 'admin',
    isStaff: currentRole === 'staff' || currentRole === 'admin',
    isAuthorized: currentRole === 'admin' || currentRole === 'staff',
    isUnauthorized: currentRole === 'unauthorized',
  };
}

/**
 * Subscribe to auth state changes
 * @param {function} callback - Called with auth state on changes
 * @returns {function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  authStateListeners.push(callback);

  // Return unsubscribe function
  return () => {
    authStateListeners = authStateListeners.filter(cb => cb !== callback);
  };
}

/**
 * Notify all listeners of auth state change
 */
function notifyListeners() {
  const state = getAuthState();
  authStateListeners.forEach(cb => cb(state));
}

/**
 * Guard: Require authentication, redirect to login if not authenticated
 * @param {string} redirectUrl - URL to redirect to if not authenticated
 * @returns {boolean} True if authenticated
 */
export function requireAuth(redirectUrl = '/GenAlpacaOps/login/') {
  const state = getAuthState();

  if (!state.isAuthenticated) {
    const currentPath = window.location.pathname;
    window.location.href = redirectUrl + '?redirect=' + encodeURIComponent(currentPath);
    return false;
  }

  return true;
}

/**
 * Guard: Require a specific role, redirect if insufficient permissions
 * @param {string} role - Required role ('admin' or 'staff')
 * @param {string} redirectUrl - URL to redirect to if unauthorized
 * @returns {boolean} True if user has required role
 */
export function requireRole(role, redirectUrl = '/GenAlpacaOps/spaces/') {
  const state = getAuthState();

  if (!state.isAuthenticated) {
    const currentPath = window.location.pathname;
    window.location.href = '/GenAlpacaOps/login/?redirect=' + encodeURIComponent(currentPath);
    return false;
  }

  if (state.isUnauthorized) {
    // User logged in but not in app_users - show unauthorized message
    return false;
  }

  if (role === 'admin' && !state.isAdmin) {
    alert('Admin access required');
    window.location.href = redirectUrl;
    return false;
  }

  if (role === 'staff' && !state.isStaff) {
    alert('Staff access required');
    window.location.href = redirectUrl;
    return false;
  }

  return true;
}

/**
 * Check if user can perform admin actions (for conditional UI)
 * @returns {boolean}
 */
export function canEdit() {
  return getAuthState().isAdmin;
}

/**
 * Check if user can view all data including unlisted/secret
 * @returns {boolean}
 */
export function canViewAll() {
  return getAuthState().isStaff;
}
