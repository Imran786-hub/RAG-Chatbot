# 🧠 AI Knowledge Base & Document Ingestion Pipeline
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Python](https://img.shields.io/badge/Python-3.10-blue)
![Flask](https://img.shields.io/badge/Framework-Flask-green)

A powerful **Retrieval-Augmented Generation (RAG)** system that allows users to interact with their documents like a chatbot. Built using **Flask, LangChain, Google Gemini, and FAISS**, this system delivers accurate, context-aware answers from uploaded documents.

---

## 🌟 Key Features

* 📄 **Multi-Format Support**
  Upload and process PDF, DOCX, and TXT files seamlessly.

* 🤖 **RAG-Based Smart Retrieval**
  Uses **Google Gemini embeddings + FAISS vector database** for precise and relevant answers.

* 💬 **Interactive Chat System**

  * Multi-turn conversation memory
  * Real-time response streaming
  * Clean and modern dark UI

* 🎙️ **Voice Assistant Integration**

  * Speech-to-Text (ask questions via voice)
  * Text-to-Speech (AI speaks answers)
  * Auto silence detection (hands-free experience)

---

## 🧠 How It Works

1. User uploads documents
2. Text is extracted and split into chunks
3. Chunks are converted into embeddings using Gemini
4. Stored in FAISS vector database
5. User query → converted to embedding
6. Relevant chunks retrieved
7. Gemini generates final answer

---

## 🛠️ Tech Stack

* **Backend**: Python, Flask
* **AI/ML**: LangChain, Google Gemini (Embeddings + Chat)
* **Vector DB**: FAISS
* **Frontend**: HTML, CSS (Dark UI), JavaScript
* **Voice Tech**: Web Speech API

---

## ⚡ Why This Project is Unique

* Combines **RAG + Voice Interaction** (rare combo)
* Works like **ChatGPT for your own documents**
* Supports **real-time streaming + memory**
* Useful for:

  * 📚 Students (notes & PDFs)
  * 💼 Professionals (reports, docs)
  * 🏢 Companies (knowledge base systems)

---

## 📦 Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd document-ingestion-pipeline
```

### 2. Create Virtual Environment

```bash
python -m venv venv
```

Activate:

```bash
# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Setup Environment Variables

Add your **Google Gemini API Key**:

```bash
export GOOGLE_API_KEY=your_api_key_here
```

---

## ▶️ Run the Project

```bash
python app.py
```

Open browser:

```
http://localhost:5000
```

---

## 💡 Usage

1. Upload your documents
2. Wait for processing
3. Ask questions (text or voice)
4. Get intelligent answers instantly

---

## 📂 Project Structure

```
document-ingestion-pipeline/
├── app.py
├── requirements.txt
├── data/
├── templates/
│   └── index.html
├── static/
└── README.md
```

---

## 🔐 License

This project is licensed under the **MIT License**.

---

## 🙌 Author

**Imran**

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!
