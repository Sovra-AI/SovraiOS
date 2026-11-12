import * as Device from 'expo-device';
import { create } from 'zustand';

/**
 * In-memory pairing draft. Names only: the invitation link is passed straight to
 * `useRemote().pair` and never kept in state, navigation params or storage.
 */
interface PairingDraft {
  phoneName: string;
  desktopName: string;
  set(patch: Partial<Pick<PairingDraft, 'phoneName' | 'desktopName'>>): void;
}

export const usePairingDraft = create<PairingDraft>((set) => ({
  phoneName: Device.deviceName ?? Device.modelName ?? 'My phone',
  desktopName: 'My computer',
  set: (patch) => set(patch),
}));
