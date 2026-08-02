// ═══════════════════════════════════════════════════
//  js/auth.js
//  - Login: works immediately, no OTP needed
//  - Register: sends OTP via EmailJS, then creates account
//  - If EmailJS not configured: skips OTP, creates account directly
//  - Google sign-in: always works
// ═══════════════════════════════════════════════════

import { auth } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─────────────────────────────────────────────
//  EMAILJS CONFIG
//  Replace with your keys from emailjs.com
//  Leave as-is to skip OTP and register directly
// ─────────────────────────────────────────────
const EMAILJS = {
  publicKey:  'YOUR_EMAILJS_PUBLIC_KEY',
  serviceId:  'YOUR_EMAILJS_SERVICE_ID',
  templateId: 'YOUR_EMAILJS_TEMPLATE_ID',
};

const EMAILJS_CONFIGURED = !EMAILJS.publicKey.includes('YOUR_');

// ─────────────────────────────────────────────
//  OTP STATE
// ─────────────────────────────────────────────
let _otp         = '';
let _otpExpiry   = 0;
let _otpEmail    = '';
let _otpAttempts = 0;
let pendingEmail = '';
let pendingPass  = '';
let pendingName  = '';
let resendTimer  = null;
let expiryTimer  = null;

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_MAX_TRIES = 5;

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
const showErr  = m => { const e = document.getElementById('auth-error'); if(e){ e.textContent=m; e.style.display='block'; }};
const clearErr = ()  => { const e = document.getElementById('auth-error'); if(e) e.style.display='none'; };
const setBtn   = (id, dis, txt) => { const b = document.getElementById(id); if(b){ b.disabled=dis; b.textContent=txt; }};
const show     = id  => { const e = document.getElementById(id); if(e) e.style.display='block'; };
const hide     = id  => { const e = document.getElementById(id); if(e) e.style.display='none'; };

// ─────────────────────────────────────────────
//  AUTH TABS
// ─────────────────────────────────────────────
export const showAuthTab = tab => {
  const login = tab === 'login';
  document.getElementById('login-form').style.display    = login ? '' : 'none';
  document.getElementById('register-form').style.display = login ? 'none' : '';
  document.getElementById('tab-login').classList.toggle('active', login);
  document.getElementById('tab-register').classList.toggle('active', !login);
  clearErr();
};

// ─────────────────────────────────────────────
//  LOGIN — always works, no OTP
// ─────────────────────────────────────────────
export const loginUser = async () => {
  clearErr();
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) return showErr('Please fill in all fields.');
  setBtn('login-btn', true, 'Signing in…');
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    // Mark existing users as verified on login so they can always get in
    localStorage.setItem(`ss_verified_${cred.user.uid}`, '1');
  } catch(e) {
    showErr(friendlyError(e.code));
  } finally {
    setBtn('login-btn', false, 'Sign In');
  }
};

// ─────────────────────────────────────────────
//  REGISTER
//  If EmailJS configured → send OTP first
//  If not configured     → create account directly
// ─────────────────────────────────────────────
export const registerUser = async () => {
  clearErr();
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;

  if (!name)           return showErr('Please enter your name.');
  if (!email)          return showErr('Please enter your email.');
  if (pass.length < 6) return showErr('Password must be at least 6 characters.');
  if (pass !== pass2)  return showErr('Passwords do not match.');

  pendingEmail = email;
  pendingPass  = pass;
  pendingName  = name;

  // ── If EmailJS not set up, skip OTP and register directly ──
  if (!EMAILJS_CONFIGURED) {
    setBtn('register-btn', true, 'Creating account…');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      localStorage.setItem(`ss_verified_${cred.user.uid}`, '1');
      // onAuthStateChanged fires and lets user in
    } catch(e) {
      showErr(friendlyError(e.code));
    } finally {
      setBtn('register-btn', false, 'Create Account');
    }
    return;
  }

  // ── EmailJS configured → send OTP ──
  setBtn('register-btn', true, 'Sending OTP…');
  try {
    _otp         = generateOTP();
    _otpExpiry   = Date.now() + OTP_EXPIRY_MS;
    _otpEmail    = email;
    _otpAttempts = 0;

    await sendOTPEmail(email, name, _otp);
    showOTPScreen(email);
  } catch(e) {
    console.error('OTP send failed:', e);
    showErr('Could not send OTP. Check your EmailJS keys in js/auth.js, or leave them blank to skip OTP.');
  } finally {
    setBtn('register-btn', false, 'Create Account');
  }
};

