import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Socket } from 'socket.io-client';

interface TerminalProps {
    socket: Socket;
    fontSize: number;
}

export const Terminal: React.FC<TerminalProps> = ({ socket, fontSize }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    useEffect(() => {
        if (xtermRef.current && fitAddonRef.current) {
            xtermRef.current.options.fontSize = fontSize;
            fitAddonRef.current.fit();
            // Emit resize event to backend because font size change affects dimensions
            const dims = fitAddonRef.current.proposeDimensions();
            if (dims) {
                socket.emit('ssh:resize', { cols: dims.cols, rows: dims.rows });
            }
        }
    }, [fontSize, socket]);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize XTerm
        const term = new XTerm({
            cursorBlink: true,
            fontSize: fontSize,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#111827', // gray-900 matches app theme
                foreground: '#ffffff',
            },
            convertEol: true, // Treat \n as \r\n
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Handle User Input
        term.onData((data) => {
            socket.emit('ssh:input', data);
        });

        // Handle Incoming Data
        const onData = (data: string) => {
            term.write(data);
        };

        const onStatus = (status: string) => {
             if (status === 'connected') {
                 term.clear();
                 term.write('\r\n\x1b[32m✔ Connected\x1b[0m\r\n');
                 term.focus();
             } else if (status === 'disconnected') {
                 term.write('\r\n\x1b[31m✖ Disconnected\x1b[0m\r\n');
             }
        };

        const onError = (msg: string) => {
             term.write(`\r\n\x1b[31m✖ Error: ${msg}\x1b[0m\r\n`);
        };

        socket.on('ssh:data', onData);
        socket.on('ssh:status', onStatus);
        socket.on('ssh:error', onError);

        // Handle Resize
        const handleResize = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit();
                const dims = fitAddonRef.current.proposeDimensions();
                if (dims && xtermRef.current) {
                     socket.emit('ssh:resize', { cols: dims.cols, rows: dims.rows });
                }
            }
        };

        window.addEventListener('resize', handleResize);

        // ResizeObserver to detect container size changes (e.g. when input area expands)
        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(terminalRef.current);

        // Initial resize after a short delay to ensure container is ready
        setTimeout(handleResize, 100);

        return () => {
            socket.off('ssh:data', onData);
            socket.off('ssh:status', onStatus);
            socket.off('ssh:error', onError);
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
            term.dispose();
        };
    }, [socket]);

    return (
        <div
            ref={terminalRef}
            className="h-full w-full overflow-hidden bg-gray-900"
            style={{ minHeight: '100%' }}
        />
    );
};
