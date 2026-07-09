A lightweight, local-first Japanese language practice application powered by your own PC. By combining the power of local AI with an adaptive caching system, GenAnki-JP generates completely unique Vocabulary and Kanji exams every single day without relying on expensive or privacy-invasive cloud APIs.
✨ Features
Infinite Context Variety: The AI dynamically generates fresh, natural contextual sentences every single day. You will never memorize a question by accident; you have to understand the Japanese.
Smart Scope Progression: Generated vocabulary words are saved locally in your system's cache. As you practice more, the app tracks your known words and systematically expands the scope of your exams.
100% Free & Private: Everything runs locally on your machine via Ollama. No data ever leaves your computer.
Low-Spec Friendly: Designed to be lightweight. The AI works in a quick burst to generate your daily exam, then sleeps—leaving your PC running cool and fast while you study.
🛠️ Prerequisites
Before running this application, you must have Ollama installed and running on your local machine.
Download and install Ollama from ollama.com.
Open your terminal and pull a Japanese-optimized model (we recommend qwen2.5 or gemma3 for excellent Japanese accuracy):
Bash
ollama run qwen2.5:7b
(Note: For lower-spec PCs, llama3.2:3b or smaller quantized variants work beautifully too!)
🚀 Getting Started
1. Clone the Repository
Bash
git clone https://github.com/your-username/genanki-jp.git
cd genanki-jp
2. Install Dependencies
Bash
npm install
3. Configure your Environment
Create a .env file in the root directory and specify your local Ollama endpoint and chosen model:
Code snippet
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
4. Run the App
Bash
npm run dev
Open your browser to the local URL displayed in your terminal (usually http://localhost:5173) and start practicing!
🧠 How the Mastery Engine Works
The Generation Phase: When you start your daily session, the app sends your current cached vocabulary range to Ollama, asking for new contextual sentences testing those ranges (plus a few new target words).
The Active Phase: Once the exam loads, the local AI model completely unloads from your RAM, freeing up your PC.
The Mastery Loop: Just like Anki, if you get a question wrong, it goes into a re-test pool. You must get the question right in a shuffled review loop before the session concludes and the words are permanently committed to your vocabulary cache.
