# Project Borg: Data-Sharing RAG Platform

Project Borg is an enterprise-grade web application designed to eliminate time wasted on manual data retrieval. By providing a shared, unified vector database per "Organization," Borg streamlines information sharing through Retrieval-Augmented Generation (RAG). 

Whether you are an individual rapidly parsing `.pdf` and `.docx` files or a corporate team seeking a single source of truth, Borg empowers you to instantly query your collective knowledge base using advanced LLM reasoning.

**This project is submitted for the Yconic Hackathon (March 28-29, 2026).**

## Value Proposition
- **For Corporate Users:** Eradicates the "Coordination Tax" by converting fragmented silos (emails, wikis, Slack threads) into a single, highly accurate AI query endpoint.
- **For Individual Users:** Accelerates research and synthesis by allowing immediate uploads of personal documents (`.pdf`, `.docx`, raw text) into the "My Data" section for instant RAG interactions.

## Key Features & Roles
- **Role-Based Access Control (RBAC):**
  - **Administrators:** Can create organizations. They possess unrestricted access to instantly upload, manage, and query data.
  - **Standard Users:** Can join existing organizations and perform unlimited free queries against the shared database. To maintain data integrity, users must request Administrator approval to push new document uploads into the communal vector index.
- **Multi-Format Data Ingestion:** Dedicated processing pipelines for parsing `.pdf`, `.docx`, and raw user text efficiently into the vector store via the specific "My Data" section.
- **Unified Gemini 2.5 Flash Queries:** All context is routed through a single, powerful Gemini 2.5 Flash model, guaranteeing consistent, low-latency synthesis across the organization.

## Tech Stack
- **Frontend:** React 18, React Router, Vite, custom CSS.
- **Backend & Auth:** Firebase Auth and Realtime/Firestore databases.
- **Vector Database:** Pinecone (`@pinecone-database/pinecone`).
- **LLM Engine:** Google Gemini 2.5 Flash via `@google/generative-ai`.
- **Parsing Utilities:** Document digestion for multi-format text ingestion.

## Getting Started

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Ensure `.env` contains secure keys for Firebase, Pinecone, and Google Generative AI.
   
3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:5173/` in your browser.

## Alignment to Master Plan
As stated in our master plan, we prioritized building a functional foundation for a curated organizational brain. We have implemented the strict Admin/User permission handshake required to maintain database integrity, along with multi-format processing capabilities for a robust knowledge base.

## Deployment
(We are actively preparing our deployment URL which will be linked here and in the Team Portal prior to judging.)
