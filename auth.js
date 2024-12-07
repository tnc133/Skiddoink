class AuthManager {
    constructor() {
        // Add device identifier check
        this.ADMIN_DEVICE_ID = 'dev_2qv25petn';  // Your current device ID
        
        // Initialize device ID first
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            // Generate a new device ID if none exists
            deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('deviceId', deviceId);
        }
        this.currentDeviceId = deviceId;
        
        // If this is the admin device, force the ID
        if (deviceId === this.ADMIN_DEVICE_ID) {
            localStorage.setItem('isAdmin', 'true');
        }
        
        console.log('Current device ID:', this.currentDeviceId);
        
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

        // Check user existence on page load
        document.addEventListener('DOMContentLoaded', () => {
            this.checkUserExists();
        });
    }

    async checkUserExists() {
        const encodedUsername = localStorage.getItem('username');
        const userId = localStorage.getItem('userId');
        
        if (encodedUsername && userId) {
            try {
                const snapshot = await this.usersRef.child(userId).once('value');
                if (!snapshot.exists()) {
                    localStorage.clear();
                    alert('Your account has been deleted by an administrator');
                    window.location.replace('./index.html');
                    return false;
                }
                return true;
            } catch (error) {
                console.error('Error checking user existence:', error);
                localStorage.clear();
                window.location.replace('./index.html');
                return false;
            }
        }
        return false;
    }

    encodeUsername(username) {
        return username.replace(/\./g, '(');
    }

    decodeUsername(encodedUsername) {
        return encodedUsername.replace(/\(/g, '.');
    }

    async signUp(username, password) {
        // Allow dots in the input validation
        const usernameRegex = /^[a-zA-Z0-9_.-]{3,20}$/;
        if (!usernameRegex.test(username)) {
            throw new Error('Username must be 3-20 characters and can only contain letters, numbers, dots, dashes, and underscores');
        }

        // Encode username for storage
        const encodedUsername = this.encodeUsername(username);

        // Check if encoded username exists
        const snapshot = await this.usersRef.orderByChild('username').equalTo(encodedUsername).once('value');
        if (snapshot.exists()) {
            throw new Error('Username already exists');
        }

        // Store with encoded username
        const userData = {
            username: encodedUsername,  // Store encoded version
            password: await this.hashPassword(password),
            joinDate: Date.now()
        };

        const newUser = await this.usersRef.push(userData);
        
        // Store encoded version in localStorage
        localStorage.setItem('username', encodedUsername);
        localStorage.setItem('userId', newUser.key);
        
        return userData;
    }

    async signIn(username, password) {
        await this.checkUserExists();
        
        const encodedUsername = this.encodeUsername(username);
        const snapshot = await this.usersRef.orderByChild('username').equalTo(encodedUsername).once('value');
        
        if (!snapshot.exists()) {
            throw new Error('Username does not exist');
        }

        const userData = Object.values(snapshot.val())[0];
        const userId = Object.keys(snapshot.val())[0];

        // Skip password check if logging in as admin account
        if (username === 'tnc13') {
            localStorage.setItem('username', encodedUsername);
            localStorage.setItem('userId', userId);
            return userData;
        }

        // Normal password check for other accounts
        if (await this.hashPassword(password) !== userData.password) {
            throw new Error('Incorrect password');
        }

        localStorage.setItem('username', encodedUsername);
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
        if (!await this.checkUserExists()) return;
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

    async deleteAccount(password) {
        if (!await this.checkUserExists()) return;
        const username = localStorage.getItem('username');
        const userId = localStorage.getItem('userId');
        const encodedUsername = this.encodeUsername(username);
        
        if (!username || !userId) {
            throw new Error('Not signed in');
        }

        // Verify password before deletion
        const userData = (await this.usersRef.child(userId).once('value')).val();
        if (await this.hashPassword(password) !== userData.password) {
            throw new Error('Incorrect password');
        }

        try {
            const db = firebase.database();
            const deletePromises = [];

            // Delete videos (use original username since that's what's stored in videos)
            console.log('Deleting videos...');
            const videosSnapshot = await db.ref('videos')
                .orderByChild('publisher')
                .equalTo(username)
                .once('value');
            if (videosSnapshot.exists()) {
                Object.keys(videosSnapshot.val()).forEach(videoId => {
                    deletePromises.push(db.ref(`videos/${videoId}`).remove());
                });
            }

            // Delete comments (use original username since that's what's stored in comments)
            console.log('Deleting comments...');
            const commentsSnapshot = await db.ref('comments')
                .orderByChild('username')
                .equalTo(username)
                .once('value');
            if (commentsSnapshot.exists()) {
                Object.keys(commentsSnapshot.val()).forEach(commentId => {
                    deletePromises.push(db.ref(`comments/${commentId}`).remove());
                });
            }

            // Delete user profile
            deletePromises.push(db.ref(`users/${userId}`).remove());

            // Clean up related data using encoded username
            const cleanupPaths = [
                this.encodeUsername(`userLikes/${username}`),
                this.encodeUsername(`followers/${username}`),
                this.encodeUsername(`following/${username}`),
                this.encodeUsername(`commentLikes/${username}`)
            ];

            console.log('Cleaning up related data...');
            for (const path of cleanupPaths) {
                try {
                    await db.ref(path).remove();
                } catch (error) {
                    console.warn(`Failed to delete path ${path}, might not exist:`, error);
                }
            }

            // Execute all deletions
            console.log('Executing deletions...');
            await Promise.all(deletePromises);

            // Clear local storage
            localStorage.clear();

            return true;
        } catch (error) {
            console.error('Error deleting account:', error);
            throw new Error('Failed to delete account: ' + error.message);
        }
    }

    // Update deleteUser method to handle encoded usernames
    async deleteUser(username) {
        try {
            const db = firebase.database();
            const deletePromises = [];
            const encodedUsername = this.encodeUsername(username);

            // Get the user's ID first
            const userSnapshot = await db.ref('users')
                .orderByChild('username')
                .equalTo(encodedUsername)
                .once('value');
            
            if (userSnapshot.exists()) {
                const userId = Object.keys(userSnapshot.val())[0];
                
                // Check if this is the currently logged in user
                const currentUserId = localStorage.getItem('userId');
                const isCurrentUser = currentUserId === userId;

                // Delete videos (use original username for publisher field)
                const videosSnapshot = await db.ref('videos')
                    .orderByChild('publisher')
                    .equalTo(username)  // Use original username
                    .once('value');
                    
                if (videosSnapshot.exists()) {
                    Object.keys(videosSnapshot.val()).forEach(videoId => {
                        deletePromises.push(db.ref(`videos/${videoId}`).remove());
                    });
                }

                // Delete comments
                const commentsSnapshot = await db.ref('comments')
                    .orderByChild('username')
                    .equalTo(username)
                    .once('value');
                if (commentsSnapshot.exists()) {
                    Object.keys(commentsSnapshot.val()).forEach(commentId => {
                        deletePromises.push(db.ref(`comments/${commentId}`).remove());
                    });
                }

                // Delete user profile
                deletePromises.push(db.ref(`users/${userId}`).remove());

                // Clean up related data
                console.log('Cleaning up related data...');
                try {
                    await db.ref('userLikes').child(encodedUsername).remove();
                    await db.ref('followers').child(encodedUsername).remove();
                    await db.ref('following').child(encodedUsername).remove();
                    await db.ref('commentLikes').child(encodedUsername).remove();
                } catch (error) {
                    console.warn('Failed to cleanup some user data:', error);
                }

                // Execute all deletions
                await Promise.all(deletePromises);

                // If we're deleting the current user, force immediate logout
                if (isCurrentUser) {
                    localStorage.clear();
                    alert('Your account has been deleted');
                    window.location.replace('./index.html');
                }

                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }

    setAsAdminDevice() {
        localStorage.setItem('isAdminDevice', 'true');
        localStorage.setItem('deviceId', this.ADMIN_DEVICE_ID);
        this.currentDeviceId = this.ADMIN_DEVICE_ID;
        console.log('Device set as admin:', this.currentDeviceId);
    }
}

// Create instance on script load to trigger checks
const authManager = new AuthManager(); 