class SearchPage {
    constructor() {
        this.database = firebase.database();
        this.videosRef = this.database.ref('videos');
        this.searchInput = document.querySelector('.search-input');
        this.resultsContainer = document.querySelector('.search-results');
        
        this.ITEMS_PER_PAGE = 12;
        this.currentUsers = [];
        this.currentVideos = [];
        
        this.decodeUsername = username => username.replace(/\(/g, '.');
        
        this.setupEventListeners();
        // Load popular videos on startup
        this.loadPopularVideos();

        // Add keyboard shortcut listener for logout
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                if (confirm('Are you sure you want to sign out?')) {
                    localStorage.clear();
                    window.location.replace('./index.html');
                }
            }
        });
    }

    setupEventListeners() {
        let searchTimeout;
        
        this.searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = this.searchInput.value.trim().toLowerCase();
            
            if (query.length < 2) {
                this.loadPopularVideos();
                return;
            }

            searchTimeout = setTimeout(() => {
                this.performSearch(query);
            }, 300);
        });

        // Check URL for search query
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('q');
        if (query) {
            this.searchInput.value = query;
            this.performSearch(query);
        }
    }

    async loadPopularVideos() {
        this.resultsContainer.innerHTML = '<div class="loading-spinner"></div>';

        try {
            const [videosSnapshot, usersSnapshot] = await Promise.all([
                this.videosRef.once('value'),
                this.database.ref('users').once('value')
            ]);

            // Process videos
            const videos = [];
            videosSnapshot.forEach(child => {
                const video = child.val();
                const videoId = child.key;
                videos.push({ ...video, id: videoId });
            });

            // Process users and get their validated follower counts
            const users = [];
            const userPromises = [];
            
            usersSnapshot.forEach(child => {
                const userData = child.val();
                if (userData && userData.username) {
                    userPromises.push(
                        (async () => {
                            const followersSnapshot = await this.database.ref(`followers/${userData.username}`).once('value');
                            const followers = followersSnapshot.val() || {};
                            
                            // Validate followers
                            const validFollowers = [];
                            for (const follower of Object.keys(followers)) {
                                const followerSnapshot = await this.database.ref('users')
                                    .orderByChild('username')
                                    .equalTo(follower)
                                    .once('value');
                                if (followerSnapshot.exists()) {
                                    validFollowers.push(follower);
                                }
                            }

                            users.push({
                                username: userData.username,
                                profilePic: userData.profilePic || window.DEFAULT_AVATAR,
                                followers: validFollowers.length
                            });
                        })()
                    );
                }
            });

            await Promise.all(userPromises);

            // Sort by validated follower count
            this.currentUsers = users.sort((a, b) => (b.followers || 0) - (a.followers || 0));
            this.currentVideos = videos.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            
            this.displayResults(1, 1, 'Popular');
        } catch (error) {
            console.error('Error loading popular content:', error);
            this.resultsContainer.innerHTML = '<p>Error loading content</p>';
        }
    }

    async performSearch(query) {
        this.resultsContainer.innerHTML = '<div class="loading-spinner"></div>';

        try {
            const [usersSnapshot, videosSnapshot] = await Promise.all([
                this.database.ref('users').once('value'),
                this.videosRef.once('value')
            ]);

            this.currentUsers = [];
            this.currentVideos = [];

            // Search users
            usersSnapshot.forEach(child => {
                const userData = child.val();
                if (userData && userData.username && userData.username.toLowerCase().includes(query)) {
                    this.currentUsers.push({
                        username: userData.username,
                        profilePic: userData.profilePic || window.DEFAULT_AVATAR
                    });
                }
            });

            // Search videos
            const videos = [];
            videosSnapshot.forEach(child => {
                const video = child.val();
                const videoId = child.key;
                if (
                    (video.title || '').toLowerCase().includes(query) ||
                    (video.description || '').toLowerCase().includes(query) ||
                    (video.publisher || '').toLowerCase().includes(query)
                ) {
                    videos.push({ ...video, id: videoId });
                }
            });

            // Sort videos by likes
            this.currentVideos = videos.sort((a, b) => (b.likes || 0) - (a.likes || 0));

            this.displayResults(1, 1, `Results for "${query}"`);

        } catch (error) {
            console.error('Search error:', error);
            this.resultsContainer.innerHTML = '<p>Error performing search</p>';
        }
    }

    displayResults(usersPage = 1, videosPage = 1, title = '') {
        const usersToShow = this.currentUsers.slice(0, usersPage * this.ITEMS_PER_PAGE);
        const videosToShow = this.currentVideos.slice(0, videosPage * this.ITEMS_PER_PAGE);

        console.log('Displaying results');
        console.log('Videos/Photos to show:', videosToShow);
        
        this.resultsContainer.innerHTML = `
            ${this.currentUsers.length > 0 ? `
                <div class="search-section">
                    <div class="search-section-title">
                        <h3>${title === 'Popular' ? 'Popular Users' : 'Users'}</h3>
                    </div>
                    <div class="users-section">
                        ${usersToShow.map(user => `
                            <div class="user-result" onclick="window.location.href='./profile.html?user=${user.username}'">
                                <img src="${user.profilePic}" alt="Profile">
                                <div class="user-info">
                                    <h4>@${this.decodeUsername(user.username)}</h4>
                                    <p>${user.followers || 0} followers</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${this.currentVideos.length > 0 ? `
                <div class="search-section">
                    <div class="search-section-title">
                        <h3>${title === 'Popular' ? 'Popular Videos' : title || 'Videos'}</h3>
                    </div>
                    <div class="videos-section">
                        <div class="videos-grid">
                            ${videosToShow.map(video => {
                                console.log('Processing item in search results:', video);
                                console.log('Item type:', video.type);
                                
                                const videoResult = document.createElement('div');
                                videoResult.className = 'video-result';
                                
                                // Modify the thumbnail creation to handle both videos and images
                                if (video.type === 'image') {
                                    console.log('Creating image thumbnail');
                                    videoResult.innerHTML = `
                                        <div class="video-thumbnail" onclick="searchPage.goToVideo('${video.id}')">
                                            <img src="${video.url}" alt="${video.title || 'Image post'}">
                                            <div class="video-likes">❤️ ${video.likes || 0}</div>
                                            <div class="video-info">
                                                <h4>${video.title || 'Untitled Post'}</h4>
                                                <p>@${this.decodeUsername(video.publisher || '[Deleted User]')}</p>
                                            </div>
                                        </div>
                                    `;
                                } else {
                                    console.log('Creating video thumbnail');
                                    // Add mature content warning overlay if needed
                                    if (video.matureContent && localStorage.getItem('showMatureContent') !== 'true') {
                                        videoResult.innerHTML = `
                                            <div class="video-thumbnail mature-warning" onclick="searchPage.handleMatureVideo('${video.id}')">
                                                <div class="mature-badge">
                                                    <span>Mature❤️</span>
                                                    <span class="mature-count">${video.likes || 0}</span>
                                                </div>
                                                <video src="${video.url}" muted loop poster="${video.thumbnail || ''}" playsinline></video>
                                                <div class="video-info">
                                                    <h4>MATURE VIDEO...</h4>
                                                    <p>@${this.decodeUsername(video.publisher || '[Deleted User]')}</p>
                                                </div>
                                            </div>
                                        `;
                                    } else {
                                        // Normal video display (existing code)
                                        videoResult.innerHTML = `
                                            <div class="video-thumbnail" onclick="searchPage.goToVideo('${video.id}')">
                                                <video src="${video.url}" muted loop poster="${video.thumbnail || ''}" playsinline></video>
                                                <div class="video-likes">❤️ ${video.likes || 0}</div>
                                                <div class="video-info">
                                                    <h4>${video.title || 'Untitled Video'}</h4>
                                                    <p>@${this.decodeUsername(video.publisher || '[Deleted User]')}</p>
                                                </div>
                                            </div>
                                        `;
                                    }
                                }

                                console.log('Video data:', video);  // Add this to see what data we have

                                return videoResult.outerHTML;
                            }).join('')}
                        </div>
                        ${this.currentVideos.length > videosToShow.length ? `
                            <div class="show-more-container">
                                <button class="show-more-btn" onclick="searchPage.displayResults(${usersPage}, ${videosPage + 1}, '${title}')">
                                    Show more
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            ${this.currentUsers.length === 0 && this.currentVideos.length === 0 ? `
                <div class="no-results">
                    <p>No results found</p>
                </div>
            ` : ''}
        `;

        // Add hover preview for video results
        document.querySelectorAll('.video-result:not(.preview) video').forEach(video => {
            video.addEventListener('mouseenter', () => {
                video.play().catch(console.error);
            });
            video.addEventListener('mouseleave', () => {
                video.pause();
                video.currentTime = 0;
            });
        });
    }

    goToVideo(videoId, isMatureOverride = false) {
        // Make sure we preserve the exact video ID
        const cleanVideoId = videoId.replace(/[^-a-zA-Z0-9_]/g, '');  // Remove any invalid characters
        console.log('Setting video ID:', cleanVideoId);
        
        // Clear any existing viewing state
        localStorage.removeItem('viewingUserVideos');
        
        // Set the video to view
        localStorage.setItem('activeVideoId', videoId);  // Use original videoId, not cleaned
        localStorage.setItem('scrollToVideo', 'true');
        
        // Navigate to index
        window.location.href = './index.html';
    }

    decodeUsername(username) {
        // Implement your decoding logic here
        return username;
    }

    handleMatureVideo(videoId) {
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
            this.goToVideo(videoId, true);
        });

        cancelBtn.addEventListener('click', closeModal);

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

// Initialize when document is ready
const searchPage = new SearchPage(); 