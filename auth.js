class AuthManager {
    constructor() {
        this.database = firebase.database();
        this.usersRef = this.database.ref('users');
    }

    async signUp(username, password) {
        // Check if username exists
        const snapshot = await this.usersRef.orderByChild('username').equalTo(username).once('value');
        if (snapshot.exists()) {
            throw new Error('Username already exists');
        }

        // Validate input
        if (!username || username.length < 3) {
            throw new Error('Username must be at least 3 characters');
        }
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
} 