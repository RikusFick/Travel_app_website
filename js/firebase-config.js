/* Public Firebase web config only.
   Paste the firebaseConfig from the Firebase console (Project settings → Your apps → Web).
   Do not put a service account, private key, or admin secret in this file.
   The apiKey here is a public client key. Firebase still requires Email/Password
   to be enabled and getearwise.com to be an authorized domain. */
window.EARWISE_FIREBASE = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
