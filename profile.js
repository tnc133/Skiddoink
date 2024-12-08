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

        // Check for ongoing upload
        const uploadStatus = localStorage.getItem('uploadStatus');
        if (uploadStatus) {
            const status = JSON.parse(uploadStatus);
            // Only show if upload was within last 5 minutes
            if (Date.now() - status.timestamp < 5 * 60 * 1000) {
                this.showUploadStatus(status);
            } else {
                localStorage.removeItem('uploadStatus');
            }
        }

        // Add floating upload button if it's the user's own profile
        if (this.username === localStorage.getItem('username')) {
            const floatingUpload = document.createElement('button');
            floatingUpload.className = 'floating-upload-btn';
            floatingUpload.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4V20M4 12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            `;
            document.body.appendChild(floatingUpload);
            floatingUpload.addEventListener('click', () => this.handleUpload());
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
            const encodedUsername = this.encodeUsername(this.username);
            
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
            
            // Fix any inconsistencies in follow relationships
            await this.fixFollowRelationships(this.username);
            
            const followersRef = this.database.ref(`followers/${encodedUsername}`);
            const followingRef = this.database.ref(`following/${encodedUsername}`);
            
            // Calculate total likes from user's videos
            const videosSnapshot = await this.videosRef
                .orderByChild('publisher')
                .equalTo(this.username)
                .once('value');
            
            const videos = videosSnapshot.val() || {};
            const totalLikes = Object.values(videos).reduce((sum, video) => sum + (video.likes || 0), 0);
            
            // Load follower and following counts with validation
            const [followersSnapshot, followingSnapshot] = await Promise.all([
                followersRef.once('value'),
                followingRef.once('value')
            ]);

            // Clean up any self-follows
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

                // Add click handlers for followers/following
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
            }

            // Add real-time listeners with validation
            followersRef.on('value', async snapshot => {
                const validFollowers = await this.validateFollowList(snapshot.val() || {});
                const followerCountElement = statsContainer?.querySelector('.followers-stat .stat-count');
                if (followerCountElement) {
                    followerCountElement.textContent = validFollowers.length;
                }
            });

            followingRef.on('value', async snapshot => {
                const validFollowing = await this.validateFollowList(snapshot.val() || {});
                const followingCountElement = statsContainer?.querySelector('.following-stat .stat-count');
                if (followingCountElement) {
                    followingCountElement.textContent = validFollowing.length;
                }
            });

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
                            <span>⚠️ ${video.likes || 0}</span>
                        </div>
                        ${video.type === 'image' 
                            ? `<img src="${video.url}" alt="Mature content" style="filter: blur(8px);">`
                            : `<video src="${video.url}" muted loop playsinline></video>`
                        }
                        <div class="video-info">
                            <h4><span class="warning-symbol">⚠️</span> Mature</h4>
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
                            <p>This content may contain mild swearing, violence, or mature themes.</p>
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
                // Normal content display
                if (video.type === 'image') {
                    const imgElement = document.createElement('img');
                    imgElement.src = video.url;
                    imgElement.alt = video.title || 'Image post';
                    
                    const videoInfo = document.createElement('div');
                    videoInfo.className = 'video-info';
                    videoInfo.innerHTML = `
                        <h4>${video.title || 'Untitled Post'}</h4>
                        <p>@${video.publisher || '[Deleted User]'}</p>
                    `;

                    const likesCounter = document.createElement('div');
                    likesCounter.className = 'video-likes';
                    likesCounter.innerHTML = `❤️ ${video.likes || 0}`;

                    thumbnail.appendChild(imgElement);
                    thumbnail.appendChild(videoInfo);
                    thumbnail.appendChild(likesCounter);
                } else {
                    // Video content
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
                    
                    // Add hover handlers for videos only
                    thumbnail.addEventListener('mouseenter', () => {
                        videoElement.play().catch(console.error);
                    });
                    thumbnail.addEventListener('mouseleave', () => {
                        videoElement.pause();
                    });
                }

                // Add click handler for both images and videos
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
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
        
        const validateFile = (file) => {
            if (!file) return { valid: false, error: 'No file selected' };
            if (file.size > MAX_FILE_SIZE) {
                return { valid: false, error: 'File size exceeds 100MB limit' };
            }
            if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
                return { valid: false, error: 'Only video and image files are allowed' };
            }
            return { valid: true };
        };

        const uploadModal = document.createElement('div');
        uploadModal.className = 'upload-modal';
        uploadModal.innerHTML = `
            <div class="upload-content">
                <div class="upload-header">
                    <h3>Upload Media</h3>
                    <button class="close-upload">×</button>
                </div>
                <div class="upload-body">
                    <div class="media-preview" id="dropZone">
                        <div class="preview-placeholder">
                            <div class="upload-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 16L12 8M12 8L15 11M12 8L9 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M3 15V16C3 18.2091 4.79086 20 7 20H17C19.2091 20 21 18.2091 21 16V15M3 15V8C3 5.79086 4.79086 4 7 4H17C19.2091 4 21 5.79086 21 8V15M3 15L8.58579 9.41421C9.36683 8.63317 10.6332 8.63316 11.4142 9.41421L16 14M21 15L18.8789 12.8789C18.0979 12.0979 16.8315 12.0979 16.0505 12.8789L15 13.9294" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </div>
                            <div class="upload-text">
                                <span class="upload-main-text">Click or drag to upload videos or images</span>
                                <span class="upload-subtitle">Maximum file size: 100MB</span>
                            </div>
                        </div>
                        <div class="upload-error" style="display: none;"></div>
                        <video class="preview-video" style="display: none;" controls></video>
                        <img class="preview-image" style="display: none;" alt="Preview">
                        <button class="remove-media" style="display: none;">✕</button>
                    </div>
                    <input type="file" accept="video/*,image/*" style="display: none;">
                    <div class="upload-form">
                        <div class="input-group">
                            <label for="title-input">Title</label>
                            <div class="title-container">
                                <input type="text" id="title-input" class="title-input" placeholder="Give your post a title" maxlength="100">
                                <span class="char-count">0/100</span>
                            </div>
                        </div>
                        <div class="input-group">
                            <label for="description-input">Description</label>
                            <div class="description-container">
                                <textarea id="description-input" class="description-input" placeholder="Add a description (optional)" maxlength="150"></textarea>
                                <span class="char-count">0/150</span>
                            </div>
                        </div>
                        <div class="input-group">
                            <div class="mature-toggle">
                                <label class="switch">
                                    <input type="checkbox" id="matureContent">
                                    <span class="slider"></span>
                                </label>
                                <div class="mature-label">
                                    <span>Mature Content</span>
                                    <span class="mature-description">Enable if content contains mild swearing, violence, or mature themes</span>
                                </div>
                            </div>
                        </div>
                        <button class="publish-btn" disabled>
                            <span class="btn-text">Publish</span>
                            <svg class="btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(uploadModal);
        requestAnimationFrame(() => uploadModal.classList.add('active'));

        const closeBtn = uploadModal.querySelector('.close-upload');
        const fileInput = uploadModal.querySelector('input[type="file"]');
        const dropZone = uploadModal.querySelector('#dropZone');
        const placeholder = uploadModal.querySelector('.preview-placeholder');
        const videoPreview = uploadModal.querySelector('.preview-video');
        const imagePreview = uploadModal.querySelector('.preview-image');
        const removeButton = uploadModal.querySelector('.remove-media');
        const titleInput = uploadModal.querySelector('.title-input');
        const descInput = uploadModal.querySelector('.description-input');
        const publishBtn = uploadModal.querySelector('.publish-btn');
        const errorDisplay = uploadModal.querySelector('.upload-error');

        const showError = (message) => {
            errorDisplay.textContent = message;
            errorDisplay.style.display = 'block';
            setTimeout(() => {
                errorDisplay.style.display = 'none';
            }, 3000);
        };

        const handleFile = (file) => {
            const validation = validateFile(file);
            if (!validation.valid) {
                showError(validation.error);
                fileInput.value = ''; // Clear the input to allow reselecting
                return;
            }

            const isVideo = file.type.startsWith('video/');
            const isImage = file.type.startsWith('image/');

            if (isVideo) {
                videoPreview.src = URL.createObjectURL(file);
                videoPreview.style.display = 'block';
                imagePreview.style.display = 'none';
            } else if (isImage) {
                imagePreview.src = URL.createObjectURL(file);
                imagePreview.style.display = 'block';
                videoPreview.style.display = 'none';
            }

            // Create a new FileList containing our file
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            placeholder.style.display = 'none';
            removeButton.style.display = 'block';
            updatePublishButton();
        };

        closeBtn.addEventListener('click', () => {
            uploadModal.classList.remove('active');
            setTimeout(() => document.body.removeChild(uploadModal), 300);
        });

        // Drag and drop handlers
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });

        dropZone.addEventListener('click', () => {
            if (uploadManager.isUploading()) {
                uploadManager.preventUpload();
                return;
            }
            fileInput.click();
        });

        // Add remove button functionality
        removeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            videoPreview.style.display = 'none';
            imagePreview.style.display = 'none';
            placeholder.style.display = 'flex';
            removeButton.style.display = 'none';
            updatePublishButton();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
        });

        // Character count and button state handlers
        titleInput.addEventListener('input', () => {
            const count = titleInput.value.length;
            titleInput.parentElement.querySelector('.char-count').textContent = `${count}/100`;
            updatePublishButton();
        });

        descInput.addEventListener('input', () => {
            const count = descInput.value.length;
            descInput.parentElement.querySelector('.char-count').textContent = `${count}/150`;
        });

        const updatePublishButton = () => {
            const hasTitle = titleInput.value.trim().length > 0;
            const hasFile = fileInput.files && fileInput.files.length > 0;
            publishBtn.disabled = !hasTitle || !hasFile;
        };

        // Handle publish
        publishBtn.addEventListener('click', async () => {
            const file = fileInput.files[0];
            const title = titleInput.value.trim();
            const description = descInput.value.trim();
            const matureContent = uploadModal.querySelector('#matureContent').checked;

            if (!file || !title) return;

            const validation = validateFile(file);
            if (!validation.valid) {
                showError(validation.error);
                return;
            }

            if (uploadManager.isUploading()) {
                uploadManager.preventUpload();
                return;
            }

            uploadModal.classList.remove('active');
            setTimeout(() => document.body.removeChild(uploadModal), 300);
            publishBtn.disabled = true;

            try {
                const response = await uploadManager.startUpload(file, title, description, matureContent);
                
                // Get current user's profile picture
                const userId = localStorage.getItem('userId');
                const userSnapshot = await this.database.ref(`users/${userId}`).once('value');
                const userData = userSnapshot.val();
                const profilePic = userData?.profilePic || window.DEFAULT_AVATAR;

                const mediaData = {
                    url: response.secure_url,
                    title: title,
                    description: description,
                    timestamp: Date.now(),
                    uploadDate: new Date().toISOString(),
                    views: 0,
                    likes: 0,
                    publisher: this.username,
                    publisherPic: profilePic,
                    matureContent: matureContent,
                    type: file.type.startsWith('video/') ? 'video' : 'image'
                };

                await this.videosRef.push(mediaData);
                this.loadUserVideos();
            } catch (error) {
                console.error('Error:', error);
                uploadManager.handleError('Failed to process upload');
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
            const encodedUsername = this.encodeUsername(username);
            const encodedPublisher = this.encodeUsername(publisherUsername);
            
            const followingRef = this.database.ref(`following/${encodedUsername}/${encodedPublisher}`);
            const followersRef = this.database.ref(`followers/${encodedPublisher}/${encodedUsername}`);
            const userRef = this.database.ref(`users/${encodedUsername}/following/${encodedPublisher}`);
            
            // Check current state in both directions
            const [followingSnapshot, followersSnapshot] = await Promise.all([
                followingRef.once('value'),
                followersRef.once('value')
            ]);
            
            const isFollowing = followingSnapshot.exists();
            const isInFollowers = followersSnapshot.exists();
            
            // If state is inconsistent, fix it
            if (isFollowing !== isInFollowers) {
                console.log('Fixing inconsistent follow state');
                // If either exists, we assume the intention was to follow
                if (isFollowing || isInFollowers) {
                    const followData = { timestamp: Date.now() };
                    await Promise.all([
                        followingRef.set(followData),
                        followersRef.set(followData),
                        userRef.set(followData)
                    ]);
                    this.following.add(publisherUsername);
                } else {
                    await Promise.all([
                        followingRef.remove(),
                        followersRef.remove(),
                        userRef.remove()
                    ]);
                    this.following.delete(publisherUsername);
                }
            } else {
                // Normal toggle behavior
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

    // Add method to fix follow relationships
    async fixFollowRelationships(username) {
        try {
            const encodedUsername = this.encodeUsername(username);
            const db = this.database;

            // Get all following and followers
            const [followingSnapshot, followersSnapshot] = await Promise.all([
                db.ref(`following/${encodedUsername}`).once('value'),
                db.ref(`followers/${encodedUsername}`).once('value')
            ]);

            const following = followingSnapshot.val() || {};
            const followers = followersSnapshot.val() || {};

            // Check each following relationship
            for (const [followedUser, followData] of Object.entries(following)) {
                const theirFollowersRef = db.ref(`followers/${followedUser}/${encodedUsername}`);
                const theirFollowersSnapshot = await theirFollowersRef.once('value');
                
                if (!theirFollowersSnapshot.exists()) {
                    // Fix missing follower entry
                    await theirFollowersRef.set(followData);
                }
            }

            // Check each follower relationship
            for (const [followerUser, followData] of Object.entries(followers)) {
                const theirFollowingRef = db.ref(`following/${followerUser}/${encodedUsername}`);
                const theirFollowingSnapshot = await theirFollowingRef.once('value');
                
                if (!theirFollowingSnapshot.exists()) {
                    // Fix missing following entry
                    await theirFollowingRef.set(followData);
                }
            }

            // Update user's following entries
            const userFollowingRef = db.ref(`users/${encodedUsername}/following`);
            const userFollowingSnapshot = await userFollowingRef.once('value');
            const userFollowing = userFollowingSnapshot.val() || {};

            // Sync user's following with the main following list
            for (const [followedUser, followData] of Object.entries(following)) {
                if (!userFollowing[followedUser]) {
                    await userFollowingRef.child(followedUser).set(followData);
                }
            }
            
            // Remove any extra entries in user's following
            for (const followedUser of Object.keys(userFollowing)) {
                if (!following[followedUser]) {
                    await userFollowingRef.child(followedUser).remove();
                }
            }

        } catch (error) {
            console.error('Error fixing follow relationships:', error);
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

// Add upload state management
class UploadManager {
    constructor() {
        this.activeUpload = null;
        this.xhr = null;
        this.loadPersistedUpload();
    }

    isUploading() {
        return this.xhr !== null || (localStorage.getItem('activeUpload') !== null);
    }

    loadPersistedUpload() {
        const persistedUpload = localStorage.getItem('activeUpload');
        if (persistedUpload) {
            const uploadData = JSON.parse(persistedUpload);
            if (Date.now() - uploadData.startTime < 3600000) { // 1 hour timeout
                this.showUploadStatus(uploadData);
                if (uploadData.status === 'uploading') {
                    // If we had an active upload that was interrupted, show error
                    this.handleError('Upload interrupted. Please try again.');
                }
            } else {
                localStorage.removeItem('activeUpload');
            }
        }
    }

    preventUpload() {
        const existingModal = document.querySelector('.upload-modal');
        if (existingModal) {
            existingModal.classList.remove('active');
            setTimeout(() => existingModal.remove(), 300);
        }

        const blockingModal = document.createElement('div');
        blockingModal.className = 'upload-modal active';
        blockingModal.innerHTML = `
            <div class="upload-content" style="max-width: 400px; padding: 24px;">
                <div style="text-align: center;">
                    <div style="color: #FF4444; font-size: 24px; margin-bottom: 16px;">⚠️</div>
                    <h3 style="margin: 0 0 12px 0; color: white;">Upload in Progress</h3>
                    <p style="margin: 0 0 20px 0; color: #888;">Please wait for the current upload to complete or cancel it before starting a new one.</p>
                    <button class="view-upload-btn" style="background: #333; border: none; color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer;">View Current Upload</button>
                </div>
            </div>
        `;

        document.body.appendChild(blockingModal);

        // Close when clicking outside
        blockingModal.addEventListener('click', (e) => {
            if (e.target === blockingModal) {
                blockingModal.classList.remove('active');
                setTimeout(() => blockingModal.remove(), 300);
            }
        });

        // View upload button
        blockingModal.querySelector('.view-upload-btn').addEventListener('click', () => {
            const uploadStatus = document.getElementById('global-upload-status');
            if (uploadStatus) {
                uploadStatus.classList.remove('collapsed');
            }
            blockingModal.classList.remove('active');
            setTimeout(() => blockingModal.remove(), 300);
        });
    }

    startUpload(file, title, description, matureContent) {
        const uploadData = {
            fileName: file.name,
            fileSize: file.size,
            title,
            description,
            matureContent,
            progress: 0,
            startTime: Date.now(),
            status: 'uploading',
            collapsed: false
        };
        
        localStorage.setItem('activeUpload', JSON.stringify(uploadData));
        this.showUploadStatus(uploadData);
        return this.performUpload(file, uploadData);
    }

    showUploadStatus(uploadData) {
        let uploadStatusBar = document.getElementById('global-upload-status');
        if (!uploadStatusBar) {
            uploadStatusBar = document.createElement('div');
            uploadStatusBar.id = 'global-upload-status';
            uploadStatusBar.className = 'upload-status-bar';
            uploadStatusBar.innerHTML = `
                <div class="upload-status-content">
                    <div class="upload-status-header">
                        <div class="upload-status-info">
                            <div class="upload-status-text">
                                <div class="upload-title">Uploading media...</div>
                                <div class="upload-subtitle">${uploadData.fileName}</div>
                            </div>
                            <div class="upload-percentage">${uploadData.progress}%</div>
                        </div>
                        <button class="cancel-upload-btn" title="Cancel Upload">Cancel</button>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${uploadData.progress}%"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(uploadStatusBar);

            // Add event listener for cancel button
            const cancelBtn = uploadStatusBar.querySelector('.cancel-upload-btn');
            cancelBtn.addEventListener('click', () => this.cancelUpload());
        }
        uploadStatusBar.classList.add('active');
    }

    toggleCollapse() {
        const uploadStatusBar = document.getElementById('global-upload-status');
        if (uploadStatusBar) {
            uploadStatusBar.classList.toggle('collapsed');
            
            // Update persisted state
            const uploadData = JSON.parse(localStorage.getItem('activeUpload'));
            if (uploadData) {
                uploadData.collapsed = uploadStatusBar.classList.contains('collapsed');
                localStorage.setItem('activeUpload', JSON.stringify(uploadData));
            }
        }
    }

    cancelUpload() {
        if (this.xhr) {
            this.xhr.abort();
        }
        this.handleError('Upload cancelled');
    }

    updateProgress(progress) {
        const uploadData = JSON.parse(localStorage.getItem('activeUpload'));
        if (uploadData) {
            uploadData.progress = progress;
            localStorage.setItem('activeUpload', JSON.stringify(uploadData));
            
            const uploadStatusBar = document.getElementById('global-upload-status');
            if (uploadStatusBar) {
                uploadStatusBar.querySelector('.upload-percentage').textContent = `${progress}%`;
                uploadStatusBar.querySelector('.progress-fill').style.width = `${progress}%`;
            }
        }
    }

    async performUpload(file, uploadData) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'skiddoink_uploads');
        formData.append('cloud_name', 'dz8kxt0gy');

        const resourceType = file.type.startsWith('video/') ? 'video' : 'image';
        const uploadUrl = `https://api.cloudinary.com/v1_1/dz8kxt0gy/${resourceType}/upload`;

        return new Promise((resolve, reject) => {
            this.xhr = new XMLHttpRequest();
            this.xhr.open('POST', uploadUrl);
            
            this.xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    this.updateProgress(percent);
                }
            };

            this.xhr.onload = () => {
                if (this.xhr.status === 200) {
                    const response = JSON.parse(this.xhr.responseText);
                    this.completeUpload(response);
                    this.xhr = null;
                    resolve(response);
                } else {
                    this.xhr = null;
                    this.handleError('Upload failed');
                    reject(new Error('Upload failed'));
                }
            };

            this.xhr.onerror = () => {
                this.xhr = null;
                this.handleError('Network error');
                reject(new Error('Network error'));
            };

            this.xhr.send(formData);
        });
    }

    completeUpload(response) {
        const uploadStatusBar = document.getElementById('global-upload-status');
        if (uploadStatusBar) {
            const uploadTitle = uploadStatusBar.querySelector('.upload-title');
            const uploadSubtitle = uploadStatusBar.querySelector('.upload-subtitle');
            const cancelBtn = uploadStatusBar.querySelector('.cancel-upload-btn');
            
            uploadStatusBar.classList.add('success');
            uploadTitle.textContent = 'Upload Complete!';
            uploadSubtitle.textContent = 'Your post has been published successfully';
            
            // Hide cancel button on success
            if (cancelBtn) cancelBtn.style.display = 'none';
            
            setTimeout(() => {
                uploadStatusBar.classList.remove('active');
                setTimeout(() => {
                    if (uploadStatusBar.parentNode) {
                        uploadStatusBar.parentNode.removeChild(uploadStatusBar);
                    }
                }, 300);
            }, 2000);
        }
        localStorage.removeItem('activeUpload');
    }

    handleError(message) {
        const uploadStatusBar = document.getElementById('global-upload-status');
        if (uploadStatusBar) {
            const uploadTitle = uploadStatusBar.querySelector('.upload-title');
            const uploadSubtitle = uploadStatusBar.querySelector('.upload-subtitle');
            const cancelBtn = uploadStatusBar.querySelector('.cancel-upload-btn');
            
            // Update UI to error state
            uploadStatusBar.classList.add('error');
            uploadTitle.textContent = 'Upload Failed';
            uploadSubtitle.textContent = message;
            
            // Change cancel button to close button
            cancelBtn.textContent = 'Close';
            cancelBtn.addEventListener('click', () => {
                uploadStatusBar.classList.remove('active');
                setTimeout(() => {
                    if (uploadStatusBar.parentNode) {
                        uploadStatusBar.parentNode.removeChild(uploadStatusBar);
                    }
                }, 300);
            });
        }
        localStorage.removeItem('activeUpload');
        this.xhr = null;
    }
}

// Initialize the upload manager
const uploadManager = new UploadManager();

document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
}); 