# Feature Specification: Kimi Code ↔ Codex transport adapter

**Created**: 2026-09-26  
**Status**: Implemented in this repository  
**Source baseline**: Kimi Code 2.1.1, `f67e6398fb3210ad8ace970e2dfd5bcc984ed61f`; Codex CLI 0.157.1, `36650394c5b38c2990ccf2a3457165ca3e9d9726`.  
**Coverage map**: [coverage.md](coverage.md). It explains every material mechanism and source limit. This specification includes the implementation contract without requiring prior chat context.

## User Scenarios & Testing

### User Story 1 — Kimi Responses provider (Priority: P1)

The owner configures Kimi Code `type = "openai_responses"` with the proxy `/v1` URL and a Codex model. Kimi sends its normal streamed OpenAI Responses request. The adapter prepares a native Codex Responses request, sends it through the same upstream transport path as Codex CLI, and returns events Kimi can parse.

**Why this priority**: This protocol most closely matches the native Codex request and is the primary bridge.  
**Independent acceptance**: With a Kimi-shaped request, the external SSE stream yields model text, tool calls, reasoning when present, usage and terminal status as they arrive; the upstream request has the required Codex fields and does not contain Kimi's output cap.

**Acceptance scenarios**:

1. Given a Kimi Responses request, when upstream sends text deltas, then the adapter forwards parseable `response.output_text.delta` frames before upstream completes.
2. Given tool and reasoning events, when upstream completes, then Kimi receives stable `call_id`, arguments, reasoning summary/encrypted content when present, usage and `response.completed`.
3. Given a later request with a provably compatible full Kimi history, when the same upstream socket and completed prior response are available, then the adapter sends only the new Codex input with `previous_response_id`.
4. Given history or request fields that do not match, when the next request arrives, then the adapter sends a full logical input without `previous_response_id`.

### User Story 2 — Kimi Chat Completions provider (Priority: P1)

The owner configures Kimi Code `type = "openai"`. Kimi keeps its own Chat request schema and receives streamed Chat chunks. Inside the adapter the request follows the same native Codex Responses transport as Story 1.

**Why this priority**: Both supported Kimi OpenAI provider modes must work without changing Kimi.  
**Independent acceptance**: A Kimi-shaped Chat request yields `chat.completion.chunk` frames with text, reasoning when present, indexed tool calls, finish reason and requested usage.

**Acceptance scenarios**:

1. Given system, developer, user, assistant and tool messages, when Kimi sends a Chat request, then the adapter maps them to native Codex instructions/input/tools without losing tool-call relationships.
2. Given upstream tool arguments arriving in parts, when the adapter emits Chat chunks, then Kimi reconstructs one call with its stable index, ID, name and arguments.
3. Given `stream_options.include_usage`, when upstream finishes, then the final Chat stream includes usage and `[DONE]`.

### User Story 3 — Codex transport continuity (Priority: P1)

For both external formats the adapter owns session, socket and turn state. It reuses a healthy upstream WebSocket, shortens only proven continuations, and uses the CLI's HTTP/SSE route when that route is required.

**Why this priority**: The request should be prepared and transported like the native CLI, including the latency-reducing continuation path.  
**Independent acceptance**: A missing turn token does not fail; a returned token is reused only within its turn; a broken continuation is resent as a full request on a valid transport.

**Acceptance scenarios**:

1. Given no `x-codex-turn-state`, when the first request starts, then the adapter omits the value and continues streaming normally.
2. Given a token received during the turn, when a related request follows, then the adapter repeats the first token; a new turn or auth owner does not inherit it.
3. Given `426 Upgrade Required` or exhausted applicable WebSocket retries, when transport selection runs, then it uses full-request HTTP/SSE with an idle event timeout.

### Edge Cases

