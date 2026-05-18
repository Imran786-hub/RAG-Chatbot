# Architecture & Design

This document describes the architecture and design decisions of RAG-Chatbot.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (Browser)                 │
│  ┌──────────────────────────────────────────────┐  │
│  │         HTML/CSS/JavaScript UI               │  │
│  │  - Sidebar: Upload, Mode Selection           │  │
│  │  - Chat Area: Messages, Typing Indicator     │  │
│  │  - Voice Input/Output Support                │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────┘
                     │ HTTP/JSON
                     ▼
┌─────────────────────────────────────────────────────┐
│              REST API (Flask)                       │
│  ┌──────────────────────────────────────────────┐  │
│  │  ✓ /health, /ready (Health Checks)          │  │
│  │  ✓ /api/process (Upload & Index)            │  │
│  │  ✓ /api/chat (Query & Response)             │  │
│  │  ✓ /api/documents (List Docs)               │  │
│  │  ✓ /api/summarize (Doc Summary)             │  │
│  │  ✓ /api/clear_chat (History Clear)          │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    ┌────────┐  ┌─────────┐  ┌──────────┐
    │Document│  │In-Memory│  │   LLM    │
    │Process │  │ Storage │  │ (Groq)   │
    │Pipeline│  │         │  │          │
    └────────┘  └─────────┘  └──────────┘
        │            │
        ▼            ▼
   ┌─────────────────────────┐
   │   Core Processing       │
   │ • Text Extraction       │
   │ • Chunking              │
   │ • Embedding             │
   │ • Search (3 modes)      │
   └─────────────────────────┘
```

---

## Data Flow

### 1. Document Upload Flow

```
User Uploads File
      ↓
File Validation (Type, Size)
      ↓
Text Extraction (PDF/DOCX/TXT)
      ↓
Text Chunking (900 chars, 180 overlap)
      ↓
Vector Embedding (HashingVectorizer)
      ↓
In-Memory Store
├─ vector_store: {doc_id → embeddings, texts}
├─ doc_meta: {doc_id → metadata}
└─ doc_chunks: {doc_id → [chunk1, chunk2...]}
      ↓
Response to User
```

### 2. Chat Query Flow

```
User Sends Question
      ↓
Validate Input
      ↓
Select Search Mode (Semantic/Keyword/Hybrid)
      ↓
Search in Vector Store
├─ Semantic: Vector similarity
├─ Keyword: Text overlap
└─ Hybrid: Combined scoring
      ↓
Retrieve Top-K Chunks
      ↓
Build Context from Chunks
      ↓
Send to Groq LLM
(System Prompt + Context + Question)
      ↓
Generate Answer
      ↓
Add to Chat History (Max 20 turns)
      ↓
Response to User
```

---

## Component Details

### 1. Document Processing Pipeline

**File:** `app.py` - Functions: `extract_text()`, `process_document()`

**Features:**
- Supports PDF, DOCX, TXT formats
- Automatic encoding detection for TXT
- Handles corrupted files gracefully
- Creates chunks of 900 characters with 180 character overlap

**Error Handling:**
- Empty document validation
- Chunk count validation
- Encoding fallback (utf-8 → latin-1 → cp1252)

### 2. Vector Storage & Embedding

**File:** `app.py` - Classes: `vector_store`, `doc_meta`

**Features:**
- Uses HashingVectorizer from scikit-learn
- 256-dimensional vectors
- L2 normalization for consistency
- In-memory storage (no persistence)

**Limitations:**
- Data lost on server restart
- Memory grows with document count
- No distributed storage support

### 3. Search Engines

**File:** `app.py` - Functions: `semantic_search()`, `keyword_search()`, `hybrid_search()`

#### Semantic Search
- Uses dot product of normalized vectors
- Measures cosine similarity
- Slow but semantically accurate
- Good for conceptual queries

#### Keyword Search
- Simple word-overlap counting
- Fast and deterministic
- Misses synonyms and context
- Good for specific terms

#### Hybrid Search (Recommended)
- Combines both methods
- 60% semantic + 40% keyword weighting
- Normalizes scores before combining
- Best overall performance

### 4. LLM Integration

**File:** `app.py` - Functions: `groq_answer()`, `groq_summarize()`

**Model:** Groq LLaMA 3.1 8B Instant

**Features:**
- System prompt enforces RAG constraints
- Rolling chat history (max 20 turns)
- Temperature: 0.3 (factual responses)
- Max tokens: 1024

**Configuration:**
```python
model = "llama-3.1-8b-instant"
max_tokens = 1024
temperature = 0.3
```

### 5. API Layer

**File:** `app.py` - Routes: `@app.route(...)`

**Features:**
- RESTful endpoint design
- Comprehensive error handling
- Input validation on all endpoints
- Health check endpoints for monitoring

**Endpoints:**
- Health/Ready checks
- Document processing
- Chat queries
- Document listing
- Summarization
- Chat history management

---

## Configuration Management

**File:** `app.py` - Class: `Config`

```python
class Config:
    GROQ_MODEL = "llama-3.1-8b-instant"
    CHUNK_SIZE = 900
    CHUNK_OVERLAP = 180
    MAX_HISTORY = 20
    MAX_FILE_SIZE = 32 * 1024 * 1024
    DEBUG = False
    LOG_LEVEL = "INFO"
