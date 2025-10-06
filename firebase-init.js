(function(){
  if (window.firebaseInitialized) return;
  const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_FIREBASE_PROJECT.firebaseapp.com",
    projectId: "YOUR_FIREBASE_PROJECT",
    storageBucket: "YOUR_FIREBASE_PROJECT.appspot.com",
    messagingSenderId: "XXXXXXX",
    appId: "XXXXXXXXXX"
  };
  firebase.initializeApp(firebaseConfig);
  window.auth = firebase.auth();
  window.db = firebase.firestore();
  try { window.storage = firebase.storage(); } catch { window.storage = null; }
  window.firebaseInitialized = true;
})();
