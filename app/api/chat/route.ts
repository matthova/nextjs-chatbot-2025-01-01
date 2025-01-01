import { createDataStreamResponse, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { v4 } from "uuid";

// Initialize the TextDecoder
const decoder = new TextDecoder("utf-8");

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Call two different LLMs simultaneously
  const stream1 = streamText({
    model: openai("gpt-4o"),
    system: "You are a helpful assistant.",
    messages,
  });

  const stream2 = streamText({
    model: openai("gpt-4o-mini"),
    system: "tell me a silly joke.",
    messages,
  });

  // Function to clean the chunk (removes quotes, escapes, and non-text content)
  const cleanChunk = (chunk: string) => {
    // Remove leading index (e.g., '0:', '1:', etc.) and outer double-quotes
    if (chunk.startsWith("e:{") || chunk.startsWith("d:{")) return "";

    const [_first, ...last] = chunk.split('"');
    last.pop(); // Remove the last element (which is the last double-quote)

    console.log(last, chunk);
    return (last ?? [""]).join('"');
  };

  // Create a combined stream
  const combinedStream = new ReadableStream({
    start(controller) {
      let finishedStreams = 0;

      // Handle first stream (Assistant1)
      stream1.toDataStream().pipeTo(
        new WritableStream({
          write(chunk) {
            const decodedChunk = decoder.decode(chunk, { stream: true });
            const cleanedChunk = cleanChunk(decodedChunk);
            controller.enqueue(
              JSON.stringify({ streamId: "Assistant1", chunk: cleanedChunk }) +
                "\n"
            );
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
            const cleanedChunk = cleanChunk(decodedChunk);
            controller.enqueue(
              JSON.stringify({ streamId: "Assistant2", chunk: cleanedChunk }) +
                "\n"
            );
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
