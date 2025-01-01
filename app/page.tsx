"use client";

import { Message, useChat } from "ai/react";
import React from "react";

export function useMultiStreamChat() {
  const { messages, setMessages } = useChat();

  const appendMultiStream = async (message: {
    role: string;
    content: string;
  }) => {
    const newMessageId = Math.random().toString(36).substring(7); // Generate a unique ID for the user message

    // Append the user message
    const userMessage: Message = {
      id: newMessageId,
      role: "user",
      content: message.content,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Send the user message to the API
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...messages, userMessage] }),
    });

    // Handle the streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");

    if (!reader) return;

    let buffer = "";
    const aiMessages: Record<string, string> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const decoded = decoder.decode(value);
      console.log(decoded);
      buffer += decoded;
      const lines = buffer.split("\n");

      console.log("lines", lines);
      for (let i = 0; i < lines.length - 1; i++) {
        if (!lines[i]) continue;

        const parsed = JSON.parse(lines[i]);
        console.log("parsed", parsed);
        const { streamId, chunk } = parsed;

        // Initialize the AI message for this stream if not already done
        if (!aiMessages[streamId]) {
          aiMessages[streamId] = "";
          const aiMessage: Message = {
            id: `${newMessageId}-${streamId}`,
            role: "assistant",
            content: "",
          };
          setMessages((prev) => [...prev, aiMessage]);
        }

        // Update the AI message content
        aiMessages[streamId] += chunk;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === `${newMessageId}-${streamId}`
              ? { ...msg, content: aiMessages[streamId] }
              : msg
          )
        );
      }

      buffer = lines[lines.length - 1];
    }
  };

  return { messages, appendMultiStream };
}

export default function ChatComponent() {
  const { messages, appendMultiStream } = useMultiStreamChat();
  const [input, setInput] = React.useState("");

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    appendMultiStream({ role: "user", content: input });
    setInput("");
  };

  return (
    <div>
      <div>
        {messages.map((msg) => (
          // <div key={msg.id}>
          //   <strong>{msg.role === "user" ? "User" : "Assistant"}:</strong>{" "}
          //   {msg.content}
          // </div>
          <div key={msg.id}>{JSON.stringify(msg)}</div>
        ))}
      </div>
      <form onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
