const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIHJ4PSI1MCIgZmlsbD0iIzQ0NDQ0NCIvPjxwYXRoIGQ9Ik01MCAyNUMzNi4xOTI5IDI1IDI1IDM2LjE5MjkgMjUgNTBDMjUgNjMuODA3MSAzNi4xOTI5IDc1IDUwIDc1QzYzLjgwNzEgNzUgNzUgNjMuODA3MSA3NSA1MEM3NSAzNi4xOTI5IDYzLjgwNzEgMjUgNTAgMjVaTTQwLjUgNDQuNUM0Mi40MzMgNDQuNSA0NCA0Mi45MzMgNDQgNDFDNDQgMzkuMDY3IDQyLjQzMyAzNy41IDQwLjUgMzcuNUMzOC41NjcgMzcuNSAzNyAzOS4wNjcgMzcgNDFDMzcgNDIuOTMzIDM4LjU2NyA0NC41IDQwLjUgNDQuNVpNNTkuNSA0NC41QzYxLjQzMyA0NC41IDYzIDQyLjkzMyA2MyA0MUM2MyAzOS4wNjcgNjEuNDMzIDM3LjUgNTkuNSAzNy41QzU3LjU2NyAzNy41IDU2IDM5LjA2NyA1NiA0MUM1NiA0Mi45MzMgNTcuNTY3IDQ0LjUgNTkuNSA0NC41Wk01MCA2Ny41QzU1LjUyMjggNjcuNSA2MCA2My4wMjI4IDYwIDU3LjVINDBDNDAgNjMuMDIyOCA0NC40NzcyIDY3LjUgNTAgNjcuNVoiIGZpbGw9IiNGRkYiLz48L3N2Zz4=';

class SkiddoinkApp {
    constructor() {
        this.decodeUsername = username => username.replace(/\(/g, '.');

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
        this.commentsRef = this.database.ref('comments');
        this.commentLikesRef = this.database.ref('commentLikes');

        // Setup username display
        this.usernameDisplay = document.querySelector('.username-display');
        if (this.usernameDisplay) {
            this.usernameDisplay.textContent = 'View Profile';
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
        
        this.scrollTimeout = null;
        this.isScrolling = false;
        
        // Replace the scroll event listener with the original Intersection Observer
        const observer = new IntersectionObserver(
            (entries) => {
                if (this.isInCommentMode || this.isTransitioning || this.isWaitingForStart) return;
                
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const container = entry.target;
                        const videoElement = container.querySelector('video');
                        
                        // Stop any other playing videos
                        const currentlyPlaying = this.feed.querySelector('.video-container.active');
                        if (currentlyPlaying && currentlyPlaying !== container) {
                            const video = currentlyPlaying.querySelector('video');
                            video.pause();
                            currentlyPlaying.classList.remove('active');
                        }

                        // Play this video
                        if (videoElement) {
                            videoElement.currentTime = 0;
                            videoElement.play().catch(console.error);
                            container.classList.add('active');
                        }
                    }
                });
            },
            { threshold: 0.7 }
        );

        // Add scroll lock property
        this.isScrollLocked = false;

        // Add flag to prevent reload on like updates
        this.isLikeUpdate = false;

        // Add flag for first interaction
        this.hasUserInteracted = false;
        
        // Listen for ANY user interaction, not just clicks
        const interactionEvents = ['click', 'touchstart', 'keydown', 'scroll'];
        interactionEvents.forEach(eventType => {
            document.addEventListener(eventType, () => {
                if (!this.hasUserInteracted) {
                    console.log(`First user interaction detected (${eventType})`);
                    this.hasUserInteracted = true;
                    // Try to unmute and play all videos
                    document.querySelectorAll('.video-container video').forEach(video => {
                        if (video.closest('.video-container').classList.contains('active')) {
                            video.muted = false;
                            video.volume = 1;
                            video.play().catch(err => console.error('Play failed:', err));
                        }
                    });
                }
            }, { once: true });
        });

        this.isInCommentMode = false;

        // Add this property to store observers
        this.videoObservers = new Map(); // Store observers by video ID
        this.currentVideoId = null;  // Track current video ID
        this.observers = new Map(); // Store observers for each video container

        this.feed.addEventListener('scroll', () => {
            if (!this.isInCommentMode) {
                this.handleScroll();
            }
        }, { passive: true });

        // Initialize following set
        this.following = new Set();
        this.loadFollowing();

        // Add properties for double tap detection
        this.lastTap = 0;
        this.lastTapX = 0;
        this.lastTapY = 0;
        this.doubleTapDelay = 300; // milliseconds between taps
        this.doubleTapRadius = 30; // pixels of tolerance for tap position

        this.tapTimeout = null;  // Add this for single tap detection

        if (this.feed) {
            this.setupSearch();
        }

