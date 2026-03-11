import os
import json
import uuid
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from dotenv import load_dotenv
import hashlib
from datetime import datetime
import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer
import faiss
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from groq import Groq
import PyPDF2
import docx

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = 'data/raw_docs'

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('data/vector_store', exist_ok=True)

# Initialize Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Global variables for our simple vector store
vector_store = {}
documents_metadata = {}
document_chunks = {}

# Allowed file extensions
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(file_path):
    """Extract text from PDF file"""
    text = ""
    try:
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text()
    except Exception as e:
        print(f"Error reading PDF: {e}")
    return text

def extract_text_from_docx(file_path):
    """Extract text from DOCX file"""
    try:
        doc = docx.Document(file_path)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text
    except Exception as e:
        print(f"Error reading DOCX: {e}")
        return ""

def extract_text_from_txt(file_path):
    """Extract text from TXT file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    except Exception as e:
        print(f"Error reading TXT: {e}")
        return ""

def process_document(file_path, filename):
    """Process document and create embeddings"""
    # Extract text based on file extension
    if filename.endswith('.pdf'):
        text = extract_text_from_pdf(file_path)
    elif filename.endswith('.docx'):
        text = extract_text_from_docx(file_path)
    elif filename.endswith('.txt'):
        text = extract_text_from_txt(file_path)
    else:
        raise ValueError("Unsupported file type")
    
    if not text.strip():
        raise ValueError("Document is empty or unreadable")
    
    # Split text into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    texts = text_splitter.create_documents([text])
    
    # For simplicity, we'll use a basic hashing approach for embeddings
    # In a real implementation, you'd use a proper embedding model
    vectorizer = HashingVectorizer(n_features=128, norm='l2')
    embeddings = vectorizer.transform([doc.page_content for doc in texts]).toarray()
    
    # Store in our simple vector store
    doc_id = str(uuid.uuid4())
    vector_store[doc_id] = {
        'embeddings': embeddings,
        'texts': [doc.page_content for doc in texts],
        'metadata': {
            'filename': filename,
            'processed_at': datetime.now().isoformat()
        }
    }
    
    # Also store chunks for keyword search
    document_chunks[doc_id] = [doc.page_content for doc in texts]
    
    # Store metadata
    documents_metadata[doc_id] = {
        'filename': filename,
        'size': os.path.getsize(file_path),
        'processed_at': datetime.now().isoformat(),
        'chunk_count': len(texts)
    }
    
    return doc_id

def semantic_search(question, top_k=3):
    """Perform semantic search using FAISS-like approach"""
    if not vector_store:
        return []
    
    # Create query embedding
    vectorizer = HashingVectorizer(n_features=128, norm='l2')
    query_embedding = vectorizer.transform([question]).toarray()[0]
    
    results = []
    for doc_id, data in vector_store.items():
        # Calculate cosine similarities
        similarities = np.dot(data['embeddings'], query_embedding)
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        
        for idx in top_indices:
            results.append({
                'text': data['texts'][idx],
                'similarity': float(similarities[idx]),
                'source': data['metadata']['filename']
            })
    
    # Sort by similarity and return top results
    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]

def keyword_search(question, top_k=3):
    """Perform keyword-based search"""
    if not document_chunks:
        return []
    
    # Simple keyword matching
    question_words = set(question.lower().split())
    results = []
    
    for doc_id, chunks in document_chunks.items():
        for chunk in chunks:
            chunk_words = set(chunk.lower().split())
            # Calculate overlap
            overlap = len(question_words.intersection(chunk_words))
            if overlap > 0:
                results.append({
                    'text': chunk,
                    'similarity': overlap,
                    'source': documents_metadata.get(doc_id, {}).get('filename', 'Unknown')
                })
    
    # Sort by overlap and return top results
    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]

def hybrid_search(question, top_k=3):
    """Combine semantic and keyword search"""
    semantic_results = semantic_search(question, top_k*2)
    keyword_results = keyword_search(question, top_k*2)
    
    # Combine and deduplicate
    combined = {}
    for result in semantic_results + keyword_results:
        key = result['text']
        if key not in combined:
            combined[key] = result
            combined[key]['scores'] = []
        combined[key]['scores'].append(result['similarity'])
    
    # Average scores
    for result in combined.values():
        result['similarity'] = sum(result['scores']) / len(result['scores'])
    
    # Sort and return top results
    results = sorted(combined.values(), key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]

def generate_answer(question, context_chunks, mode="semantic"):
    """Generate answer using Groq"""
    if not context_chunks:
        return "The knowledge base does not contain enough information to answer this question.", []
    
    context = "\n\n".join([chunk['text'] for chunk in context_chunks])
    sources = list(set([chunk['source'] for chunk in context_chunks]))
    
    prompt = f"""
    Use the following context to answer the question at the end. 
    If you don't know the answer, just say that the knowledge base does not contain enough information. 
    Don't try to make up an answer.

    Context:
    {context}

    Question: {question}

    Answer:
    """
    
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="openai/gpt-oss-120b",
        )
        answer = chat_completion.choices[0].message.content
        return answer, sources
    except Exception as e:
        print(f"Error generating answer: {e}")
        return "Sorry, I encountered an error while generating the answer.", []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/process', methods=['POST'])
def process_document_api():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    try:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        doc_id = process_document(file_path, filename)
        
        return jsonify({
            'success': True,
            'message': 'Document processed successfully',
            'document_id': doc_id
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    question = data.get('question', '')
    mode = data.get('mode', 'semantic')
    
    if not question:
        return jsonify({'error': 'Question is required'}), 400
    
    try:
        # Perform search based on mode
        if mode == 'semantic':
            context_chunks = semantic_search(question)
        elif mode == 'keyword':
            context_chunks = keyword_search(question)
        elif mode == 'hybrid':
            context_chunks = hybrid_search(question)
        else:
            return jsonify({'error': 'Invalid mode'}), 400
        
        # Generate answer
        answer, sources = generate_answer(question, context_chunks, mode)
        
        return jsonify({
            'answer': answer,
            'sources': sources
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents', methods=['GET'])
def get_documents():
    return jsonify(documents_metadata)

@app.route('/api/process-existing/<filename>', methods=['GET'])
def reprocess_document(filename):
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        doc_id = process_document(file_path, filename)
        
        return jsonify({
            'success': True,
            'message': 'Document reprocessed successfully',
            'document_id': doc_id
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clear_chat', methods=['POST'])
def clear_chat():
    # In a real app, you might clear session-specific chat history
    # For this simple version, we'll just return success
    return jsonify({'success': True})

@app.route('/api/summarize', methods=['POST'])
def summarize_document():
    data = request.get_json()
    filename = data.get('filename', '')
    
    if not filename:
        return jsonify({'error': 'Filename is required'}), 400
    
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        # Extract text
        if filename.endswith('.pdf'):
            text = extract_text_from_pdf(file_path)
        elif filename.endswith('.docx'):
            text = extract_text_from_docx(file_path)
        elif filename.endswith('.txt'):
            text = extract_text_from_txt(file_path)
        else:
            return jsonify({'error': 'Unsupported file type'}), 400
        
        if not text.strip():
            return jsonify({'error': 'Document is empty'}), 400
        
        # Generate summary using Groq
        prompt = f"Summarize the following document in 3-5 sentences:\n\n{text[:4000]}..."
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="openai/gpt-oss-120b",
        )
        summary = chat_completion.choices[0].message.content
        
        return jsonify({
            'success': True,
            'summary': summary
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(400)
def bad_request(error):
    return jsonify({'error': 'Bad request'}), 400

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(RequestEntityTooLarge)
def file_too_large(error):
    return jsonify({'error': 'File too large'}), 413

if __name__ == '__main__':
    app.run(debug=True)