// ─────────────────────────────────────────────
//  EMAILJS
// ─────────────────────────────────────────────
const loadEmailJS = () => new Promise((resolve, reject) => {
  if (window.emailjs) { window.emailjs.init(EMAILJS.publicKey); return resolve(); }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  s.onload  = () => { window.emailjs.init(EMAILJS.publicKey); resolve(); };
  s.onerror = () => reject(new Error('EmailJS failed to load'));
  document.head.appendChild(s);
});

const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

const sendOTPEmail = async (email, name, otp) => {
  await loadEmailJS();
  return window.emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, {
    to_email:   email,
    to_name:    name || email.split('@')[0],
    otp_code:   otp,
    passcode:   otp,
    expires_in: '10 minutes',
    time:       '10 minutes',
    app_name:   'StudySync',
    year:       new Date().getFullYear(),
  });
};

// ─────────────────────────────────────────────
//  OTP SCREEN
// ─────────────────────────────────────────────
const showOTPScreen = email => {
  hide('login-form');
  hide('register-form');
  hide('verify-notice');
  document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = 'none');
  show('otp-screen');
  const el = document.getElementById('otp-sent-email');
  if (el) el.textContent = email;
  clearErr();
  clearOTPInputs();
  setTimeout(() => document.getElementById('otp-1')?.focus(), 100);
  startCooldown(60);
  startExpiryCountdown();
};

// ─────────────────────────────────────────────
//  OTP INPUT HANDLERS
// ─────────────────────────────────────────────
export const otpKeyUp = (e, idx) => {
  const val = e.target.value.replace(/\D/g, '');
  e.target.value = val.slice(-1);
  if (val && idx < 6) document.getElementById(`otp-${idx+1}`)?.focus();
  if (e.key === 'Backspace' && !e.target.value && idx > 1) document.getElementById(`otp-${idx-1}`)?.focus();
  if (getOTPValue().length === 6) verifyOTP();
};

export const otpPaste = e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
  text.split('').forEach((ch, i) => { const inp = document.getElementById(`otp-${i+1}`); if(inp) inp.value = ch; });
  if (text.length === 6) setTimeout(verifyOTP, 100);
  else document.getElementById(`otp-${text.length+1}`)?.focus();
};

const getOTPValue    = () => [1,2,3,4,5,6].map(i => document.getElementById(`otp-${i}`)?.value||'').join('');
const clearOTPInputs = () => [1,2,3,4,5,6].forEach(i => { const e = document.getElementById(`otp-${i}`); if(e) e.value=''; });

