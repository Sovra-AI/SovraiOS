import { Redirect } from 'expo-router';

import { useRemote } from '@/state/remote';

/** Opening the app goes straight to the remembered computer, or to pairing. */
export default function Index() {
  const desktop = useRemote((state) => state.desktop);
  return <Redirect href={desktop ? '/remote' : '/pair'} />;
}