        // Remove all muting related code and replace with welcome popup
        this.showWelcomePopup();

        // Add keyboard shortcut for logout
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                if (confirm('Are you sure you want to sign out?')) {
                    localStorage.clear();
                    window.location.replace('./index.html'); // Use replace to prevent going back
                }
            }
        });

        // Add this property to track active comment modal
        this.activeCommentModal = null;
    }

    checkUsername() {
        if (!localStorage.getItem('username')) {
            const modal = document.createElement('div');
            modal.className = 'username-modal';
            modal.innerHTML = `
                <div class="username-modal-content">
                    <h2>Welcome to Skiddoink!</h2>
                    <div class="auth-tabs">
                        <button class="auth-tab active" data-tab="signin">Log In</button>
                        <button class="auth-tab" data-tab="signup">Sign Up</button>
                    </div>
                    <div class="auth-form signin-form">
                        <input type="text" id="signinUsername" placeholder="Username">
                        <input type="password" id="signinPassword" placeholder="Password">
                        <button id="signinBtn">Log In</button>
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
        // Declare these variables once at the top
        const activeVideoId = localStorage.getItem('activeVideoId');
        const shouldScrollToVideo = localStorage.getItem('scrollToVideo');
        
        console.log('Initial videos array:', videos);

        // Before any filtering
        if (Array.isArray(videos)) {
            console.log('Videos is an array');
        } else {
            console.log('Videos is an object:', Object.keys(videos));
            // Convert to array if it's an object
            videos = Object.entries(videos).map(([id, video]) => ({
                ...video,
                id  // Make sure ID is included
            }));
        }

        console.log('After conversion:', videos); // Debug converted data

        this.allVideos = videos;
        this.feed.innerHTML = '';
        
        // Check if we're viewing a specific user's videos
        const viewingUser = localStorage.getItem('viewingUserVideos');
        const currentUser = localStorage.getItem('username');
        
        if (viewingUser) {
            // Filter videos to show only the user's videos
            videos = videos.filter(video => {
                // First filter by publisher
                if (video.publisher !== viewingUser) return false;
                
                // Then check mature content unless it's the specific video we clicked
                const showMatureContent = localStorage.getItem('showMatureContent') === 'true';
                const isActiveVideo = video.id === activeVideoId;
                
                if (video.matureContent && !showMatureContent && !isActiveVideo) {
                    return false;
                }
                
                return true;
            });
            
            // Add a header to show whose videos we're viewing
            const header = document.createElement('div');
            header.className = 'user-videos-header';
            header.innerHTML = `
                <h2>@${viewingUser}'s Videos</h2>
                <button class="close-user-videos">✕</button>
            `;
            this.feed.appendChild(header);

            // Add close button handler
            header.querySelector('.close-user-videos').addEventListener('click', () => {
                localStorage.removeItem('viewingUserVideos');
                window.location.reload();
            });
        } else {
            const showMatureContent = localStorage.getItem('showMatureContent') === 'true';
            
            console.log('Before filtering, total videos:', videos.length);
            
            videos = videos.filter(video => {
                // Always show the video we're trying to navigate to
                if (video.id === activeVideoId) {
                    console.log('Keeping active video:', video.id);
                    return true;
                }

                // Normal mature content filtering
                const shouldShow = showMatureContent || !video.matureContent;
                if (!shouldShow) {
                    console.log('Filtered out video:', video.id);
                }
                return shouldShow;
            });

            // Only filter out current user's videos if not coming from search
            if (!shouldScrollToVideo) {
                videos = videos.filter(video => video.publisher !== currentUser);
            }
        }

        console.log('After filtering, total videos:', videos.length);

        if (!videos || videos.length === 0) {
            const noVideos = document.createElement('div');
            noVideos.className = 'loading-message';
            noVideos.textContent = viewingUser ? 
                `@${viewingUser} has no videos yet` : 
                'No videos available';
            this.feed.appendChild(noVideos);
            return;
        }

        // Remove the second declarations and just use the if statement
        if (activeVideoId && shouldScrollToVideo) {
            console.log('Looking for video:', activeVideoId);
            // Find the active video
            const activeVideo = videos.find(v => v.id === activeVideoId);
            
            if (activeVideo) {
                this.sortedVideos = [
                    activeVideo,
                    ...videos.filter(v => v.id !== activeVideoId)
                ];
            } else {
                alert('Video not found');
                localStorage.removeItem('activeVideoId');
                localStorage.removeItem('scrollToVideo');
                window.history.back();
                return;
            }
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
            const videosToLoad = this.sortedVideos.slice(
                this.currentVideoIndex,
                this.currentVideoIndex + this.videosPerLoad
            );

            for (const video of videosToLoad) {
                console.log('Processing item:', video);
                console.log('Item type:', video.type);
                console.log('Item URL:', video.url);

                const container = document.createElement('div');
                container.className = `video-container ${video.type === 'image' ? 'image-post' : ''}`;
                container.dataset.videoId = video.id;

                let mediaElement;
                if (video.type === 'image') {
                    mediaElement = document.createElement('img');
                    mediaElement.src = video.url;
                    mediaElement.alt = video.title || 'Image post';
                } else {
                    mediaElement = document.createElement('video');
                    mediaElement.src = video.url;
                    mediaElement.loop = true;
                    mediaElement.playsInline = true;
                    // Start muted but allow unmuting
                    mediaElement.muted = !this.hasUserInteracted;
                }

                container.appendChild(mediaElement);

                // Add unmute hint for videos
                if (video.type !== 'image' && !this.hasUserInteracted) {
                    const unmuteHint = document.createElement('div');
                    unmuteHint.className = 'unmute-hint';
                    unmuteHint.textContent = 'Tap to unmute';
                    container.appendChild(unmuteHint);
                }

                // Update click handler
                container.addEventListener('click', (e) => {
                    if (e.target.closest('.interaction-buttons') || e.target.closest('.video-info')) {
                        return;
                    }

                    const currentTime = new Date().getTime();
                    const tapX = e.clientX;
                    const tapY = e.clientY;
                    const timeDiff = currentTime - this.lastTap;
                    const distance = Math.hypot(tapX - this.lastTapX, tapY - this.lastTapY);

                    if (this.tapTimeout) {
                        clearTimeout(this.tapTimeout);
                        this.tapTimeout = null;
                    }

                    if (timeDiff < this.doubleTapDelay && distance < this.doubleTapRadius) {
                        // Double tap - handle like
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const likeBtn = container.querySelector('.like-btn');
                        if (likeBtn && !likeBtn.classList.contains('liked')) {
                            const heart = document.createElement('div');
                            heart.innerHTML = '❤️';
                            heart.style.cssText = `
                                position: absolute;
                                left: ${tapX - container.getBoundingClientRect().left}px;
                                top: ${tapY - container.getBoundingClientRect().top}px;
                                transform: translate(-50%, -50%) scale(0);
                                font-size: 100px;
                                pointer-events: none;
                                z-index: 1000;
                                animation: heartPop 0.5s ease-out forwards;
                            `;
                            container.appendChild(heart);
                            likeBtn.click();
                            setTimeout(() => heart.remove(), 500);
                        }
                    } else {
                        // Single tap - handle play/pause and unmute
                        this.tapTimeout = setTimeout(() => {
                            if (video.type !== 'image' && (e.target === container || e.target === mediaElement)) {
                                if (!this.hasUserInteracted) {
                                    // First interaction - unmute and ensure playing
                                    this.hasUserInteracted = true;
                                    mediaElement.muted = false;
                                    if (mediaElement.paused) {
                                        mediaElement.play().catch(console.error);
                                    }
                                    // Remove unmute hint
                                    const unmuteHint = container.querySelector('.unmute-hint');
                                    if (unmuteHint) {
                                        unmuteHint.remove();
                                    }
                                    // Unmute all visible videos
                                    document.querySelectorAll('.video-container.active video').forEach(video => {
                                        video.muted = false;
                                    });
                                } else {
                                    // Toggle play/pause after first interaction
                                    if (mediaElement.paused) {
                                        mediaElement.play().catch(console.error);
                                    } else {
                                        mediaElement.pause();
                                    }
                                }
                            }
                        }, 200);
                    }

                    this.lastTap = currentTime;
                    this.lastTapX = tapX;
                    this.lastTapY = tapY;
                });

                // Create a new observer for each video container
                const observer = new IntersectionObserver(
                    (entries) => {
                        const entry = entries[0];
                        if (entry.isIntersecting && !this.isInCommentMode) {
                            if (video.type !== 'image') {
                                // Stop any other playing videos
                                const currentlyPlaying = this.feed.querySelector('.video-container.active');
                                if (currentlyPlaying && currentlyPlaying !== container) {
                                    const otherVideo = currentlyPlaying.querySelector('video');
                                    if (otherVideo) {
                                        otherVideo.pause();
                                        currentlyPlaying.classList.remove('active');
                                    }
                                }

                                // Play this video
                                mediaElement.currentTime = 0;
                                // Maintain unmuted state if user has interacted
                                mediaElement.muted = !this.hasUserInteracted;
                                mediaElement.play().catch(console.error);
                                container.classList.add('active');
                            }
                        } else if (!entry.isIntersecting && video.type !== 'image') {
                            mediaElement.pause();
                            container.classList.remove('active');
                        }
                    },
                    { threshold: 0.7 }
                );

                // Only observe if it's a video
                if (video.type !== 'image') {
                    observer.observe(container);
                    this.observers.set(container, observer);
                }

                // Add interaction buttons
                const interactionButtons = document.createElement('div');
                interactionButtons.className = 'interaction-buttons';
                const isLiked = this.likedVideos.has(video.id);
                const currentUsername = localStorage.getItem('username');
                const isOwnVideo = video.publisher === currentUsername;

                interactionButtons.innerHTML = `
                    <button class="interaction-btn like-btn ${isLiked ? 'liked' : ''}" ${isOwnVideo ? 'disabled' : ''}>
                        ${isLiked ? '❤️' : '🤍'}
                        <span>${video.likes || 0}</span>
                    </button>
                    <button class="interaction-btn comment-btn">
                        💬
                        <span class="comment-count">0</span>
                    </button>
                `;

                // Add like button handler
                const likeBtn = interactionButtons.querySelector('.like-btn');
                likeBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (video.publisher === localStorage.getItem('username')) {
                        return; // Do nothing if it's the user's own video
                    }
                    
                    // Lock scroll and mark interaction
                    this.isScrollLocked = true;
                    container.setAttribute('data-user-interaction', 'true');
                    
                    // Keep the current video playing
                    const wasPlaying = video.type === 'image' ? false : !mediaElement.paused;
                    
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
                            if (wasPlaying && video.type !== 'image') {
                                mediaElement.play();
                            }
                            this.isScrollLocked = false;
                            container.removeAttribute('data-user-interaction');
                        }, 100);

                    } catch (error) {
                        console.error('Error updating likes:', error);
                        alert('Failed to update like');
                        if (wasPlaying && video.type !== 'image') {
                            mediaElement.play();
                        }
                        this.isScrollLocked = false;
                        container.removeAttribute('data-user-interaction');
                    }
                });

                // Add comment button handler
                const commentBtn = interactionButtons.querySelector('.comment-btn');
                commentBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showComments({...video, id: video.id});
                });

                // Add video info
                const infoOverlay = document.createElement('div');
                infoOverlay.className = 'video-info';
                infoOverlay.innerHTML = `
                    <div class="video-text">
                        <div class="publisher-info">
                            <img src="${video.publisherPic || window.DEFAULT_AVATAR}" class="publisher-pic" alt="Profile" 
                                onerror="this.src='${window.DEFAULT_AVATAR}'">
                            <div>
                                <h3>${video.title || (video.type === 'image' ? 'Image Post' : 'Untitled Video')}</h3>
                                <div class="publisher-row">
                                    <a href="./profile.html?user=${video.publisher}" class="publisher">
                                        @${video.publisher ? this.decodeUsername(video.publisher) : '[Deleted User]'}
                                    </a>
                                    ${video.publisher && video.publisher !== '[Deleted User]' && video.publisher !== localStorage.getItem('username') ? `
                                        <button class="follow-btn" data-username="${video.publisher}" data-following="${this.following.has(video.publisher)}">
                                            ${this.following.has(video.publisher) ? 'Following' : 'Follow'}
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <p class="description">${video.description || ''}</p>
                        <p class="date">Posted ${this.formatDate(video.timestamp)}</p>
                    </div>
                `;

                // Add follow button handler
                const followBtn = infoOverlay.querySelector('.follow-btn');
                if (followBtn) {
                    followBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const publisherUsername = followBtn.dataset.username;
                        await this.toggleFollow(publisherUsername);
                        
                        // Update all follow buttons for this user
                        document.querySelectorAll(`.follow-btn[data-username="${publisherUsername}"]`)
                            .forEach(btn => {
                                btn.textContent = this.following.has(publisherUsername) ? 'Following' : 'Follow';
                                btn.dataset.following = this.following.has(publisherUsername).toString();
                            });
                    });
                }

                // Add delete button (hidden by default)
                const deleteButton = document.createElement('button');
                deleteButton.className = 'delete-button';
                deleteButton.innerHTML = '🗑️';

                // Show delete button by default for video owner, hidden for others
                const isOwner = video.publisher === currentUsername;
                const isAdmin = currentUsername === 'tnc13';
                deleteButton.style.display = (isOwner || isAdmin) ? 'block' : 'none';

                // Modify delete functionality
                deleteButton.addEventListener('click', async (e) => {
                    e.stopPropagation(); // Prevent video play/pause
                    
                    if (isOwner || isAdmin) {
                        if (confirm('Are you sure you want to delete this video?')) {
                            try {
                                await this.videosRef.child(video.id).remove();
                                container.remove();
                            } catch (error) {
                                console.error('Error deleting video:', error);
                                alert('Failed to delete video');
                            }
                        }
                    }
                });

                // Modify ctrl key event listeners to only apply for non-owners
                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && !isOwner && !isAdmin) {
                        deleteButton.style.display = 'block';
                    }
                });

                document.addEventListener('keyup', (e) => {
                    if (!e.ctrlKey && !isOwner && !isAdmin) {
                        deleteButton.style.display = 'none';
                    }
                });

                container.appendChild(mediaElement);
                container.appendChild(interactionButtons);
                container.appendChild(infoOverlay);
                container.appendChild(deleteButton);
                this.feed.appendChild(container);

                // Mark video as watched when it plays
                if (video.type !== 'image') {
                    mediaElement.addEventListener('play', () => {
                        if (!this.watchedVideos.has(video.id)) {
                            this.watchedVideos.add(video.id);
                            localStorage.setItem('watchedVideos', JSON.stringify([...this.watchedVideos]));
                        }
                    });
                }

                // Update comment count for this video
                this.commentsRef.orderByChild('videoId').equalTo(video.id).once('value', snapshot => {
                    const comments = snapshot.val() || {};
                    const commentCount = Object.keys(comments).length;
                    const countSpan = interactionButtons.querySelector('.comment-count');
                    if (countSpan) {
                        countSpan.textContent = commentCount;
                    }
                });
            }

            this.currentVideoIndex += this.videosPerLoad;
        } catch (error) {
            console.error('Error loading more videos:', error);
        }
        this.isLoading = false;
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
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

    async showComments(video) {
        // If there's already an open comment modal, just return
        if (this.activeCommentModal || this.isInCommentMode) {
            return;
        }

        this.isInCommentMode = true;
        
        const modal = document.createElement('div');
        modal.className = 'comment-modal';
        modal.innerHTML = `
            <div class="comment-header">
                <h3>Comments</h3>
                <button class="close-comments">×</button>
            </div>
            <div class="comments-container"></div>
            <div class="comment-input-container">
                <input type="text" class="comment-input" placeholder="Add a comment...">
                <button class="comment-submit" disabled>Post</button>
            </div>
        `;

        document.body.appendChild(modal);
        this.activeCommentModal = modal;
        requestAnimationFrame(() => modal.classList.add('active'));

        // Improved scroll handler
        const handleScroll = () => {
            if (this.activeCommentModal && this.isInCommentMode) {
                const activeContainer = this.feed.querySelector('.video-container.active');
                const activeVideo = activeContainer?.querySelector('video');
                
                // Pause the video before closing modal
                if (activeVideo && !activeVideo.paused) {
                    activeVideo.pause();
                }
                
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    this.activeCommentModal = null;
                    this.isInCommentMode = false;
                    
                    // Find the video that should be playing based on viewport
                    const containers = Array.from(document.querySelectorAll('.video-container'));
                    const visibleContainer = containers.find(container => {
                        const rect = container.getBoundingClientRect();
                        const threshold = window.innerHeight * 0.7;
                        return rect.top <= threshold && rect.bottom >= threshold;
                    });

                    if (visibleContainer) {
                        const video = visibleContainer.querySelector('video');
                        if (video) {
                            // Stop any other playing videos
                            containers.forEach(c => {
                                if (c !== visibleContainer) {
                                    const v = c.querySelector('video');
                                    if (v) v.pause();
                                    c.classList.remove('active');
                                }
                            });

                            // Play the visible video
                            video.currentTime = 0;
                            video.play().catch(console.error);
                            visibleContainer.classList.add('active');
                        }
                    }

                    this.isTransitioning = false;
                }, 300);
                
                // Remove the scroll listener
                this.feed.removeEventListener('scroll', handleScroll);
            }
        };

        this.feed.addEventListener('scroll', handleScroll);

        // Improved close button handler
        const closeBtn = modal.querySelector('.close-comments');
        closeBtn.addEventListener('click', () => {
            if (!this.activeCommentModal) return;
            
            const activeContainer = this.feed.querySelector('.video-container.active');
            const activeVideo = activeContainer?.querySelector('video');
            const wasPlaying = activeVideo && !activeVideo.paused;
            
            this.isTransitioning = true;
            modal.classList.remove('active');
            
            setTimeout(() => {
                modal.remove();
                this.activeCommentModal = null;
                this.isInCommentMode = false;
                
                if (activeContainer) {
                    activeContainer.classList.add('active');
                }
                
                this.isTransitioning = false;
                // Remove the scroll listener when closing
                this.feed.removeEventListener('scroll', handleScroll);
            }, 300);
        });

        const input = modal.querySelector('.comment-input');
        const submitBtn = modal.querySelector('.comment-submit');
        const container = modal.querySelector('.comments-container');

        // Enable/disable submit button based on input
        input.addEventListener('input', () => {
            submitBtn.disabled = !input.value.trim();
        });

        // Handle comment submission
        submitBtn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) return;

            submitBtn.disabled = true;
            input.disabled = true;

            try {
                // Store current video state
                const activeVideo = this.feed.querySelector('.video-container.active');
                const videoElement = activeVideo?.querySelector('video');
                const wasPlaying = !videoElement?.paused;
                
                // Force video to keep playing
                if (videoElement && wasPlaying) {
                    videoElement.play().catch(console.error);
                }

                const username = localStorage.getItem('username');
                if (!username) {
                    alert('Please sign in to comment');
                    return;
                }

                // Get current user's profile picture before posting comment
                const userSnapshot = await this.database.ref('users')
                    .orderByChild('username')
                    .equalTo(username)
                    .once('value');
                
                const userData = userSnapshot.val();
                const userId = Object.keys(userData)[0];
                const currentProfilePic = userData[userId].profilePic || window.DEFAULT_AVATAR;

                const commentData = {
                    text,
                    username,
                    videoId: video.id,
                    timestamp: Date.now(),
                    likes: 0,
                    userPic: currentProfilePic  // Always use current profile picture
                };

                // Create new comment reference
                const newCommentRef = this.commentsRef.push();

                // Do everything in parallel
                await Promise.all([
                    // Post the comment
                    newCommentRef.set(commentData),
                    // Keep video playing
                    videoElement?.play()
                ]);

                // Clear input but keep focus
                input.value = '';
                input.focus();

                // Make absolutely sure the video stays active
                if (activeVideo && videoElement) {
                    activeVideo.classList.add('active');
                    if (wasPlaying) {
                        videoElement.play().catch(console.error);
                    }
                }

            } catch (error) {
                console.error('Error posting comment:', error);
                alert('Failed to post comment');
            } finally {
                submitBtn.disabled = false;
                input.disabled = false;
            }
        });

        // Load and listen for comments
        this.commentsRef.orderByChild('videoId').equalTo(video.id).on('value', async snapshot => {
            const comments = snapshot.val() || {};
            
            // Get current user's liked comments
            const username = localStorage.getItem('username');
            let userLikedComments = new Set();
            if (username) {
                const likesSnapshot = await this.commentLikesRef.child(username).once('value');
                userLikedComments = new Set(Object.keys(likesSnapshot.val() || {}));
            }

            // Only do full rebuild if container is empty
            if (container.children.length === 0) {
                // Convert comments to array for sorting
                let commentsArray = Object.entries(comments).map(([id, comment]) => ({
                    ...comment,
                    id,
                    isLiked: userLikedComments.has(id)
                }));

                // Sort comments
                commentsArray.sort((a, b) => {
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    if (a.likes !== b.likes) return (b.likes || 0) - (a.likes || 0);
                    return b.timestamp - a.timestamp;
                });

                container.innerHTML = '';  // Clear only on initial load
                
                // Build initial comment list
                commentsArray.forEach(comment => {
                    const div = document.createElement('div');
                    div.className = 'comment-item';
                    div.dataset.commentId = comment.id;  // Add data attribute for finding comments
                    const isCreator = comment.username === video.publisher;
                    const isOwnComment = comment.username === localStorage.getItem('username');
                    const isAdmin = localStorage.getItem('username') === 'tnc13';

                    div.innerHTML = `
                        <img src="${comment.userPic || DEFAULT_AVATAR}" class="comment-pic" alt="Profile">
                        <div class="comment-content">
                            <div class="comment-header-text">
                                <a href="./profile.html?user=${comment.username}" class="comment-username">
                                    @${comment.username ? this.decodeUsername(comment.username) : '[Deleted User]'}
                                </a>
                                ${isCreator ? '<span class="creator-badge">Creator</span>' : ''}
                                ${(isOwnComment || isAdmin) ? `
                                    <button class="delete-comment-btn" title="Delete comment">🗑️</button>
                                ` : ''}
                            </div>
                            <p class="comment-text">${comment.text}</p>
                            <div class="comment-actions">
                                <button class="comment-like ${comment.isLiked ? 'liked' : ''}">
                                    ${comment.isLiked ? '❤️' : '🤍'}
                                    <span>${comment.likes || 0}</span>
                                </button>
                            </div>
                        </div>
                    `;

                    // Add like button handler
                    const likeBtn = div.querySelector('.comment-like');
                    likeBtn.addEventListener('click', async () => {
                        if (!username) {
                            alert('Please sign in to like comments');
                            return;
                        }

                        try {
                            const commentRef = this.commentsRef.child(comment.id);
                            const userLikeRef = this.commentLikesRef.child(username).child(comment.id);
                            const currentLikes = comment.likes || 0;

                            // Optimistically update UI first
                            if (comment.isLiked) {
                                likeBtn.innerHTML = `🤍 <span>${currentLikes - 1}</span>`;
                                likeBtn.classList.remove('liked');
                            } else {
                                likeBtn.innerHTML = `❤️ <span>${currentLikes + 1}</span>`;
                                likeBtn.classList.add('liked');
                            }

                            // Then update Firebase
                            if (comment.isLiked) {
                                await Promise.all([
                                    commentRef.update({ likes: currentLikes - 1 }),
                                    userLikeRef.remove()
                                ]);
                                comment.likes = currentLikes - 1;
                                comment.isLiked = false;
                            } else {
                                await Promise.all([
                                    commentRef.update({ likes: currentLikes + 1 }),
                                    userLikeRef.set(true)
                                ]);
                                comment.likes = currentLikes + 1;
                                comment.isLiked = true;
                            }
                        } catch (error) {
                            console.error('Error updating comment like:', error);
                            alert('Failed to update like');
                            // Revert UI on error
                            if (comment.isLiked) {
                                likeBtn.innerHTML = `❤️ <span>${comment.likes}</span>`;
                                likeBtn.classList.add('liked');
                            } else {
                                likeBtn.innerHTML = `🤍 <span>${comment.likes}</span>`;
                                likeBtn.classList.remove('liked');
                            }
                        }
                    });

                    // Add delete handler
                    if (isOwnComment || isAdmin) {
                        const deleteBtn = div.querySelector('.delete-comment-btn');
                        deleteBtn.addEventListener('click', async () => {
                            if (confirm('Are you sure you want to delete this comment?')) {
                                try {
                                    await this.commentsRef.child(comment.id).remove();
                                } catch (error) {
                                    console.error('Error deleting comment:', error);
                                    alert('Failed to delete comment');
                                }
                            }
                        });
                    }

                    container.appendChild(div);
                });
            } else {
                // Just update like counts and states for existing comments
                Object.entries(comments).forEach(([commentId, updatedComment]) => {
                    const existingComment = container.querySelector(`[data-comment-id="${commentId}"]`);
                    if (existingComment) {
                        const likeBtn = existingComment.querySelector('.comment-like');
                        if (likeBtn) {
                            const isLiked = userLikedComments.has(commentId);
                            likeBtn.innerHTML = `${isLiked ? '❤️' : '🤍'} <span>${updatedComment.likes || 0}</span>`;
                            if (isLiked) {
                                likeBtn.classList.add('liked');
                            } else {
                                likeBtn.classList.remove('liked');
                            }
                        }
                    }
                });
            }
        });

        // In the showComments method, add this after the input event listener:
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !submitBtn.disabled) {
                e.preventDefault(); // Prevent newline
                submitBtn.click(); // Trigger the same click handler
            }
        });
    }

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

    async loadFollowing() {
        const username = localStorage.getItem('username');
        if (!username) return;
        
        try {
            // Load from both following and users nodes
            const [followingSnapshot, userFollowingSnapshot] = await Promise.all([
                this.database.ref(`following/${username}`).once('value'),
                this.database.ref(`users/${username}/following`).once('value')
            ]);
            
            const followingData = followingSnapshot.val() || {};
            const userFollowingData = userFollowingSnapshot.val() || {};
            
            // Combine both sources
            this.following = new Set([
                ...Object.keys(followingData),
                ...Object.keys(userFollowingData)
            ]);
            
            // Update any visible follow buttons
            this.following.forEach(publisherUsername => {
                document.querySelectorAll(`.follow-btn[data-username="${publisherUsername}"]`)
                    .forEach(btn => {
                        btn.textContent = 'Following';
                        btn.dataset.following = 'true';
                    });
            });
        } catch (error) {
            console.error('Error loading following data:', error);
        }
    }

    async toggleFollow(publisherUsername) {
        const username = localStorage.getItem('username');
        if (!username) {
            alert('Please sign in to follow users');
            return;
        }
        
        // Add stricter check for deleted user
        if (!publisherUsername || publisherUsername === '[Deleted User]' || username === publisherUsername) {
            console.log('Cannot follow this user');
            return;
        }
        
        try {
            const encodedUsername = username.replace(/\./g, '(');
            const encodedPublisher = publisherUsername.replace(/\./g, '(');
            
            const followingRef = this.database.ref(`following/${encodedUsername}/${encodedPublisher}`);
            const followersRef = this.database.ref(`followers/${encodedPublisher}/${encodedUsername}`);
            const userRef = this.database.ref(`users/${encodedUsername}/following/${encodedPublisher}`);
            
            if (this.following.has(publisherUsername)) {
                // Unfollow
                await Promise.all([
                    followingRef.remove(),
                    followersRef.remove(),
                    userRef.remove()
                ]);
                this.following.delete(publisherUsername);
            } else {
                // Follow
                const followData = {
                    timestamp: Date.now()
                };
                
                await Promise.all([
                    followingRef.set(followData),
                    followersRef.set(followData),
                    userRef.set(followData)
                ]);
                this.following.add(publisherUsername);
            }

            // Update all follow buttons for this user
            document.querySelectorAll(`.follow-btn[data-username="${publisherUsername}"]`)
                .forEach(btn => {
                    btn.textContent = this.following.has(publisherUsername) ? 'Following' : 'Follow';
                    btn.dataset.following = this.following.has(publisherUsername).toString();
                });

        } catch (error) {
            console.error('Error toggling follow:', error);
            alert('Failed to update follow status');
        }
    }

    setupSearch() {
        const searchButton = document.querySelector('.search-button');
        searchButton.addEventListener('click', () => {
            window.location.href = './search.html';
        });
    }

    showWelcomePopup() {
        const overlay = document.createElement('div');
        overlay.className = 'welcome-overlay';
        overlay.innerHTML = `
            <div class="welcome-popup">
                <h2>Welcome to Skiddoink</h2>
                <button class="start-watching-btn">Start Watching</button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Pause all videos initially
        document.querySelectorAll('video').forEach(video => {
            video.pause();
        });

        // Prevent any video from playing until "Start Watching" is clicked
        const observer = new IntersectionObserver(() => {}, { threshold: 0.7 });
        this.isWaitingForStart = true;

        const startBtn = overlay.querySelector('.start-watching-btn');
        startBtn.addEventListener('click', () => {
            overlay.remove();
            this.isWaitingForStart = false;
            
            // Start playing the first visible video
            const activeContainer = this.feed.querySelector('.video-container');
            if (activeContainer) {
                const video = activeContainer.querySelector('video');
                if (video) {
                    video.play().catch(console.error);
                    activeContainer.classList.add('active');
                }
            }
        });
    }

    // Add this helper method to validate followers/following
    async validateFollowList(followList) {
        try {
            const validUsers = [];
            for (const username of Object.keys(followList)) {
                // Skip self-follows
                if (username === this.username) continue;

                // Check if user exists
                const userSnapshot = await this.database.ref('users')
                    .orderByChild('username')
                    .equalTo(username)
                    .once('value');

                if (userSnapshot.exists()) {
                    validUsers.push(username);
                } else {
                    // Remove invalid follow entry
                    const path = followList === 'followers' ? 
                        `followers/${this.username}/${username}` : 
                        `following/${this.username}/${username}`;
                    await this.database.ref(path).remove();
                }
            }
            return validUsers;
        } catch (error) {
            console.error('Error validating follow list:', error);
            return [];
        }
    }

    // Modify the loadUserData method to use validation
    async loadUserData() {
        try {
            console.log('Loading user data for:', this.username);
            
            // ... existing code ...

            // Load follower and following counts with validation
            const [followersSnapshot, followingSnapshot] = await Promise.all([
                followersRef.once('value'),
                followingRef.once('value')
            ]);

            // Clean up any self-follows using encoded username
            if (followersSnapshot.val() && followersSnapshot.val()[encodedUsername]) {
                await followersRef.child(encodedUsername).remove();
            }
            if (followingSnapshot.val() && followingSnapshot.val()[encodedUsername]) {
                await followingRef.child(encodedUsername).remove();
            }

            // Validate and count actual followers/following
            const validFollowers = await this.validateFollowList(followersSnapshot.val() || {});
            const validFollowing = await this.validateFollowList(followingSnapshot.val() || {});

            const followerCount = validFollowers.length;
            const followingCount = validFollowing.length;

            // Update stats UI
            const statsContainer = document.querySelector('.profile-stats');
            if (statsContainer) {
                statsContainer.innerHTML = `
                    <div class="stat-item followers-stat" role="button" tabindex="0">
                        <span class="stat-count">${followerCount}</span>
                        <span class="stat-label">Followers</span>
                    </div>
                    <div class="stat-item following-stat" role="button" tabindex="0">
                        <span class="stat-count">${followingCount}</span>
                        <span class="stat-label">Following</span>
                    </div>
                    <div class="stat-item likes-stat">
                        <span class="stat-count">${totalLikes}</span>
                        <span class="stat-label">Likes</span>
                    </div>
                `;
            }

            // Add real-time listeners with validation
            this.database.ref(`followers/${encodedUsername}`).on('value', async snapshot => {
                const validFollowers = await this.validateFollowList(snapshot.val() || {});
                statsContainer.querySelector('.followers-stat .stat-count').textContent = validFollowers.length;
            });

            this.database.ref(`following/${encodedUsername}`).on('value', async snapshot => {
                const validFollowing = await this.validateFollowList(snapshot.val() || {});
                statsContainer.querySelector('.following-stat .stat-count').textContent = validFollowing.length;
            });

        } catch (error) {
            console.error('Error in loadUserData:', error);
        }
    }
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    new SkiddoinkApp();
});