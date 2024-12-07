class ProfilePage {
    constructor() {
        this.decodeUsername = username => username.replace(/\(/g, '.');
        
        console.log('ProfilePage constructor called');
        
        // Get username from URL parameter or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        let rawUsername = urlParams.get('user') || localStorage.getItem('username');
        
        // Handle undefined username
        if (!rawUsername || rawUsername === 'undefined' || rawUsername === '[Deleted User]') {
            console.log('Invalid username - redirecting to index');
            window.location.href = './index.html';
            return;
        }
        
        // Encode username if it comes from URL parameter
        if (urlParams.get('user')) {
            // If it's from URL, we need to encode it for Firebase
            this.username = rawUsername.replace(/\./g, '(');
        } else {
            // If it's from localStorage, it's already encoded
            this.username = rawUsername;
        }
        
        console.log('Username from URL or localStorage:', this.username);
        
        // Additional check after encoding
        if (!this.username || this.username === 'undefined' || this.username === '[Deleted User]') {
            console.log('Invalid username after encoding - redirecting to index');
            window.location.href = './index.html';
            return;
        }

        // Initialize Firebase
        console.log('Initializing Firebase...');
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
        this.commentsRef = this.database.ref('comments');
        this.commentLikesRef = this.database.ref('commentLikes');
        
        // Initialize following set
        this.following = new Set();
        this.loadFollowing();
        
        this.setupUI();
        this.loadUserData();
        this.loadUserVideos();
        
        this.currentVideos = [];
        this.sortSelect = document.getElementById('videoSort');
        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', () => this.sortVideos());
        }

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

        this.setupUsernameChange();
    }

    async loadUserData() {
        try {
            console.log('Loading user data for:', this.username);
            
            const currentUsername = localStorage.getItem('username');
            // Encode both usernames for comparison since Firebase stores them encoded
            const encodedCurrentUsername = currentUsername?.replace(/\./g, '(');
            const encodedUsername = this.username.replace(/\./g, '(');
            
            // Compare encoded versions for own profile check
            const isOwnProfile = encodedUsername === encodedCurrentUsername;
            
            // Get user data including profile picture
            const userSnapshot = await this.database.ref('users')
                .orderByChild('username')
                .equalTo(encodedUsername)
                .once('value');
            
            const userData = userSnapshot.val();
            if (userData) {
                const userId = Object.keys(userData)[0];
                const profilePic = userData[userId].profilePic || window.DEFAULT_AVATAR;
                
                // Update profile picture in UI
                const profilePicElement = document.getElementById('profilePic');
                if (profilePicElement) {
                    profilePicElement.src = profilePic;
                }
            } else {
                // If no user data found, use default avatar
                const profilePicElement = document.getElementById('profilePic');
                if (profilePicElement) {
                    profilePicElement.src = window.DEFAULT_AVATAR;
                }
            }

            // When displaying username, decode it
            document.querySelector('.profile-username').textContent = 
                `@${this.decodeUsername(this.username)}`;
            
            // Update section title with decoded username
            const sectionTitle = document.querySelector('.section-title');
            if (sectionTitle) {
                sectionTitle.textContent = isOwnProfile ? 
                    'Your Videos' : 
                    `${this.decodeUsername(this.username)}'s Videos`;
            }

            // Use encoded username for Firebase lookup
            const followingRef = this.database.ref(`following/${encodedUsername}`);
            const followersRef = this.database.ref(`followers/${encodedUsername}`);

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

            // Calculate total likes from user's videos
            const videosSnapshot = await this.videosRef
                .orderByChild('publisher')
                .equalTo(this.username)
                .once('value');
            
            const videos = videosSnapshot.val() || {};
            const totalLikes = Object.values(videos).reduce((sum, video) => sum + (video.likes || 0), 0);
            
            // Update stats UI with real-time listener
            const statsContainer = document.querySelector('.profile-stats');
            if (statsContainer) {
                const updateStats = () => {
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

                    // Re-add click handlers for followers/following
                    const followersBtn = statsContainer.querySelector('.followers-stat');
                    const followingBtn = statsContainer.querySelector('.following-stat');

                    if (followersBtn) {
                        followersBtn.addEventListener('click', () => {
                            this.showFollowModal('followers');
                        });
                    }

                    if (followingBtn) {
                        followingBtn.addEventListener('click', () => {
                            this.showFollowModal('following');
                        });
                    }
                };
                updateStats();

                // Add real-time listeners with validation
                this.database.ref(`followers/${encodedUsername}`).on('value', async snapshot => {
                    const validFollowers = await this.validateFollowList(snapshot.val() || {});
                    statsContainer.querySelector('.followers-stat .stat-count').textContent = validFollowers.length;
                });

                this.database.ref(`following/${encodedUsername}`).on('value', async snapshot => {
                    const validFollowing = await this.validateFollowList(snapshot.val() || {});
                    statsContainer.querySelector('.following-stat .stat-count').textContent = validFollowing.length;
                });
            }
            
            // Add follow button if not own profile and not deleted user
            if (!isOwnProfile && this.username !== '[Deleted User]' && this.username) {
                if (!currentUsername) return; // Exit if not logged in

                const isFollowing = await this.checkIfFollowing(currentUsername, this.username);
                
                const followBtn = document.createElement('button');
                followBtn.className = 'profile-follow-btn';
                followBtn.textContent = isFollowing ? 'Following' : 'Follow';
                followBtn.dataset.username = this.username;
                followBtn.dataset.following = isFollowing.toString();
                
                followBtn.addEventListener('click', async () => {
                    if (!currentUsername) {
                        alert('Please sign in to follow users');
                        return;
                    }
                    await this.toggleFollow(this.username);
                    followBtn.textContent = this.following.has(this.username) ? 'Following' : 'Follow';
                    followBtn.dataset.following = this.following.has(this.username).toString();
                });
                
                const profileInfo = document.querySelector('.profile-info');
                // Remove any existing follow button before adding new one
                const existingBtn = profileInfo.querySelector('.profile-follow-btn');
                if (existingBtn) {
                    existingBtn.remove();
                }
                profileInfo.appendChild(followBtn);
            }

            // Show change photo overlay only on own profile
            const profilePicOverlay = document.querySelector('.profile-pic-overlay');
            if (profilePicOverlay) {
                if (isOwnProfile) {
                    profilePicOverlay.style.display = 'flex';
                    
                    // Add click handler to profile picture for own profile
                    const profilePic = document.querySelector('.profile-pic');
                    if (profilePic) {
                        profilePic.addEventListener('click', () => {
                            this.handleProfilePicUpload();
                        });
                    }
                } else {
                    profilePicOverlay.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error in loadUserData:', error);
        }
    }

    async setupUI() {
        // Decode username for display
        document.querySelector('.profile-username').textContent = `@${this.decodeUsername(this.username)}`;
        
        // Only show upload and settings buttons if it's the user's own profile
        const isOwnProfile = this.username === localStorage.getItem('username');
        const isAdmin = localStorage.getItem('username') === 'tnc13';
        
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadSection = document.querySelector('.upload-section');
        const settingsBtn = document.getElementById('settingsBtn');
        
        // Hide buttons for other users' profiles
        if (!isOwnProfile) {
            if (uploadSection) uploadSection.style.display = 'none';
            if (settingsBtn) settingsBtn.style.display = 'none';
        } else {
            // Setup upload button
            if (uploadBtn) {
                uploadBtn.addEventListener('click', () => this.handleUpload());
            }

            // Setup settings
            const settingsModal = document.querySelector('.settings-modal');
            if (settingsBtn && settingsModal) {
                settingsBtn.addEventListener('click', () => {
                    settingsModal.style.display = 'flex';
                });

                document.querySelector('.close-settings')?.addEventListener('click', () => {
                    settingsModal.style.display = 'none';
                });

                document.getElementById('changeProfilePic')?.addEventListener('click', () => {
                    this.handleProfilePicUpload();
                });

                document.getElementById('updatePassword')?.addEventListener('click', () => {
                    this.handlePasswordUpdate();
                });

                document.getElementById('signoutBtn')?.addEventListener('click', () => {
                    if (confirm('Are you sure you want to sign out?')) {
                        localStorage.clear();
                        window.location.href = './index.html';
                    }
                });

                document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
                    const password = document.getElementById('deleteAccountPassword').value;
                    if (!password) {
                        document.querySelector('.delete-error').textContent = 'Please enter your password';
                        return;
                    }

                    if (!confirm('Are you absolutely sure you want to delete your account? This cannot be undone!')) {
                        return;
                    }

                    try {
                        const auth = new AuthManager();
                        await auth.deleteAccount(password);
                        alert('Account deleted successfully');
                        window.location.href = './index.html';
                    } catch (error) {
                        document.querySelector('.delete-error').textContent = error.message;
                    }
                });
            }
        }

        // Add delete user button for admin
        if (isAdmin && !isOwnProfile) {
            const deleteUserBtn = document.createElement('button');
            deleteUserBtn.className = 'delete-user-btn';
            deleteUserBtn.textContent = '🗑️ Delete User';
            deleteUserBtn.style.position = 'fixed';
            deleteUserBtn.style.top = '80px';
            deleteUserBtn.style.right = '20px';
            deleteUserBtn.addEventListener('click', async () => {
                if (confirm(`Are you sure you want to delete user ${this.username}? This action cannot be undone.`)) {
                    try {
                        await this.deleteUser(this.username);
                        alert('User deleted successfully');
                        window.location.href = './index.html';
                    } catch (error) {
                        alert('Failed to delete user: ' + error.message);
                    }
                }
            });
            document.body.appendChild(deleteUserBtn);
        }

        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and sections
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding section
                tab.classList.add('active');
                document.querySelector(`.settings-section[data-section="${tab.dataset.tab}"]`).classList.add('active');
            });
        });

        const matureToggle = document.getElementById('showMatureContent');
        if (matureToggle) {
            // Set initial state
            matureToggle.checked = localStorage.getItem('showMatureContent') === 'true';
            
            matureToggle.addEventListener('change', async () => {
                localStorage.setItem('showMatureContent', matureToggle.checked);
                // Reload videos to apply filter
                this.loadUserVideos();
            });
        }
    }

    async loadUserVideos() {
        const videosGrid = document.querySelector('.videos-grid');
        const noVideosMessage = document.querySelector('.no-videos-message');
        const sectionTitle = document.querySelector('.section-title');
        
        // Set appropriate title
        const isOwnProfile = this.username === localStorage.getItem('username');
        sectionTitle.textContent = isOwnProfile ? 'Your Videos' : `${this.username}'s Videos`;
        
        this.videosRef.orderByChild('publisher').equalTo(this.username).once('value', snapshot => {
            const videos = snapshot.val();
            
            if (!videos) {
                noVideosMessage.style.display = 'block';
                return;
            }
            
            // Remove the mature content filter - just convert to array with IDs
            this.currentVideos = Object.entries(videos).map(([id, video]) => ({
                ...video,
                id,
                timestamp: video.timestamp || 0
            }));

            this.sortVideos();
        });
    }

    sortVideos() {
        const sortBy = this.sortSelect.value;
        const videosGrid = document.querySelector('.videos-grid');
        videosGrid.innerHTML = '';

        // Sort videos based on selected option
        const sortedVideos = [...this.currentVideos].sort((a, b) => {
            if (sortBy === 'date') {
                return b.timestamp - a.timestamp;
            } else { // popular
                return (b.likes || 0) - (a.likes || 0);
            }
        });

        // Display sorted videos
        sortedVideos.forEach(video => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'video-thumbnail';
            
            // Check if video is mature and user has mature content disabled
            if (video.matureContent && localStorage.getItem('showMatureContent') !== 'true') {
                thumbnail.innerHTML = `
                    <div class="mature-warning">
                        <div class="mature-badge">
                            <span>Mature❤️</span>
                            <span class="mature-count">${video.likes || 0}</span>
                        </div>
                        <video src="${video.url}" muted loop playsinline></video>
                        <div class="video-info">
                            <h4>MATURE VIDEO...</h4>
                            <p>@${video.publisher || '[Deleted User]'}</p>
                        </div>
                    </div>
                `;

                // Add click handler for mature warning
                thumbnail.addEventListener('click', () => {
                    const modal = document.createElement('div');
                    modal.className = 'mature-modal';
                    modal.innerHTML = `
                        <div class="mature-modal-content">
                            <div class="mature-modal-header">
                                <span class="mature-warning-icon">⚠️</span>
                                <h3>Mature Content Warning</h3>
                            </div>
                            <p>This video may contain mild swearing, violence, or mature themes.</p>
                            <div class="mature-modal-buttons">
                                <button class="cancel-btn">Cancel</button>
                                <button class="continue-btn">Continue</button>
                            </div>
                        </div>
                    `;
                    
                    document.body.appendChild(modal);
                    requestAnimationFrame(() => modal.classList.add('active'));

                    // Handle button clicks
                    const continueBtn = modal.querySelector('.continue-btn');
                    const cancelBtn = modal.querySelector('.cancel-btn');
                    const closeModal = () => {
                        modal.classList.remove('active');
                        setTimeout(() => modal.remove(), 300);
                    };

                    continueBtn.addEventListener('click', () => {
                        closeModal();
                        localStorage.setItem('activeVideoId', video.id);
                        localStorage.setItem('scrollToVideo', 'true');
                        localStorage.setItem('viewingUserVideos', this.username);
                        window.location.href = './index.html';
                    });

                    cancelBtn.addEventListener('click', closeModal);

                    // Close on background click
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) closeModal();
                    });
                });
            } else {
                // Normal video display (existing code)
                const videoElement = document.createElement('video');
                videoElement.src = video.url;
                videoElement.muted = true;
                videoElement.playsInline = true;
                videoElement.loop = true;
                
                const videoInfo = document.createElement('div');
                videoInfo.className = 'video-info';
                videoInfo.innerHTML = `
                    <h4>${video.title || 'Untitled Video'}</h4>
                    <p>@${video.publisher || '[Deleted User]'}</p>
                `;

                const likesCounter = document.createElement('div');
                likesCounter.className = 'video-likes';
                likesCounter.innerHTML = `❤️ ${video.likes || 0}`;

                thumbnail.appendChild(videoElement);
                thumbnail.appendChild(videoInfo);
                thumbnail.appendChild(likesCounter);
                
                // Existing hover and click handlers
                thumbnail.addEventListener('mouseenter', () => {
                    videoElement.play().catch(console.error);
                });
                thumbnail.addEventListener('mouseleave', () => {
                    videoElement.pause();
                    videoElement.currentTime = 0;
                });
                
                thumbnail.addEventListener('click', () => {
                    localStorage.setItem('activeVideoId', video.id);
                    localStorage.setItem('scrollToVideo', 'true');
                    localStorage.setItem('viewingUserVideos', this.username);
                    window.location.href = './index.html';
                });
            }
            
            videosGrid.appendChild(thumbnail);
        });
    }

    handleUpload() {
        const uploadModal = document.createElement('div');
        uploadModal.className = 'settings-modal';  // Reuse settings modal styles
        uploadModal.innerHTML = `
            <div class="settings-content upload-content">
                <div class="settings-header">
                    <h3>Upload Video</h3>
                    <button class="close-settings">×</button>
                </div>
                
                <div class="upload-sections">
                    <div class="upload-preview">
                        <div class="video-preview-container">
                            <div class="video-placeholder">
                                <span>📁</span>
                                <p>No video selected</p>
                                <button class="settings-button select-video-btn">Select Video</button>
                            </div>
                            <video style="display: none" controls></video>
                        </div>
                    </div>

                    <div class="upload-details">
                        <div class="settings-input-group">
                            <h4>Details</h4>
                            <input type="text" 
                                   class="settings-input" 
                                   id="videoTitle" 
                                   placeholder="Title (required)"
                                   maxlength="75">
                            <div class="char-count">0/75</div>
                            
                            <textarea class="settings-input" 
                                      id="videoDescription" 
                                      placeholder="Description (optional)"
                                      maxlength="150"
                                      rows="4"></textarea>
                            <div class="char-count">0/150</div>

                            <div class="mature-content-toggle">
                                <label class="toggle-container">
                                    <input type="checkbox" id="matureContent">
                                    <span class="toggle-slider"></span>
                                </label>
                                <div class="toggle-label">
                                    <span>Mature Content</span>
                                    <p class="toggle-description">Enable if video contains mild swearing, violence, or mature themes</p>
                                </div>
                            </div>

                            <div class="upload-status" style="display: none;">
                                <div class="upload-progress">
                                    <div class="progress-bar"></div>
                                </div>
                                <p class="upload-message">Uploading video...</p>
                            </div>
                            
                            <button class="settings-button publish-btn" disabled>Publish</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(uploadModal);

        // Add styles for new upload UI
        const style = document.createElement('style');
        style.textContent = `
            .upload-content {
                max-width: 800px !important;
            }
            
            .upload-sections {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                padding: 20px;
                height: calc(100% - 52px);
                overflow-y: auto;
            }
            
            .video-preview-container {
                aspect-ratio: 9/16;
                background: #000;
                border-radius: 8px;
                overflow: hidden;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .video-placeholder {
                text-align: center;
                color: #666;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
            }
            
            .video-placeholder span {
                font-size: 48px;
                margin-bottom: 4px;
            }

            .video-placeholder p {
                margin: 0;
            }
            
            .video-placeholder .select-video-btn {
                margin: 0;
                padding: 8px 16px;
                font-size: 0.9rem;
            }
            
            .video-preview-container video {
                width: 100%;
                height: 100%;
                object-fit: contain;
                background: #000;
            }
            
            .upload-details {
                padding-right: 20px;
            }
            
            .char-count {
                text-align: right;
                font-size: 12px;
                color: #666;
                margin-top: -8px;
                margin-bottom: 16px;
            }
            
            .upload-progress {
                height: 4px;
                background: #333;
                border-radius: 2px;
                margin: 16px 0;
                overflow: hidden;
            }
            
            .progress-bar {
                height: 100%;
                background: #FF4444;
                width: 0%;
                transition: width 0.3s ease;
            }
            
            .upload-message {
                text-align: center;
                color: #666;
                margin: 8px 0;
            }
            
            textarea.settings-input {
                resize: vertical;
                min-height: 100px;
            }
            
            @media (max-width: 768px) {
                .upload-sections {
                    grid-template-columns: 1fr;
                }
                
                .upload-details {
                    padding-right: 0;
                }
            }

            .mature-content-toggle {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                margin: 16px 0;
                padding: 12px;
                background: rgba(255, 68, 68, 0.1);
                border-radius: 8px;
            }

            .toggle-container {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
                flex-shrink: 0;
            }

            .toggle-container input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #333;
                transition: .4s;
                border-radius: 24px;
            }

            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }

            input:checked + .toggle-slider {
                background-color: #FF4444;
            }

            input:checked + .toggle-slider:before {
                transform: translateX(20px);
            }

            .toggle-label {
                flex: 1;
            }

            .toggle-label span {
                display: block;
                font-weight: 500;
                margin-bottom: 4px;
            }

            .toggle-description {
                font-size: 0.9rem;
                color: #666;
                margin: 0;
            }
        `;
        document.head.appendChild(style);

        // Handle close button
        const closeBtn = uploadModal.querySelector('.close-settings');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(uploadModal);
        });

        // Handle file selection
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'video/*';
        
        const selectBtn = uploadModal.querySelector('.select-video-btn');
        const videoPreview = uploadModal.querySelector('video');
        const placeholder = uploadModal.querySelector('.video-placeholder');
        const publishBtn = uploadModal.querySelector('.publish-btn');
        const titleInput = uploadModal.querySelector('#videoTitle');
        const descInput = uploadModal.querySelector('#videoDescription');
        
        selectBtn.addEventListener('click', () => fileInput.click());

        // Update character counts
        titleInput.addEventListener('input', () => {
            const count = titleInput.value.length;
            titleInput.nextElementSibling.textContent = `${count}/75`;
            updatePublishButton();
        });

        descInput.addEventListener('input', () => {
            const count = descInput.value.length;
            descInput.nextElementSibling.textContent = `${count}/150`;
        });

        // Enable/disable publish button
        const updatePublishButton = () => {
            publishBtn.disabled = !titleInput.value.trim() || !fileInput.files[0];
        };

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                videoPreview.src = URL.createObjectURL(file);
                videoPreview.style.display = 'block';
                placeholder.style.display = 'none';
                updatePublishButton();
            }
        });

        // Handle publish
        publishBtn.addEventListener('click', async () => {
            const file = fileInput.files[0];
            const title = titleInput.value.trim();
            const description = descInput.value.trim();
            const matureContent = uploadModal.querySelector('#matureContent').checked;

            if (!file || !title) return;

            const uploadStatus = uploadModal.querySelector('.upload-status');
            const progressBar = uploadModal.querySelector('.progress-bar');
            const uploadMessage = uploadModal.querySelector('.upload-message');
            
            uploadStatus.style.display = 'block';
            publishBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'skiddoink_uploads');
                formData.append('cloud_name', 'dz8kxt0gy');

                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://api.cloudinary.com/v1_1/dz8kxt0gy/video/upload');
                
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = (e.loaded / e.total) * 100;
                        progressBar.style.width = percent + '%';
                        uploadMessage.textContent = `Uploading: ${Math.round(percent)}%`;
                    }
                };

                xhr.onload = async () => {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);
                        
                        // Get current user's profile picture
                        const userId = localStorage.getItem('userId');
                        const userSnapshot = await this.database.ref(`users/${userId}`).once('value');
                        const userData = userSnapshot.val();
                        const profilePic = userData?.profilePic || window.DEFAULT_AVATAR;

                        const videoData = {
                            url: data.secure_url,
                            title: title,
                            description: description,
                            timestamp: Date.now(),
                            uploadDate: new Date().toISOString(),
                            views: 0,
                            likes: 0,
                            publisher: this.username,
                            publisherPic: profilePic,
                            matureContent: matureContent
                        };

                        await this.videosRef.push(videoData);
                        
                        document.body.removeChild(uploadModal);
                        this.loadUserVideos();
                        alert('Video uploaded successfully!');
                    }
                };
                
                xhr.onerror = () => {
                    uploadMessage.textContent = 'Upload failed';
                    publishBtn.disabled = false;
                };
                
                xhr.send(formData);

            } catch (error) {
                console.error('Error:', error);
                uploadMessage.textContent = 'Upload failed';
                publishBtn.disabled = false;
            }
        });
    }

    async handleProfilePicUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.click();

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'skiddoink_uploads');
                formData.append('cloud_name', 'dz8kxt0gy');

                const response = await fetch(
                    'https://api.cloudinary.com/v1_1/dz8kxt0gy/image/upload',
                    {
                        method: 'POST',
                        body: formData
                    }
                );

                const data = await response.json();
                
                // Update profile picture URL in Firebase
                const userId = localStorage.getItem('userId');
                const username = localStorage.getItem('username');
                
                const updates = {};
                updates[`users/${userId}/profilePic`] = data.secure_url;
                
                // Update all videos by this user to include the profile pic
                const videosSnapshot = await this.videosRef
                    .orderByChild('publisher')
                    .equalTo(this.username)
                    .once('value');
                
                Object.entries(videosSnapshot.val() || {}).forEach(([videoId, video]) => {
                    updates[`videos/${videoId}/publisherPic`] = data.secure_url;
                });

                // Update all comments by this user
                const commentsSnapshot = await this.commentsRef
                    .orderByChild('username')
                    .equalTo(username)
                    .once('value');
                
                Object.entries(commentsSnapshot.val() || {}).forEach(([commentId, comment]) => {
                    updates[`comments/${commentId}/userPic`] = data.secure_url;
                });
                
                // Perform all updates atomically
                if (Object.keys(updates).length > 0) {
                    await this.database.ref().update(updates);
                }
                
                // Update UI
                document.getElementById('profilePic').src = data.secure_url;
                
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                alert('Failed to upload profile picture');
            }
        };
    }

    async handlePasswordUpdate() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorDisplay = document.querySelector('.settings-error');

        try {
            if (newPassword !== confirmPassword) {
                throw new Error('New passwords do not match');
            }

            if (newPassword.length < 6) {
                throw new Error('Password must be at least 6 characters');
            }

            const auth = new AuthManager();
            await auth.updatePassword(currentPassword, newPassword);
            
            alert('Password updated successfully');
            document.querySelector('.settings-modal').style.display = 'none';
            
        } catch (error) {
            errorDisplay.textContent = error.message;
        }
    }

    async showComments(video) {
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
        requestAnimationFrame(() => modal.classList.add('active'));

        const closeBtn = modal.querySelector('.close-comments');
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
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

            try {
                const username = localStorage.getItem('username');
                if (!username) {
                    alert('Please sign in to comment');
                    return;
                }

                const commentData = {
                    text,
                    username,
                    videoId: video.id,
                    timestamp: Date.now(),
                    likes: 0
                };

                // Get user's profile picture
                const userSnapshot = await this.database.ref('users')
                    .orderByChild('username')
                    .equalTo(username)
                    .once('value');
                const userData = userSnapshot.val();
                if (userData) {
                    const userId = Object.keys(userData)[0];
                    commentData.userPic = userData[userId].profilePic || DEFAULT_AVATAR;
                }

                await this.commentsRef.push(commentData);
                input.value = '';
                submitBtn.disabled = true;

            } catch (error) {
                console.error('Error posting comment:', error);
                alert('Failed to post comment');
            }
        });

        // Load and listen for comments
        this.commentsRef.orderByChild('videoId').equalTo(video.id).on('value', async snapshot => {
            const comments = snapshot.val() || {};
            container.innerHTML = '';
            
            // Update the video's comment count in Firebase
            const commentCount = Object.keys(comments).length;
            await this.videosRef.child(video.id).update({
                comments: commentCount
            });

            // Get current user's liked comments
            const username = localStorage.getItem('username');
            let userLikedComments = new Set();
            if (username) {
                const likesSnapshot = await this.commentLikesRef.child(username).once('value');
                userLikedComments = new Set(Object.keys(likesSnapshot.val() || {}));
            }

            Object.entries(comments).reverse().forEach(([commentId, comment]) => {
                const isLiked = userLikedComments.has(commentId);
                const div = document.createElement('div');
                div.className = 'comment-item';
                div.innerHTML = `
                    <img src="${comment.userPic || DEFAULT_AVATAR}" class="comment-pic" alt="Profile">
                    <div class="comment-content">
                        <div class="comment-header-text">
                            <a href="./profile.html?user=${comment.username}" class="comment-username">@${comment.username}</a>
                            <span class="comment-time">${this.formatDate(comment.timestamp)}</span>
                        </div>
                        <p class="comment-text">${comment.text}</p>
                        <div class="comment-actions">
                            <button class="comment-like ${isLiked ? 'liked' : ''}">
                                ${isLiked ? '❤️' : ''}
                                <span>${comment.likes || 0}</span>
                            </button>
                        </div>
                    </div>
                `;

                const likeBtn = div.querySelector('.comment-like');
                likeBtn.addEventListener('click', async () => {
                    if (!username) {
                        alert('Please sign in to like comments');
                        return;
                    }

                    try {
                        const commentRef = this.commentsRef.child(commentId);
                        const userLikeRef = this.commentLikesRef.child(username).child(commentId);

                        if (isLiked) {
                            await Promise.all([
                                commentRef.update({ likes: (comment.likes || 0) - 1 }),
                                userLikeRef.remove()
                            ]);
                        } else {
                            await Promise.all([
                                commentRef.update({ likes: (comment.likes || 0) + 1 }),
                                userLikeRef.set(true)
                            ]);
                        }
                    } catch (error) {
                        console.error('Error updating comment like:', error);
                        alert('Failed to update like');
                    }
                });

                container.appendChild(div);
            });
        });
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    async checkIfFollowing(follower, following) {
        if (!follower || !following) return false;
        const snapshot = await this.database.ref(`following/${follower}/${following}`).once('value');
        return snapshot.exists();
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

    async showFollowModal(type) {
        console.log(`Opening ${type} modal`);
        
        const modal = document.createElement('div');
        modal.className = 'follow-modal';
        modal.innerHTML = `
            <div class="follow-modal-content">
                <div class="follow-modal-header">
                    <h3>${type === 'followers' ? 'Followers' : 'Following'}</h3>
                    <button class="close-follow-modal">×</button>
                </div>
                <div class="follow-list"></div>
            </div>
        `;

        document.body.appendChild(modal);
        
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });

        const closeBtn = modal.querySelector('.close-follow-modal');
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        });

        const listContainer = modal.querySelector('.follow-list');
        const encodedUsername = this.encodeUsername(this.username);
        const ref = this.database.ref(type === 'followers' ? `followers/${encodedUsername}` : `following/${encodedUsername}`);
        const snapshot = await ref.once('value');
        const users = snapshot.val() || {};

        // Refresh following list before showing modal
        await this.loadFollowing();

        // Load each user's data
        const userPromises = Object.keys(users).map(async encodedUser => {
            if (encodedUser === encodedUsername) return null; // Skip self-follows
            
            const userSnapshot = await this.database.ref('users')
                .orderByChild('username')
                .equalTo(encodedUser)
                .once('value');
            const userData = userSnapshot.val();
            if (userData) {
                const userId = Object.keys(userData)[0];
                const decodedUsername = this.decodeUsername(encodedUser);
                return {
                    username: decodedUsername,
                    profilePic: userData[userId].profilePic || window.DEFAULT_AVATAR,
                    isFollowing: this.following.has(decodedUsername)
                };
            }
            return null;
        });

        const userList = (await Promise.all(userPromises)).filter(user => user !== null);
        const currentUsername = localStorage.getItem('username');

        listContainer.innerHTML = userList.length ? userList.map(user => `
            <div class="follow-item">
                <div class="follow-user-info">
                    <img src="${user.profilePic}" alt="Profile" class="follow-profile-pic">
                    <a href="./profile.html?user=${user.username}" class="follow-username">@${this.decodeUsername(user.username)}</a>
                </div>
                ${user.username !== currentUsername ? `
                    <button class="follow-btn" data-username="${user.username}">
                        ${user.isFollowing ? 'Following' : 'Follow'}
                    </button>
                ` : ''}
            </div>
        `).join('') : '<p class="no-follows">No users found</p>';

        // Add follow button handlers
        listContainer.querySelectorAll('.follow-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.username;
                await this.toggleFollow(username);
                // Update button state after toggle
                const isNowFollowing = this.following.has(username);
                btn.textContent = isNowFollowing ? 'Following' : 'Follow';
            });
        });
    }

    // Add loadFollowing method
    async loadFollowing() {
        const username = localStorage.getItem('username');
        if (!username) return;
        
        try {
            const encodedUsername = this.encodeUsername(username);
            const followingSnapshot = await this.database.ref(`following/${encodedUsername}`).once('value');
            const followingData = followingSnapshot.val() || {};
            
            // Clear and rebuild following set with decoded usernames
            this.following.clear();
            Object.keys(followingData).forEach(encodedUser => {
                this.following.add(this.decodeUsername(encodedUser));
            });

            // Update any visible follow buttons
            document.querySelectorAll('.follow-btn').forEach(btn => {
                const buttonUsername = btn.dataset.username;
                const isFollowing = this.following.has(buttonUsername);
                btn.textContent = isFollowing ? 'Following' : 'Follow';
                btn.dataset.following = isFollowing.toString();
            });
        } catch (error) {
            console.error('Error loading following data:', error);
        }
    }

    async deleteUser(username) {
        if (localStorage.getItem('username') !== 'tnc13') {
            console.error('Unauthorized deletion attempt');
            return;
        }

        try {
            const db = firebase.database();
            const deletePromises = [];

            // Delete videos first (these use the raw username)
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

            // Delete comments (these also use the raw username)
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

            // Delete user profile if it exists
            console.log('Checking for user profile...');
            const userSnapshot = await db.ref('users')
                .orderByChild('username')
                .equalTo(username)
                .once('value');
            
            if (userSnapshot.exists()) {
                const userId = Object.keys(userSnapshot.val())[0];
                deletePromises.push(db.ref(`users/${userId}`).remove());
            }

            // For problematic paths that might be too long, try-catch each one individually
            const cleanupPaths = [
                `userLikes/${username}`,
                `followers/${username}`,
                `following/${username}`,
                `commentLikes/${username}`
            ];

            console.log('Cleaning up related data...');
            for (const path of cleanupPaths) {
                try {
                    await db.ref(path).remove();
                } catch (error) {
                    console.warn(`Failed to delete path ${path}, might not exist or be invalid:`, error);
                    // Continue with deletion even if some paths fail
                }
            }

            // Execute all the safe deletions
            console.log('Executing deletions...');
            await Promise.all(deletePromises);

            // If we got here without throwing, consider it a success
            console.log('User deletion completed');
            return true;

        } catch (error) {
            console.error('Error deleting user:', error);
            // Check if it's the key path length error
            if (error.message.includes('key path longer than 768 bytes')) {
                // If we've deleted videos and comments, consider it a partial success
                if (deletePromises.length > 0) {
                    console.log('User content deleted, but some cleanup failed');
                    return true;
                }
            }
            throw error;
        }
    }

    // Add this new method to check if user has any content
    async checkUserHasContent(username) {
        console.log('Checking content for user:', username);
        try {
            const encodedUsername = this.encodeUsername(username);
            const [videosSnapshot, commentsSnapshot, followersSnapshot, followingSnapshot] = await Promise.all([
                this.videosRef.orderByChild('publisher').equalTo(username).once('value'),
                this.commentsRef.orderByChild('username').equalTo(username).once('value'),
                this.database.ref(`followers/${encodedUsername}`).once('value'),
                this.database.ref(`following/${encodedUsername}`).once('value')
            ]);

            const hasVideos = videosSnapshot.exists();
            const hasComments = commentsSnapshot.exists();
            const hasFollowers = followersSnapshot.exists();
            const hasFollowing = followingSnapshot.exists();

            console.log('Content check results:', {
                videos: hasVideos,
                comments: hasComments,
                followers: hasFollowers,
                following: hasFollowing
            });

            if (hasVideos) {
                console.log('Videos found:', videosSnapshot.val());
            }
            if (hasComments) {
                console.log('Comments found:', commentsSnapshot.val());
            }
            if (hasFollowers) {
                console.log('Followers found:', followersSnapshot.val());
            }
            if (hasFollowing) {
                console.log('Following found:', followingSnapshot.val());
            }

            const hasAnyContent = hasVideos || hasComments || hasFollowers || hasFollowing;
            console.log('Final hasContent result:', hasAnyContent);

            return hasAnyContent;
        } catch (error) {
            console.error('Error checking user content:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    // Add this helper method to the ProfilePage class
    encodeUsername(username) {
        // Replace invalid Firebase path characters with safe alternatives
        return encodeURIComponent(username)
            .replace(/\./g, '%2E')
            .replace(/#/g, '%23')
            .replace(/\$/g, '%24')
            .replace(/\[/g, '%5B')
            .replace(/\]/g, '%5D')
            .replace(/\//g, '%2F');
    }

    async cleanupFollows(encodedUsername) {
        try {
            const db = this.database;
            const [followersSnapshot, followingSnapshot] = await Promise.all([
                db.ref(`followers/${encodedUsername}`).once('value'),
                db.ref(`following/${encodedUsername}`).once('value')
            ]);

            const followers = followersSnapshot.val() || {};
            const following = followingSnapshot.val() || {};
            const cleanup = [];

            // Check followers
            for (const followerUsername of Object.keys(followers)) {
                const userSnapshot = await db.ref('users')
                    .orderByChild('username')
                    .equalTo(followerUsername)
                    .once('value');
                
                if (!userSnapshot.exists()) {
                    // Remove non-existent follower
                    cleanup.push(db.ref(`followers/${encodedUsername}/${followerUsername}`).remove());
                }
            }

            // Check following
            for (const followedUsername of Object.keys(following)) {
                const userSnapshot = await db.ref('users')
                    .orderByChild('username')
                    .equalTo(followedUsername)
                    .once('value');
                
                if (!userSnapshot.exists()) {
                    // Remove non-existent followed user
                    cleanup.push(db.ref(`following/${encodedUsername}/${followedUsername}`).remove());
                }
            }

            // Execute all cleanup operations
            if (cleanup.length > 0) {
                await Promise.all(cleanup);
                console.log(`Cleaned up ${cleanup.length} invalid follows`);
            }
        } catch (error) {
            console.error('Error during follow cleanup:', error);
        }
    }

    async setupUsernameChange() {
        const updateUsernameBtn = document.getElementById('updateUsername');
        const newUsernameInput = document.getElementById('newUsername');
        const errorDisplay = document.querySelector('.username-error');

        if (updateUsernameBtn) {
            updateUsernameBtn.addEventListener('click', async () => {
                try {
                    await this.handleUsernameChange();
                } catch (error) {
                    errorDisplay.textContent = error.message;
                }
            });
        }
    }

    async handleUsernameChange() {
        const newUsername = document.getElementById('newUsername').value.trim();
        const errorDisplay = document.querySelector('.username-error');
        const currentUsername = localStorage.getItem('username');
        const userId = localStorage.getItem('userId');

        // Username validation
        const usernameRegex = /^[a-zA-Z0-9_.-]{3,20}$/;
        if (!usernameRegex.test(newUsername)) {
            throw new Error('Username must be 3-20 characters and can only contain letters, numbers, dots, dashes, and underscores');
        }

        try {
            // Check if new username is different from current
            if (newUsername === this.decodeUsername(currentUsername)) {
                throw new Error('New username must be different from current username');
            }

            // Check if username exists
            const encodedNewUsername = newUsername.replace(/\./g, '(');
            const snapshot = await this.database.ref('users')
                .orderByChild('username')
                .equalTo(encodedNewUsername)
                .once('value');
            
            if (snapshot.exists()) {
                throw new Error('Username already exists');
            }

            // Check last username change time
            const userSnapshot = await this.database.ref(`users/${userId}`).once('value');
            const userData = userSnapshot.val();
            const lastUsernameChange = userData.lastUsernameChange || 0;
            const oneHour = 60 * 60 * 1000; // milliseconds

            if (Date.now() - lastUsernameChange < oneHour) {
                const minutesLeft = Math.ceil((oneHour - (Date.now() - lastUsernameChange)) / 60000);
                throw new Error(`Please wait ${minutesLeft} minutes before changing username again`);
            }

            // Start username update process
            const oldEncodedUsername = currentUsername;
            const updates = {};

            // Update user record
            updates[`users/${userId}/username`] = encodedNewUsername;
            updates[`users/${userId}/lastUsernameChange`] = Date.now();

            // Update videos
            const videosSnapshot = await this.videosRef
                .orderByChild('publisher')
                .equalTo(currentUsername)
                .once('value');
            
            if (videosSnapshot.exists()) {
                videosSnapshot.forEach(child => {
                    updates[`videos/${child.key}/publisher`] = encodedNewUsername;
                });
            }

            // Update comments
            const commentsSnapshot = await this.commentsRef
                .orderByChild('username')
                .equalTo(currentUsername)
                .once('value');
            
            if (commentsSnapshot.exists()) {
                commentsSnapshot.forEach(child => {
                    updates[`comments/${child.key}/username`] = encodedNewUsername;
                });
            }

            // Update following/followers structure
            const followingSnapshot = await this.database.ref(`following/${oldEncodedUsername}`).once('value');
            const followersSnapshot = await this.database.ref(`followers/${oldEncodedUsername}`).once('value');

            if (followingSnapshot.exists()) {
                updates[`following/${encodedNewUsername}`] = followingSnapshot.val();
                updates[`following/${oldEncodedUsername}`] = null;
            }

            if (followersSnapshot.exists()) {
                updates[`followers/${encodedNewUsername}`] = followersSnapshot.val();
                updates[`followers/${oldEncodedUsername}`] = null;
            }

            // Update other users' following lists
            const allUsersSnapshot = await this.database.ref('users').once('value');
            allUsersSnapshot.forEach(userSnap => {
                const userFollowing = userSnap.child('following').val() || {};
                if (userFollowing[oldEncodedUsername]) {
                    updates[`users/${userSnap.key}/following/${oldEncodedUsername}`] = null;
                    updates[`users/${userSnap.key}/following/${encodedNewUsername}`] = true;
                }
            });

            // Update likes
            const userLikesSnapshot = await this.database.ref(`userLikes/${oldEncodedUsername}`).once('value');
            if (userLikesSnapshot.exists()) {
                updates[`userLikes/${encodedNewUsername}`] = userLikesSnapshot.val();
                updates[`userLikes/${oldEncodedUsername}`] = null;
            }

            // Update comment likes
            const commentLikesSnapshot = await this.database.ref(`commentLikes/${oldEncodedUsername}`).once('value');
            if (commentLikesSnapshot.exists()) {
                updates[`commentLikes/${encodedNewUsername}`] = commentLikesSnapshot.val();
                updates[`commentLikes/${oldEncodedUsername}`] = null;
            }

            // Perform all updates atomically
            await this.database.ref().update(updates);

            // Update localStorage
            localStorage.setItem('username', encodedNewUsername);

            // Clear input and show success
            document.getElementById('newUsername').value = '';
            errorDisplay.style.color = '#4CAF50';
            errorDisplay.textContent = 'Username updated successfully!';

            // Reload page after short delay
            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (error) {
            console.error('Error updating username:', error);
            throw error;
        }
    }

    // Add this new helper method to validate follow lists
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
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
}); 