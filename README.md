<div align="center">
    <h1>AIS-Terminal</h1>
    <p><strong>The AI-Native Terminal for Modern DevOps</strong></p>
    <p>Describe your task, get verified commands, and fix errors automatically with Gemini 3.0.</p>

<p align="center">
  <img src="/public/screenshots/feature-terminal.png" alt="AIS-Terminal Hero" width="800" />
</p>

</div>

## 🚀 Features

- **AI-Powered Command Generation**: Describe your task in natural language, and Gemini 3.0 will generate the appropriate shell commands.
- **Auto-Fix & Explanations**: If a command fails, the AI analyzes the error output and suggests a fix.
- **Interactive Terminal**: Full xterm.js integration for a native terminal experience (vim, nano, htop support).
- **Secure Profile Management**: Store SSH credentials securely with AES-256 encryption and a Master PIN.
- **Task Staging**: Review AI-generated commands in a staging sidebar before execution.
- **Context-Aware**: Automatically detects the remote OS (Ubuntu, CentOS, etc.) to tailor commands.

## 🛠 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, xterm.js
- **Backend**: Node.js, Express, Socket.io, ssh2
- **AI**: Google Gemini 3.0 Flash (via `@google/genai`)
- **Security**: PBKDF2 Hashing, AES-256-GCM Encryption

## 📦 Deployment & Installation

### 🐳 Docker (Recommended)

1.  **Production Deployment:**
    Use the provided `docker-compose.prod.yml` to run the application in production mode.
    ```bash
    GEMINI_API_KEY=your_key docker compose -f docker-compose.prod.yml up -d
    ```
    The app will be available at `http://your-vps-ip:3000`.

2.  **Local Development:**
    ```bash
    GEMINI_API_KEY=your_key docker compose up
    ```

### 🛠 Manual Installation

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
    ```bash
    npm start
    ```

5.  **Access:**
    Open `http://localhost:3000` in your browser.

## 🤖 GitHub Actions CI/CD

To automate deployment to your VPS, set up the following GitHub Secrets:

- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `VPS_HOST`: Your VPS IP address or domain.
- `VPS_USER`: SSH username (e.g., `root`).
- `VPS_SSH_KEY`: Your private SSH key for the VPS.
- `GH_PAT`: A GitHub Personal Access Token with `read:packages` scope (to pull images on the VPS).

## 🔑 SSH Configuration Guide

If you need to connect as a user other than `root` (e.g., `admin` or `sysadmin`) and encounter permission errors, you may need to manually configure the SSH keys on your server.

**Basic Steps:**

1.  **Generate a Key Pair:** Create a new SSH key pair locally (or use an existing one).
2.  **Create .ssh Directory:** Ensure the directory exists for the target user:
    ```bash
    mkdir -p /home/username/.ssh
    ```
3.  **Add Public Key:** Append your public key content to the `authorized_keys` file:
    ```bash
    echo "your-public-key-content" >> /home/username/.ssh/authorized_keys
    ```
4.  **Set Permissions:** Secure the files (SSH requires strict permissions):
    ```bash
    chown -R username:username /home/username/.ssh
    chmod 700 /home/username/.ssh
    chmod 600 /home/username/.ssh/authorized_keys
    ```

For a detailed example of diagnosing and fixing these issues, please refer to [server_fix_log.md](./server_fix_log.md).

## 🔒 Security

*   **HTTPS Requirement**: This application uses the **Web Crypto API** for secure PIN hashing and encryption. This API is **only available in Secure Contexts** (HTTPS or localhost). If you are deploying to a public server, **you must serve the application over HTTPS**. Accessing it via HTTP will cause security setup failures.
*   **Master PIN**: On first run, you will be prompted to set a 6-digit Master PIN. This PIN is used to encrypt all your SSH private keys and passphrases.
*   **Encryption**: Keys are stored in `ssh_profiles.json` encrypted with AES-256-GCM derived from your PIN.
*   **Privacy**: Your PIN is never stored in plain text. Only a salted hash is saved in `security.json` for verification.

## 📸 Screenshots

| Landing Page | Terminal Interface |
|:---:|:---:|
| <img src="/public/screenshots/landing-page.png" width="400"> | <img src="/public/screenshots/feature-terminal.png" width="400"> |

| Command Staging | AI Suggestions |
|:---:|:---:|
| <img src="/public/screenshots/feature-ai-commands.png" width="400"> | <img src="/public/screenshots/feature-auto-fix.png" width="400"> |

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

[MIT](LICENSE)
