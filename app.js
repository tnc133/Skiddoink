class SkiddoinkApp {
    constructor() {
        this.feed = document.querySelector('.feed');
        if (!this.feed) {
            console.error('Feed element not found');
            return;
        }

        const firebaseConfig = {
            apiKey: "AIzaSyAktux6amfQANJPyo1Z5ppGw4oSmtzk4AU",
            authDomain: "skiddoink.firebaseapp.com",
            databaseURL: "https://skiddoink-default-rtdb.firebaseio.com",
            projectId: "skiddoink",
            storageBucket: "skiddoink.appspot.com",
            messagingSenderId: "471225425456",
            appId: "1:471225425456:web:39d6d27c7bcd72156197f5"
        };

        // Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // Initialize Firebase services
        this.database = firebase.database();
        this.storage = firebase.storage();
        this.videosRef = this.database.ref('videos');

        // Add username check after Firebase initialization
        this.checkUsername();

        // Initialize upload button
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleUpload());
        }

        // Add username display
        this.usernameDisplay = document.createElement('a');
        this.usernameDisplay.className = 'username-display';
        this.usernameDisplay.textContent = localStorage.getItem('username') || 'Guest';
        this.usernameDisplay.href = './profile.html';
        uploadBtn.parentElement.insertBefore(this.usernameDisplay, uploadBtn);

        this.loadVideos();

        // Update base path for GitHub Pages
        this.basePath = location.pathname.includes('github.io') ? 
            '/your-repo-name/' : 
            './';
        
        // Update profile link
        this.usernameDisplay.href = this.basePath + 'profile.html';

        this.watchedVideos = new Set(JSON.parse(localStorage.getItem('watchedVideos') || '[]'));
    }

    checkUsername() {
        if (!localStorage.getItem('username')) {
            const modal = document.createElement('div');
            modal.className = 'username-modal';
            modal.innerHTML = `
                <div class="username-modal-content">
                    <h2>Welcome to Skiddoink!</h2>
                    <div class="auth-tabs">
                        <button class="auth-tab active" data-tab="signin">Sign In</button>
                        <button class="auth-tab" data-tab="signup">Sign Up</button>
                    </div>
                    <div class="auth-form signin-form">
                        <input type="text" id="usernameInput" maxlength="20" placeholder="Username">
                        <input type="password" id="passwordInput" placeholder="Password">
                        <button id="submitAuth">Sign In</button>
                        <p class="auth-error"></p>
                    </div>
                    <div class="auth-form signup-form" style="display: none;">
                        <input type="text" id="signupUsername" maxlength="20" placeholder="Username">
                        <input type="password" id="signupPassword" placeholder="Password">
                        <button id="submitSignup">Sign Up</button>
                        <p class="auth-error"></p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const auth = new AuthManager();
            const errorDisplay = modal.querySelector('.auth-error');

            // Handle tab switching
            modal.querySelectorAll('.auth-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    const isSignIn = tab.dataset.tab === 'signin';
                    modal.querySelector('.signin-form').style.display = isSignIn ? 'block' : 'none';
                    modal.querySelector('.signup-form').style.display = isSignIn ? 'none' : 'block';
                });
            });

            // Handle sign in
            modal.querySelector('#submitAuth').addEventListener('click', async () => {
                const username = modal.querySelector('#usernameInput').value;
                const password = modal.querySelector('#passwordInput').value;

                try {
                    await auth.signIn(username, password);
                    document.body.removeChild(modal);
                    this.usernameDisplay.textContent = username;
                } catch (error) {
                    errorDisplay.textContent = error.message;
                }
            });

            // Handle sign up
            modal.querySelector('#submitSignup').addEventListener('click', async () => {
                const username = modal.querySelector('#signupUsername').value;
                const password = modal.querySelector('#signupPassword').value;

                try {
                    await auth.signUp(username, password);
                    document.body.removeChild(modal);
                    this.usernameDisplay.textContent = username;
                } catch (error) {
                    modal.querySelector('.signup-form .auth-error').textContent = error.message;
                }
            });
        }
    }

    async handleUpload() {
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
                            publisher: localStorage.getItem('username') || '[Deleted User]'
                        };

                        const newVideoRef = this.videosRef.push();
                        await newVideoRef.set(videoData);

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

    loadVideos() {
        this.videosRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const videos = Object.entries(data).map(([id, video]) => ({
                    ...video,
                    id
                }));
                this.displayVideos(videos);
            }
        });
    }

    displayVideos(videos) {
        this.feed.innerHTML = '';
        
        // Sort videos: unwatched first, then watched
        const sortedVideos = [...videos].sort((a, b) => {
            const aWatched = this.watchedVideos.has(a.id);
            const bWatched = this.watchedVideos.has(b.id);
            if (aWatched === bWatched) {
                return Math.random() - 0.5; // Random sort within each group
            }
            return aWatched ? 1 : -1; // Unwatched first
        });

        // If all videos are watched, reset tracking
        if (sortedVideos.every(v => this.watchedVideos.has(v.id))) {
            this.watchedVideos.clear();
            localStorage.setItem('watchedVideos', '[]');
        }

        sortedVideos.forEach(video => {
            const container = document.createElement('div');
            container.className = 'video-container';
            container.dataset.videoId = video.id;
            
            const videoElement = document.createElement('video');
            videoElement.src = video.url;
            videoElement.loop = true;
            videoElement.playsInline = true;
            videoElement.muted = false;
            videoElement.controls = false;

            // Add click handler for play/pause
            container.addEventListener('click', (e) => {
                if (e.target.closest('.interaction-buttons') || e.target.closest('.video-info')) {
                    return;
                }
                if (videoElement.paused) {
                    videoElement.play();
                } else {
                    videoElement.pause();
                }
            });

            // Improved intersection observer
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && entry.intersectionRatio > 0.8) {
                            videoElement.play();
                            container.classList.add('active');
                        } else {
                            videoElement.pause();
                            videoElement.currentTime = 0;
                            container.classList.remove('active');
                        }
                    });
                },
                {
                    threshold: [0, 0.8, 1],
                    rootMargin: '-10% 0px'
                }
            );
            observer.observe(container);

            // Add interaction buttons
            const interactionButtons = document.createElement('div');
            interactionButtons.className = 'interaction-buttons';
            interactionButtons.innerHTML = `
                <button class="interaction-btn like-btn">
                    ❤️
                    <span>${video.likes || 0}</span>
                </button>
                <button class="interaction-btn comment-btn">
                    💬
                    <span>${video.comments?.length || 0}</span>
                </button>
                <button class="interaction-btn share-btn">
                    ↗️
                    <span>Share</span>
                </button>
            `;

            // Add video info
            const infoOverlay = document.createElement('div');
            infoOverlay.className = 'video-info';
            infoOverlay.innerHTML = `
                <div class="video-text">
                    <h3>${video.title || 'Untitled Video'}</h3>
                    <p class="publisher">@${video.publisher || '[Deleted User]'}</p>
                    <p class="description">${video.description || ''}</p>
                    <p class="date">Posted ${this.formatDate(video.timestamp)}</p>
                </div>
            `;

            // Add delete button (hidden by default)
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '🗑️';

            // Show delete button by default for video owner, hidden for others
            const currentUser = localStorage.getItem('username');
            const isOwner = video.publisher === currentUser;
            deleteButton.style.display = isOwner ? 'block' : 'none';

            // Modify delete functionality
            deleteButton.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent video play/pause
                
                if (isOwner) {
                    if (confirm('Are you sure you want to delete this video?')) {
                        try {
                            await this.videosRef.child(video.id).remove();
                            container.remove();
                        } catch (error) {
                            console.error('Error deleting video:', error);
                            alert('Failed to delete video');
                        }
                    }
                } else {
                    const password = prompt('Enter password to delete:');
                    if (password === '1323') {
                        if (confirm('Are you sure you want to delete this video?')) {
                            try {
                                await this.videosRef.child(video.id).remove();
                                container.remove();
                            } catch (error) {
                                console.error('Error deleting video:', error);
                                alert('Failed to delete video');
                            }
                        }
                    } else {
                        alert('Incorrect password');
                    }
                }
            });

            // Modify ctrl key event listeners to only apply for non-owners
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && !isOwner) {
                    deleteButton.style.display = 'block';
                }
            });

            document.addEventListener('keyup', (e) => {
                if (!e.ctrlKey && !isOwner) {
                    deleteButton.style.display = 'none';
                }
            });

            container.appendChild(videoElement);
            container.appendChild(interactionButtons);
            container.appendChild(infoOverlay);
            container.appendChild(deleteButton);
            this.feed.appendChild(container);

            // Mark video as watched when it plays
            videoElement.addEventListener('play', () => {
                if (!this.watchedVideos.has(video.id)) {
                    this.watchedVideos.add(video.id);
                    localStorage.setItem('watchedVideos', JSON.stringify([...this.watchedVideos]));
                }
            });
        });

        // Improved scroll handling
        let isScrolling;
        let lastScrollTop = 0;
        
        this.feed.addEventListener('scroll', () => {
            window.clearTimeout(isScrolling);
            
            const currentScrollTop = this.feed.scrollTop;
            const windowHeight = window.innerHeight;
            
            // Only snap when scrolling has stopped
            isScrolling = setTimeout(() => {
                const snapPoint = Math.round(currentScrollTop / windowHeight) * windowHeight;
                
                if (currentScrollTop !== snapPoint) {
                    this.feed.scrollTo({
                        top: snapPoint,
                        behavior: 'smooth'
                    });
                }
            }, 50); // Reduced timeout for faster response

            lastScrollTop = currentScrollTop;
        }, { passive: true });

        this.scrollToVideo();
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    scrollToVideo() {
        const activeVideoId = localStorage.getItem('activeVideoId');
        const shouldScrollToVideo = localStorage.getItem('scrollToVideo');
        
        if (activeVideoId && shouldScrollToVideo) {
            // Clear the scroll flag
            localStorage.removeItem('scrollToVideo');
            
            // Find the video container with this ID
            const videos = document.querySelectorAll('.video-container');
            let targetIndex = 0;
            
            videos.forEach((container, index) => {
                if (container.dataset.videoId === activeVideoId) {
                    targetIndex = index;
                }
            });
            
            // Scroll to the video after a short delay to ensure everything is loaded
            setTimeout(() => {
                const targetScroll = targetIndex * window.innerHeight;
                this.feed.scrollTo({
                    top: targetScroll,
                    behavior: 'smooth'
                });
            }, 100);
        }
    }
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    new SkiddoinkApp();
});