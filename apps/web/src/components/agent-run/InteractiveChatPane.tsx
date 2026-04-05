"use client";

import { useState, useRef, useEffect } from "react";

interface InteractiveChatPaneProps {
  runId: string;
}

export function InteractiveChatPane({ runId }: InteractiveChatPaneProps) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>(
    [],
  );
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"connecting" | "ready">("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL ??
    (typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : "ws://localhost:4000");

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/agent-runs/${runId}/chat`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("ready");
      ws.send(JSON.stringify({ type: "join", runId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "message") {
          setMessages((prev) => [...prev, { role: msg.role, content: msg.content }]);
        }
      } catch {
        // ignore
      }
    };

    return () => ws.close();
  }, [runId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "message", content: input }));
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === "user" ? "bg-primary text-white" : "bg-bg-card border border-border"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 border-t border-border bg-bg">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 px-3 py-2 text-sm bg-bg border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={status !== "ready" || !input.trim()}
            className="px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
