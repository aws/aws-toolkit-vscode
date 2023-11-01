// smithy-typescript generated code
import { CodeWhispererStreamingServiceException as __BaseException } from "./CodeWhispererStreamingServiceException";
import {
  SENSITIVE_STRING,
  ExceptionOptionType as __ExceptionOptionType,
} from "@smithy/smithy-client";

/**
 * @public
 * This exception is thrown when the user does not have sufficient access to perform this action.
 */
export class AccessDeniedException extends __BaseException {
  readonly name: "AccessDeniedException" = "AccessDeniedException";
  readonly $fault: "client" = "client";
  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<AccessDeniedException, __BaseException>) {
    super({
      name: "AccessDeniedException",
      $fault: "client",
      ...opts
    });
    Object.setPrototypeOf(this, AccessDeniedException.prototype);
  }
}

/**
 * @public
 * Streaming Response Event for Assistant Markdown text message.
 */
export interface AssistantResponseEvent {
  /**
   * The content of the text message in markdown format.
   */
  content: string;
}

/**
 * @internal
 */
export const AssistantResponseEventFilterSensitiveLog = (obj: AssistantResponseEvent): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * @enum
 */
export const UserIntent = {
  /**
   * Apply Common Best Practices
   */
  APPLY_COMMON_BEST_PRACTICES: "APPLY_COMMON_BEST_PRACTICES",
  /**
   * Cite Sources
   */
  CITE_SOURCES: "CITE_SOURCES",
  /**
   * Explain Code Selection
   */
  EXPLAIN_CODE_SELECTION: "EXPLAIN_CODE_SELECTION",
  /**
   * Explain Code Line By Line
   */
  EXPLAIN_LINE_BY_LINE: "EXPLAIN_LINE_BY_LINE",
  /**
   * Improve Code
   */
  IMPROVE_CODE: "IMPROVE_CODE",
  /**
   * Show More Examples
   */
  SHOW_EXAMPLES: "SHOW_EXAMPLES",
  /**
   * Suggest Alternative Implementation
   */
  SUGGEST_ALTERNATE_IMPLEMENTATION: "SUGGEST_ALTERNATE_IMPLEMENTATION",
} as const
/**
 * @public
 */
export type UserIntent = typeof UserIntent[keyof typeof UserIntent]

/**
 * @public
 * Followup Prompt for the Assistant Response
 */
export interface FollowupPrompt {
  /**
   * The content of the text message in markdown format.
   */
  content: string;

  /**
   * User Intent
   */
  userIntent?: UserIntent | string;
}

/**
 * @internal
 */
export const FollowupPromptFilterSensitiveLog = (obj: FollowupPrompt): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * Represents span in a text
 */
export interface Span {
  start?: number;
  end?: number;
}

/**
 * @public
 * Code Reference / Repository details
 */
export interface Reference {
  /**
   * License name
   */
  licenseName?: string;

  /**
   * Code Repsitory for the associated reference
   */
  repository?: string;

  /**
   * Respository URL
   */
  url?: string;

  /**
   * Span / Range for the Reference
   */
  recommendationContentSpan?: Span;
}

/**
 * @public
 * Represents an additional reference link retured with the Chat message
 */
export interface SupplementaryWebLink {
  /**
   * URL of the web reference link
   */
  url: string;

  /**
   * Title of the web reference link
   */
  title: string;

  /**
   * Relevant text snippet from the link
   */
  snippet?: string;
}

/**
 * @internal
 */
