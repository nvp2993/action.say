import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPp0AbNtvvuIWTrTwIYkvXyoD0Vr2IeuE",
  authDomain: "lich-show-action-say.firebaseapp.com",
  projectId: "lich-show-action-say",
  storageBucket: "lich-show-action-say.firebasestorage.app",
  messagingSenderId: "464838086307",
  appId: "1:464838086307:web:c5b7ec3c47551577c1f916"
};

export const APP_ID = 'action-say-media-2026';
export const ADMIN_EMAIL = 'nvp0209@gmail.com';
export const MEMBER_EMAIL_DOMAIN = 'actionsay.local';

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
