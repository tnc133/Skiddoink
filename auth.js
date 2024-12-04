class AuthManager {
    constructor() {
        // Initialize Firebase if not already initialized
        if (!firebase.apps.length) {
            const firebaseConfig = {
                apiKey: "AIzaSyAktux6amfQANJPyo1Z5ppGw4oSmtzk4AU",
                authDomain: "skiddoink.firebaseapp.com",
                databaseURL: "https://skiddoink-default-rtdb.firebaseio.com",
                projectId: "skiddoink",
                storageBucket: "skiddoink.appspot.com",
                messagingSenderId: "471225425456",
                appId: "1:471225425456:web:39d6d27c7bcd72156197f5"
            };
            firebase.initializeApp(firebaseConfig);
        }
        this.database = firebase.database();
        this.usersRef = this.database.ref('users');
    }

    async signUp(username, password) {
        // Validate username format and length
        const usernameRegex = /^[a-zA-Z0-9_.-]{3,20}$/;
        if (!usernameRegex.test(username)) {
            throw new Error('Username must be 3-20 characters and can only contain letters, numbers, dots, dashes, and underscores');
        }

        // Check if username exists
        const snapshot = await this.usersRef.orderByChild('username').equalTo(username).once('value');
        if (snapshot.exists()) {
            throw new Error('Username already exists');
        }

        // Validate password
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }
        if (password.length > 30) {
            throw new Error('Password too long (max 30 characters)');
        }

        // Create user
        const userData = {
            username,
            password: await this.hashPassword(password),
            joinDate: Date.now()
        };

        await this.usersRef.push(userData);
        return this.signIn(username, password);
    }

    async signIn(username, password) {
        const snapshot = await this.usersRef.orderByChild('username').equalTo(username).once('value');
        if (!snapshot.exists()) {
            throw new Error('Username does not exist');
        }

        const userData = Object.values(snapshot.val())[0];
        const userId = Object.keys(snapshot.val())[0];

        if (await this.hashPassword(password) !== userData.password) {
            throw new Error('Incorrect password');
        }

        localStorage.setItem('username', username);
        localStorage.setItem('userId', userId);
        return userData;
    }

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async updatePassword(currentPassword, newPassword) {
        const username = localStorage.getItem('username');
        const userId = localStorage.getItem('userId');
        
        const userData = (await this.usersRef.child(userId).once('value')).val();
        
        if (await this.hashPassword(currentPassword) !== userData.password) {
            throw new Error('Current password is incorrect');
        }
        
        await this.usersRef.child(userId).update({
            password: await this.hashPassword(newPassword)
        });
    }
} 