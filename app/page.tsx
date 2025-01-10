"use client";

import { Message, useChat } from "ai/react";
import React from "react";
import { parseDataStreamPart } from "ai";
import { v4 } from "uuid";

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
    // Append the user message
    const userMessage: Message = {
      id: v4(),
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

    const modelAMessage: Message = {
      id: v4(),
      role: "assistant",
      content: "",
      annotations: [{ model: "a" }, { parentMessageId: userMessage.id }],
    };
    const modelBMessage: Message = {
      id: v4(),
      role: "assistant",
      content: "",
      annotations: [{ model: "b" }, { parentMessageId: userMessage.id }],
    };

    setMessages((prev) => [...prev, modelAMessage, modelBMessage]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const decoded = decoder.decode(value);
      buffer += decoded;
      const lines = buffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        if (!lines[i]) continue;
        const [model, chunk] = splitString(lines[i]);
        // TODO expand this to handle multiple modalities
        const { type, value } = parseDataStreamPart(chunk);
        setMessages((prev) => {
          const [messages, modelAMessage, modelBMessage] = splitArray(prev);
          switch (type) {
            case "text": {
              if (model === "a") {
                return [
                  ...messages,
                  { ...modelAMessage, content: modelAMessage.content + value },
                  modelBMessage,
                ];
              } else if (model === "b") {
                return [
                  ...messages,
                  modelAMessage,
                  { ...modelBMessage, content: modelBMessage.content + value },
                ];
              } else {
                return prev;
              }
            }
            default:
              return prev;
          }
        });
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
              <strong>{getRoleName(msg)}:</strong> {msg.content}
            </div>
          </React.Fragment>
        ))}
      </div>
      <form onSubmit={sendMessage}>
        <textarea
          className="bg-white border border-black text-black"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

function getRoleName(message: Message) {
  if (message.role === "user") return "User";
  if (message.role === "assistant") {
    if (message.annotations) {
      const messageModelAnnotation = message.annotations.find(
        (a) => a?.model != null
      )?.model;
      if (messageModelAnnotation === "a") {
        return "Assistant A";
      } else if (messageModelAnnotation === "b") {
        return "Assistant B";
      }
      return "Assistant";
    }
    return message.role;
  }
}

/** Get the model a | b and the rest of the string out of a buffer */
function splitString(str: string): [string, string] {
  if (str.length === 0) return ["", ""];
  return [str.charAt(0), str.slice(1)];
}

function splitArray(arr: Message[]): [Message[], Message, Message] {
  if (arr.length < 2) throw new Error("Array must have at least two elements");
  const allButLastTwo = arr.slice(0, -2);
  const secondToLast = arr[arr.length - 2];
  const last = arr[arr.length - 1];
  return [allButLastTwo, secondToLast, last];
}
