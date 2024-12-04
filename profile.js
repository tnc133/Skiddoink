class ProfilePage {
    constructor() {
        console.log('ProfilePage constructor called');
        
        // Get username from URL parameter or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        this.username = urlParams.get('user') || localStorage.getItem('username');
        console.log('Username from URL or localStorage:', this.username);
        
        if (!this.username) {
            console.log('No username found - redirecting to index');
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
    }

    async loadUserData() {
        try {
            console.log('Loading user data for:', this.username);
            
            // Get user data from Firebase
            const snapshot = await this.database.ref('users')
                .orderByChild('username')
                .equalTo(this.username)
                .once('value');
            
            const userData = snapshot.val();
            console.log('User data from Firebase:', userData);
            
            const profilePicElement = document.getElementById('profilePic');
            console.log('Profile pic element found:', !!profilePicElement);
            
            if (!profilePicElement) {
                console.error('Profile picture element not found');
                return;
            }

            // Check if this is a ghost user (has content but no profile)
            console.log('Checking for ghost user content...');
            const hasContent = await this.checkUserHasContent(this.username);
            console.log('Has content result:', hasContent);

            // If we have videos or comments, don't redirect even without a user profile
            const [videosExist, commentsExist] = await Promise.all([
                this.videosRef.orderByChild('publisher').equalTo(this.username).once('value'),
                this.commentsRef.orderByChild('username').equalTo(this.username).once('value')
            ]);

            const hasRealContent = videosExist.exists() || commentsExist.exists();
            console.log('Has real content (videos/comments):', hasRealContent);

            if (!userData && !hasRealContent) {
                console.log('No user data AND no real content found - redirecting to home');
                console.log('Final check - userData:', userData);
                console.log('Final check - hasRealContent:', hasRealContent);
                setTimeout(() => {
                    window.location.href = './index.html';
                }, 1000);
                return;
            }

            console.log('Profile is valid (either has userData or content)');
            if (userData) {
                const userId = Object.keys(userData)[0];
                let profilePic = userData[userId].profilePic;
                
                // If no profile pic in user data, try to get from their latest video
                if (!profilePic) {
                    try {
                        const videosSnapshot = await this.videosRef
                            .orderByChild('publisher')
                            .equalTo(this.username)
                            .limitToLast(1)
                            .once('value');
                        
                        const videos = videosSnapshot.val();
                        if (videos) {
                            const latestVideo = Object.values(videos)[0];
                            profilePic = latestVideo.publisherPic;
                        }
                    } catch (error) {
                        console.error('Error fetching video profile pic:', error);
                    }
                }
                
                // Set the profile picture
                profilePicElement.src = profilePic || window.DEFAULT_AVATAR;

                // Only show change photo overlay on own profile
                const isOwnProfile = this.username === localStorage.getItem('username');
                const overlay = document.querySelector('.profile-pic-overlay');
                const profilePicContainer = document.querySelector('.profile-pic');
                
                if (overlay && profilePicContainer) {
                    overlay.style.display = isOwnProfile ? 'flex' : 'none';
                    profilePicContainer.style.cursor = isOwnProfile ? 'pointer' : 'default';
                    
                    if (isOwnProfile) {
                        profilePicContainer.addEventListener('click', () => {
                            this.handleProfilePicUpload();
                        });
                    }
                }
            } else {
                profilePicElement.src = window.DEFAULT_AVATAR;
            }

            // Load follower and following counts
            const followersSnapshot = await this.database.ref(`followers/${this.username}`).once('value');
            const followingSnapshot = await this.database.ref(`following/${this.username}`).once('value');
            
            const followerCount = Object.keys(followersSnapshot.val() || {}).length;
            const followingCount = Object.keys(followingSnapshot.val() || {}).length;
            
            // Calculate total likes from user's videos
            const videosSnapshot = await this.videosRef
                .orderByChild('publisher')
                .equalTo(this.username)
                .once('value');
            
            const videos = videosSnapshot.val() || {};
            const totalLikes = Object.values(videos).reduce((sum, video) => sum + (video.likes || 0), 0);
            
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

                // Bind click events for followers/following
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
            
            // Add follow button if not own profile and not deleted user
            if (!isOwnProfile && this.username !== '[Deleted User]') {
                const currentUsername = localStorage.getItem('username');
                const isFollowing = await this.checkIfFollowing(currentUsername, this.username);
                
                const followBtn = document.createElement('button');
                followBtn.className = 'profile-follow-btn';
                followBtn.textContent = isFollowing ? 'Following' : 'Follow';
                followBtn.addEventListener('click', () => this.toggleFollow());
                
                document.querySelector('.profile-info').appendChild(followBtn);
            }
        } catch (error) {
            console.error('Error in loadUserData:', error);
        }
    }

    async setupUI() {
        document.querySelector('.profile-username').textContent = `@${this.username}`;
        
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
            
            noVideosMessage.style.display = 'none';
            videosGrid.innerHTML = ''; // Clear existing videos
            
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
                    window.location.href = './index.html';
                });
            });
        });
    }

    handleUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.click();
        
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

                        // Get current user's profile picture from Firebase
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
                            publisherPic: profilePic  // Use the profile picture from Firebase
                        };

                        const newVideoRef = this.videosRef.push();
                        await newVideoRef.set(videoData);

                        this.loadUserVideos(); // Reload videos after upload
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
                await this.database.ref(`users/${userId}/profilePic`).set(data.secure_url);
                
                // Update all videos by this user to include the profile pic
                const videosSnapshot = await this.videosRef
                    .orderByChild('publisher')
                    .equalTo(this.username)
                    .once('value');
                
                const updates = {};
                Object.entries(videosSnapshot.val() || {}).forEach(([videoId, video]) => {
                    updates[`videos/${videoId}/publisherPic`] = data.secure_url;
                });
                
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
                                ${isLiked ? '❤️' : '🤍'}
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

    async toggleFollow() {
        const currentUsername = localStorage.getItem('username');
        if (!currentUsername) {
            alert('Please sign in to follow users');
            return;
        }
        
        const followingRef = this.database.ref(`following/${currentUsername}/${this.username}`);
        const followersRef = this.database.ref(`followers/${this.username}/${currentUsername}`);
        const followBtn = document.querySelector('.profile-follow-btn');
        
        const isFollowing = await this.checkIfFollowing(currentUsername, this.username);
        
        if (isFollowing) {
            // Unfollow
            await Promise.all([
                followingRef.remove(),
                followersRef.remove()
            ]);
            followBtn.textContent = 'Follow';
        } else {
            // Follow
            await Promise.all([
                followingRef.set(true),
                followersRef.set(true)
            ]);
            followBtn.textContent = 'Following';
        }
        
        // Update follower count
        this.loadUserData();
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
        
        // Important: Add the active class in the next frame
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });

        const closeBtn = modal.querySelector('.close-follow-modal');
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        });

        const listContainer = modal.querySelector('.follow-list');
        const ref = this.database.ref(type === 'followers' ? `followers/${this.username}` : `following/${this.username}`);
        const snapshot = await ref.once('value');
        const users = snapshot.val() || {};

        console.log(`Found ${Object.keys(users).length} ${type}`);  // Debug log

        // Load each user's data
        const userPromises = Object.keys(users).map(async username => {
            const userSnapshot = await this.database.ref('users')
                .orderByChild('username')
                .equalTo(username)
                .once('value');
            const userData = userSnapshot.val();
            if (userData) {
                const userId = Object.keys(userData)[0];
                return {
                    username,
                    profilePic: userData[userId].profilePic || window.DEFAULT_AVATAR
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
                    <a href="./profile.html?user=${user.username}" class="follow-username">@${user.username}</a>
                </div>
                ${user.username !== currentUsername ? `
                    <button class="follow-btn" data-username="${user.username}">
                        ${this.following.has(user.username) ? 'Following' : 'Follow'}
                    </button>
                ` : ''}
            </div>
        `).join('') : '<p class="no-follows">No users found</p>';

        // Add follow button handlers
        listContainer.querySelectorAll('.follow-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.username;
                await this.toggleFollow(username);
                btn.textContent = this.following.has(username) ? 'Following' : 'Follow';
            });
        });
    }

    // Add loadFollowing method
    async loadFollowing() {
        const currentUsername = localStorage.getItem('username');
        if (!currentUsername) return;
        
        try {
            const followingSnapshot = await this.database.ref(`following/${currentUsername}`).once('value');
            this.following = new Set(Object.keys(followingSnapshot.val() || {}));
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
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
}); 