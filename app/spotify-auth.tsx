import { useEffect } from 'react';
import { router } from 'expo-router';

// Spotify's sign-in redirect also reaches the router as a deep link. The
// sign-in itself reads the code from the browser session, so just step back.
export default function SpotifyAuthRedirect() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/alarm-sound');
  }, []);
  return null;
}