export const SupplementaryWebLinkFilterSensitiveLog = (obj: SupplementaryWebLink): any => ({
  ...obj,
  ...(obj.url && { url:
    SENSITIVE_STRING
  }),
  ...(obj.title && { title:
    SENSITIVE_STRING
  }),
  ...(obj.snippet && { snippet:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * Markdown text message.
 */
export interface AssistantResponseMessage {
  /**
   * Unique identifier for the chat message
   */
  messageId?: string;

  /**
   * The content of the text message in markdown format.
   */
  content: string;

  /**
   * Web References
   */
  supplementaryWebLinks?: (SupplementaryWebLink)[];

  /**
   * Code References
   */
  references?: (Reference)[];

  /**
   * Followup Prompt
   */
  followupPrompt?: FollowupPrompt;
}

/**
 * @internal
 */
export const AssistantResponseMessageFilterSensitiveLog = (obj: AssistantResponseMessage): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
  ...(obj.supplementaryWebLinks && { supplementaryWebLinks:
    obj.supplementaryWebLinks.map(
      item =>
      SupplementaryWebLinkFilterSensitiveLog(item)
    )
  }),
  ...(obj.followupPrompt && { followupPrompt:
    FollowupPromptFilterSensitiveLog(obj.followupPrompt)
  }),
})

/**
 * @public
 * @enum
 */
export const ContentChecksumType = {
  SHA_256: "SHA_256",
} as const
/**
 * @public
 */
export type ContentChecksumType = typeof ContentChecksumType[keyof typeof ContentChecksumType]

/**
 * @public
 * Payload Part
 */
export interface BinaryMetadataEvent {
  /**
   * Content length of the binary payload
   */
  size?: number;

  /**
   * Content type of the response
   */
  mimeType?: string;

  /**
   * Content checksum of the binary payload
   */
  contentChecksum?: string;

  /**
   * Content checksum type of the binary payload
   */
  contentChecksumType?: ContentChecksumType | string;
}

/**
 * @internal
 */
export const BinaryMetadataEventFilterSensitiveLog = (obj: BinaryMetadataEvent): any => ({
  ...obj,
})

/**
 * @public
 * Payload Part
 */
export interface BinaryPayloadEvent {
  /**
   * Payload Part's body
   */
  bytes?: Uint8Array;
}

/**
 * @internal
 */
export const BinaryPayloadEventFilterSensitiveLog = (obj: BinaryPayloadEvent): any => ({
  ...obj,
  ...(obj.bytes && { bytes:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * @enum
 */
export const DiagnosticSeverity = {
  ERROR: "ERROR",
  HINT: "HINT",
  INFORMATION: "INFORMATION",
  WARNING: "WARNING",
} as const
/**
 * @public
 */
export type DiagnosticSeverity = typeof DiagnosticSeverity[keyof typeof DiagnosticSeverity]

/**
 * @public
 * Structure to represent metadata about a Runtime Diagnostics
 */
export interface RuntimeDiagnostic {
  /**
   * A human-readable string describing the source of the diagnostic
   */
  source: string;

  /**
   * Diagnostic Error type
   */
  severity: DiagnosticSeverity | string;

  /**
   * The diagnostic's message.
   */
  message: string;
}

/**
 * @internal
 */
export const RuntimeDiagnosticFilterSensitiveLog = (obj: RuntimeDiagnostic): any => ({
  ...obj,
  ...(obj.source && { source:
    SENSITIVE_STRING
  }),
  ...(obj.message && { message:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * @enum
 */
export const SymbolType = {
  DECLARATION: "DECLARATION",
  USAGE: "USAGE",
} as const
/**
 * @public
 */
export type SymbolType = typeof SymbolType[keyof typeof SymbolType]

/**
 * @public
 */
export interface DocumentSymbol {
  /**
   * Name of the Document Symbol
   */
  name: string;

  /**
   * Symbol type - DECLARATION / USAGE
   */
  type: SymbolType | string;

  /**
   * Symbol package / source for FullyQualified names
   */
  source?: string;
}

/**
 * @public
 * Programming Languages supported by CodeWhisperer
 */
export interface ProgrammingLanguage {
  languageName: string;
}

/**
 * @public
 * Represents a Text Document / File
 */
export interface TextDocument {
  /**
   * Filepath relative to the root of the workspace
   */
  relativeFilePath: string;

  /**
   * The text document's language identifier.
   */
  programmingLanguage?: ProgrammingLanguage;

  /**
   * Content of the text document
   */
  text?: string;

  /**
   * DocumentSymbols parsed from a text document
   */
  documentSymbols?: (DocumentSymbol)[];
}

/**
 * @internal
 */
export const TextDocumentFilterSensitiveLog = (obj: TextDocument): any => ({
  ...obj,
  ...(obj.relativeFilePath && { relativeFilePath:
    SENSITIVE_STRING
  }),
  ...(obj.text && { text:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * Indicates Cursor postion in a Text Document
 */
export interface Position {
  /**
   * Line position in a document.
   */
  line: number;

  /**
   * Character offset on a line in a document (zero-based)
   */
  character: number;
}

/**
 * @public
 * Indicates Range / Span in a Text Document
 */
export interface Range {
  /**
   * The range's start position.
   */
  start: Position;

  /**
   * The range's end position.
   */
  end: Position;
}

/**
 * @public
 * Structure to represent metadata about a TextDocument Diagnostic
 */
export interface TextDocumentDiagnostic {
  /**
   * Represents a Text Document associated with Diagnostic
   */
  document: TextDocument;

  /**
   * The range at which the message applies.
   */
  range: Range;

  /**
   * A human-readable string describing the source of the diagnostic
   */
  source: string;

  /**
   * Diagnostic Error type
   */
  severity: DiagnosticSeverity | string;

  /**
   * The diagnostic's message.
   */
  message: string;
}

/**
 * @internal
 */
export const TextDocumentDiagnosticFilterSensitiveLog = (obj: TextDocumentDiagnostic): any => ({
  ...obj,
  ...(obj.document && { document:
    TextDocumentFilterSensitiveLog(obj.document)
  }),
  ...(obj.source && { source:
    SENSITIVE_STRING
  }),
  ...(obj.message && { message:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * Represents a Diagnostic message
 */
export type Diagnostic =
  | Diagnostic.RuntimeDiagnosticMember
  | Diagnostic.TextDocumentDiagnosticMember
  | Diagnostic.$UnknownMember

/**
 * @public
 */
export namespace Diagnostic {

  /**
   * Diagnostics originating from a TextDocument
   */
  export interface TextDocumentDiagnosticMember {
    textDocumentDiagnostic: TextDocumentDiagnostic;
    runtimeDiagnostic?: never;
    $unknown?: never;
  }

  /**
   * Diagnostics originating from a Runtime
   */
  export interface RuntimeDiagnosticMember {
    textDocumentDiagnostic?: never;
    runtimeDiagnostic: RuntimeDiagnostic;
    $unknown?: never;
  }

  export interface $UnknownMember {
    textDocumentDiagnostic?: never;
    runtimeDiagnostic?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    textDocumentDiagnostic: (value: TextDocumentDiagnostic) => T;
    runtimeDiagnostic: (value: RuntimeDiagnostic) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: Diagnostic,
    visitor: Visitor<T>
  ): T => {
    if (value.textDocumentDiagnostic !== undefined) return visitor.textDocumentDiagnostic(value.textDocumentDiagnostic);
    if (value.runtimeDiagnostic !== undefined) return visitor.runtimeDiagnostic(value.runtimeDiagnostic);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const DiagnosticFilterSensitiveLog = (obj: Diagnostic): any => {
  if (obj.textDocumentDiagnostic !== undefined) return {textDocumentDiagnostic:
    TextDocumentDiagnosticFilterSensitiveLog(obj.textDocumentDiagnostic)
  };
  if (obj.runtimeDiagnostic !== undefined) return {runtimeDiagnostic:
    RuntimeDiagnosticFilterSensitiveLog(obj.runtimeDiagnostic)
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * @public
 * Represents the state of the Cursor in an Editor
 */
export type CursorState =
  | CursorState.PositionMember
  | CursorState.RangeMember
  | CursorState.$UnknownMember

/**
 * @public
 */
export namespace CursorState {

  /**
   * Represents a cursor position in a Text Document
   */
  export interface PositionMember {
    position: Position;
    range?: never;
    $unknown?: never;
  }

  /**
   * Represents a text selection in a Text Document
   */
  export interface RangeMember {
    position?: never;
    range: Range;
    $unknown?: never;
  }

  export interface $UnknownMember {
    position?: never;
    range?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    position: (value: Position) => T;
    range: (value: Range) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: CursorState,
    visitor: Visitor<T>
  ): T => {
    if (value.position !== undefined) return visitor.position(value.position);
    if (value.range !== undefined) return visitor.range(value.range);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}

/**
 * @public
 * Represents the state of an Editor
 */
export interface EditorState {
  /**
   * Represents currently edited file
   */
  document?: TextDocument;

  /**
   * Position of the cursor
   */
  cursorState?: CursorState;
}

/**
 * @internal
 */
export const EditorStateFilterSensitiveLog = (obj: EditorState): any => ({
  ...obj,
  ...(obj.document && { document:
    TextDocumentFilterSensitiveLog(obj.document)
  }),
  ...(obj.cursorState && { cursorState:
    obj.cursorState
  }),
})

/**
 * @public
 * Additional Chat message context associated with the Chat Message
 */
export interface UserInputMessageContext {
  /**
   * Editor state chat message context.
   */
  editorState?: EditorState;

  /**
   * Diagnostic chat message context.
   */
  diagnostic?: Diagnostic;
}

/**
 * @internal
 */
export const UserInputMessageContextFilterSensitiveLog = (obj: UserInputMessageContext): any => ({
  ...obj,
  ...(obj.editorState && { editorState:
    EditorStateFilterSensitiveLog(obj.editorState)
  }),
  ...(obj.diagnostic && { diagnostic:
    DiagnosticFilterSensitiveLog(obj.diagnostic)
  }),
})

/**
 * @public
 * Structure to represent a chat input message from User
 */
export interface UserInputMessage {
  /**
   * The content of the chat message.
   */
  content: string;

  /**
   * Chat message context associated with the Chat Message
   */
  userInputMessageContext?: UserInputMessageContext;

  /**
   * User Intent
   */
  userIntent?: UserIntent | string;
}

/**
 * @internal
 */
export const UserInputMessageFilterSensitiveLog = (obj: UserInputMessage): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
  ...(obj.userInputMessageContext && { userInputMessageContext:
    UserInputMessageContextFilterSensitiveLog(obj.userInputMessageContext)
  }),
})

/**
 * @public
 */
export type ChatMessage =
  | ChatMessage.AssistantResponseMessageMember
  | ChatMessage.UserInputMessageMember
  | ChatMessage.$UnknownMember

/**
 * @public
 */
export namespace ChatMessage {

  /**
   * Structure to represent a chat input message from User
   */
  export interface UserInputMessageMember {
    userInputMessage: UserInputMessage;
    assistantResponseMessage?: never;
    $unknown?: never;
  }

  /**
   * Markdown text message.
   */
  export interface AssistantResponseMessageMember {
    userInputMessage?: never;
    assistantResponseMessage: AssistantResponseMessage;
    $unknown?: never;
  }

  export interface $UnknownMember {
    userInputMessage?: never;
    assistantResponseMessage?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    userInputMessage: (value: UserInputMessage) => T;
    assistantResponseMessage: (value: AssistantResponseMessage) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: ChatMessage,
    visitor: Visitor<T>
  ): T => {
    if (value.userInputMessage !== undefined) return visitor.userInputMessage(value.userInputMessage);
    if (value.assistantResponseMessage !== undefined) return visitor.assistantResponseMessage(value.assistantResponseMessage);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const ChatMessageFilterSensitiveLog = (obj: ChatMessage): any => {
  if (obj.userInputMessage !== undefined) return {userInputMessage:
    UserInputMessageFilterSensitiveLog(obj.userInputMessage)
  };
  if (obj.assistantResponseMessage !== undefined) return {assistantResponseMessage:
    AssistantResponseMessageFilterSensitiveLog(obj.assistantResponseMessage)
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * @public
 * Streaming Response Event for CodeReferences
 */
export interface CodeReferenceEvent {
  /**
   * Code References for Assistant Response Message
   */
  references?: (Reference)[];
}

/**
 * @public
 * This exception is thrown when an unexpected error occurred during the processing of a request.
 */
export class InternalServerException extends __BaseException {
  readonly name: "InternalServerException" = "InternalServerException";
  readonly $fault: "server" = "server";
  $retryable = {
  };
  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<InternalServerException, __BaseException>) {
    super({
      name: "InternalServerException",
      $fault: "server",
      ...opts
    });
    Object.setPrototypeOf(this, InternalServerException.prototype);
  }
}

/**
 * @public
 * Streaming Response Event for Followup Prompt.
 */
export interface FollowupPromptEvent {
  /**
   * Followup Prompt for the Assistant Response
   */
  followupPrompt?: FollowupPrompt;
}

/**
 * @internal
 */
export const FollowupPromptEventFilterSensitiveLog = (obj: FollowupPromptEvent): any => ({
  ...obj,
  ...(obj.followupPrompt && { followupPrompt:
    FollowupPromptFilterSensitiveLog(obj.followupPrompt)
  }),
})

/**
 * @public
 * Streaming Response Event for AssistantResponse Metadata
 */
export interface MessageMetadataEvent {
  /**
   * Unique identifier for the conversation
   */
  conversationId?: string;
}

/**
 * @public
 * Streaming Response Event for SupplementaryWebLinks
 */
export interface SupplementaryWebLinksEvent {
  /**
   * Web References for Assistant Response Message
   */
  supplementaryWebLinks?: (SupplementaryWebLink)[];
}

/**
 * @internal
 */
export const SupplementaryWebLinksEventFilterSensitiveLog = (obj: SupplementaryWebLinksEvent): any => ({
  ...obj,
  ...(obj.supplementaryWebLinks && { supplementaryWebLinks:
    obj.supplementaryWebLinks.map(
      item =>
      SupplementaryWebLinkFilterSensitiveLog(item)
    )
  }),
})

/**
 * @public
 * Streaming events from UniDirectional Streaming Conversational APIs.
 */
export type ChatResponseStream =
  | ChatResponseStream.AssistantResponseEventMember
  | ChatResponseStream.CodeReferenceEventMember
  | ChatResponseStream.ErrorMember
  | ChatResponseStream.FollowupPromptEventMember
  | ChatResponseStream.MessageMetadataEventMember
  | ChatResponseStream.SupplementaryWebLinksEventMember
  | ChatResponseStream.$UnknownMember

/**
 * @public
 */
export namespace ChatResponseStream {

  /**
   * Message Metadata event
   */
  export interface MessageMetadataEventMember {
    messageMetadataEvent: MessageMetadataEvent;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Assistant response event - Text / Code snippet
   */
  export interface AssistantResponseEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent: AssistantResponseEvent;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Code References event
   */
  export interface CodeReferenceEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent: CodeReferenceEvent;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Web Reference links event
   */
  export interface SupplementaryWebLinksEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent: SupplementaryWebLinksEvent;
    followupPromptEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Followup prompt event
   */
  export interface FollowupPromptEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent: FollowupPromptEvent;
    error?: never;
    $unknown?: never;
  }

  /**
   * Internal Server Exception
   */
  export interface ErrorMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    error: InternalServerException;
    $unknown?: never;
  }

  export interface $UnknownMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    error?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    messageMetadataEvent: (value: MessageMetadataEvent) => T;
    assistantResponseEvent: (value: AssistantResponseEvent) => T;
    codeReferenceEvent: (value: CodeReferenceEvent) => T;
    supplementaryWebLinksEvent: (value: SupplementaryWebLinksEvent) => T;
    followupPromptEvent: (value: FollowupPromptEvent) => T;
    error: (value: InternalServerException) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: ChatResponseStream,
    visitor: Visitor<T>
  ): T => {
    if (value.messageMetadataEvent !== undefined) return visitor.messageMetadataEvent(value.messageMetadataEvent);
    if (value.assistantResponseEvent !== undefined) return visitor.assistantResponseEvent(value.assistantResponseEvent);
    if (value.codeReferenceEvent !== undefined) return visitor.codeReferenceEvent(value.codeReferenceEvent);
    if (value.supplementaryWebLinksEvent !== undefined) return visitor.supplementaryWebLinksEvent(value.supplementaryWebLinksEvent);
    if (value.followupPromptEvent !== undefined) return visitor.followupPromptEvent(value.followupPromptEvent);
    if (value.error !== undefined) return visitor.error(value.error);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const ChatResponseStreamFilterSensitiveLog = (obj: ChatResponseStream): any => {
  if (obj.messageMetadataEvent !== undefined) return {messageMetadataEvent:
    obj.messageMetadataEvent
  };
  if (obj.assistantResponseEvent !== undefined) return {assistantResponseEvent:
    AssistantResponseEventFilterSensitiveLog(obj.assistantResponseEvent)
  };
  if (obj.codeReferenceEvent !== undefined) return {codeReferenceEvent:
    obj.codeReferenceEvent
  };
  if (obj.supplementaryWebLinksEvent !== undefined) return {supplementaryWebLinksEvent:
    SupplementaryWebLinksEventFilterSensitiveLog(obj.supplementaryWebLinksEvent)
  };
  if (obj.followupPromptEvent !== undefined) return {followupPromptEvent:
    FollowupPromptEventFilterSensitiveLog(obj.followupPromptEvent)
  };
  if (obj.error !== undefined) return {error:
    obj.error
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * @public
 * @enum
 */
export const ChatTriggerType = {
  /**
   * Indicates the Chat was triggered in response to a IDE diagnostic
   */
  DIAGNOSTIC: "DIAGNOSTIC",
  /**
   * Indicates the Chat was triggered due to an explicit chat request by an end-user
   */
  MANUAL: "MANUAL",
} as const
/**
 * @public
 */
export type ChatTriggerType = typeof ChatTriggerType[keyof typeof ChatTriggerType]

/**
 * @public
 * @enum
 */
export const ContextTruncationScheme = {
  ANALYSIS: "ANALYSIS",
  GUMBY: "GUMBY",
} as const
/**
 * @public
 */
export type ContextTruncationScheme = typeof ContextTruncationScheme[keyof typeof ContextTruncationScheme]

/**
 * @public
 * Structure to represent the current state of a chat conversation.
 */
export interface ConversationState {
  /**
   * Unique identifier for the chat conversation stream
   */
  conversationId?: string;

  /**
   * Holds the history of chat messages.
   */
  history?: (ChatMessage)[];

  /**
   * Holds the current message being processed or displayed.
   */
  currentMessage: ChatMessage;

  /**
   * Trigger Reason for Chat
   */
  chatTriggerType: ChatTriggerType | string;
}

/**
 * @internal
 */
export const ConversationStateFilterSensitiveLog = (obj: ConversationState): any => ({
  ...obj,
  ...(obj.history && { history:
    obj.history.map(
      item =>
      ChatMessageFilterSensitiveLog(item)
    )
  }),
  ...(obj.currentMessage && { currentMessage:
    ChatMessageFilterSensitiveLog(obj.currentMessage)
  }),
})

/**
 * @public
 * @enum
 */
export const ExportIntent = {
  /**
   * Code Task Assist
   */
  TASK_ASSIST: "TASK_ASSIST",
  /**
   * Code Transformation
   */
  TRANSFORMATION: "TRANSFORMATION",
} as const
/**
 * @public
 */
export type ExportIntent = typeof ExportIntent[keyof typeof ExportIntent]

/**
 * @public
 * <Undocumented>
 */
export interface PayloadPart {
  /**
   * Model input and output as a binary large object
   */
  string?: string;
}

/**
 * @internal
 */
export const PayloadPartFilterSensitiveLog = (obj: PayloadPart): any => ({
  ...obj,
  ...(obj.string && { string:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * <Undocumented>
 */
export type ResponseStream =
  | ResponseStream.ChunkMember
  | ResponseStream.InternalServerExceptionMember
  | ResponseStream.$UnknownMember

/**
 * @public
 */
export namespace ResponseStream {

  /**
   * <Undocumented>
   */
  export interface ChunkMember {
    chunk: PayloadPart;
    internalServerException?: never;
    $unknown?: never;
  }

  /**
   * This exception is thrown when an unexpected error occurred during the processing of a request.
   */
  export interface InternalServerExceptionMember {
    chunk?: never;
    internalServerException: InternalServerException;
    $unknown?: never;
  }

  export interface $UnknownMember {
    chunk?: never;
    internalServerException?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    chunk: (value: PayloadPart) => T;
    internalServerException: (value: InternalServerException) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: ResponseStream,
    visitor: Visitor<T>
  ): T => {
    if (value.chunk !== undefined) return visitor.chunk(value.chunk);
    if (value.internalServerException !== undefined) return visitor.internalServerException(value.internalServerException);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const ResponseStreamFilterSensitiveLog = (obj: ResponseStream): any => {
  if (obj.chunk !== undefined) return {chunk:
    SENSITIVE_STRING
  };
  if (obj.internalServerException !== undefined) return {internalServerException:
    obj.internalServerException
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * @public
 * Response Stream
 */
export type ResultArchiveStream =
  | ResultArchiveStream.BinaryMetadataEventMember
  | ResultArchiveStream.BinaryPayloadEventMember
  | ResultArchiveStream.InternalServerExceptionMember
  | ResultArchiveStream.$UnknownMember

/**
 * @public
 */
export namespace ResultArchiveStream {

  /**
   * Payload Part
   */
  export interface BinaryMetadataEventMember {
    binaryMetadataEvent: BinaryMetadataEvent;
    binaryPayloadEvent?: never;
    internalServerException?: never;
    $unknown?: never;
  }

  /**
   * Payload Part
   */
  export interface BinaryPayloadEventMember {
    binaryMetadataEvent?: never;
    binaryPayloadEvent: BinaryPayloadEvent;
    internalServerException?: never;
    $unknown?: never;
  }

  /**
   * This exception is thrown when an unexpected error occurred during the processing of a request.
   */
  export interface InternalServerExceptionMember {
    binaryMetadataEvent?: never;
    binaryPayloadEvent?: never;
    internalServerException: InternalServerException;
    $unknown?: never;
  }

  export interface $UnknownMember {
    binaryMetadataEvent?: never;
    binaryPayloadEvent?: never;
    internalServerException?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    binaryMetadataEvent: (value: BinaryMetadataEvent) => T;
    binaryPayloadEvent: (value: BinaryPayloadEvent) => T;
    internalServerException: (value: InternalServerException) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: ResultArchiveStream,
    visitor: Visitor<T>
  ): T => {
    if (value.binaryMetadataEvent !== undefined) return visitor.binaryMetadataEvent(value.binaryMetadataEvent);
    if (value.binaryPayloadEvent !== undefined) return visitor.binaryPayloadEvent(value.binaryPayloadEvent);
    if (value.internalServerException !== undefined) return visitor.internalServerException(value.internalServerException);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const ResultArchiveStreamFilterSensitiveLog = (obj: ResultArchiveStream): any => {
  if (obj.binaryMetadataEvent !== undefined) return {binaryMetadataEvent:
    SENSITIVE_STRING
  };
  if (obj.binaryPayloadEvent !== undefined) return {binaryPayloadEvent:
    SENSITIVE_STRING
  };
  if (obj.internalServerException !== undefined) return {internalServerException:
    obj.internalServerException
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * @public
 * prompt or input to invoke the model
 */
export interface StartConversationRequest {
  /**
   * <Undocumented>
   */
  body: PayloadPart;
}

/**
 * @internal
 */
export const StartConversationRequestFilterSensitiveLog = (obj: StartConversationRequest): any => ({
  ...obj,
  ...(obj.body && { body:
    SENSITIVE_STRING
  }),
})

/**
 * @public
 * completion or output from the model
 */
export interface StartConversationResponse {
  /**
   * <Undocumented>
   */
  body: AsyncIterable<ResponseStream>;
}

/**
 * @internal
 */
export const StartConversationResponseFilterSensitiveLog = (obj: StartConversationResponse): any => ({
  ...obj,
  ...(obj.body && { body:
    'STREAMING_CONTENT'
  }),
})

/**
 * @public
 * This exception is thrown when request was denied due to request throttling.
 */
export class ThrottlingException extends __BaseException {
  readonly name: "ThrottlingException" = "ThrottlingException";
  readonly $fault: "client" = "client";
  $retryable = {
    throttling: true,
  };
  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<ThrottlingException, __BaseException>) {
    super({
      name: "ThrottlingException",
      $fault: "client",
      ...opts
    });
    Object.setPrototypeOf(this, ThrottlingException.prototype);
  }
}

/**
 * @public
 * @enum
 */
export const ValidationExceptionReason = {
  INVALID_CONVERSATION_ID: "INVALID_CONVERSATION_ID",
} as const
/**
 * @public
 */
export type ValidationExceptionReason = typeof ValidationExceptionReason[keyof typeof ValidationExceptionReason]

/**
 * @public
 * This exception is thrown when the input fails to satisfy the constraints specified by the service.
 */
export class ValidationException extends __BaseException {
  readonly name: "ValidationException" = "ValidationException";
  readonly $fault: "client" = "client";
  /**
   * Reason for ValidationException
   */
  reason?: ValidationExceptionReason | string;

  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<ValidationException, __BaseException>) {
    super({
      name: "ValidationException",
      $fault: "client",
      ...opts
    });
    Object.setPrototypeOf(this, ValidationException.prototype);
    this.reason = opts.reason;
  }
}

/**
 * @public
 * Represents a Workspace state uploaded to S3 for Async Code Actions
 */
export interface WorkspaceState {
  /**
   * Upload ID representing an Upload using a PreSigned URL
   */
  uploadId: string;

  /**
   * Primary programming language of the Workspace
   */
  programmingLanguage: ProgrammingLanguage;

  /**
   * Workspace context truncation schemes based on usecase
   */
  contextTruncationScheme?: ContextTruncationScheme | string;
}

/**
 * @public
 * Structure to represent a new chat request.
 */
export interface ChatRequest {
  /**
   * Structure to represent the current state of a chat conversation.
   */
  conversationState: ConversationState;
}

/**
 * @internal
 */
export const ChatRequestFilterSensitiveLog = (obj: ChatRequest): any => ({
  ...obj,
  ...(obj.conversationState && { conversationState:
    ConversationStateFilterSensitiveLog(obj.conversationState)
  }),
})

/**
 * @public
 * Structure to represent chat response.
 */
export interface ChatResponse {
  /**
   * Streaming events from UniDirectional Streaming Conversational APIs.
   */
  chatResponse: AsyncIterable<ChatResponseStream>;
}

/**
 * @internal
 */
export const ChatResponseFilterSensitiveLog = (obj: ChatResponse): any => ({
  ...obj,
  ...(obj.chatResponse && { chatResponse:
    'STREAMING_CONTENT'
  }),
})

/**
 * @public
 * Structure to represent a new ExportResultArchive request.
 */
export interface ExportResultArchiveRequest {
  exportId: string;
  /**
   * Export Intent
   */
  exportIntent: ExportIntent | string;
}

/**
 * @public
 * Structure to represent ExportResultArchive response.
 */
export interface ExportResultArchiveResponse {
  /**
   * Response Stream
   */
  body: AsyncIterable<ResultArchiveStream>;
}

/**
 * @internal
 */
export const ExportResultArchiveResponseFilterSensitiveLog = (obj: ExportResultArchiveResponse): any => ({
  ...obj,
  ...(obj.body && { body:
    'STREAMING_CONTENT'
  }),
})

/**
 * @public
 * Structure to represent execute planning interaction request.
 */
export interface GenerateTaskAssistPlanRequest {
  /**
   * Structure to represent the current state of a chat conversation.
   */
  conversationState: ConversationState;

  /**
   * Represents a Workspace state uploaded to S3 for Async Code Actions
   */
  workspaceState: WorkspaceState;
}

/**
 * @internal
 */
export const GenerateTaskAssistPlanRequestFilterSensitiveLog = (obj: GenerateTaskAssistPlanRequest): any => ({
  ...obj,
  ...(obj.conversationState && { conversationState:
    ConversationStateFilterSensitiveLog(obj.conversationState)
  }),
})

/**
 * @public
 * Structure to represent execute planning interaction response.
 */
export interface GenerateTaskAssistPlanResponse {
  /**
   * Streaming events from UniDirectional Streaming Conversational APIs.
   */
  planningResponseStream?: AsyncIterable<ChatResponseStream>;
}

/**
 * @internal
 */
export const GenerateTaskAssistPlanResponseFilterSensitiveLog = (obj: GenerateTaskAssistPlanResponse): any => ({
  ...obj,
  ...(obj.planningResponseStream && { planningResponseStream:
    'STREAMING_CONTENT'
  }),
})
