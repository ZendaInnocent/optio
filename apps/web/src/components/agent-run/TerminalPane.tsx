"use client";

import { useState, useRef, useEffect } from "react";

interface TerminalPaneProps {
  runId: string;
}

export function TerminalPane({ runId }: TerminalPaneProps) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string[]>(["Terminal connected to agent run."]);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL ??
    (typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : "ws://localhost:4000");

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/agent-runs/${runId}/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      setOutput((prev) => [...prev, "Connected to terminal."]);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output") {
          setOutput((prev) => [...prev, msg.content]);
        }
      } catch {
        setOutput((prev) => [...prev, event.data]);
      }
    };

    return () => ws.close();
  }, [runId]);

  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [output.length]);

  const sendCommand = () => {
    if (!input.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "input", content: input }));
    setOutput((prev) => [...prev, `$ ${input}`]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendCommand();
    }
  };

  return (
    <div className="flex flex-col h-full bg-black text-green-400 font-mono text-sm">
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {output.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-2 bg-bg border-t border-border flex items-center gap-2">
        <span className="text-primary">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          className="flex-1 bg-transparent outline-none text-text-muted placeholder:text-text-muted/50"
        />
      </div>
    </div>
  );
}