```

All values can be overridden via environment variables.

---

## Error Handling Strategy

### Levels

1. **Input Validation**
   - File type validation
   - File size validation
   - Required field validation

2. **Processing Errors**
   - Text extraction failures
   - Chunk generation failures
   - Embedding failures

3. **API Errors**
   - 400 Bad Request
   - 404 Not Found
   - 413 Payload Too Large
   - 500 Internal Server Error

4. **Logging**
   - All errors logged with context
   - Warnings for recovery attempts
   - Info for successful operations

---

## Security Considerations

### Currently Implemented

✓ Secure filename handling  
✓ File size limits  
✓ File type validation  
✓ Error message sanitization  
✓ Input validation  

### Recommended for Production

- [ ] API key authentication
- [ ] Rate limiting
- [ ] HTTPS/TLS encryption
- [ ] CORS configuration
- [ ] Input sanitization for LLM prompts
- [ ] SQL injection prevention (if DB added)
- [ ] XSS protection in frontend
- [ ] CSRF tokens
- [ ] Security headers

---

## Performance Considerations

### Current Performance

| Operation | Time | Bottleneck |
|-----------|------|-----------|
| Text extraction (PDF 1MB) | ~100ms | PyPDF2 |
| Chunking | ~50ms | RecursiveCharacterTextSplitter |
| Embedding generation | ~200ms | HashingVectorizer |
| Semantic search | ~150ms | Vector multiplication |
| Keyword search | ~50ms | Text iteration |
| Groq API call | ~2-5s | Network + LLM |

### Optimization Opportunities

1. **Caching**
   - Cache embeddings for repeated queries
   - Cache search results

2. **Vectorization**
   - Use batch processing for embeddings
   - Parallel document processing

3. **Indexing**
   - Use FAISS for efficient similarity search
   - Implement database indexing

4. **Storage**
   - Move to persistent storage (Redis, PostgreSQL)
   - Implement document compression

---

## Scalability Limitations

### Current Limitations

- **In-memory storage** → Restarts lose data
- **Single-threaded** → No concurrent processing
- **No distributed** → Limited to single server
- **No persistence** → Can't handle many documents
- **No load balancing** → Can't scale horizontally

### Scaling Strategy for Production

1. **Phase 1: Add Persistence**
   - Move to SQLite or PostgreSQL
   - Add Redis caching layer

2. **Phase 2: Async Processing**
   - Use Celery for background tasks
   - Implement job queues

3. **Phase 3: Distributed Architecture**
   - Separate API and processing workers
   - Use message queue (RabbitMQ/Kafka)
   - Implement load balancer

4. **Phase 4: Advanced Optimization**
   - Use FAISS for efficient indexing
   - Implement sharding for large datasets
   - Add caching layers (Redis)

---

## Testing Architecture

### Test Structure

```
tests/
├── test_api.py              # API endpoint tests
├── test_document_processing.py  # Document handling
├── test_search.py           # Search functionality
└── conftest.py              # Shared fixtures
```

### Coverage Goals

- ✓ >= 80% code coverage
- ✓ Unit tests for core logic
- ✓ Integration tests for API
- ✓ Error handling tests

### CI/CD Pipeline

```
Push to GitHub
    ↓
Run Tests (Python 3.10, 3.11)
    ↓
Lint Code (flake8, pylint)
    ↓
Type Check (mypy)
    ↓
Coverage Report
    ↓
Build Docker Image
    ↓
Security Scan (bandit, safety)
    ↓
Deploy (if all pass)
```

---

## Deployment Architecture

### Local Development

```
python app.py
├─ Runs on 0.0.0.0:8080
├─ Debug mode optional
└─ In-memory storage
```

### Docker Deployment

```
docker build -t rag-chatbot .
docker run -p 8080:8080 -e GROQ_API_KEY=<key> rag-chatbot
```

### Production Deployment (Render.yaml)

```yaml
services:
  - type: web
    env: python
    startCommand: gunicorn app:app
```

---

## Future Architecture Improvements

1. **Persistent Storage**
   - PostgreSQL for document metadata
   - Redis for caching
   - S3 for large files

2. **Advanced Search**
   - FAISS indexing
   - Cross-encoder reranking
   - Semantic filtering

3. **Distributed Processing**
   - Celery task queue
   - Multiple worker nodes
   - Load balancing

4. **Enhanced Features**
   - Multi-user support with authentication
   - Document versioning
   - Advanced analytics
   - Custom prompt engineering

5. **ML Improvements**
   - Fine-tuned embeddings
   - Custom LLM models
   - Feedback-based ranking

---

*Last Updated: 2026-05-18*
