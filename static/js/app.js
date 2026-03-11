// DOM Elements
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const documentsList = document.getElementById('documents-list');
const docCount = document.getElementById('doc-count');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const searchMode = document.getElementById('search-mode');
const autoSpeakCheckbox = document.getElementById('auto-speak-checkbox');
const themeToggle = document.getElementById('theme-toggle');
const loadingOverlay = document.getElementById('loading-overlay');
const toastContainer = document.getElementById('toast-container');

// State
let isListening = false;
let recognition = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadDocuments();
    initializeSpeechRecognition();
    loadThemePreference();
});

// Event Listeners
browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
dropArea.addEventListener('dragover', handleDragOver);
dropArea.addEventListener('drop', handleDrop);
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
micBtn.addEventListener('click', toggleSpeechRecognition);
clearChatBtn.addEventListener('click', clearChat);
themeToggle.addEventListener('click', toggleTheme);

// File Handling
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.add('hover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('hover');
    
    const files = e.dataTransfer.files;
    if (files.length) {
        uploadFile(files[0]);
    }
}

function handleFileSelect(e) {
    if (e.target.files.length) {
        uploadFile(e.target.files[0]);
    }
}

// API Functions
async function uploadFile(file) {
    showLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast('Document uploaded successfully!', 'success');
            loadDocuments();
        } else {
            showToast(result.error || 'Upload failed', 'error');
        }
    } catch (error) {
        showToast('Network error occurred', 'error');
        console.error('Upload error:', error);
    } finally {
        showLoading(false);
    }
}

