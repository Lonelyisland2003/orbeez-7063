import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage }     from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyDG9-DvVtkr1TAwxAZsNLVqLbfcDyUcXY0",
    authDomain: "orbeez-16c8f.firebaseapp.com",
    projectId: "orbeez-16c8f",
    storageBucket: "orbeez-16c8f.firebasestorage.app",
    messagingSenderId: "44426040054",
    appId: "1:44426040054:web:bcddca8ff6442e0a5e52d7",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);