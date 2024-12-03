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
        this.usernameDisplay = document.createElement('span');
        this.usernameDisplay.className = 'username-display';
        this.usernameDisplay.textContent = localStorage.getItem('username') || 'Guest';
        uploadBtn.parentElement.insertBefore(this.usernameDisplay, uploadBtn);

        this.loadVideos();
    }

    checkUsername() {
        if (!localStorage.getItem('username')) {
            const modal = document.createElement('div');
            modal.className = 'username-modal';
            modal.innerHTML = `
                <div class="username-modal-content">
                    <h2>Welcome to Skiddoink!</h2>
                    <p>Please enter a username to continue:</p>
                    <input type="text" id="usernameInput" maxlength="20" placeholder="Your username">
                    <button id="submitUsername">Continue</button>
                </div>
            `;
            document.body.appendChild(modal);

            const input = modal.querySelector('#usernameInput');
            const submitBtn = modal.querySelector('#submitUsername');

            const handleSubmit = () => {
                const username = input.value.trim();
                if (username) {
                    localStorage.setItem('username', username);
                    this.usernameDisplay.textContent = username;
                    document.body.removeChild(modal);
                }
            };

            submitBtn.addEventListener('click', handleSubmit);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSubmit();
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
        const randomizedVideos = [...videos].sort(() => Math.random() - 0.5);

        randomizedVideos.forEach(video => {
            const container = document.createElement('div');
            container.className = 'video-container';
            
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
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    new SkiddoinkApp();
});