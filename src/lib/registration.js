/** When true, anyone can create an account (multi-tenant / shared instance). */
export function isRegistrationOpen() {
  const v = (process.env.ALLOW_REGISTRATION || '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