// ─────────────────────────────────────────────
//  VERIFY OTP → create Firebase account
// ─────────────────────────────────────────────
export const verifyOTP = async () => {
  clearErr();
  const entered = getOTPValue();
  if (entered.length < 6) return;

  if (Date.now() > _otpExpiry) {
    showErr('OTP expired. Click Resend to get a new one.');
    clearOTPInputs();
    return;
  }
  if (_otpAttempts >= OTP_MAX_TRIES) {
    showErr('Too many wrong attempts. Request a new OTP.');
    clearOTPInputs();
    return;
  }
  if (entered !== _otp) {
    _otpAttempts++;
    const left = OTP_MAX_TRIES - _otpAttempts;
    showErr(`Wrong code. ${left} attempt${left!==1?'s':''} left.`);
    clearOTPInputs();
    document.getElementById('otp-1')?.focus();
    const wrap = document.querySelector('.otp-inputs');
    if (wrap) { wrap.classList.add('shake'); setTimeout(() => wrap.classList.remove('shake'), 500); }
    return;
  }

  // ✅ Correct OTP
  const btn = document.getElementById('verify-otp-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
  clearErr();

  try {
    const cred = await createUserWithEmailAndPassword(auth, pendingEmail, pendingPass);
    await updateProfile(cred.user, { displayName: pendingName });
    localStorage.setItem(`ss_verified_${cred.user.uid}`, '1');
    if (expiryTimer) clearInterval(expiryTimer);
    if (resendTimer) clearInterval(resendTimer);
    _otp = '';
    // onAuthStateChanged fires → user enters app
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Verify OTP'; }
    showErr(friendlyError(e.code));
  }
};

// ─────────────────────────────────────────────
//  RESEND OTP
// ─────────────────────────────────────────────
export const resendOTP = async () => {
  if (!_otpEmail) return;
  clearErr();
  try {
    _otp         = generateOTP();
    _otpExpiry   = Date.now() + OTP_EXPIRY_MS;
    _otpAttempts = 0;
    clearOTPInputs();
    document.getElementById('otp-1')?.focus();
    await sendOTPEmail(_otpEmail, pendingName, _otp);
    window.showToast?.('New OTP sent! 📬', 'success');
    startCooldown(60);
    startExpiryCountdown();
  } catch(e) {
    showErr('Could not resend OTP. Please try again.');
  }
};

export const backToRegister = () => {
  if (resendTimer) clearInterval(resendTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  _otp = '';
  hide('otp-screen');
  document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = 'flex');
  showAuthTab('register');
  clearErr();
};

// ─────────────────────────────────────────────
//  TIMERS
// ─────────────────────────────────────────────
const startExpiryCountdown = () => {
  if (expiryTimer) clearInterval(expiryTimer);
  const el = document.getElementById('otp-expiry');
  const tick = () => {
    const left = Math.max(0, _otpExpiry - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    if (el) el.textContent = `${m}:${String(s).padStart(2,'0')}`;
    if (left <= 0) { clearInterval(expiryTimer); if (el) el.style.color = '#F43F5E'; }
  };
  tick();
  expiryTimer = setInterval(tick, 1000);
};

const startCooldown = secs => {
  if (resendTimer) clearInterval(resendTimer);
  const btn = document.getElementById('resend-otp-btn');
  let left = secs;
  const tick = () => {
    if (!btn) return;
    btn.disabled  = true;
    btn.innerHTML = `<i class="bi bi-hourglass-split"></i> Resend in ${left}s`;
    if (--left < 0) {
      clearInterval(resendTimer);
      btn.disabled  = false;
      btn.innerHTML = `<i class="bi bi-arrow-repeat"></i> Resend OTP`;
    }
  };
  tick();
  resendTimer = setInterval(tick, 1000);
};

// ─────────────────────────────────────────────
//  GOOGLE SIGN-IN
// ─────────────────────────────────────────────
export const loginGoogle = async () => {
  clearErr();
  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    localStorage.setItem(`ss_verified_${result.user.uid}`, '1');
  } catch(e) {
    showErr(friendlyError(e.code));
  }
};

// ─────────────────────────────────────────────
//  LOGOUT
// ─────────────────────────────────────────────
export const logoutUser = async () => {
  if (confirm('Sign out of StudySync?')) await signOut(auth);
};

// ─────────────────────────────────────────────
//  AUTH STATE OBSERVER
// ─────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (user) {
    const isVerified = localStorage.getItem(`ss_verified_${user.uid}`) === '1';
    const isGoogle   = user.providerData?.[0]?.providerId === 'google.com';

    if (!isVerified && !isGoogle) {
      // Unverified — sign out and stay on auth screen
      await signOut(auth);
      document.getElementById('auth-overlay').style.display = 'flex';
      return;
    }

    // ✅ Let user in
    document.getElementById('auth-overlay').style.display = 'none';
    const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    set('user-name',     user.displayName || 'User');
    set('user-email',    user.email || '');
    set('avatar',        (user.displayName || user.email || 'U')[0].toUpperCase());
    set('dash-greeting', `Good ${tod()}, ${(user.displayName || 'User').split(' ')[0]} 👋`);
    window.dispatchEvent(new CustomEvent('userReady', { detail: user }));

  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    window.dispatchEvent(new CustomEvent('userSignedOut'));
  }
});

// ─────────────────────────────────────────────
//  EXPORTED HELPER for app.js
// ─────────────────────────────────────────────
export const requireVerified = () => {
  const u = auth.currentUser;
  if (!u) return false;
  return localStorage.getItem(`ss_verified_${u.uid}`) === '1';
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const friendlyError = c => ({
  'auth/user-not-found':         'No account found with this email.',
  'auth/wrong-password':         'Incorrect password.',
  'auth/invalid-email':          'Invalid email address.',
  'auth/email-already-in-use':   'Email already registered. Please sign in.',
  'auth/weak-password':          'Password must be at least 6 characters.',
  'auth/popup-closed-by-user':   'Google sign-in was cancelled.',
  'auth/invalid-credential':     'Invalid email or password.',
  'auth/too-many-requests':      'Too many attempts. Wait a few minutes.',
  'auth/network-request-failed': 'Network error. Check your connection.',
}[c] || 'Something went wrong. Please try again.');

const tod = () => { const h = new Date().getHours(); return h<12?'morning':h<17?'afternoon':'evening'; };

// ── doSignOut for app.js ──
export const doSignOut = () => signOut(auth);
export const initAuth  = () => {};  // onAuthStateChanged starts on module import

// ── Also attach to window so any inline HTML can call them ──
window.showAuthTab    = showAuthTab;
window.loginUser      = loginUser;
window.registerUser   = registerUser;
window.verifyOTP      = verifyOTP;
window.resendOTP      = resendOTP;
window.backToRegister = backToRegister;
window.loginGoogle    = loginGoogle;
window.logoutUser     = logoutUser;
window.otpKeyUp       = otpKeyUp;
window.otpPaste       = otpPaste;
