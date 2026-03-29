# Master Plan: Project Borg

## 1. Vision Clarity
**North Star:** Project Borg is a centralized data-sharing web application that eliminates time wasted on manual organizational data retrieval. Our compelling direction is to transform fragmented silos into a single, shared source of truth using a unified vector database per "Organization". By leveraging Retrieval-Augmented Generation (RAG), both individual contributors and entire corporate divisions can instantaneously query collective intelligence. 

## 2. Technical Depth
Borg operates on a robust, role-gated RAG architecture:
- **Frontend & Auth:** React/Vite paired with Firebase for strict Identity and Access Management (IAM).
- **Organization-Bound Vector Stores:** A highly partitioned Pinecone architecture where each "Organization" owns an isolated embedded database.
- **Multi-Format Ingestion:** Parsers built to handle `.pdf`, `.docx`, and raw text uploads via the "My Data" ingestion pipeline.
- **Core Intelligence:** Standardized routing of user queries through Google Gemini 2.5 Flash ensures consistent, high-speed responses securely grounded in the shared index.

## 3. Innovation
Unlike unstructured team chat tools or "wild west" AI interfaces where any user can pollute the context window, Borg champions a **Curated RAG** approach. 
- **Novel Approach:** By introducing an explicit permission handshake between Users and Administrators for data ingestion, the vector database acts as a verified ledger of truth rather than a chaotic dump of outdated files. 

## 4. Feasibility
The execution strategy for the 24-hour development cycle:
- **Hours 0-6:** Scaffold React/Vite frontend, initialize Firebase Auth, and set up Organization vs. User data structures.
- **Hours 6-12:** Build the Multi-Format Data Ingestion pipeline (`.pdf`, `.docx`, text) and integrate Pinecone uploading via "My Data".
- **Hours 12-18:** Implement the Upload Permission Handshake logic (Users request -> Admins approve) and integrate Gemini 2.5 Flash for RAG querying.
- **Hours 18-24:** Final UI optimization, testing authorization edge cases, and deployment.

## 5. Scalability Design
- **Architecture Beyond Demo:** Utilizing `orgId` metadata filtering allows a single Pinecone index to securely serve thousands of distinct corporate organizations (horizontally scalable SaaS model).
- **Compute Efficiency:** Anchoring all operations to the Gemini 2.5 Flash model drives high performance at minimal API cost overhead compared to heavier legacy models.

## 6. Ecosystem Thinking
- **Interoperability:** The file ingestion pipeline is modular, allowing easy future extensions for `.csv`, markdown, or direct Google Drive/Notion sync integrations.
- **Data Governance:** The rigid Admin/User upload handshake creates easily auditable logs for compliance and enterprise extension requirements.

## 7. Problem Definition
The "Coordination Tax" is crippling modern productivity.
- **Specific Problem:** Individual and corporate users lose significant daily cycles searching across multiple SaaS platforms, trying to retrieve verifying specific documents, procedures, or domain data manually.
- **Who Experiences It:** Corporate teams lacking a centralized knowledge base, and individuals who struggle to synthesize large batches of local file formats quickly.

## 8. User Impact
- **Quantitative Benefit:** Reduces data retrieval times from hours to seconds by converting exhaustive manual deep-dives into direct conversational queries.
- **Qualitative Benefit (Value Proposition):** 
  - *Individuals* can instantly parse heavy reports and distill answers directly via the "My Data" module.
  - *Corporate Users* gain a trusted, hallucination-resistant oracle strictly curated by their own administrators.

## 9. Market Awareness
- **Competitive Landscape:** Generic enterprise search (SharePoint) relies on brittle keyword matching. Solo AI platforms lack organizational visibility.
- **Positioning:** Borg holds the middle ground: it provides ChatGPT-level conversational fluency, but explicitly anchors generation within a highly curated, organizationally shared truth boundary.

## 10. Team Execution Plan
- **Data/AI Lead:** Integrates file-parsing libraries (`.pdf`, `.docx`), manages Pinecone vector mappings, and tunes Gemini 2.5 Flash query logic.
- **Frontend Lead:** Builds the "My Data" interface, Organization creation flows, and the conversational UI.
- **Backend/IAM Lead:** Engineers the exact User/Admin permission handshake in Firebase to control the upload request/approval state machine.

## 11. Risk Assessment
- **Risk:** Database Pollution leading to hallucinations.
  - *Contingency:* The explicit permission handshake blocks Standard Users from directly writing to the vector index. All standard uploads are placed in a "pending approval" state queue.
- **Risk:** Cross-Organizational Data Bleed.
  - *Contingency:* Firebase RBAC rules paired with strict `namespace` or `orgId` metadata constraints on every Pinecone operation.

## 12. Differentiation Strategy
Many platforms allow unconstrained data uploads, rapidly degrading the LLM's accuracy with conflicting or outdated context. Borg deliberately introduces friction at the ingestion layer relative to standard users—requiring Admin approval for shared organizational uploads. This ensures the RAG model is only answering utilizing verified, premium context.
