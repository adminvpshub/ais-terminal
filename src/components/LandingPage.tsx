import React, { useState } from 'react';
import { Terminal, Cpu, Sparkles, Command, Zap, Shield, ArrowRight, Github, FileText } from 'lucide-react';

interface LandingPageProps {
  onLaunch: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch }) => {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">

      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-bold text-xl text-blue-400 hover:text-blue-300 transition-colors">
            <Cpu className="h-6 w-6" />
            <span>AIS-Terminal</span>
          </a>
          <div className="flex items-center gap-4">
            <a href="https://github.com/adminvpshub/ais-terminal" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              <Github className="h-5 w-5" />
            </a>
            <button
              onClick={onLaunch}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
            >
              Launch App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden pt-16 pb-24">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/30 border border-blue-800 text-blue-400 text-sm mb-8">
              <Sparkles size={14} />
              <span>Gemini 3.0 Integration</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-white via-blue-100 to-blue-300 bg-clip-text text-transparent">
              The AI-Native Terminal <br/>for Modern DevOps
            </h1>
            <p className="text-xl text-gray-400 mb-10 leading-relaxed">
              Stop memorizing flags. Just describe your task, and let AI generate, explain, and fix commands for you.
              The power of a full interactive shell combined with next-gen intelligence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onLaunch}
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all shadow-xl shadow-blue-500/25 hover:scale-105"
              >
                Start Using Now <ArrowRight size={20} />
              </button>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-8 py-4 rounded-xl text-lg font-medium transition-all border border-gray-700"
              >
                View Features
              </a>
            </div>
          </div>

          <div className="mt-20 relative rounded-xl overflow-hidden shadow-2xl border border-gray-800 bg-gray-900/50 backdrop-blur">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 border-b border-gray-800">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="text-xs text-gray-500 ml-2">ais-terminal — demo</div>
            </div>
            <img
              src="/screenshots/feature-ai-commands.png"
              alt="AI Command Generation Demo"
              className="w-full opacity-90"
            />
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div id="features" className="py-24 bg-gray-900/30 border-y border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Reimagine Your Workflow</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Built for developers who want to stay in the flow. No more context switching to search for syntax.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<Command className="text-purple-400" />}
              title="Natural Language to Bash"
              description="Simply type 'Check disk usage on /var' and get the exact command instantly. Safe, explained, and ready to run."
            />
            <FeatureCard
              icon={<Zap className="text-yellow-400" />}
              title="Auto-Fix Errors"
              description="Command failed? The AI analyzes the exit code and output to suggest an immediate fix. One click to resolve."
            />
            <FeatureCard
              icon={<Terminal className="text-green-400" />}
              title="Full Interactive PTY"
              description="Not just a command runner. A full interactive terminal supporting vim, nano, htop, and all your favorite TUI tools."
            />
            <FeatureCard
              icon={<FileText className="text-blue-400" />}
              title="File Upload & Download"
              description="Seamlessly transfer files between your local machine and the remote server. Drag-and-drop uploads and one-click downloads."
            />
          </div>
        </div>
      </div>

      {/* Detailed Feature Showcases */}
      <div className="py-24 space-y-32 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Feature 1 */}
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-6">
            <div className="inline-block p-3 rounded-lg bg-blue-900/20 border border-blue-800/50">
              <Sparkles className="text-blue-400 h-6 w-6" />
            </div>
            <h3 className="text-3xl font-bold text-white">Intelligent Command Generation</h3>
            <p className="text-lg text-gray-400 leading-relaxed">
              Don't remember the `tar` flags? Need a complex `find` command? Just ask.
              AIS-Terminal translates your intent into valid shell commands, explains what they do, and stages them for execution.
            </p>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div> Detects Linux Distro automatically</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div> Explains dangerous commands before running</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div> Batch execution mode</li>
            </ul>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
            <img src="/screenshots/feature-ai-commands.png" alt="AI Commands" className="w-full" />
          </div>
        </div>

        {/* Feature 2 */}
        <div className="flex flex-col md:flex-row-reverse items-center gap-12">
          <div className="flex-1 space-y-6">
            <div className="inline-block p-3 rounded-lg bg-red-900/20 border border-red-800/50">
              <Shield className="text-red-400 h-6 w-6" />
            </div>
            <h3 className="text-3xl font-bold text-white">Smart Error Recovery</h3>
            <p className="text-lg text-gray-400 leading-relaxed">
              When a command fails, you don't need to copy-paste the error into a browser.
              The AI analyzes the error output in-context and proposes a fix immediately.
            </p>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
            <img src="/screenshots/feature-auto-fix.png" alt="Auto Fix" className="w-full" />
          </div>
        </div>

        {/* Feature 3 (New) */}
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-6">
            <div className="inline-block p-3 rounded-lg bg-green-900/20 border border-green-800/50">
              <Terminal className="text-green-400 h-6 w-6" />
            </div>
            <h3 className="text-3xl font-bold text-white">Full Interactive PTY</h3>
            <p className="text-lg text-gray-400 leading-relaxed">
              Unlike other AI command runners, AIS-Terminal is a full terminal emulator.
              Run interactive tools like `vim`, `htop`, or `nano` natively.
            </p>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
            <img src="/screenshots/feature-terminal.png" alt="Interactive Terminal" className="w-full" />
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-gray-300 font-semibold">
            <Cpu size={20} />
            AIS-Terminal
          </div>
          <div className="text-sm text-gray-500">
            Open Source • MIT License • Built with React & Vite
          </div>
          <div className="flex gap-4">
             <a href="https://github.com/adminvpshub/ais-terminal" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">GitHub</a>
             <a href="#" className="text-gray-400 hover:text-white transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-xl hover:bg-gray-800/60 transition-colors">
    <div className="mb-4">{icon}</div>
    <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
    <p className="text-gray-400 leading-relaxed">{description}</p>
  </div>
);
