# API Documentation

Complete reference for all RAG-Chatbot API endpoints.

---

## Base URL

```
http://localhost:8080
```

## Authentication

No authentication required for current version. For production, consider implementing:
- API keys
- JWT tokens
- OAuth 2.0

---

## Endpoints

### 1. Health Check Endpoints

#### GET /health
Basic health status check.

**Request:**
```bash
curl http://localhost:8080/health
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-05-18T06:00:00Z"
}
```

#### GET /ready
Readiness check (API configured, documents loaded).

**Request:**
```bash
curl http://localhost:8080/ready
```

**Response (200 OK):**
```json
{
  "ready": true,
  "has_api_key": true,
  "document_count": 3,
  "total_chunks": 45
}
```

**Response (503 Service Unavailable):**
```json
{
  "ready": false,
  "reason": "GROQ_API_KEY not configured"
}
```

---

### 2. Document Management

#### POST /api/process
Upload and process a document.

**Request:**
```bash
curl -X POST http://localhost:8080/api/process \
  -F "file=@document.pdf"
```

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | file | Yes | PDF, DOCX, or TXT file (max 32MB) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Document uploaded and indexed successfully.",
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "chunk_count": 12
}
```

**Response (400 Bad Request):**
```json
{
  "error": "No file field in request"
}
```

**Response (415 Unsupported Media Type):**
```json
{
  "error": "Unsupported file type. Use PDF, DOCX, or TXT."
}
```

**Response (413 Payload Too Large):**
```json
{
  "error": "File too large. Maximum size is 32 MB."
}
```

**Response (422 Unprocessable Entity):**
```json
{
  "error": "Document is empty or could not be parsed."
}
```

---

#### GET /api/documents
List all uploaded documents.

**Request:**
```bash
curl http://localhost:8080/api/documents
```

**Response (200 OK):**
```json
{
  "550e8400-e29b-41d4-a716-446655440000": {
    "filename": "sample.pdf",
    "size": 125000,
    "processed_at": "2026-05-18T05:30:00Z",
    "chunk_count": 12
  },
  "660e8400-e29b-41d4-a716-446655440001": {
    "filename": "guide.docx",
    "size": 87500,
    "processed_at": "2026-05-18T05:45:00Z",
    "chunk_count": 8
  }
}
```

---

#### GET /api/process-existing/{filename}
Reprocess an existing uploaded document.

**Request:**
```bash
curl http://localhost:8080/api/process-existing/sample.pdf
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "sample.pdf reprocessed successfully.",
  "document_id": "770e8400-e29b-41d4-a716-446655440002",
  "chunk_count": 12
}
```

**Response (404 Not Found):**
```json
{
  "error": "File \"sample.pdf\" not found in uploads."
}
```

---

### 3. Chat & Queries

#### POST /api/chat
Send a question and get an AI-powered answer.

**Request:**
```bash
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the main topic?",
    "mode": "hybrid"
  }'
```

**Request Body:**
| Field | Type | Required | Values | Default |
|-------|------|----------|--------|---------|
| question | string | Yes | Any text | - |
| mode | string | No | "semantic", "keyword", "hybrid" | "hybrid" |

**Response (200 OK):**
```json
{
  "answer": "The main topic of the document is machine learning and its applications in modern technology.",
  "sources": ["sample.pdf", "guide.docx"]
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Question is required"
}
```

**Response (400 Bad Request - Invalid Mode):**
```json
{
  "error": "mode must be semantic, keyword, or hybrid"
}
```

**Response (200 OK - No Documents):**
```json
{
  "answer": "No documents have been indexed yet. Please upload a document first.",
  "sources": []
}
```

**Search Modes:**
- **semantic**: Vector similarity based (best for conceptual queries)
- **keyword**: Text matching based (fast, for exact terms)
- **hybrid**: Combined approach (recommended, balanced)

---

### 4. Document Summarization

#### POST /api/summarize
Generate a summary of a document.

**Request:**
```bash
curl -X POST http://localhost:8080/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "sample.pdf"
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| filename | string | Yes | Name of uploaded document |

**Response (200 OK):**
```json
{
  "success": true,
  "summary": "This document covers the fundamentals of machine learning. It discusses supervised learning techniques including regression and classification. The document also explores neural networks and their applications in computer vision. Key concepts include feature engineering, model evaluation, and hyperparameter tuning. The paper concludes with practical examples using Python libraries like scikit-learn and TensorFlow."
}
```