- A completed prior response is required for `previous_response_id`; partial output, closed socket or unmatched history cannot justify a delta.
- Kimi normalizes streamed tool IDs and reserializes assistant history; matching `prompt_cache_key` alone is insufficient for a delta.
- The first turn-state token wins; no token is a valid state, not an error or fallback trigger.
- `previous_response_not_found` and an expired/closed WS connection require retry with a full logical request when retry is permitted.
- Kimi can send inline mp3/wav and remote audio file URLs in Responses, and audio/video content parts in Chat. Native Codex items have no video type; the adapter must not silently discard unsupported media. Remote audio URL acceptance by ChatGPT backend is not established by the CLI sources.
- Errors before an external stream starts use an HTTP error response; errors after it starts use a protocol error frame and end the stream.

## Requirements

### Functional Requirements

- **FR-001**: Provide one lightweight Rust executable. Expose only `POST /v1/responses` and `POST /v1/chat/completions` for Kimi Code 2.1.1. Kimi's ordinary OpenAI SDK schema and streaming calls remain unchanged; the adapter does not modify Kimi or Codex CLI.
- **FR-002**: For Responses requests accept the Kimi wire fields `model`, `instructions`, complete `input`, `tools`, `reasoning`, `include`, `text`, `prompt_cache_key`, `store:false`, `stream:true`, and model options Kimi actually sends. Preserve supported meaning in a native Codex `ResponsesApiRequest`. Reject unsupported nonempty content explicitly instead of discarding it.
- **FR-003**: For Chat requests map system/developer messages to native instructions, user/assistant/tool messages and calls/results to `ResponseItem` input, and supported reasoning/text options to native fields. Preserve `prompt_cache_key` in the upstream request and session affinity. Honor `stream_options.include_usage` in external output.
- **FR-004**: Accept and remove incoming Responses `max_output_tokens` and Chat `max_tokens`/`max_completion_tokens` before the Codex request. Do not truncate output or fabricate `response.incomplete` because of these limits. This is a deliberate bridge rule, so the external cap is not guaranteed.
- **FR-005**: Build the full native logical request before transport selection, with model, instructions, input, tools, tool choice, parallel tool calls, reasoning, `store:false`, `stream:true`, include encrypted reasoning, applicable service tier, prompt cache key, text and available client metadata. Use only values known from Kimi/config/auth; do not invent unsupported Codex internal context. Keep the full logical request even when WebSocket transmits a delta.
- **FR-006**: Use Codex Responses WebSocket v2 as the primary upstream path when the configured provider supports it and the session has not fallen back. Connect to `/responses`, send text `response.create`, and reuse a live compatible connection. The external Kimi connection remains HTTP/SSE or HTTP Chat chunks.
- **FR-007**: Keep a turn-scoped state token separate from the socket session. Initially omit `x-codex-turn-state`; capture the first valid value from the CLI-observed response header or WS metadata and repeat it only in related requests of that turn. Reset it for a new turn or auth owner. Absence never itself causes a retry, error or HTTP fallback.
- **FR-008**: Before using `previous_response_id`, require a completed prior response on the compatible live socket; compare native non-input request properties exactly as in Codex CLI; compare the beginning of the new native input against old input plus completed output items with the CLI's item equality rule. Send only the suffix if all checks pass. Otherwise send full input with no previous ID.
- **FR-009**: Because Kimi rebuilds history, hold both raw upstream records and the externally visible Kimi projection. Match the new external history against the expected Kimi projection before reconstructing native history and applying FR-008. Account for tool-ID normalization, reasoning, encrypted content, text joining and function-argument deltas. If matching is ambiguous, use the full native request.
- **FR-010**: Stream backend events without waiting for the whole response. For Responses emit Kimi-parseable text, item, function-argument, reasoning, terminal, usage and error SSE frames in order, ending with `[DONE]`. Preserve `call_id`, item identity, `encrypted_content` and valid argument assembly.
- **FR-011**: For Chat emit Kimi-parseable `chat.completion.chunk` frames with message ID, text, reasoning fields, indexed tool call ID/name/argument deltas, finish reason and final usage when requested, then `[DONE]`.
- **FR-012**: Follow Codex CLI transport selection: full-request `POST /responses` over HTTP/SSE if WS is disabled, receives `426`, or the applicable retry path exhausts its budget. Do not turn arbitrary WS errors into HTTP fallback. Parse both upstream transports incrementally; apply timeout to waiting for the next event, not the total duration of an active stream.
- **FR-013**: Distinguish preconnect (socket only) from prewarm (`response.create` with `generate:false`). Use either only when its prepared connection/response can actually serve the request; prewarm output is not user-visible generation.
- **FR-014**: Send Codex auth and applicable session/thread/request/compatibility headers as the CLI does. Reuse the canonical Codex `auth.json` for ChatGPT access and refresh it in place. An auth owner or revision change invalidates its socket and turn state. Do not change the file's secret location, format or values except the existing token refresh.
- **FR-015**: Convert Kimi inline mp3/wav `input_file.file_data` to native `input_audio.audio_url` data URI. The native field can carry a remote `file_url` string, but backend acceptance is unproven; forward a backend rejection to Kimi. Since Codex has no video item, never claim exact video conversion or silently drop video content.
- **FR-016**: Preserve the streaming error boundary: an error before the response starts is an HTTP error; after it starts, emit the corresponding protocol error event/chunk and terminate. Do not expose backend-only metadata as model text.
- **FR-017**: The adapter owns only outbound request construction, transport, state, and inbound event projection. Internal ChatGPT backend computation is outside this contract.

