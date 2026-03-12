import os
import json
import uuid
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from dotenv import load_dotenv
from datetime import datetime
import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from groq import Groq
import PyPDF2
import docx

# ─────────────────────────────────────────────
#  Bootstrap
# ─────────────────────────────────────────────
load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024   # 32 MB
app.config['UPLOAD_FOLDER']      = os.path.join('data', 'raw_docs')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(os.path.join('data', 'vector_store'), exist_ok=True)

# ─────────────────────────────────────────────
#  Groq client
# ─────────────────────────────────────────────
_groq_key = os.getenv("GROQ_API_KEY", "")
client     = Groq(api_key=_groq_key) if _groq_key else None

# ─────────────────────────────────────────────
#  In-memory stores
# ─────────────────────────────────────────────
# vector_store  : { doc_id -> { embeddings, texts, metadata } }
# doc_meta      : { doc_id -> { filename, size, processed_at, chunk_count } }
# doc_chunks    : { doc_id -> [chunk_text, …] }
# chat_history  : [ { role, content }, … ]   (kept for context, max 20 turns)

vector_store  = {}
doc_meta      = {}
doc_chunks    = {}
chat_history  = []

ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}
MAX_HISTORY        = 20          # messages kept in rolling window
GROQ_MODEL         = "llama-3.1-8b-instant"   # free-tier Groq model


# ══════════════════════════════════════════════════════════════
#  HELPERS — text extraction
# ══════════════════════════════════════════════════════════════

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text(file_path: str, filename: str) -> str:
    ext = filename.rsplit('.', 1)[1].lower()
    if ext == 'pdf':
        return _read_pdf(file_path)
    if ext == 'docx':
        return _read_docx(file_path)
    return _read_txt(file_path)


def _read_pdf(path: str) -> str:
    text = ""
    try:
        with open(path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                chunk = page.extract_text()
                if chunk:
                    text += chunk + "\n"
    except Exception as exc:
        app.logger.error("PDF read error: %s", exc)
    return text.strip()


def _read_docx(path: str) -> str:
    try:
        doc  = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as exc:
        app.logger.error("DOCX read error: %s", exc)
        return ""


def _read_txt(path: str) -> str:
    for enc in ('utf-8', 'latin-1', 'cp1252'):
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read().strip()
        except UnicodeDecodeError:
            continue
    return ""


# ══════════════════════════════════════════════════════════════
#  HELPERS — document processing
# ══════════════════════════════════════════════════════════════

def process_document(file_path: str, filename: str) -> str:
    """Chunk document, build HashingVectorizer embeddings, store in memory."""
    text = extract_text(file_path, filename)
    if not text:
        raise ValueError("Document is empty or could not be parsed.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=900,
        chunk_overlap=180,
        length_function=len,
    )
    chunks = [d.page_content for d in splitter.create_documents([text])]

    vectorizer  = HashingVectorizer(n_features=256, norm='l2', alternate_sign=False)
    embeddings  = vectorizer.transform(chunks).toarray().astype(np.float32)

    # Remove any previous entry for same filename
    _remove_by_filename(filename)

    doc_id = str(uuid.uuid4())
    vector_store[doc_id] = {
        'embeddings' : embeddings,
        'texts'      : chunks,
        'vectorizer' : vectorizer,
        'metadata'   : {'filename': filename, 'processed_at': datetime.utcnow().isoformat()}
    }
    doc_chunks[doc_id] = chunks
    doc_meta[doc_id]   = {
        'filename'    : filename,
        'size'        : os.path.getsize(file_path),
        'processed_at': datetime.utcnow().isoformat(),
        'chunk_count' : len(chunks)
    }
    return doc_id


def _remove_by_filename(filename: str):
    """Delete all in-memory data for a given filename (before reprocessing)."""
    to_del = [did for did, m in doc_meta.items() if m['filename'] == filename]
    for did in to_del:
        vector_store.pop(did, None)
        doc_chunks.pop(did, None)
        doc_meta.pop(did, None)


# ══════════════════════════════════════════════════════════════
#  SEARCH  (semantic / keyword / hybrid)
# ══════════════════════════════════════════════════════════════

def _query_embedding(query: str, vectorizer) -> np.ndarray:
    return vectorizer.transform([query]).toarray()[0].astype(np.float32)


def semantic_search(question: str, top_k: int = 4):
    results = []
    for did, data in vector_store.items():
        q_emb  = _query_embedding(question, data['vectorizer'])
        scores = data['embeddings'] @ q_emb            # dot product (both l2-normed)
        for idx in np.argsort(scores)[::-1][:top_k]:
            results.append({
                'text'      : data['texts'][idx],
                'score'     : float(scores[idx]),
                'source'    : data['metadata']['filename'],
                'chunk_idx' : int(idx)
            })
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:top_k]


