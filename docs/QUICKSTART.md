# RAG-Chatbot - Quick Start Guide

Get RAG-Chatbot running in 5 minutes!

---

## Prerequisites

- Python 3.10 or higher
- pip package manager
- A Groq API key (free at https://console.groq.com)

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/Imran786-hub/RAG-Chatbot.git
cd RAG-Chatbot
```

### 2. Create Virtual Environment

```bash
# macOS/Linux
python -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Setup Environment Variables

```bash
# Copy example file
cp .env.example .env

# Edit .env and add your Groq API key
# GROQ_API_KEY=your_key_here
```

### 5. Run Application

```bash
python app.py
```

**Output:**
```
Starting RAG-Chatbot on port 8080 (debug=False)
Config: GROQ_MODEL=llama-3.1-8b-instant, CHUNK_SIZE=900
 * Running on http://0.0.0.0:8080
```

### 6. Open in Browser

Visit: http://localhost:8080

---

## Docker Installation (Optional)

### Build Image

```bash
docker build -t rag-chatbot .
```

### Run Container

```bash
docker run -p 8080:8080 \
  -e GROQ_API_KEY=your_key_here \
  rag-chatbot
```

---

## Quick Usage

### 1. Upload a Document

1. Click the upload area in the sidebar
2. Select PDF, DOCX, or TXT file
3. Wait for processing (usually 1-2 seconds)
4. See "Document indexed successfully" message

### 2. Ask a Question

1. Type your question in the chat input
2. Choose search mode (Semantic/Keyword/Hybrid)
3. Press Enter or click Send
4. Get AI-powered answer with sources

### 3. Try Different Search Modes

- **Semantic**: Understanding-based (best for complex queries)
- **Keyword**: Text-matching (fast, good for exact terms)
- **Hybrid**: Combined approach (recommended)

---

## API Quick Reference

### Upload Document

```bash
curl -X POST http://localhost:8080/api/process \
  -F "file=@document.pdf"
```

### Chat Query

```bash
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this about?", "mode": "hybrid"}'
```

### Check Health

```bash
curl http://localhost:8080/health
```

---

## Troubleshooting

### Port Already in Use

```bash
PORT=8081 python app.py
```

### Missing API Key

```bash
# Set environment variable
export GROQ_API_KEY=your_key_here

# Then run
python app.py
```

### Document Upload Failed

- Ensure file is < 32 MB
- Use .pdf, .docx, or .txt extension
- File should contain readable text

---

## Next Steps

- 📖 Read [API Documentation](docs/API.md)
- 🏗️ Review [Architecture](docs/ARCHITECTURE.md)
- 🐛 Check [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- 🤝 See [Contributing Guide](CONTRIBUTING.md)

---

## Support

- **Issues:** https://github.com/Imran786-hub/RAG-Chatbot/issues
- **Documentation:** Check `docs/` folder
- **Examples:** See API.md for usage examples

---

*Happy chatting! 🚀*
