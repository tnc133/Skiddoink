class ProfilePage {
    constructor() {
        this.username = localStorage.getItem('username');
        if (!this.username) {
            window.location.href = '/';
            return;
        }

        // Initialize Firebase (same config as app.js)
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

        this.database = firebase.database();
        this.videosRef = this.database.ref('videos');
        
        this.setupUI();
        this.loadUserVideos();
    }

    setupUI() {
        document.querySelector('.profile-username').textContent = `@${this.username}`;
        
        // Setup upload buttons
        const uploadBtn = document.getElementById('uploadBtn');
        const profileUploadBtn = document.getElementById('profileUploadBtn');
        
        [uploadBtn, profileUploadBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.handleUpload());
            }
        });
    }

    async loadUserVideos() {
        const videosGrid = document.querySelector('.videos-grid');
        const noVideosMessage = document.querySelector('.no-videos-message');
        
        this.videosRef.orderByChild('publisher').equalTo(this.username).once('value', snapshot => {
            const videos = snapshot.val();
            
            if (!videos) {
                noVideosMessage.style.display = 'block';
                return;
            }
            
            Object.entries(videos).forEach(([id, video]) => {
                const thumbnail = document.createElement('div');
                thumbnail.className = 'video-thumbnail';
                
                const videoElement = document.createElement('video');
                videoElement.src = video.url;
                videoElement.muted = true;
                
                thumbnail.appendChild(videoElement);
                videosGrid.appendChild(thumbnail);
                
                // Play preview on hover
                thumbnail.addEventListener('mouseenter', () => videoElement.play());
                thumbnail.addEventListener('mouseleave', () => {
                    videoElement.pause();
                    videoElement.currentTime = 0;
                });
                
                // Go to main feed and play this video when clicked
                thumbnail.addEventListener('click', () => {
                    localStorage.setItem('playVideo', id);
                    window.location.href = '/';
                });
            });
        });
    }

    handleUpload() {
        // Use the same upload logic as in app.js
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.click();
        
        // Add the same upload handling code as in app.js
        // This ensures consistent upload behavior
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
}); 