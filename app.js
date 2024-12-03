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

        // Initialize liked videos tracking with user-specific key
        const username = localStorage.getItem('username');
        this.likedVideosKey = `likedVideos_${username}`;
        this.likedVideos = new Set(JSON.parse(localStorage.getItem(this.likedVideosKey) || '[]'));

        // Also store likes in Firebase for persistence across devices
        this.userLikesRef = this.database.ref(`userLikes/${username}`);
        this.loadUserLikes();

        // Load videos
        this.loadVideos();

        // Add new properties for infinite scroll
        this.currentVideoIndex = 0;
        this.videosPerLoad = 5;  // Number of videos to load each time
        this.isLoading = false;  // Flag to prevent multiple simultaneous loads
        
        // Add scroll event listener for infinite scroll
        this.feed.addEventListener('scroll', () => {
            this.handleScroll();
        }, { passive: true });

        // Add scroll lock property
        this.isScrollLocked = false;

        // Add flag to prevent reload on like updates
        this.isLikeUpdate = false;

        // Add flag for first interaction
        this.hasUserInteracted = false;
        
        // Listen for any user interaction
        document.addEventListener('click', () => {
            if (!this.hasUserInteracted) {
                console.log('First user interaction detected');
                this.hasUserInteracted = true;
                // Try to unmute any playing video
                const activeVideo = document.querySelector('.video-container.active video');
                if (activeVideo) {
                    console.log('Found active video, attempting to unmute');
                    activeVideo.muted = false;
                    activeVideo.volume = 1;
                }
            }
        }, { once: true });
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
                
                // Only reload videos if it's not a like update
                if (!this.isLikeUpdate) {
                    this.displayVideos(videos);
                }
                this.isLikeUpdate = false;
            }
        });
    }

    displayVideos(videos) {
        this.allVideos = videos;
        this.feed.innerHTML = '';
        
        if (!videos || videos.length === 0) {
            const noVideos = document.createElement('div');
            noVideos.className = 'loading-message';
            noVideos.textContent = 'No videos available';
            this.feed.appendChild(noVideos);
            return;
        }

        // Get the active video ID if any
        const activeVideoId = localStorage.getItem('activeVideoId');
        const shouldScrollToVideo = localStorage.getItem('scrollToVideo');

        if (activeVideoId && shouldScrollToVideo) {
            // Find the active video
            const activeVideo = videos.find(v => v.id === activeVideoId);
            if (activeVideo) {
                // Put the active video first
                this.sortedVideos = [
                    activeVideo,
                    ...videos.filter(v => v.id !== activeVideoId)
                ];
            } else {
                this.sortedVideos = [...videos];
            }
            // Clear the scroll flag
            localStorage.removeItem('scrollToVideo');
        } else {
            // Normal video sorting logic
            const allVideosWatched = videos.every(video => this.watchedVideos.has(video.id));
            if (allVideosWatched) {
                this.watchedVideos.clear();
                localStorage.setItem('watchedVideos', '[]');
            }

            const unwatchedVideos = videos.filter(video => !this.watchedVideos.has(video.id));
            const watchedVideos = videos.filter(video => this.watchedVideos.has(video.id));

            const shuffleArray = arr => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            };

            this.sortedVideos = [
                ...shuffleArray(unwatchedVideos),
                ...shuffleArray(watchedVideos)
            ];
        }

        // Reset current index
        this.currentVideoIndex = 0;

        // Load initial batch of videos
        this.loadMoreVideos();
    }

    // Add new method for loading more videos
    async loadMoreVideos() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            // If we've reached the end, append the videos again
            if (this.currentVideoIndex >= this.sortedVideos.length) {
                // Shuffle a new copy of the videos and append them
                const shuffleArray = arr => {
                    const newArr = [...arr];
                    for (let i = newArr.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
                    }
                    return newArr;
                };

                // Add another set of shuffled videos to the end
                this.sortedVideos = [
                    ...this.sortedVideos,
                    ...shuffleArray(this.allVideos)
                ];
            }

            const videosToLoad = this.sortedVideos.slice(
                this.currentVideoIndex,
                this.currentVideoIndex + this.videosPerLoad
            );

            for (const video of videosToLoad) {
                const container = document.createElement('div');
                container.className = 'video-container';
                container.dataset.videoId = video.id;
                
                const videoElement = document.createElement('video');
                videoElement.src = video.url;
                videoElement.loop = true;
                videoElement.playsInline = true;
                videoElement.muted = !this.hasUserInteracted;
                videoElement.volume = 1;
                videoElement.controls = false;
                videoElement.setAttribute('playsinline', '');
                videoElement.setAttribute('webkit-playsinline', '');

                // Add more debugging events
                videoElement.addEventListener('loadstart', () => {
                    console.log('Video loadstart:', {
                        id: video.id,
                        muted: videoElement.muted,
                        hasInteracted: this.hasUserInteracted
                    });
                });

                videoElement.addEventListener('canplay', () => {
                    console.log('Video canplay:', {
                        id: video.id,
                        muted: videoElement.muted,
                        hasInteracted: this.hasUserInteracted
                    });
                });

                videoElement.addEventListener('play', () => {
                    console.log('Video play event:', {
                        id: video.id,
                        muted: videoElement.muted,
                        hasInteracted: this.hasUserInteracted,
                        userActivation: navigator.userActivation?.hasBeenActive
                    });
                });

                // Add debugging events
                videoElement.addEventListener('volumechange', () => {
                    console.log('Volume changed:', {
                        id: video.id,
                        muted: videoElement.muted,
                        volume: videoElement.volume,
                        autoplay: videoElement.autoplay
                    });
                });

                // Add click handler back for debugging
                container.addEventListener('click', (e) => {
                    if (e.target.closest('.interaction-buttons') || e.target.closest('.video-info')) {
                        return;
                    }

                    if (e.target === container || e.target === videoElement) {
                        console.log('Click state:', {
                            id: video.id,
                            muted: videoElement.muted,
                            volume: videoElement.volume,
                            paused: videoElement.paused
                        });

                        if (videoElement.paused) {
                            videoElement.play().then(() => {
                                console.log('Manual play success:', {
                                    id: video.id,
                                    muted: videoElement.muted,
                                    volume: videoElement.volume
                                });
                            }).catch(error => {
                                console.error('Manual play failed:', error);
                            });
                        } else {
                            videoElement.pause();
                        }
                    }
                });

                // Update the Intersection Observer
                const observer = new IntersectionObserver(
                    (entries) => {
                        if (this.isScrollLocked) return;

                        entries.forEach(entry => {
                            if (entry.isIntersecting && entry.intersectionRatio > 0.8) {
                                if (!container.hasAttribute('data-user-interaction')) {
                                    const currentlyPlaying = this.feed.querySelector('.video-container.active');
                                    if (currentlyPlaying && currentlyPlaying !== container) {
                                        const video = currentlyPlaying.querySelector('video');
                                        console.log('Stopping previous video:', {
                                            id: currentlyPlaying.dataset.videoId,
                                            muted: video.muted,
                                            hasInteracted: this.hasUserInteracted
                                        });
                                        video.pause();
                                        video.currentTime = 0;
                                        currentlyPlaying.classList.remove('active');
                                    }

                                    console.log('Starting new video:', {
                                        id: video.id,
                                        muted: videoElement.muted,
                                        hasInteracted: this.hasUserInteracted
                                    });

                                    videoElement.currentTime = 0;
                                    videoElement.volume = 1;
                                    // Only unmute if user has interacted
                                    videoElement.muted = !this.hasUserInteracted;

                                    videoElement.play().then(() => {
                                        console.log('Video started successfully:', {
                                            id: video.id,
                                            muted: videoElement.muted,
                                            hasInteracted: this.hasUserInteracted
                                        });
                                    }).catch(error => {
                                        console.error('Failed to start video:', error);
                                    });

                                    container.classList.add('active');
                                }
                            }
                        });
                    },
                    {
                        threshold: [0.8],
                        rootMargin: '-10% 0px'
                    }
                );
                observer.observe(container);

                // Add interaction buttons
                const interactionButtons = document.createElement('div');
                interactionButtons.className = 'interaction-buttons';
                const isLiked = this.likedVideos.has(video.id);
                interactionButtons.innerHTML = `
                    <button class="interaction-btn like-btn ${isLiked ? 'liked' : ''}">
                        ${isLiked ? '❤️' : '🤍'}
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

                // Add like button handler
                const likeBtn = interactionButtons.querySelector('.like-btn');
                likeBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Lock scroll and mark interaction
                    this.isScrollLocked = true;
                    container.setAttribute('data-user-interaction', 'true');
                    
                    // Keep the current video playing
                    const wasPlaying = !videoElement.paused;
                    
                    if (!localStorage.getItem('username')) {
                        alert('Please sign in to like videos');
                        return;
                    }

                    try {
                        this.isLikeUpdate = true;
                        const videoRef = this.videosRef.child(video.id);
                        const isLiked = this.likedVideos.has(video.id);

                        // Get current likes count from Firebase
                        const snapshot = await videoRef.once('value');
                        const currentLikes = snapshot.val()?.likes || 0;

                        if (isLiked) {
                            // Unlike
                            await Promise.all([
                                videoRef.update({ likes: currentLikes - 1 }),
                                this.userLikesRef.child(video.id).remove()
                            ]);
                            this.likedVideos.delete(video.id);
                            
                            // Update all instances of this video in the feed
                            document.querySelectorAll(`.video-container[data-video-id="${video.id}"] .like-btn`).forEach(btn => {
                                btn.classList.remove('liked');
                                btn.innerHTML = `🤍<span>${currentLikes - 1}</span>`;
                            });
                            
                            video.likes = currentLikes - 1;
                        } else {
                            // Like
                            await Promise.all([
                                videoRef.update({ likes: currentLikes + 1 }),
                                this.userLikesRef.child(video.id).set(true)
                            ]);
                            this.likedVideos.add(video.id);
                            
                            // Update all instances of this video in the feed
                            document.querySelectorAll(`.video-container[data-video-id="${video.id}"] .like-btn`).forEach(btn => {
                                btn.classList.add('liked');
                                btn.innerHTML = `❤️<span>${currentLikes + 1}</span>`;
                            });
                            
                            video.likes = currentLikes + 1;
                        }

                        // Update localStorage with user-specific key
                        localStorage.setItem(this.likedVideosKey, JSON.stringify([...this.likedVideos]));

                        // Restore video state and unlock after delay
                        setTimeout(() => {
                            if (wasPlaying) {
                                videoElement.play();
                            }
                            this.isScrollLocked = false;
                            container.removeAttribute('data-user-interaction');
                        }, 100);

                    } catch (error) {
                        console.error('Error updating likes:', error);
                        alert('Failed to update like');
                        if (wasPlaying) {
                            videoElement.play();
                        }
                        this.isScrollLocked = false;
                        container.removeAttribute('data-user-interaction');
                    }
                });

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
            }

            this.currentVideoIndex += this.videosPerLoad;
            this.isLoading = false;
        } catch (error) {
            console.error('Error loading more videos:', error);
            this.isLoading = false;
        }
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    // Add new method for handling infinite scroll
    handleScroll() {
        if (this.isLoading) return;

        const lastVideo = this.feed.lastElementChild;
        if (!lastVideo) return;

        const lastVideoOffset = lastVideo.offsetTop + lastVideo.clientHeight;
        const pageOffset = this.feed.scrollTop + this.feed.clientHeight;

        // If we're near the bottom, load more videos
        if (pageOffset > lastVideoOffset - 1000) {  // 1000px threshold
            this.loadMoreVideos();
        }
    }

    async getPublisherProfilePic(username) {
        try {
            const snapshot = await this.database.ref('users')
                .orderByChild('username')
                .equalTo(username)
                .once('value');
            
            const userData = snapshot.val();
            if (userData) {
                const userId = Object.keys(userData)[0];
                return userData[userId].profilePic || window.DEFAULT_AVATAR;
            }
            return window.DEFAULT_AVATAR;
        } catch (error) {
            console.error('Error getting publisher profile pic:', error);
            return window.DEFAULT_AVATAR;
        }
    }

    // Add new method to load user likes from Firebase
    async loadUserLikes() {
        try {
            const username = localStorage.getItem('username');
            if (!username) return;

            const snapshot = await this.userLikesRef.once('value');
            const likes = snapshot.val() || {};
            
            // Update local storage and memory with Firebase data
            this.likedVideos = new Set(Object.keys(likes));
            localStorage.setItem(this.likedVideosKey, JSON.stringify([...this.likedVideos]));
        } catch (error) {
            console.error('Error loading user likes:', error);
        }
    }
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    new SkiddoinkApp();
});