### Key Entities

- **External Kimi request**: One of two ordinary OpenAI provider payloads; identifies model, complete client history, tools, cache key and output format.
- **Logical Codex request**: Full native Responses representation before WS delta or HTTP transfer.
- **Socket session**: Current upstream connection plus auth owner/revision, routing headers, last complete logical request and completed response.
- **Turn state**: Optional first backend token that belongs to one inferred Kimi agent turn.
- **History projection**: The form Kimi receives and will send back, mapped to raw upstream item IDs, calls and response ID.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Both external Kimi provider modes complete a streaming text-and-tool exchange through the same native Codex request builder and upstream transport selection.
- **SC-002**: The first client text delta is forwarded before the backend terminal event; no whole-response buffering lies on the data path.
- **SC-003**: For each provably compatible continuation, the upstream WS request contains `previous_response_id` and only the new suffix. For an unproven continuation, it contains full input and no previous ID.
- **SC-004**: Missing turn state causes zero retries or transport changes by itself; a state value is never reused across different turns or auth owners.
- **SC-005**: The executable is one Rust binary using the pinned direct dependencies below. No fixed numerical latency or throughput equivalence is claimed without measurements; the performance target is the same preparation, connection reuse and streaming mechanism as Codex CLI.

## Assumptions and Scope Boundary

- The upstream Codex provider is reached through a valid ChatGPT Codex subscription in canonical `~/.codex/auth.json`. Model names and permitted access come from that account; the adapter cannot create access.
- Kimi Code is configured directly with its model and capabilities. No model-list route, resource API, client WebSocket or Kimi/Codex CLI source modification is requested.
- The referenced release commits, not moving `main`, define the source contract. Backend internals, undocumented media acceptance, arbitrary Kimi `extraParams`, and measured parity are not implied.
- The coverage map records source evidence; no unsupported field is made valid by merely forwarding it. Where Kimi and native Codex differ, the adapter translates or reports a precise unsupported input instead of claiming exact equivalence.

## Native Codex request and transport contract

