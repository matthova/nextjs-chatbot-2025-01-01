import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

// Initialize the TextDecoder
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder("utf-8");

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
          start() {
            controller.enqueue(
              JSON.stringify({
                streamId: "Assistant1",
                chunk: JSON.stringify({
                  message_annotations: [{ modelId: "12345678-87654321" }],
                }),
              }) + "\n"
            );
          },
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
          start() {
            controller.enqueue(
              JSON.stringify({
                streamId: "Assistant2",
                chunk: JSON.stringify({
                  message_annotations: [{ modelId: "23456789-98765432" }],
                }),
              }) + "\n"
            );
          },
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

export function formatDataStreamPart<T extends keyof DataStreamPartValueType>(
  type: T,
  value: DataStreamPartValueType[T]
): DataStreamString {
  const streamPart = dataStreamParts.find((part) => part.name === type);

  if (!streamPart) {
    throw new Error(`Invalid stream part type: ${type}`);
  }

  return `${streamPart.code}:${JSON.stringify(value)}\n`;
}

const textStreamPart: DataStreamPart<"0", "text", string> = {
  code: "0",
  name: "text",
  parse: (value: JSONValue) => {
    if (typeof value !== "string") {
      throw new Error('"text" parts expect a string value.');
    }
    return { type: "text", value };
  },
};

const dataStreamPart: DataStreamPart<"2", "data", Array<JSONValue>> = {
  code: "2",
  name: "data",
  parse: (value: JSONValue) => {
    if (!Array.isArray(value)) {
      throw new Error('"data" parts expect an array value.');
    }

    return { type: "data", value };
  },
};

const errorStreamPart: DataStreamPart<"3", "error", string> = {
  code: "3",
  name: "error",
  parse: (value: JSONValue) => {
    if (typeof value !== "string") {
      throw new Error('"error" parts expect a string value.');
    }
    return { type: "error", value };
  },
};

const messageAnnotationsStreamPart: DataStreamPart<
  "8",
  "message_annotations",
  Array<JSONValue>
> = {
  code: "8",
  name: "message_annotations",
  parse: (value: JSONValue) => {
    if (!Array.isArray(value)) {
      throw new Error('"message_annotations" parts expect an array value.');
    }

    return { type: "message_annotations", value };
  },
};

const toolCallStreamPart: DataStreamPart<
  "9",
  "tool_call",
  CoreToolCall<string, any>
> = {
  code: "9",
  name: "tool_call",
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== "object" ||
      !("toolCallId" in value) ||
      typeof value.toolCallId !== "string" ||
      !("toolName" in value) ||
      typeof value.toolName !== "string" ||
      !("args" in value) ||
      typeof value.args !== "object"
    ) {
      throw new Error(
        '"tool_call" parts expect an object with a "toolCallId", "toolName", and "args" property.'
      );
    }

    return {
      type: "tool_call",
      value: value as unknown as CoreToolCall<string, any>,
    };
  },
};

const toolResultStreamPart: DataStreamPart<
  "a",
  "tool_result",
  Omit<CoreToolResult<string, any, any>, "args" | "toolName">
> = {
  code: "a",
  name: "tool_result",
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== "object" ||
      !("toolCallId" in value) ||
      typeof value.toolCallId !== "string" ||
      !("result" in value)
    ) {
      throw new Error(
        '"tool_result" parts expect an object with a "toolCallId" and a "result" property.'
      );
    }

    return {
      type: "tool_result",
      value: value as unknown as Omit<
        CoreToolResult<string, any, any>,
        "args" | "toolName"
      >,
    };
  },
};

const toolCallStreamingStartStreamPart: DataStreamPart<
  "b",
  "tool_call_streaming_start",
  { toolCallId: string; toolName: string }
> = {
  code: "b",
  name: "tool_call_streaming_start",
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== "object" ||
      !("toolCallId" in value) ||
      typeof value.toolCallId !== "string" ||
      !("toolName" in value) ||
      typeof value.toolName !== "string"
    ) {
      throw new Error(
        '"tool_call_streaming_start" parts expect an object with a "toolCallId" and "toolName" property.'
      );
    }

    return {
      type: "tool_call_streaming_start",
      value: value as unknown as { toolCallId: string; toolName: string },
    };
  },
};

