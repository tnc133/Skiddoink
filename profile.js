class ProfilePage {
    constructor() {
        this.username = localStorage.getItem('username');
        if (!this.username) {
            window.location.href = './index.html';
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
                    localStorage.setItem('activeVideoId', id);
                    localStorage.setItem('scrollToVideo', 'true');
                    window.location.href = location.pathname.includes('github.io') ? 
                        '/your-repo-name/index.html' : 
                        './index.html';
                });
            });
        });
    }

    handleUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const loadingOverlay = document.createElement('div');
                loadingOverlay.className = 'loading-overlay';
                loadingOverlay.innerHTML = `
                    <div class="loading-spinner"></div>
                    <p>Uploading video...</p>
                `;
                document.body.appendChild(loadingOverlay);

                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'skiddoink_uploads');
                formData.append('api_key', '255245241992774');
                formData.append('timestamp', Math.round(Date.now() / 1000));
                formData.append('cloud_name', 'dz8kxt0gy');
                
                const uploadUrl = 'https://api.cloudinary.com/v1_1/dz8kxt0gy/video/upload';
                
                const xhr = new XMLHttpRequest();
                xhr.open('POST', uploadUrl);
                
                xhr.onload = async () => {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);
                        
                        const title = prompt('Enter a title for your video:', '') || 'Untitled Video';
                        const description = prompt('Enter a description (optional):', '');

                        const videoData = {
                            url: data.secure_url,
                            title: title,
                            description: description,
                            timestamp: Date.now(),
                            uploadDate: new Date().toISOString(),
                            views: 0,
                            likes: 0,
                            publisher: this.username
                        };

                        const newVideoRef = this.videosRef.push();
                        await newVideoRef.set(videoData);

                        // Reload the videos grid after upload
                        this.loadUserVideos();
                        alert('Video added successfully!');
                    } else {
                        throw new Error('Upload failed');
                    }
                    document.body.removeChild(loadingOverlay);
                };
                
                xhr.onerror = () => {
                    console.error('Error:', xhr.statusText);
                    alert('Upload failed');
                    document.body.removeChild(loadingOverlay);
                };
                
                xhr.send(formData);

            } catch (error) {
                console.error('Error:', error);
                alert(`Upload failed: ${error.message}`);
                if (document.body.querySelector('.loading-overlay')) {
                    document.body.removeChild(document.body.querySelector('.loading-overlay'));
                }
            }
        };

        input.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
}); 