def keyword_search(question: str, top_k: int = 4):
    q_words = set(question.lower().split())
    results = []
    for did, chunks in doc_chunks.items():
        fname = doc_meta.get(did, {}).get('filename', 'unknown')
        for idx, chunk in enumerate(chunks):
            c_words = set(chunk.lower().split())
            overlap = len(q_words & c_words)
            if overlap:
                results.append({
                    'text'      : chunk,
                    'score'     : overlap / max(len(q_words), 1),
                    'source'    : fname,
                    'chunk_idx' : idx
                })
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:top_k]


def hybrid_search(question: str, top_k: int = 4):
    sem = semantic_search(question, top_k * 2)
    kw  = keyword_search (question, top_k * 2)

    seen   = {}
    for item in sem:
        key = item['text']
        seen[key] = {'text': item['text'], 'source': item['source'],
                     'sem': item['score'], 'kw': 0.0}
    for item in kw:
        key = item['text']
        if key in seen:
            seen[key]['kw'] = item['score']
        else:
            seen[key] = {'text': item['text'], 'source': item['source'],
                         'sem': 0.0, 'kw': item['score']}

    # Normalise each dimension then combine 60 / 40
    sems = [v['sem'] for v in seen.values()]
    kws  = [v['kw']  for v in seen.values()]
    max_s = max(sems) if sems else 1
    max_k = max(kws)  if kws  else 1

    ranked = []
    for v in seen.values():
        v['score'] = 0.60 * (v['sem'] / max_s) + 0.40 * (v['kw'] / max_k)
        ranked.append(v)

    ranked.sort(key=lambda x: x['score'], reverse=True)
    return ranked[:top_k]


