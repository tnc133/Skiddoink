class SearchPage {
    constructor() {
        this.database = firebase.database();
        this.videosRef = this.database.ref('videos');
        this.searchInput = document.querySelector('.search-input');
        this.resultsContainer = document.querySelector('.search-results');
        
        this.ITEMS_PER_PAGE = 12;
        this.currentUsers = [];
        this.currentVideos = [];
        
        this.setupEventListeners();
        // Load popular videos on startup
        this.loadPopularVideos();
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

            // Process users and get their follower counts
            const users = [];
            const userPromises = [];
            
            usersSnapshot.forEach(child => {
                const userData = child.val();
                if (userData && userData.username) {
                    userPromises.push(
                        this.database.ref(`followers/${userData.username}`).once('value')
                            .then(followersSnapshot => {
                                const followerCount = followersSnapshot.numChildren() || 0;
                                users.push({
                                    username: userData.username,
                                    profilePic: userData.profilePic || window.DEFAULT_AVATAR,
                                    followers: followerCount
                                });
                            })
                    );
                }
            });

            await Promise.all(userPromises);

            // Sort by likes/followers (descending)
            this.currentVideos = videos.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            this.currentUsers = users.sort((a, b) => (b.followers || 0) - (a.followers || 0));
            
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
                                    <h4>@${user.username}</h4>
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
                            ${videosToShow.map(video => `
                                <div class="video-result" onclick="searchPage.goToVideo('${video.id}')">
                                    <div class="video-thumbnail">
                                        <video src="${video.url}" muted loop poster="${video.thumbnail || ''}" playsinline></video>
                                        <div class="video-likes">❤️ ${video.likes || 0}</div>
                                        <div class="video-info">
                                            <h4>${video.title || 'Untitled Video'}</h4>
                                            <p>@${video.publisher || '[Deleted User]'}</p>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
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

    goToVideo(videoId) {
        localStorage.setItem('activeVideoId', videoId);
        localStorage.setItem('scrollToVideo', 'true');
        window.location.href = './index.html';
    }
}

// Initialize when document is ready
const searchPage = new SearchPage(); 