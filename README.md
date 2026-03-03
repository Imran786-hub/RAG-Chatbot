# AI Knowledge Base & Document Ingestion Pipeline

A powerful Retrieval-Augmented Generation (RAG) system that lets you chat with your documents. Built with Flask, LangChain, Google Gemini, and FAISS.

## 🚀 Features

- **Multi-Format Support**: Ingest PDF, Word (.docx), and Text (.txt) files.
- **RAG Architecture**: Uses Google Gemini embeddings and FAISS vector store for accurate retrieval.
- **Smart Chat Interface**: 
  - Multi-turn conversation memory.
  - Professional dark-themed UI.
  - Real-time streaming responses.
- **Voice Interaction**:
  - **Speech-to-Text (STT)**: Speak your questions.
  - **Text-to-Speech (TTS)**: Listen to AI responses.
  - Hands-free mode with auto-silence detection (2s kill time).

## 🛠️ Tech Stack

- **Backend**: Python, Flask
- **AI/ML**: LangChain, Google Gemini (Embeddings & Chat), FAISS
- **Frontend**: HTML5, CSS3 (Dark Mode), JavaScript (Web Speech API)

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd document-ingestion-pipeline
   ```

2. **Set up a virtual environment**
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables**
   Ensure you have access to Google Gemini API keys if required for the embedding models.

## 🏃‍♂️ Running the Application

1. **Start the Flask server**
   ```bash
   python app.py
   ```

2. **Open the Web UI**
   Navigate to `http://localhost:5000` in your browser.

## 💡 Usage Guide

1. **Upload Documents**: Drag & drop or select PDF/DOCX/TXT files in the "Upload Knowledge" section.
2. **Wait for Processing**: The system chunks, embeds, and indexes your documents.
3. **Start Chatting**: 
   - Type your question in the chat input.
   - Or click the **Mic icon** to speak your query.
   - Click the **Speaker icon** next to the response to hear it read aloud.

## 📂 Project Structure

```
document-ingestion-pipeline/
├── app.py                 # Main Flask application & RAG logic
├── requirements.txt       # Python dependencies
├── data/                  # Directory for raw and processed data
├── templates/
│   └── index.html         # Frontend UI
└── README.md              # Project documentation
```

## 📄 License

MIT License