**Response (400 Bad Request):**
```json
{
  "error": "filename is required"
}
```

**Response (404 Not Found):**
```json
{
  "error": "File \"sample.pdf\" not found."
}
```

**Response (422 Unprocessable Entity):**
```json
{
  "error": "Document is empty or unreadable."
}
```

---

### 5. Chat Management

#### POST /api/clear_chat
Clear chat history.

**Request:**
```bash
curl -X POST http://localhost:8080/api/clear_chat
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Chat history cleared."
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "Descriptive error message"
}
```

### Common HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful request |
| 400 | Bad Request | Missing required field |
| 404 | Not Found | File not found |
| 405 | Method Not Allowed | Using GET instead of POST |
| 413 | Payload Too Large | File exceeds 32MB |
| 422 | Unprocessable Entity | Invalid file format |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | API not ready |

---

## Rate Limiting

Current implementation has no rate limiting. For production, implement:

```
- 100 requests per minute per IP
- 10 file uploads per hour per IP
- 500 character limit on questions
```

---

## Example Workflows

### Complete Chat Workflow

```bash
# 1. Upload document
curl -X POST http://localhost:8080/api/process \
  -F "file=@research.pdf"

# 2. List documents
curl http://localhost:8080/api/documents

# 3. Ask question (semantic mode)
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the key findings?",
    "mode": "semantic"
  }'

# 4. Summarize document
curl -X POST http://localhost:8080/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "research.pdf"
  }'

# 5. Clear chat history
curl -X POST http://localhost:8080/api/clear_chat

# 6. Check server readiness
curl http://localhost:8080/ready
```

### Python Client Example

```python
import requests
import json

BASE_URL = "http://localhost:8080"

# Upload document
with open("document.pdf", "rb") as f:
    files = {"file": f}
    response = requests.post(f"{BASE_URL}/api/process", files=files)
    print(response.json())

# Ask question
question_data = {
    "question": "What is this about?",
    "mode": "hybrid"
}
response = requests.post(
    f"{BASE_URL}/api/chat",
    json=question_data
)
print(response.json())
```

### JavaScript/Fetch Example

```javascript
const BASE_URL = "http://localhost:8080";

// Upload document
async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await fetch(`${BASE_URL}/api/process`, {
    method: "POST",
    body: formData
  });
  
  return response.json();
}

// Ask question
async function askQuestion(question, mode = "hybrid") {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question, mode })
  });
  
  return response.json();
}

// Usage
const answer = await askQuestion("What is the main topic?");
console.log(answer.answer);
console.log(answer.sources);
```

---

## Configuration

### Environment Variables

```bash
# API Keys
GROQ_API_KEY=your_key_here

# Model Configuration
GROQ_MODEL=llama-3.1-8b-instant

# Text Processing
CHUNK_SIZE=900
CHUNK_OVERLAP=180

# Chat Settings
MAX_HISTORY=20

# File Handling
MAX_FILE_SIZE=33554432  # 32MB in bytes

# Server
PORT=8080
DEBUG=false

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR
```

---

## Best Practices

### For Questions

1. **Be specific**: "List the benefits" vs "Tell me about this"
2. **Use context**: "Based on the methodology section, what is..."
3. **Try different modes**:
   - Semantic: For understanding-based queries
   - Keyword: For specific terms
   - Hybrid: For balanced results

### For Documents

1. **Upload quality files**: Ensure text is extractable
2. **File size**: Keep under 32MB for performance
3. **Format**: PDF, DOCX, or TXT work best
4. **Content**: Clear, well-structured documents give better results

### For Integration

1. **Error handling**: Always check response status
2. **Timeouts**: Set appropriate timeouts (LLM calls can take 5s+)
3. **Retries**: Implement exponential backoff for failures
4. **Caching**: Cache frequently asked questions

---

## Troubleshooting

### Issue: 503 Service Unavailable

```
Solution: Ensure GROQ_API_KEY environment variable is set
```

### Issue: 413 Payload Too Large

```
Solution: Ensure file size is under 32MB
```

### Issue: 422 Unprocessable Entity (Upload)

```
Solution: Ensure file format is PDF, DOCX, or TXT
         and contains readable text
```

### Issue: Slow Response Time

```
Solution: - Try keyword mode for faster results
         - Check network connection
         - Groq API calls typically take 2-5 seconds
```

---

*Last Updated: 2026-05-18*