const toolCallDeltaStreamPart: DataStreamPart<
  "c",
  "tool_call_delta",
  { toolCallId: string; argsTextDelta: string }
> = {
  code: "c",
  name: "tool_call_delta",
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== "object" ||
      !("toolCallId" in value) ||
      typeof value.toolCallId !== "string" ||
      !("argsTextDelta" in value) ||
      typeof value.argsTextDelta !== "string"
    ) {
      throw new Error(
        '"tool_call_delta" parts expect an object with a "toolCallId" and "argsTextDelta" property.'
      );
    }

    return {
      type: "tool_call_delta",
      value: value as unknown as {
        toolCallId: string;
        argsTextDelta: string;
      },
    };
  },
};

const finishMessageStreamPart: DataStreamPart<
  "d",
  "finish_message",
  {
    finishReason: LanguageModelV1FinishReason;
    usage?: {
      promptTokens: number;
      completionTokens: number;
    };
  }
> = {
  code: "d",
  name: "finish_message",
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== "object" ||
      !("finishReason" in value) ||
      typeof value.finishReason !== "string"
    ) {
      throw new Error(
        '"finish_message" parts expect an object with a "finishReason" property.'
      );
    }

    const result: {
      finishReason: LanguageModelV1FinishReason;
      usage?: {
        promptTokens: number;
        completionTokens: number;
      };
    } = {
      finishReason: value.finishReason as LanguageModelV1FinishReason,
    };

    if (
      "usage" in value &&
      value.usage != null &&
      typeof value.usage === "object" &&
      "promptTokens" in value.usage &&
      "completionTokens" in value.usage
    ) {
      result.usage = {
        promptTokens:
          typeof value.usage.promptTokens === "number"
            ? value.usage.promptTokens
            : Number.NaN,
        completionTokens:
          typeof value.usage.completionTokens === "number"
            ? value.usage.completionTokens
            : Number.NaN,
      };
    }

    return {
      type: "finish_message",
      value: result,
    };
  },
};

const finishStepStreamPart: DataStreamPart<
  "e",
  "finish_step",
  {
    isContinued: boolean;
    finishReason: LanguageModelV1FinishReason;
    usage?: {
      promptTokens: number;
      completionTokens: number;
    };
  }
> = {
  code: "e",
  name: "finish_step",
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== "object" ||
      !("finishReason" in value) ||
      typeof value.finishReason !== "string"
    ) {
      throw new Error(
        '"finish_step" parts expect an object with a "finishReason" property.'
      );
    }

    const result: {
      isContinued: boolean;
      finishReason: LanguageModelV1FinishReason;
      usage?: {
        promptTokens: number;
        completionTokens: number;
      };
    } = {
      finishReason: value.finishReason as LanguageModelV1FinishReason,
      isContinued: false,
    };

    if (
      "usage" in value &&
      value.usage != null &&
      typeof value.usage === "object" &&
      "promptTokens" in value.usage &&
      "completionTokens" in value.usage
    ) {
      result.usage = {
        promptTokens:
          typeof value.usage.promptTokens === "number"
            ? value.usage.promptTokens
            : Number.NaN,
        completionTokens:
          typeof value.usage.completionTokens === "number"
            ? value.usage.completionTokens
            : Number.NaN,
      };
    }

    if ("isContinued" in value && typeof value.isContinued === "boolean") {
      result.isContinued = value.isContinued;
    }

    return {
      type: "finish_step",
      value: result,
    };
  },
};

const dataStreamParts = [
  textStreamPart,
  dataStreamPart,
  errorStreamPart,
  messageAnnotationsStreamPart,
  toolCallStreamPart,
  toolResultStreamPart,
  toolCallStreamingStartStreamPart,
  toolCallDeltaStreamPart,
  finishMessageStreamPart,
  finishStepStreamPart,
] as const;
