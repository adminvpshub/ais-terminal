<div align="center">
    <h1>AIS-Terminal</h1>
    <p><strong>The AI-Native Terminal for Modern DevOps</strong></p>
    <p>Describe your task, get verified commands, and fix errors automatically with Gemini 2.0.</p>

<p align="center">
  <img src="/public/screenshots/landing_hero.png" alt="AIS-Terminal Hero" width="800" />
</p>

</div>

## 🚀 Features

- **AI-Powered Command Generation**: Describe your task in natural language, and Gemini 2.0 will generate the appropriate shell commands.
- **Auto-Fix & Explanations**: If a command fails, the AI analyzes the error output and suggests a fix.
- **Interactive Terminal**: Full xterm.js integration for a native terminal experience (vim, nano, htop support).
- **Secure Profile Management**: Store SSH credentials securely with AES-256 encryption and a Master PIN.
- **Task Staging**: Review AI-generated commands in a staging sidebar before execution.
- **Context-Aware**: Automatically detects the remote OS (Ubuntu, CentOS, etc.) to tailor commands.

## 🛠 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, xterm.js
- **Backend**: Node.js, Express, Socket.io, ssh2
- **AI**: Google Gemini 2.0 Flash (via `@google/genai`)
- **Security**: PBKDF2 Hashing, AES-256-GCM Encryption

## 📦 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/adminvpshub/ais-terminal.git
    cd ais-terminal
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Create a `.env.local` file in the root directory:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

4.  **Start the Application:**
    This command starts both the backend server and the frontend development server concurrently.
    ```bash
    npm start
    ```
    *Or separately:*
    ```bash
    node server.js
    npm run dev
    ```

5.  **Access:**
    Open `http://localhost:3000` in your browser.

## 🔒 Security

*   **Master PIN**: On first run, you will be prompted to set a 6-digit Master PIN. This PIN is used to encrypt all your SSH private keys and passphrases.
*   **Encryption**: Keys are stored in `ssh_profiles.json` encrypted with AES-256-GCM derived from your PIN.
*   **Privacy**: Your PIN is never stored in plain text. Only a salted hash is saved in `security.json` for verification.

## 📸 Screenshots

| Landing Page | Terminal Interface |
|:---:|:---:|
| <img src="/public/screenshots/landing_hero.png" width="400"> | <img src="/public/screenshots/terminal_view.png" width="400"> |

| Command Staging | AI Suggestions |
|:---:|:---:|
| <img src="/public/screenshots/staging_area.png" width="400"> | <img src="/public/screenshots/suggestion_modal.png" width="400"> |

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

[MIT](LICENSE)
