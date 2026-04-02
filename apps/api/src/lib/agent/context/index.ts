import { threadRepository, type ThreadEvent } from "../repository.js";

export interface ContextConfig {
  maxHistoryEvents: number;
  maxToolCalls: number;
  maxRagDocs: number;
  maxMemoryItems: number;
  format: "json" | "markdown" | "hybrid";
  compressResolvedErrors: boolean;
  compressOldHistory: boolean;
  safetyFilter: boolean;
  tokenBudget?: number;
}

export interface ContextItem {
  type: "prompt" | "instruction" | "rag" | "history" | "tool_call" | "memory" | "error";
  content: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
  resolved?: boolean;
  tokenEstimate?: number;
}

export interface ContextWindow {
  system: ContextItem[];
  state: ContextItem[];
  history: ContextItem[];
  knowledge: ContextItem[];
  errors: ContextItem[];
  totalTokens: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxHistoryEvents: 20,
  maxToolCalls: 10,
  maxRagDocs: 5,
  maxMemoryItems: 10,
  format: "hybrid",
  compressResolvedErrors: true,
  compressOldHistory: true,
  safetyFilter: true,
  tokenBudget: 8000,
};

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}/gi,
  /(?:token|secret|password)\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}/gi,
  /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"]?[A-Z0-9]{20,}/gi,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
  /(?:bearer|authorization)\s+eyJ[a-zA-Z0-9_-]+/gi,
];

export class ContextManager {
  private config: ContextConfig;
  private errorBuffer: Map<string, ContextItem> = new Map();
  private historyBuffer: ContextItem[] = [];
  private toolCallBuffer: ContextItem[] = [];

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async buildContext(
    threadId: string,
    options?: {
      prompt?: string;
      instructions?: string;
      ragDocs?: string[];
      memory?: string[];
    },
  ): Promise<ContextWindow> {
    const events = await threadRepository.getThreadEvents(threadId, this.config.maxHistoryEvents);
    const thread = await threadRepository.getThread(threadId);

    const context: ContextWindow = {
      system: this.buildSystemContext(options),
      state: this.buildStateContext(thread),
      history: this.buildHistoryContext(events),
      knowledge: this.buildKnowledgeContext(options),
      errors: this.buildErrorContext(),
      totalTokens: 0,
    };

    context.totalTokens = this.estimateTotalTokens(context);

    if (this.config.tokenBudget && context.totalTokens > this.config.tokenBudget) {
      this.optimizeForTokenBudget(context);
    }

    return context;
  }

  private buildSystemContext(options?: { prompt?: string; instructions?: string }): ContextItem[] {
    const items: ContextItem[] = [];

    if (options?.prompt) {
      items.push({
        type: "prompt",
        content: this.config.safetyFilter
          ? this.filterSensitiveData(options.prompt)
          : options.prompt,
        tokenEstimate: this.estimateTokens(options.prompt),
      });
    }

    if (options?.instructions) {
      items.push({
        type: "instruction",
        content: this.config.safetyFilter
          ? this.filterSensitiveData(options.instructions)
          : options.instructions,
        tokenEstimate: this.estimateTokens(options.instructions),
      });
    }

    return items;
  }

  private buildStateContext(
    thread: {
      status: string;
      currentPhase: string | null;
      metadata: Record<string, unknown> | null;
    } | null,
  ): ContextItem[] {
    if (!thread) return [];

    return [
      {
        type: "memory",
        content: JSON.stringify({
          status: thread.status,
          phase: thread.currentPhase,
          metadata: thread.metadata ?? {},
        }),
        tokenEstimate: this.estimateTokens(JSON.stringify(thread)),
      },
    ];
  }

  private buildHistoryContext(events: ThreadEvent[]): ContextItem[] {
    const items: ContextItem[] = [];

    for (const event of events) {
      const item: ContextItem = {
        type: "history",
        content: this.formatEvent(event),
        metadata: {
          eventType: event.eventType,
          timestamp: event.createdAt,
        },
        timestamp: event.createdAt,
        tokenEstimate: this.estimateTokens(JSON.stringify(event.payload)),
      };

      if (this.config.compressOldHistory && items.length > this.config.maxHistoryEvents / 2) {
        item.content = this.compressEvent(item.content);
      }

      items.push(item);
    }

    return items.slice(-this.config.maxHistoryEvents);
  }

  private buildKnowledgeContext(options?: {
    ragDocs?: string[];
    memory?: string[];
  }): ContextItem[] {
    const items: ContextItem[] = [];

    if (options?.ragDocs) {
      for (const doc of options.ragDocs.slice(0, this.config.maxRagDocs)) {
        items.push({
          type: "rag",
          content: this.config.safetyFilter ? this.filterSensitiveData(doc) : doc,
          tokenEstimate: this.estimateTokens(doc),
        });
      }
    }

    if (options?.memory) {
      for (const mem of options.memory.slice(0, this.config.maxMemoryItems)) {
        items.push({
          type: "memory",
          content: this.config.safetyFilter ? this.filterSensitiveData(mem) : mem,
          tokenEstimate: this.estimateTokens(mem),
        });
      }
    }

    return items;
  }

  private buildErrorContext(): ContextItem[] {
    const items: ContextItem[] = [];

    for (const [, error] of this.errorBuffer) {
      if (!error.resolved) {
        items.push(error);
      } else if (this.config.compressResolvedErrors) {
        items.push({
          type: "error",
          content: `[RESOLVED] ${error.content.substring(0, 100)}...`,
          metadata: error.metadata,
          timestamp: error.timestamp,
          resolved: true,
          tokenEstimate: 20,
        });
      }
    }

    return items;
  }

