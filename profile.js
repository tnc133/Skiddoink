class ProfilePage {
    constructor() {
        // Get username from URL parameter or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        this.username = urlParams.get('user') || localStorage.getItem('username');
        
        if (!this.username) {
            window.location.href = './index.html';
            return;
        }

        // Initialize Firebase
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
        this.loadUserData();
        this.loadUserVideos();
    }

    async loadUserData() {
        try {
            // Get user data from Firebase
            const snapshot = await this.database.ref('users')
                .orderByChild('username')
                .equalTo(this.username)
                .once('value');
            
            const userData = snapshot.val();
            if (userData) {
                const userId = Object.keys(userData)[0];
                const profilePic = userData[userId].profilePic || DEFAULT_AVATAR;
                const profilePicElement = document.getElementById('profilePic');
                profilePicElement.src = profilePic;

                // Only show change photo overlay on own profile
                const isOwnProfile = this.username === localStorage.getItem('username');
                const overlay = document.querySelector('.profile-pic-overlay');
                const profilePicContainer = document.querySelector('.profile-pic');
                
                if (overlay && profilePicContainer) {
                    overlay.style.display = isOwnProfile ? 'flex' : 'none';
                    profilePicContainer.style.cursor = isOwnProfile ? 'pointer' : 'default';
                    
                    // Add click handler for profile picture change
                    if (isOwnProfile) {
                        profilePicContainer.addEventListener('click', () => {
                            this.handleProfilePicUpload();
                        });
                    }
                }
            } else {
                document.getElementById('profilePic').src = DEFAULT_AVATAR;
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            document.getElementById('profilePic').src = DEFAULT_AVATAR;
        }
    }

    async setupUI() {
        document.querySelector('.profile-username').textContent = `@${this.username}`;
        
        // Only show upload and settings buttons if it's the user's own profile
        const isOwnProfile = this.username === localStorage.getItem('username');
        
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
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
}); 