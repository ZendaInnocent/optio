# Context Management Configuration

## Version

**v1.0.0**

## Format Options

| Parameter                | Type    | Default  | Description                                    |
| ------------------------ | ------- | -------- | ---------------------------------------------- |
| `format`                 | string  | "hybrid" | Output format: "json", "markdown", or "hybrid" |
| `maxHistoryEvents`       | number  | 20       | Maximum events in context window               |
| `maxToolCalls`           | number  | 10       | Maximum tool calls retained                    |
| `maxRagDocs`             | number  | 5        | Maximum RAG documents included                 |
| `maxMemoryItems`         | number  | 10       | Maximum memory items retained                  |
| `compressResolvedErrors` | boolean | true     | Compress resolved errors in context            |
| `compressOldHistory`     | boolean | true     | Compress older history entries                 |
| `safetyFilter`           | boolean | true     | Filter sensitive data from context             |
| `tokenBudget`            | number  | 8000     | Maximum tokens in context window               |

## Information Density

- **Structured**: Use XML-like tags for machine parsing
- **Compressed**: Older entries truncated to first/last 100 chars
- **Prioritized**: Most recent events kept, oldest dropped first

## Error Handling

- **Unresolved errors**: Full error details in context
- **Resolved errors**: Compressed to `[RESOLVED]` prefix + 100 chars
- **Auto-cleanup**: Resolved errors removed after N events

## Safety

- **API keys**: Redacted with `[REDACTED]`
- **Tokens**: JWT tokens redacted
- **Secrets**: Private keys, passwords redacted
- **Patterns**: Regex-based detection for common secret formats

## Token Efficiency

- **Estimation**: 1 token ≈ 4 characters
- **Budget enforcement**: Drop oldest items when over budget
- **Compression**: Long entries compressed before dropping