# ══════════════════════════════════════════════════════════════
#  ANSWER GENERATION  (Groq)
# ══════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are KnowledgeAI, an expert RAG assistant.
Answer ONLY from the provided context. Be concise, accurate, and helpful.
If the answer is not in the context say:
"The knowledge base does not contain enough information to answer this question."
Format your response with clear paragraphs. Use markdown for lists or headings when helpful."""


def build_context(chunks: list) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        parts.append(f"[Chunk {i} — {c['source']}]\n{c['text']}")
    return "\n\n---\n\n".join(parts)


def groq_answer(question: str, context_chunks: list, mode: str) -> tuple[str, list]:
    """Generate answer using Groq; returns (answer_text, sources_list)."""
    if not context_chunks:
        return ("The knowledge base does not contain enough information "
                "to answer this question."), []

    if not client:
        return "GROQ_API_KEY is not configured on the server.", []

    context = build_context(context_chunks)
    sources = sorted(set(c['source'] for c in context_chunks))

    user_msg = (
        f"Context:\n{context}\n\n"
        f"Search mode used: {mode}\n\n"
        f"Question: {question}\n\nAnswer:"
    )

    # Rolling chat history (last N turns) + current question
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += chat_history[-MAX_HISTORY:]
    messages.append({"role": "user", "content": user_msg})

    try:
        resp   = client.chat.completions.create(
            model    = GROQ_MODEL,
            messages = messages,
            max_tokens = 1024,
            temperature = 0.3,
        )
        answer = resp.choices[0].message.content.strip()

        # Persist to rolling history
        chat_history.append({"role": "user",      "content": question})
        chat_history.append({"role": "assistant",  "content": answer})
        if len(chat_history) > MAX_HISTORY * 2:
            del chat_history[:2]

        return answer, sources

    except Exception as exc:
        app.logger.error("Groq error: %s", exc)
        return f"Error generating answer: {exc}", []


def groq_summarize(text: str, filename: str) -> str:
    """Summarise a document directly (no chat-history context)."""
    if not client:
        return "GROQ_API_KEY is not configured on the server."

    prompt = (
        f"You are a document summariser. Produce a clear, well-structured summary "
        f"of the following document titled \"{filename}\".\n\n"
        f"Requirements:\n"
        f"- 5-8 sentences covering main topics\n"
        f"- Use bullet points for key facts\n"
        f"- Keep it professional\n\n"
        f"Document (first 6000 chars):\n{text[:6000]}"
    )
    try:
        resp = client.chat.completions.create(
            model    = GROQ_MODEL,
            messages = [
                {"role": "system", "content": "You are an expert document summariser."},
                {"role": "user",   "content": prompt}
            ],
            max_tokens  = 700,
            temperature = 0.4,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        app.logger.error("Groq summarise error: %s", exc)
        raise


# ══════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')


# ─── POST /api/process ───────────────────────────────────────
@app.route('/api/process', methods=['POST'])
def api_process():
    if 'file' not in request.files:
        return jsonify({'error': 'No file field in request'}), 400

    f = request.files['file']
    if not f or f.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not allowed_file(f.filename):
        return jsonify({'error': 'Unsupported file type. Use PDF, DOCX, or TXT.'}), 415

    filename  = secure_filename(f.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    f.save(file_path)

    try:
        doc_id = process_document(file_path, filename)
        return jsonify({
            'success'    : True,
            'message'    : 'Document uploaded and indexed successfully.',
            'document_id': doc_id,
            'chunk_count': doc_meta[doc_id]['chunk_count']
        })
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 422
    except Exception as exc:
        app.logger.error("Process error: %s", exc)
        return jsonify({'error': 'Failed to process document.'}), 500


# ─── POST /api/chat ──────────────────────────────────────────
@app.route('/api/chat', methods=['POST'])
def api_chat():
    body     = request.get_json(silent=True) or {}
    question = (body.get('question') or '').strip()
    mode     = body.get('mode', 'hybrid').lower()

    if not question:
        return jsonify({'error': 'Question is required'}), 400
    if mode not in ('semantic', 'keyword', 'hybrid'):
        return jsonify({'error': 'mode must be semantic, keyword, or hybrid'}), 400
    if not vector_store:
        return jsonify({
            'answer' : 'No documents have been indexed yet. Please upload a document first.',
            'sources': []
        })

    try:
        if mode == 'semantic':
            chunks = semantic_search(question)
        elif mode == 'keyword':
            chunks = keyword_search(question)
        else:
            chunks = hybrid_search(question)

        answer, sources = groq_answer(question, chunks, mode)
        return jsonify({'answer': answer, 'sources': sources})

    except Exception as exc:
        app.logger.error("Chat error: %s", exc)
        return jsonify({'error': 'Failed to generate answer.'}), 500


# ─── GET /api/documents ──────────────────────────────────────
@app.route('/api/documents', methods=['GET'])
def api_documents():
    return jsonify(doc_meta)


# ─── GET /api/process-existing/<filename> ───────────────────
@app.route('/api/process-existing/<path:filename>', methods=['GET'])
def api_reprocess(filename):
    safe      = secure_filename(filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], safe)

    if not os.path.exists(file_path):
        return jsonify({'error': f'File "{safe}" not found in uploads.'}), 404

    try:
        doc_id = process_document(file_path, safe)
        return jsonify({
            'success'    : True,
            'message'    : f'"{safe}" reprocessed successfully.',
            'document_id': doc_id,
            'chunk_count': doc_meta[doc_id]['chunk_count']
        })
    except Exception as exc:
        app.logger.error("Reprocess error: %s", exc)
        return jsonify({'error': str(exc)}), 500


# ─── POST /api/clear_chat ────────────────────────────────────
@app.route('/api/clear_chat', methods=['POST'])
def api_clear_chat():
    chat_history.clear()
    return jsonify({'success': True, 'message': 'Chat history cleared.'})


# ─── POST /api/summarize ─────────────────────────────────────
@app.route('/api/summarize', methods=['POST'])
def api_summarize():
    body     = request.get_json(silent=True) or {}
    filename = (body.get('filename') or '').strip()

    if not filename:
        return jsonify({'error': 'filename is required'}), 400

    safe      = secure_filename(filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], safe)

    if not os.path.exists(file_path):
        return jsonify({'error': f'File "{safe}" not found.'}), 404

    try:
        text = extract_text(file_path, safe)
        if not text:
            return jsonify({'error': 'Document is empty or unreadable.'}), 422

        summary = groq_summarize(text, safe)
        return jsonify({'success': True, 'summary': summary})

    except Exception as exc:
        app.logger.error("Summarize error: %s", exc)
        return jsonify({'error': f'Summarization failed: {exc}'}), 500


# ══════════════════════════════════════════════════════════════
#  ERROR HANDLERS
# ══════════════════════════════════════════════════════════════

@app.errorhandler(404)
def err_404(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'API endpoint not found'}), 404
    return render_template('index.html'), 404


@app.errorhandler(405)
def err_405(e):
    return jsonify({'error': 'Method not allowed'}), 405


@app.errorhandler(413)
@app.errorhandler(RequestEntityTooLarge)
def err_413(e):
    return jsonify({'error': 'File too large. Maximum size is 32 MB.'}), 413


@app.errorhandler(500)
def err_500(e):
    return jsonify({'error': 'Internal server error'}), 500


# ══════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════

import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
