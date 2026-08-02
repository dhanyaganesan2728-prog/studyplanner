// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBbD5oR3XJPq1HJkBGmKp08ZCyrbpwCXwM",
  authDomain:        "study-planner-c911f.firebaseapp.com",
  projectId:         "study-planner-c911f",
  storageBucket:     "study-planner-c911f.firebasestorage.app",
  messagingSenderId: "361818604551",
  appId:             "1:361818604551:web:79cafae7ae7f0338e796a2"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export { app, auth, db };