  addError(error: { id: string; content: string; metadata?: Record<string, unknown> }): void {
    this.errorBuffer.set(error.id, {
      type: "error",
      content: this.config.safetyFilter ? this.filterSensitiveData(error.content) : error.content,
      metadata: error.metadata,
      timestamp: new Date(),
      resolved: false,
      tokenEstimate: this.estimateTokens(error.content),
    });
  }

  resolveError(errorId: string): void {
    const error = this.errorBuffer.get(errorId);
    if (error) {
      error.resolved = true;
      this.errorBuffer.set(errorId, error);
    }
  }

  addToolCall(toolCall: {
    name: string;
    args: Record<string, unknown>;
    result: string;
    success: boolean;
  }): void {
    const content = JSON.stringify({
      tool: toolCall.name,
      args: toolCall.args,
      result: toolCall.result.substring(0, 500),
      success: toolCall.success,
    });

    this.toolCallBuffer.push({
      type: "tool_call",
      content: this.config.safetyFilter ? this.filterSensitiveData(content) : content,
      metadata: { success: toolCall.success },
      timestamp: new Date(),
      tokenEstimate: this.estimateTokens(content),
    });

    if (this.toolCallBuffer.length > this.config.maxToolCalls) {
      this.toolCallBuffer.shift();
    }
  }

  private formatEvent(event: ThreadEvent): string {
    const payload = event.payload as Record<string, unknown>;
    return `[${event.eventType}] ${JSON.stringify(payload)}`;
  }

  private compressEvent(content: string): string {
    if (content.length < 200) return content;
    return content.substring(0, 100) + "..." + content.substring(content.length - 100);
  }

  private filterSensitiveData(content: string): string {
    let filtered = content;
    for (const pattern of SENSITIVE_PATTERNS) {
      filtered = filtered.replace(pattern, (match) => {
        const keyPart = match.split(/[:=]/)[0];
        return `${keyPart}: [REDACTED]`;
      });
    }
    return filtered;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private estimateTotalTokens(context: ContextWindow): number {
    let total = 0;
    for (const section of [
      context.system,
      context.state,
      context.history,
      context.knowledge,
      context.errors,
    ]) {
      for (const item of section) {
        total += item.tokenEstimate ?? 0;
      }
    }
    return total;
  }

  private optimizeForTokenBudget(context: ContextWindow): void {
    const budget = this.config.tokenBudget ?? 8000;
    let current = this.estimateTotalTokens(context);

    if (current <= budget) return;

    while (current > budget) {
      const longestSection = this.findLongestSection(context);
      if (!longestSection || longestSection.length === 0) break;

      const lastItem = longestSection.pop();
      if (lastItem) {
        current -= lastItem.tokenEstimate ?? 0;
      }
    }
  }

  private findLongestSection(context: ContextWindow): ContextItem[] | null {
    const sections = [
      context.system,
      context.state,
      context.history,
      context.knowledge,
      context.errors,
    ];
    let longest: ContextItem[] | null = null;
    let maxTokens = 0;

    for (const section of sections) {
      const tokens = section.reduce((sum, item) => sum + (item.tokenEstimate ?? 0), 0);
      if (tokens > maxTokens) {
        maxTokens = tokens;
        longest = section;
      }
    }

    return longest;
  }

  serializeContext(context: ContextWindow): string {
    switch (this.config.format) {
      case "json":
        return this.serializeAsJson(context);
      case "markdown":
        return this.serializeAsMarkdown(context);
      case "hybrid":
      default:
        return this.serializeAsHybrid(context);
    }
  }

  private serializeAsJson(context: ContextWindow): string {
    return JSON.stringify(context, null, 2);
  }

  private serializeAsMarkdown(context: ContextWindow): string {
    let output = "# Context\n\n";

    if (context.system.length > 0) {
      output += "## System\n\n";
      for (const item of context.system) {
        output += `### ${item.type}\n\n${item.content}\n\n`;
      }
    }

    if (context.state.length > 0) {
      output += "## State\n\n";
      for (const item of context.state) {
        output += `${item.content}\n\n`;
      }
    }

    if (context.history.length > 0) {
      output += "## History\n\n";
      for (const item of context.history) {
        output += `- ${item.content}\n`;
      }
      output += "\n";
    }

    if (context.knowledge.length > 0) {
      output += "## Knowledge\n\n";
      for (const item of context.knowledge) {
        output += `### ${item.type}\n\n${item.content}\n\n`;
      }
    }

    if (context.errors.length > 0) {
      output += "## Errors\n\n";
      for (const item of context.errors) {
        output += `- ${item.content}\n`;
      }
      output += "\n";
    }

    return output;
  }

  private serializeAsHybrid(context: ContextWindow): string {
    let output = "";

    if (context.system.length > 0) {
      output += "<system>\n";
      for (const item of context.system) {
        output += `<${item.type}>${item.content}</${item.type}>\n`;
      }
      output += "</system>\n";
    }

    if (context.state.length > 0) {
      output += "<state>\n";
      for (const item of context.state) {
        output += `${item.content}\n`;
      }
      output += "</state>\n";
    }

    if (context.history.length > 0) {
      output += "<history>\n";
      for (const item of context.history) {
        output += `<event type="${item.metadata?.eventType ?? "unknown"}">${item.content}</event>\n`;
      }
      output += "</history>\n";
    }

    if (context.knowledge.length > 0) {
      output += "<knowledge>\n";
      for (const item of context.knowledge) {
        output += `<${item.type}>${item.content}</${item.type}>\n`;
      }
      output += "</knowledge>\n";
    }

    if (context.errors.length > 0) {
      output += "<errors>\n";
      for (const item of context.errors) {
        output += `<error resolved="${item.resolved ?? false}">${item.content}</error>\n`;
      }
      output += "</errors>\n";
    }

    return output;
  }

  getConfig(): ContextConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const contextManager = new ContextManager();
