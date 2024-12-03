const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIHJ4PSI1MCIgZmlsbD0iIzQ0NDQ0NCIvPjxwYXRoIGQ9Ik01MCAyNUMzNi4xOTI5IDI1IDI1IDM2LjE5MjkgMjUgNTBDMjUgNjMuODA3MSAzNi4xOTI5IDc1IDUwIDc1QzYzLjgwNzEgNzUgNzUgNjMuODA3MSA3NSA1MEM3NSAzNi4xOTI5IDYzLjgwNzEgMjUgNTAgMjVaTTQwLjUgNDQuNUM0Mi40MzMgNDQuNSA0NCA0Mi45MzMgNDQgNDFDNDQgMzkuMDY3IDQyLjQzMyAzNy41IDQwLjUgMzcuNUMzOC41NjcgMzcuNSAzNyAzOS4wNjcgMzcgNDFDMzcgNDIuOTMzIDM4LjU2NyA0NC41IDQwLjUgNDQuNVpNNTkuNSA0NC41QzYxLjQzMyA0NC41IDYzIDQyLjkzMyA2MyA0MUM2MyAzOS4wNjcgNjEuNDMzIDM3LjUgNTkuNSAzNy41QzU3LjU2NyAzNy41IDU2IDM5LjA2NyA1NiA0MUM1NiA0Mi45MzMgNTcuNTY3IDQ0LjUgNTkuNSA0NC41Wk01MCA2Ny41QzU1LjUyMjggNjcuNSA2MCA2My4wMjI4IDYwIDU3LjVINDBDNDAgNjMuMDIyOCA0NC40NzcyIDY3LjUgNTAgNjcuNVoiIGZpbGw9IiNGRkYiLz48L3N2Zz4=';

class SkiddoinkApp {
    constructor() {
        if (!firebase.apps.length) {
            console.error('Firebase not initialized');
            return;
        }

        // Check for username first
        if (!localStorage.getItem('username')) {
            this.checkUsername();
            return;
        }

        this.feed = document.querySelector('.feed');
        if (!this.feed) {
            console.error('Feed element not found');
            return;
        }

        // Initialize Firebase services
        this.database = firebase.database();
        this.videosRef = this.database.ref('videos');

        // Setup username display
        this.usernameDisplay = document.querySelector('.username-display');
        if (this.usernameDisplay) {
            this.usernameDisplay.textContent = `@${localStorage.getItem('username')}`;
        }

        // Initialize watched videos tracking
        this.watchedVideos = new Set(JSON.parse(localStorage.getItem('watchedVideos') || '[]'));

        // Load videos
        this.loadVideos();
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
                        <input type="text" id="signinUsername" placeholder="Username">
                        <input type="password" id="signinPassword" placeholder="Password">
                        <button id="signinBtn">Sign In</button>
                        <p class="auth-error"></p>
                    </div>
                    <div class="auth-form signup-form" style="display: none;">
                        <input type="text" id="signupUsername" placeholder="Username">
                        <input type="password" id="signupPassword" placeholder="Password">
                        <button id="signupBtn">Sign Up</button>
                        <p class="auth-error"></p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const auth = new AuthManager();

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
            modal.querySelector('#signinBtn').addEventListener('click', async () => {
                const username = modal.querySelector('#signinUsername').value;
                const password = modal.querySelector('#signinPassword').value;

                try {
                    await auth.signIn(username, password);
                    document.body.removeChild(modal);
                    window.location.reload();
                } catch (error) {
                    modal.querySelector('.signin-form .auth-error').textContent = error.message;
                }
            });

            // Handle sign up
            modal.querySelector('#signupBtn').addEventListener('click', async () => {
                const username = modal.querySelector('#signupUsername').value;
                const password = modal.querySelector('#signupPassword').value;

                try {
                    await auth.signUp(username, password);
                    document.body.removeChild(modal);
                    window.location.reload();
                } catch (error) {
                    modal.querySelector('.signup-form .auth-error').textContent = error.message;
                }
            });

            // Add keyboard event listeners for both forms
            ['signinUsername', 'signinPassword', 'signupUsername', 'signupPassword'].forEach(id => {
                const input = modal.querySelector(`#${id}`);
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const isSignIn = id.startsWith('signin');
                        const btn = modal.querySelector(isSignIn ? '#signinBtn' : '#signupBtn');
                        btn.click();
                    }
                });
            });
        }
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
        
        if (!videos || videos.length === 0) {
            const noVideos = document.createElement('div');
            noVideos.className = 'loading-message';
            noVideos.textContent = 'No videos available';
            this.feed.appendChild(noVideos);
            return;
        }

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
                    ️
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
                    <div class="publisher-info">
                        <img src="${video.publisherPic || window.DEFAULT_AVATAR}" class="publisher-pic" alt="Profile">
                        <div>
                            <h3>${video.title || 'Untitled Video'}</h3>
                            <a href="./profile.html?user=${video.publisher}" class="publisher">@${video.publisher || '[Deleted User]'}</a>
                        </div>
                    </div>
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