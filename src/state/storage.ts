/**
 * On-device persistence. The phone's private key lives in the iOS Keychain /
 * Android Keystore-backed store and never leaves this device (no backup, no sync).
 * Only public routing hints for the paired computer are saved; the pairing
 * invitation itself is never written anywhere.
 */
import * as SecureStore from 'expo-secure-store';

import { validateAddress } from '@/remote/ticket';
import type { PeerAddress } from '@/remote/wire';

const PHONE_SECRET = 'sovra.phone-secret.v1';
const DESKTOP = 'sovra.desktop.v1';
const PREFERENCES = 'sovra.preferences.v1';

const secretOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface SavedDesktop {
  address: PeerAddress;
  name: string;
  pairedAt: string;
}

export async function loadPhoneSecret(): Promise<string | null> {
  return SecureStore.getItemAsync(PHONE_SECRET, secretOptions);
}

export async function savePhoneSecret(secret: string): Promise<void> {
  await SecureStore.setItemAsync(PHONE_SECRET, secret, secretOptions);
}

export async function deletePhoneSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(PHONE_SECRET, secretOptions);
}

/** Damaged storage fails closed (treated as unpaired), it is never "repaired" silently. */
export async function loadDesktop(): Promise<SavedDesktop | null> {
  const text = await SecureStore.getItemAsync(DESKTOP);
  if (!text) return null;
  try {
    const saved = JSON.parse(text) as SavedDesktop;
    if (!validateAddress(saved.address) || typeof saved.name !== 'string') return null;
    return saved;
  } catch {
    return null;
  }
}

export async function saveDesktop(desktop: SavedDesktop): Promise<void> {
  await SecureStore.setItemAsync(DESKTOP, JSON.stringify(desktop));
}

export async function deleteDesktop(): Promise<void> {
  await SecureStore.deleteItemAsync(DESKTOP);
}

export async function loadPreferences<T>(): Promise<Partial<T>> {
  try {
    const text = await SecureStore.getItemAsync(PREFERENCES);
    return text ? (JSON.parse(text) as Partial<T>) : {};
  } catch {
    return {};
  }
}

export async function savePreferences<T>(preferences: T): Promise<void> {
  await SecureStore.setItemAsync(PREFERENCES, JSON.stringify(preferences));
}
