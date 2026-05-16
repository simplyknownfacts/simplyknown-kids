// Yoto API config. Set the client_id you got from Yoto's developer portal.
// You can set it inline here OR via Parent Settings → 🎧 Yoto → "Set client ID".
// Settings UI saves it to localStorage 'vb_yoto_client_id', which js/yoto.js reads.
//
// To apply for a client_id:
//   1. Sign up at https://yoto.dev
//   2. Email dev@yotoplay.com requesting browser-auth access
//   3. Tell them your redirect URI: https://kids.simplyknown.co/yoto-callback.html
//   4. They send you a client_id — paste below or in settings.
window.YOTO_CONFIG = {
  clientId: '', // ← paste your Yoto client_id here, or set via parent settings
};
