import { SettingsPage } from './settings';

/**
 * Account page — shows personal account settings (Profile, Password, Google Calendar, Notifications, Security).
 * Accessible from the user menu (click name in top-right → My Account).
 */
export function AccountPage() {
  return <SettingsPage initialTab="account" hideTabsList />;
}