The construction below is the **Codex CLI-facing** side of the adapter. [Native builder](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L888-L1005) constructs `ResponsesApiRequest`; [native structs](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/codex-api/src/common.rs#L259-L370) define the wire body. The adapter must follow those fields and rules, including default `tool_choice:"auto"`, `store:false`, `stream:true`, and `include:["reasoning.encrypted_content"]`. Model-aware reasoning defaults, supported summary, image detail, verbosity and JSON schema come from [builder](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L859-L1005), [image normalization](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client_common.rs#L59-L110) and [text controls](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/codex-api/src/common.rs#L374-L393). Only options derivable from Kimi/config can be translated; CLI-only Guardian, internal lineage, attestation and Responses Lite state must not be fabricated.

The adapter's public Responses payload is Kimi's [actual `responses.create` construction](https://github.com/MoonshotAI/kimi-code/blob/f67e6398fb3210ad8ace970e2dfd5bcc984ed61f/packages/agent-core-v2/src/human/llm/requester/bases/openai-responses/requester.ts#L68-L167). It contains full input and no `previous_response_id`; [Kimi's input lowering](https://github.com/MoonshotAI/kimi-code/blob/f67e6398fb3210ad8ace970e2dfd5bcc984ed61f/packages/agent-core-v2/src/human/llm/requester/bases/openai-responses/lower.ts#L1-L221) defines roles, text/image, reasoning, function calls/results and audio file items. Chat requests follow [Chat construction](https://github.com/MoonshotAI/kimi-code/blob/f67e6398fb3210ad8ace970e2dfd5bcc984ed61f/packages/agent-core-v2/src/human/llm/requester/bases/openai/requester.ts#L70-L190) and [message lowering](https://github.com/MoonshotAI/kimi-code/blob/f67e6398fb3210ad8ace970e2dfd5bcc984ed61f/packages/agent-core-v2/src/human/llm/requester/bases/openai/lower.ts#L1-L175). Translate on receipt; do not change either client schema.

On WS the adapter connects to upstream `/responses` with Codex auth, `session-id`, `thread-id`, `x-client-request-id`, originator and the `OpenAI-Beta: responses_websockets=2026-02-06` protocol header, and sends `type:"response.create"` as a text message. An ordinary generation omits `generate:false`. The turn token, when known, is sent in WS `client_metadata`; HTTP sends it as a header. [Handshake](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L1210-L1305), [WS request](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L1890-L2010), [turn token](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L2227-L2243). Session IDs are stable per Kimi session/cache key; thread/turn IDs are adapter-owned and never masquerade as Kimi's unsent internal turn ID.

For short continuation, compare all fields in [CLI's non-input comparison](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L330-L405): model, instructions, tools, tool choice, parallel calls, reasoning, store, stream, include, service tier, cache key, text. `stream_options`, `client_metadata`, `access_programs` do not block it. Then check [prefix and completed response](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L1381-L1445): the new native input starts with prior input plus completed output; tool-result metadata must match and only CLI's explicitly ignored internal metadata may differ. The exact previous response ID and items are stored only after [completion](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L2285-L2365). For Kimi's reserialized history, first verify its expected external projection, then restore native output items for this comparison; otherwise use the full request. Before send, apply the CLI's [item-ID/content-kind normalization](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L1008-L1017).

The [CLI stream selector](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L2120-L2180) prefers WS when supported. Its [retry rule](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/responses_retry.rs#L45-L145) uses the provider's retry budget; `426` switches to HTTP. WS `previous_response_not_found` is [retryable](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/codex-api/src/endpoint/responses_websocket.rs#L605-L650), but a retry must re-evaluate the connection and use full input if the previous ID is invalid. HTTP fallback is [full `POST /responses` with SSE](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/codex-api/src/endpoint/responses.rs#L75-L155); idle timeout measures the gap between events. Preconnect opens only a socket; prewarm sends `generate:false` and waits for completion [in CLI](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/client.rs#L2060-L2125).

The upstream event reader preserves `response.output_item.done`, `response.completed`, response ID, token usage, text/function/reasoning deltas, errors and turn metadata. Output projections follow [Kimi Responses parser](https://github.com/MoonshotAI/kimi-code/blob/f67e6398fb3210ad8ace970e2dfd5bcc984ed61f/packages/agent-core-v2/src/human/llm/requester/bases/openai-responses/format.ts#L507-L649) and [Chat parser](https://github.com/MoonshotAI/kimi-code/blob/f67e6398fb3210ad8ace970e2dfd5bcc984ed61f/packages/agent-core-v2/src/human/llm/requester/bases/openai/format.ts#L210-L327). SSE frames use `data: {JSON}\n\n`, ending with `data: [DONE]\n\n`; Chat uses `chat.completion.chunk` payloads. A backend event that has no Kimi user-facing equivalent remains in internal state, rather than becoming model text.

## Executable, authentication and direct libraries

The single binary accepts `--listen` (default `127.0.0.1:18080`), `--auth-json` (default `~/.codex/auth.json`), `--backend-base-url` (default `https://chatgpt.com/backend-api/codex`) and optional `--debug`. Debug mode writes incoming history, native requests, upstream events and projected downstream events as JSONL to a new file in the operating system's temporary directory and prints its path on startup. Kimi points `base_url` to the local `/v1` root and supplies its model config. The Kimi-only model alias `gpt-6-luna-fast` maps to upstream `gpt-6-luna` with `service_tier:"priority"` (Codex Fast), regardless of an incoming tier; other model names keep their existing tier handling. Upstream `auth.json` uses `auth_mode="chatgpt"`, `tokens.access_token`, and `account_id` directly or from JWT claims. Refresh writes the same canonical file; a 401 reloads it, and auth changes invalidate upstream state.

The implementation pins the following **direct** Rust dependencies with exact `=X.Y.Z` versions. The generated [Cargo.lock](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html) and three OS binaries are present in this component. The links are API usage guides for the implemented proxy.

| Library | Use and documentation |
|---|---|
| [`tokio =1.53.1`](https://docs.rs/tokio/1.53.1/tokio/) | Runtime, tasks, net/sync/time; `macros`, `rt-multi-thread`, `net`, `sync`, `time`. |
| [`axum =0.8.9`](https://docs.rs/axum/0.8.9/axum/) | Two HTTP routes; [SSE](https://docs.rs/axum/0.8.9/axum/response/sse/index.html). |
| [`tokio-tungstenite =0.29.0`](https://docs.rs/tokio-tungstenite/0.29.0/tokio_tungstenite/fn.connect_async.html) | Reused upstream WS with Codex headers; `rustls-tls-native-roots`. |
| [`reqwest =0.13.5`](https://docs.rs/reqwest/0.13.5/reqwest/struct.Client.html) | Reused HTTP client for fallback; [bytes_stream](https://docs.rs/reqwest/0.13.5/reqwest/struct.Response.html#method.bytes_stream), `stream`. |
| [`eventsource-stream =0.2.3`](https://docs.rs/eventsource-stream/0.2.3/eventsource_stream/) | Incremental HTTP SSE parsing. |
| [`futures-util =0.3.34`](https://docs.rs/futures-util/0.3.34/futures_util/) | `StreamExt`, `SinkExt` for backpressured streams. |
| [`serde =1.0.229`](https://docs.rs/serde/1.0.229/serde/) | Wire structures with `derive`. |
| [`serde_json =1.0.151`](https://docs.rs/serde_json/1.0.151/serde_json/) | JSON request/event conversion. |
| [`base64 =0.23.1`](https://docs.rs/base64/0.23.1/base64/engine/general_purpose/index.html) | URL-safe JWT payload decoding for account/expiry. |
| [`uuid =1.26.1`](https://docs.rs/uuid/1.26.1/uuid/struct.Uuid.html) | Own session/thread IDs; `v4`. |

This layout follows GitHub Spec Kit's [feature specification template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md): user stories, acceptance scenarios, edge cases, numbered requirements, entities and success criteria. Technical source detail and library choices stay in this same file because the user explicitly requires a self-contained implementation handoff; no separate plan/tasks artifacts are implied by this specification request.
