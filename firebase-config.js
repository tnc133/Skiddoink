// Initialize Firebase first
const firebaseConfig = {
    apiKey: "AIzaSyAktux6amfQANJPyo1Z5ppGw4oSmtzk4AU",
    authDomain: "skiddoink.firebaseapp.com",
    databaseURL: "https://skiddoink-default-rtdb.firebaseio.com",
    projectId: "skiddoink",
    storageBucket: "skiddoink.appspot.com",
    messagingSenderId: "471225425456",
    appId: "1:471225425456:web:39d6d27c7bcd72156197f5"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} 