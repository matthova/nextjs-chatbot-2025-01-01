"use client";
import * as z from "zod";
import { Message, useChat } from "ai/react";
import React from "react";

export function useMultiStreamChat({
  initialMessages,
}: {
  initialMessages: Message[];
}) {
  const { messages, setMessages } = useChat({
    initialMessages,
  });

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
      buffer += decoded;
      const lines = buffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        if (!lines[i]) continue;

        const parsed = JSON.parse(lines[i]);
        const { streamId, chunk } = parsed;
        let annotations = undefined;
        try {
          annotations = z
            .object({
              message_annotations: z.array(
                z.object({
                  modelId: z.string(),
                })
              ),
            })
            .parse(JSON.parse(chunk)).message_annotations;
        } catch (e) {
          console.log("Error parsing annotations", e);
        }

        // Initialize the AI message for this stream if not already done
        if (!aiMessages[streamId]) {
          aiMessages[streamId] = "";
          const aiMessage: Message = {
            id: `${newMessageId}-${streamId}`,
            role: "assistant",
            content: "",
            annotations,
          };
          setMessages((prev) => [...prev, aiMessage]);
        }

        // Update the AI message content
        if (annotations == null) {
          aiMessages[streamId] += chunk;
        }
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
  const { messages, appendMultiStream } = useMultiStreamChat({
    initialMessages: [],
  });
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
          <React.Fragment key={msg.id}>
            <div>
              <strong>{msg.role === "user" ? "User" : "Assistant"}:</strong>{" "}
              {msg.content}
            </div>
            <div>{JSON.stringify(msg)}</div>
          </React.Fragment>
        ))}
      </div>
      <div>{JSON.stringify(messages)}</div>
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