async function loadDocuments() {
    try {
        const response = await fetch('/api/documents');
        const documents = await response.json();
        
        if (Object.keys(documents).length === 0) {
            documentsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt empty-icon"></i>
                    <h4>No documents yet</h4>
                    <p>Upload your first document to get started</p>
                </div>
            `;
            docCount.textContent = '0 documents';
            return;
        }
        
        docCount.textContent = `${Object.keys(documents).length} document${Object.keys(documents).length !== 1 ? 's' : ''}`;
        
        let documentsHTML = '';
        for (const [id, doc] of Object.entries(documents)) {
            documentsHTML += createDocumentCard(id, doc);
        }
        
        documentsList.innerHTML = documentsHTML;
        
        // Add event listeners to action buttons
        document.querySelectorAll('.summarize-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filename = e.currentTarget.dataset.filename;
                summarizeDocument(filename);
            });
        });
        
        document.querySelectorAll('.reprocess-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filename = e.currentTarget.dataset.filename;
                reprocessDocument(filename);
            });
        });
    } catch (error) {
        showToast('Failed to load documents', 'error');
        console.error('Load documents error:', error);
    }
}

function createDocumentCard(id, doc) {
    const fileSize = formatFileSize(doc.size);
    const fileExtension = doc.filename.split('.').pop().toUpperCase();
    
    return `
        <div class="document-card">
            <div class="document-icon">
                ${getFileIcon(fileExtension)}
            </div>
            <div class="document-info">
                <div class="document-name">${doc.filename}</div>
                <div class="document-meta">
                    <span>${fileSize}</span>
                    <span>${fileExtension}</span>
                    <span>${doc.chunk_count || 0} chunks</span>
                </div>
            </div>
            <div class="document-actions">
                <button class="btn btn-sm btn-outline summarize-btn" data-filename="${doc.filename}">
                    <i class="fas fa-file-contract"></i> Summarize
                </button>
                <button class="btn btn-sm btn-outline reprocess-btn" data-filename="${doc.filename}">
                    <i class="fas fa-sync"></i> Reprocess
                </button>
            </div>
        </div>
    `;
}

function getFileIcon(extension) {
    switch (extension) {
        case 'PDF': return '<i class="fas fa-file-pdf"></i>';
        case 'DOCX': return '<i class="fas fa-file-word"></i>';
        case 'TXT': return '<i class="fas fa-file-alt"></i>';
        default: return '<i class="fas fa-file"></i>';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function sendMessage() {
    const question = chatInput.value.trim();
    if (!question) return;
    
    // Add user message to chat
    addMessageToChat(question, 'user');
    chatInput.value = '';
    
    // Add thinking indicator
    const thinkingId = addThinkingIndicator();
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                mode: searchMode.value
            })
        });
        
        const result = await response.json();
        
        // Remove thinking indicator
        removeThinkingIndicator(thinkingId);
        
        if (response.ok) {
            addMessageToChat(result.answer, 'assistant', result.sources);
            
            // Auto-speak if enabled
            if (autoSpeakCheckbox.checked) {
                speakText(result.answer);
            }
        } else {
            addMessageToChat(result.error || 'Failed to get response', 'assistant');
        }
    } catch (error) {
        removeThinkingIndicator(thinkingId);
        addMessageToChat('Network error occurred', 'assistant');
        console.error('Chat error:', error);
    }
}

async function summarizeDocument(filename) {
    showLoading(true);
    
    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast('Summary generated successfully!', 'success');
            // Add summary to chat
            addMessageToChat(`**Summary of ${filename}:**\n\n${result.summary}`, 'assistant');
        } else {
            showToast(result.error || 'Failed to summarize', 'error');
        }
    } catch (error) {
        showToast('Network error occurred', 'error');
        console.error('Summarize error:', error);
    } finally {
        showLoading(false);
    }
}

async function reprocessDocument(filename) {
    showLoading(true);
    
    try {
        const response = await fetch(`/api/process-existing/${filename}`);
        const result = await response.json();
        
        if (response.ok) {
            showToast('Document reprocessed successfully!', 'success');
            loadDocuments();
        } else {
            showToast(result.error || 'Reprocessing failed', 'error');
        }
    } catch (error) {
        showToast('Network error occurred', 'error');
        console.error('Reprocess error:', error);
    } finally {
        showLoading(false);
    }
}

async function clearChat() {
    try {
        const response = await fetch('/api/clear_chat', {
            method: 'POST'
        });
        
        if (response.ok) {
            chatMessages.innerHTML = `
                <div class="message assistant-message">
                    <div class="message-avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="message-content">
                        <p>Hello! I'm your AI assistant. Upload some documents and ask me questions about their content.</p>
                    </div>
                </div>
            `;
            showToast('Chat cleared', 'info');
        } else {
            showToast('Failed to clear chat', 'error');
        }
    } catch (error) {
        showToast('Network error occurred', 'error');
        console.error('Clear chat error:', error);
    }
}

// Chat UI Functions
function addMessageToChat(content, sender, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = sender === 'user' ? 
        '<div class="message-avatar"><i class="fas fa-user"></i></div>' : 
        '<div class="message-avatar"><i class="fas fa-robot"></i></div>';
    
    let formattedContent = formatResponse(content);
    
    let sourcesHTML = '';
    if (sources.length > 0) {
        sourcesHTML = `
            <div class="sources">
                <strong>Sources:</strong>
                ${sources.map(source => `<span class="source-item">${source}</span>`).join('')}
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        ${avatar}
        <div class="message-content">
            ${formattedContent}
            ${sourcesHTML}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function addThinkingIndicator() {
    const thinkingId = 'thinking-' + Date.now();
    
    const thinkingDiv = document.createElement('div');
    thinkingDiv.id = thinkingId;
    thinkingDiv.className = 'message assistant-message';
    thinkingDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(thinkingDiv);
    scrollToBottom();
    
    return thinkingId;
}

function removeThinkingIndicator(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function formatResponse(text) {
    // Convert markdown-like formatting to HTML
    let formatted = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        // Inline code
        .replace(/`(.*?)`/gim, '<code>$1</code>')
        // Code blocks
        .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        // Unordered lists
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        // Ordered lists
        .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ol>$1</ol>')
        // Line breaks and paragraphs
        .split('\n\n')
        .map(para => para.trim() ? `<p>${para.replace(/\n/g, '<br>')}</p>` : '')
        .join('');
    
    return formatted || '<p>No content</p>';
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Speech Recognition
function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.log('Speech Recognition not available');
        micBtn.style.display = 'none';
        return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let interimTranscript = '';
    
    recognition.onstart = () => {
        console.log('Listening...');
        isListening = true;
        micBtn.classList.add('listening');
    };
    
    recognition.onresult = (event) => {
        let finalTranscript = '';
        interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        if (finalTranscript) {
            chatInput.value = finalTranscript.trim();
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        showToast('Microphone error: ' + event.error, 'error');
        stopListening();
    };
    
    recognition.onend = () => {
        console.log('Speech recognition ended');
        stopListening();
    };
}

function toggleSpeechRecognition() {
    if (!recognition) {
        showToast('Speech recognition not available', 'error');
        return;
    }
    
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

function startListening() {
    try {
        recognition.start();
        isListening = true;
        micBtn.classList.add('listening');
        micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        chatInput.placeholder = 'Listening...';
    } catch (error) {
        console.error('Error starting recognition:', error);
    }
}

function stopListening() {
    try {
        recognition.abort();
    } catch (error) {
        console.error('Error stopping recognition:', error);
    }
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    chatInput.placeholder = 'Ask something about your documents...';
}

// Text-to-Speech
function speakText(text) {
    if ('speechSynthesis' in window) {
        // Remove HTML tags for speech
        const plainText = text.replace(/<[^>]*>/g, ' ');
        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        speechSynthesis.speak(utterance);
    }
}

// Theme Management
function loadThemePreference() {
    const savedTheme = localStorage.getItem('theme') || 'system';
    applyTheme(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 
                         document.body.classList.contains('light-theme') ? 'light' : 'system';
    
    let newTheme;
    if (currentTheme === 'system') {
        newTheme = 'light';
    } else if (currentTheme === 'light') {
        newTheme = 'dark';
    } else {
        newTheme = 'system';
    }
    
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update icon
    const icon = themeToggle.querySelector('i');
    if (newTheme === 'dark') {
        icon.className = 'fas fa-sun';
    } else if (newTheme === 'light') {
        icon.className = 'fas fa-moon';
    } else {
        icon.className = 'fas fa-adjust';
    }
}

function applyTheme(theme) {
    document.body.classList.remove('dark-theme', 'light-theme');
    
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        // System preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-theme');
        }
    }
}

// Utility Functions
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 'fa-info-circle';
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icon}"></i>
        </div>
        <div class="toast-content">
            ${message}
        </div>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3000);
}