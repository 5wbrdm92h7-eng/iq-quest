import {LEGAL_PROFILE} from './legal-config.mjs';

const required = ['operatorName','operatorAddress','businessEmail','businessPhone'];
const missing = required.filter(key => !String(LEGAL_PROFILE[key] ?? '').trim());
const ready = missing.length === 0 && LEGAL_PROFILE.reviewedForLaunch === true;

for (const element of document.querySelectorAll('[data-legal-field]')) {
  const key = element.getAttribute('data-legal-field');
  const value = String(LEGAL_PROFILE[key] ?? '').trim();
  element.textContent = value || '[To be completed before launch]';
  if (!value) element.classList.add('placeholder');
}
for (const element of document.querySelectorAll('[data-legal-email]')) {
  const email = String(LEGAL_PROFILE.businessEmail ?? '').trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    element.href = 'mailto:' + email;
    element.textContent = email;
  } else {
    element.removeAttribute('href');
    element.textContent = '[Contact email pending]';
    element.classList.add('placeholder');
  }
}
const banner = document.querySelector('[data-legal-warning]');
if (banner && ready) banner.hidden = true;

// Even a filled imprint does not activate checkout or imply legal approval.
// A separate production checkout gate is documented in PRELAUNCH-CHECKLIST.md.
