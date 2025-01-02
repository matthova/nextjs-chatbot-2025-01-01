import * as z from "zod";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

// Initialize the TextDecoder
const decoder = new TextDecoder("utf-8");

const MessageParser = z.array(
  z.object({
    id: z.string(),
    role: z.enum(["system", "user", "assistant", "data"]),
    content: z.string(),
    annotations: z
      .array(
        z.object({
          model: z.string().optional(),
          parentMessageId: z.string().optional(),
        })
      )
      .optional(),
  })
);

export async function POST(req: Request) {
  const { messages: messagesUnparsed } = await req.json();
  const messages = MessageParser.parse(messagesUnparsed);

  const modelAMessages = messages.filter(
    (m) =>
      m.role === "user" ||
      (m.annotations != null && m.annotations.find((a) => a?.model === "a"))
  );

  // Call two different LLMs simultaneously
  const stream1 = streamText({
    model: openai("gpt-4o"),
    system: "You are a helpful assistant.",
    messages: modelAMessages,
  });

  const modelBMessages = messages.filter(
    (m) =>
      m.role === "user" ||
      (m.annotations != null && m.annotations.find((a) => a?.model === "b"))
  );

  const stream2 = streamText({
    model: openai("gpt-4o-mini"),
    system: "You are a helpful assistant.",
    messages: modelBMessages,
  });

  // Create a combined stream
  const combinedStream = new ReadableStream({
    start(controller) {
      let finishedStreams = 0;

      // Handle first stream (Assistant1)
      stream1.toDataStream().pipeTo(
        new WritableStream({
          write(chunk) {
            const decodedChunk = decoder.decode(chunk, { stream: true });
            controller.enqueue(`a${decodedChunk}`);
          },
          close() {
            finishedStreams += 1;
            if (finishedStreams === 2) {
              controller.close(); // Close when both streams are done
            }
          },
          abort(err) {
            controller.error(err);
          },
        })
      );

      // Handle second stream (Assistant2)
      stream2.toDataStream().pipeTo(
        new WritableStream({
          write(chunk) {
            const decodedChunk = decoder.decode(chunk, { stream: true });
            controller.enqueue(`b${decodedChunk}`);
          },
          close() {
            finishedStreams += 1;
            if (finishedStreams === 2) {
              controller.close(); // Close when both streams are done
            }
          },
          abort(err) {
            controller.error(err);
          },
        })
      );
    },
  });

  return new Response(combinedStream, {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}
