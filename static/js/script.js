document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.querySelector('.chat-messages');
    const typingIndicator = document.querySelector('.typing-indicator');
    const fileInput = document.getElementById('file-input');
    const newChatBtn = document.querySelector('.new-chat');
    const chatHistory = document.querySelector('.chat-history');
    const themeToggle = document.getElementById('theme-toggle');
    
    let currentChatId = null;
    let isDarkTheme = localStorage.getItem('theme') === 'dark';
    
    // Initialize the app
    init();
    
    // Initialize function
    function init() {
        // Add theme color meta tag if not exists
        if (!document.querySelector('meta[name="theme-color"]')) {
            const meta = document.createElement('meta');
            meta.name = 'theme-color';
            meta.content = isDarkTheme ? '#121212' : '#f5f6fa';
            document.head.appendChild(meta);
        }
        
        setTheme();
        loadChats();
        setupEventListeners();
    }
    
    // Set theme based on localStorage
    function setTheme() {
        if (isDarkTheme) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            themeToggle.title = 'Switch to light theme';
            document.querySelector('meta[name="theme-color"]').content = '#121212';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            themeToggle.title = 'Switch to dark theme';
            document.querySelector('meta[name="theme-color"]').content = '#f5f6fa';
        }
        
        // Force redraw for smooth transition
        document.body.style.visibility = 'hidden';
        document.body.offsetHeight; // Trigger reflow
        document.body.style.visibility = 'visible';
    }
    
    // Setup event listeners
    function setupEventListeners() {
        // Theme toggle
        themeToggle.addEventListener('click', toggleTheme);
        
        // New chat button
        newChatBtn.addEventListener('click', createNewChat);
        
        // Chat form submission
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const message = chatInput.value.trim();
            if (message && currentChatId) {
                sendMessage(message);
                chatInput.value = '';
            }
        });
        
        // File input change
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0 && currentChatId) {
                const message = chatInput.value.trim() || "Analyze these images";
                sendMessage(message, this.files);
                this.value = ''; // Reset file input
            }
        });
    }
    
    // Toggle between dark and light theme
    function toggleTheme() {
        isDarkTheme = !isDarkTheme;
        localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
        setTheme();
    }
    
    // Load chat history from server
    function loadChats() {
        fetch('/api/chats')
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                renderChatHistory(data.chats);
                if (data.chats.length > 0) {
                    loadChat(data.chats[0].id);
                } else {
                    createNewChat();
                }
            })
            .catch(error => {
                console.error('Error loading chats:', error);
                showErrorToast('Failed to load chats');
            });
    }
    
    // Render chat history in sidebar
    function renderChatHistory(chats) {
        chatHistory.innerHTML = '';
        chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            if (currentChatId === chat.id) {
                chatItem.classList.add('active');
            }
            
            // Truncate long chat titles
            const title = chat.title.length > 20 
                ? chat.title.substring(0, 17) + '...' 
                : chat.title;
            
            chatItem.innerHTML = `
                <i class="fas fa-comment"></i>
                <span class="chat-title">${title}</span>
                <button class="delete-chat" data-id="${chat.id}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            chatItem.addEventListener('click', () => loadChat(chat.id));
            
            const deleteBtn = chatItem.querySelector('.delete-chat');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(chat.id);
            });
            
            chatHistory.appendChild(chatItem);
        });
    }
    
    // Create a new chat
    function createNewChat() {
        fetch('/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: 'Новый чат' })
        })
        .then(response => {
            if (!response.ok) throw new Error('Проблемы с инетом');
            return response.json();
        })
        .then(chat => {
            currentChatId = chat.id;
            loadChats();
            clearChatMessages();
        })
        .catch(error => {
            console.error('Ошибка создания чата:', error);
            showErrorToast('Не получилось создать чат');
        });
    }
    
    // Delete a chat
    function deleteChat(chatId) {
        if (confirm('Ты уверен что хочешь удалить этот чат?')) {
            fetch('/api/chats', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: chatId })
            })
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                loadChats();
                if (currentChatId === chatId) {
                    currentChatId = null;
                    clearChatMessages();
                    if (chatHistory.children.length > 0) {
                        const firstChat = chatHistory.children[0];
                        const newChatId = parseInt(firstChat.querySelector('.delete-chat').dataset.id);
                        loadChat(newChatId);
                    } else {
                        createNewChat();
                    }
                }
            })
            .catch(error => {
                console.error('Error deleting chat:', error);
                showErrorToast('Failed to delete chat');
            });
        }
    }
    
    // Load a specific chat
    function loadChat(chatId) {
        currentChatId = chatId;
        fetch(`/api/chat/${chatId}`)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(chat => {
                renderChatMessages(chat.messages);
                updateActiveChatInSidebar(chatId);
            })
            .catch(error => {
                console.error('Error loading chat:', error);
                showErrorToast('Failed to load chat');
            });
    }
    
    // Update active chat in sidebar
    function updateActiveChatInSidebar(chatId) {
        const chatItems = document.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            const itemChatId = parseInt(item.querySelector('.delete-chat').dataset.id);
            item.classList.toggle('active', itemChatId === chatId);
        });
    }
    
    // Clear chat messages
    function clearChatMessages() {
        chatMessages.innerHTML = '';
    }
    
    // Render chat messages
    function renderChatMessages(messages) {
        clearChatMessages();
        messages.forEach(message => {
            addMessageToChat(message.role, message.content, message.images);
        });
        scrollToBottom();
    }
    
    // Send a message to the server
    function sendMessage(message, files = null) {
        // Add user message to chat immediately
        addMessageToChat('user', message, files ? Array.from(files) : null);
        
        // Show typing indicator
        typingIndicator.style.display = 'flex';
        scrollToBottom();
        
        // Prepare form data
        const formData = new FormData();
        formData.append('prompt', message);
        formData.append('chat_id', currentChatId);
        
        if (files) {
            for (let i = 0; i < files.length; i++) {
                formData.append('images', files[i]);
            }
        }
        
        // Send to server
        fetch('/api/generate', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            // Add AI response to chat
            addMessageToChat('assistant', data.content, data.images || null);
        })
        .catch(error => {
            console.error('Error:', error);
            addMessageToChat('assistant', `Error: ${error.message}`);
        })
        .finally(() => {
            // Hide typing indicator
            typingIndicator.style.display = 'none';
            scrollToBottom();
        });
    }
    
    // Add a message to the chat UI
    function addMessageToChat(role, content, images = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        // Format content with Markdown
        let formattedContent = marked.parse(content || '');
        
        // Add images if present
        let imagesHTML = '';
        if (images && images.length > 0) {
            if (Array.isArray(images)) {
                // Handle File objects (from file input)
                images.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const imgContainer = document.createElement('div');
                        imgContainer.className = 'message-image-container';
                        
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        img.alt = file.name;
                        img.loading = 'lazy';
                        img.className = 'message-image';
                        
                        imgContainer.appendChild(img);
                        messageDiv.querySelector('.message-content').prepend(imgContainer);
                        renderMathAndCode();
                    };
                    reader.readAsDataURL(file);
                });
            } else {
                // Handle image paths (from server)
                images.forEach(imgPath => {
                    imagesHTML += `
                        <div class="message-image-container">
                            <img src="/static/images/${imgPath}" alt="${imgPath}" loading="lazy" class="message-image">
                        </div>
                    `;
                });
            }
        }
        
        // Get current time
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="message-content">${imagesHTML}${formattedContent}</div>
            <div class="message-time">${timeString}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        renderMathAndCode();
        scrollToBottom();
    } 
    
    // Render LaTeX and syntax highlighting
    function renderMathAndCode() {
        // Render LaTeX
        if (typeof renderMathInElement === 'function') {
            document.querySelectorAll('.message-content').forEach(el => {
                renderMathInElement(el, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError: false
                });
            });
        }
        
        // Highlight code
        if (typeof hljs !== 'undefined') {
            document.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
    }
    
    // Scroll chat to bottom
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Show error toast notification
    function showErrorToast(message) {
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
});