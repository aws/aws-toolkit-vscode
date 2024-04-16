// smithy-typescript generated code
import { CodeWhispererStreamingServiceException as __BaseException } from "./CodeWhispererStreamingServiceException";
import {
  SENSITIVE_STRING,
  ExceptionOptionType as __ExceptionOptionType,
} from "@smithy/smithy-client";

/**
 * @public
 * @enum
 */
export const AccessDeniedExceptionReason = {
  UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS: "UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS",
} as const
/**
 * @public
 */
export type AccessDeniedExceptionReason = typeof AccessDeniedExceptionReason[keyof typeof AccessDeniedExceptionReason]

/**
 * @public
 * This exception is thrown when the user does not have sufficient access to perform this action.
 */
export class AccessDeniedException extends __BaseException {
  readonly name: "AccessDeniedException" = "AccessDeniedException";
  readonly $fault: "client" = "client";
  /**
   * @public
   * Reason for AccessDeniedException
   */
  reason?: AccessDeniedExceptionReason | string;

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
    this.reason = opts.reason;
  }
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
 * This exception is thrown when describing a resource that does not exist.
 */
export class ResourceNotFoundException extends __BaseException {
  readonly name: "ResourceNotFoundException" = "ResourceNotFoundException";
  readonly $fault: "client" = "client";
  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<ResourceNotFoundException, __BaseException>) {
    super({
      name: "ResourceNotFoundException",
      $fault: "client",
      ...opts
    });
    Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
  }
}

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
   * @public
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
 * Streaming Response Event for Assistant Markdown text message.
 */
export interface AssistantResponseEvent {
  /**
   * @public
   * The content of the text message in markdown format.
   */
  content: string | undefined;
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
   * @public
   * The content of the text message in markdown format.
   */
  content: string | undefined;

  /**
   * @public
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
   * @public
   * License name
   */
  licenseName?: string;

  /**
   * @public
   * Code Repsitory for the associated reference
   */
  repository?: string;

  /**
   * @public
   * Respository URL
   */
  url?: string;

  /**
   * @public
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
   * @public
   * URL of the web reference link
   */
  url: string | undefined;

  /**
   * @public
   * Title of the web reference link
   */
  title: string | undefined;

  /**
   * @public
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
   * @public
   * Unique identifier for the chat message
   */
  messageId?: string;

  /**
   * @public
   * The content of the text message in markdown format.
   */
  content: string | undefined;

  /**
   * @public
   * Web References
   */
  supplementaryWebLinks?: (SupplementaryWebLink)[];

  /**
   * @public
   * Code References
   */
  references?: (Reference)[];

  /**
   * @public
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
 * This exception is thrown when the action to perform could not be completed because the resource is in a conflicting state.
 */
export class ConflictException extends __BaseException {
  readonly name: "ConflictException" = "ConflictException";
  readonly $fault: "client" = "client";
  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>) {
    super({
      name: "ConflictException",
      $fault: "client",
      ...opts
    });
    Object.setPrototypeOf(this, ConflictException.prototype);
  }
}

/**
 * @public
 * Programming Languages supported by CodeWhisperer
 */
export interface ProgrammingLanguage {
  languageName: string | undefined;
}

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
   * @public
   * Content length of the binary payload
   */
  size?: number;

  /**
   * @public
   * Content type of the response
   */
  mimeType?: string;

  /**
   * @public
   * Content checksum of the binary payload
   */
  contentChecksum?: string;

  /**
   * @public
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
   * @public
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
   * @public
   * A human-readable string describing the source of the diagnostic
   */
  source: string | undefined;

  /**
   * @public
   * Diagnostic Error type
   */
  severity: DiagnosticSeverity | string | undefined;

  /**
   * @public
   * The diagnostic's message.
   */
  message: string | undefined;
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
   * @public
   * Name of the Document Symbol
   */
  name: string | undefined;

  /**
   * @public
   * Symbol type - DECLARATION / USAGE
   */
  type: SymbolType | string | undefined;

  /**
   * @public
   * Symbol package / source for FullyQualified names
   */
  source?: string;
}

/**
 * @public
 * Represents a Text Document / File
 */
export interface TextDocument {
  /**
   * @public
   * Filepath relative to the root of the workspace
   */
  relativeFilePath: string | undefined;

  /**
   * @public
   * The text document's language identifier.
   */
  programmingLanguage?: ProgrammingLanguage;

  /**
   * @public
   * Content of the text document
   */
  text?: string;

  /**
   * @public
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
   * @public
   * Line position in a document.
   */
  line: number | undefined;

  /**
   * @public
   * Character offset on a line in a document (zero-based)
   */
  character: number | undefined;
}

/**
 * @public
 * Indicates Range / Span in a Text Document
 */
export interface Range {
  /**
   * @public
   * The range's start position.
   */
  start: Position | undefined;

  /**
   * @public
   * The range's end position.
   */
  end: Position | undefined;
}

/**
 * @public
 * Structure to represent metadata about a TextDocument Diagnostic
 */
export interface TextDocumentDiagnostic {
  /**
   * @public
   * Represents a Text Document associated with Diagnostic
   */
  document: TextDocument | undefined;

  /**
   * @public
   * The range at which the message applies.
   */
  range: Range | undefined;

  /**
   * @public
   * A human-readable string describing the source of the diagnostic
   */
  source: string | undefined;

  /**
   * @public
   * Diagnostic Error type
   */
  severity: DiagnosticSeverity | string | undefined;

  /**
   * @public
   * The diagnostic's message.
   */
  message: string | undefined;
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
   * @public
   * Diagnostics originating from a TextDocument
   */
  export interface TextDocumentDiagnosticMember {
    textDocumentDiagnostic: TextDocumentDiagnostic;
    runtimeDiagnostic?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Diagnostics originating from a Runtime
   */
  export interface RuntimeDiagnosticMember {
    textDocumentDiagnostic?: never;
    runtimeDiagnostic: RuntimeDiagnostic;
    $unknown?: never;
  }

  /**
   * @public
   */
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
   * @public
   * Represents a cursor position in a Text Document
   */
  export interface PositionMember {
    position: Position;
    range?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Represents a text selection in a Text Document
   */
  export interface RangeMember {
    position?: never;
    range: Range;
    $unknown?: never;
  }

  /**
   * @public
   */
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
   * @public
   * Represents currently edited file
   */
  document?: TextDocument;

  /**
   * @public
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
   * @public
   * Editor state chat message context.
   */
  editorState?: EditorState;

  /**
   * @public
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
   * @public
   * The content of the chat message.
   */
  content: string | undefined;

  /**
   * @public
   * Chat message context associated with the Chat Message
   */
  userInputMessageContext?: UserInputMessageContext;

  /**
   * @public
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
   * @public
   * Structure to represent a chat input message from User
   */
  export interface UserInputMessageMember {
    userInputMessage: UserInputMessage;
    assistantResponseMessage?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Markdown text message.
   */
  export interface AssistantResponseMessageMember {
    userInputMessage?: never;
    assistantResponseMessage: AssistantResponseMessage;
    $unknown?: never;
  }

  /**
   * @public
   */
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
   * @public
   * Code References for Assistant Response Message
   */
  references?: (Reference)[];
}

/**
 * @public
 * Streaming Response Event for Followup Prompt.
 */
export interface FollowupPromptEvent {
  /**
   * @public
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
 * @enum
 */
export const InvalidStateReason = {
  INVALID_TASK_ASSIST_PLAN: "INVALID_TASK_ASSIST_PLAN",
} as const
/**
 * @public
 */
export type InvalidStateReason = typeof InvalidStateReason[keyof typeof InvalidStateReason]

/**
 * @public
 * Streaming Response Event when an Invalid State is reached
 */
export interface InvalidStateEvent {
  /**
   * @public
   * Reasons for Invalid State Event
   */
  reason: InvalidStateReason | string | undefined;

  message: string | undefined;
}

/**
 * @public
 * Streaming Response Event for AssistantResponse Metadata
 */
export interface MessageMetadataEvent {
  /**
   * @public
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
   * @public
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
  | ChatResponseStream.InvalidStateEventMember
  | ChatResponseStream.MessageMetadataEventMember
  | ChatResponseStream.SupplementaryWebLinksEventMember
  | ChatResponseStream.$UnknownMember

/**
 * @public
 */
export namespace ChatResponseStream {

  /**
   * @public
   * Message Metadata event
   */
  export interface MessageMetadataEventMember {
    messageMetadataEvent: MessageMetadataEvent;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Assistant response event - Text / Code snippet
   */
  export interface AssistantResponseEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent: AssistantResponseEvent;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Code References event
   */
  export interface CodeReferenceEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent: CodeReferenceEvent;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Web Reference links event
   */
  export interface SupplementaryWebLinksEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent: SupplementaryWebLinksEvent;
    followupPromptEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Followup prompt event
   */
  export interface FollowupPromptEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent: FollowupPromptEvent;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Invalid State event
   */
  export interface InvalidStateEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    invalidStateEvent: InvalidStateEvent;
    error?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Internal Server Exception
   */
  export interface ErrorMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    invalidStateEvent?: never;
    error: InternalServerException;
    $unknown?: never;
  }

  /**
   * @public
   */
  export interface $UnknownMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    messageMetadataEvent: (value: MessageMetadataEvent) => T;
    assistantResponseEvent: (value: AssistantResponseEvent) => T;
    codeReferenceEvent: (value: CodeReferenceEvent) => T;
    supplementaryWebLinksEvent: (value: SupplementaryWebLinksEvent) => T;
    followupPromptEvent: (value: FollowupPromptEvent) => T;
    invalidStateEvent: (value: InvalidStateEvent) => T;
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
    if (value.invalidStateEvent !== undefined) return visitor.invalidStateEvent(value.invalidStateEvent);
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
  if (obj.invalidStateEvent !== undefined) return {invalidStateEvent:
    obj.invalidStateEvent
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
   * @public
   * Unique identifier for the chat conversation stream
   */
  conversationId?: string;

  /**
   * @public
   * Holds the history of chat messages.
   */
  history?: (ChatMessage)[];

  /**
   * @public
   * Holds the current message being processed or displayed.
   */
  currentMessage: ChatMessage | undefined;

  /**
   * @public
   * Trigger Reason for Chat
   */
  chatTriggerType: ChatTriggerType | string | undefined;
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

export type TransformationExportContext = {
    downloadArtifactId: string
    downloadArtifactType: string
}
export type ExportContext = {
    transformationExportContext: TransformationExportContext
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
   * @public
   * Payload Part
   */
  export interface BinaryMetadataEventMember {
    binaryMetadataEvent: BinaryMetadataEvent;
    binaryPayloadEvent?: never;
    internalServerException?: never;
    $unknown?: never;
  }

  /**
   * @public
   * Payload Part
   */
  export interface BinaryPayloadEventMember {
    binaryMetadataEvent?: never;
    binaryPayloadEvent: BinaryPayloadEvent;
    internalServerException?: never;
    $unknown?: never;
  }

  /**
   * @public
   * This exception is thrown when an unexpected error occurred during the processing of a request.
   */
  export interface InternalServerExceptionMember {
    binaryMetadataEvent?: never;
    binaryPayloadEvent?: never;
    internalServerException: InternalServerException;
    $unknown?: never;
  }

  /**
   * @public
   */
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
 * Represents a Workspace state uploaded to S3 for Async Code Actions
 */
export interface WorkspaceState {
  /**
   * @public
   * Upload ID representing an Upload using a PreSigned URL
   */
  uploadId: string | undefined;

  /**
   * @public
   * Primary programming language of the Workspace
   */
  programmingLanguage: ProgrammingLanguage | undefined;

  /**
   * @public
   * Workspace context truncation schemes based on usecase
   */
  contextTruncationScheme?: ContextTruncationScheme | string;
}

/**
 * @public
 * Structure to represent a new generate assistant response request.
 */
export interface GenerateAssistantResponseRequest {
  /**
   * @public
   * Structure to represent the current state of a chat conversation.
   */
  conversationState: ConversationState | undefined;
}

/**
 * @internal
 */
export const GenerateAssistantResponseRequestFilterSensitiveLog = (obj: GenerateAssistantResponseRequest): any => ({
  ...obj,
  ...(obj.conversationState && { conversationState:
    ConversationStateFilterSensitiveLog(obj.conversationState)
  }),
})

/**
 * @public
 * Structure to represent generate assistant response response.
 */
export interface GenerateAssistantResponseResponse {
  /**
   * @public
   * ID which represents a multi-turn conversation
   */
  conversationId: string | undefined;

  /**
   * @public
   * Streaming events from UniDirectional Streaming Conversational APIs.
   */
  generateAssistantResponseResponse: AsyncIterable<ChatResponseStream> | undefined;
}

/**
 * @internal
 */
export const GenerateAssistantResponseResponseFilterSensitiveLog = (obj: GenerateAssistantResponseResponse): any => ({
  ...obj,
  ...(obj.generateAssistantResponseResponse && { generateAssistantResponseResponse:
    'STREAMING_CONTENT'
  }),
})

/**
 * @public
 * Structure to represent a new ExportResultArchive request.
 */
export interface ExportResultArchiveRequest {
  exportId: string | undefined;
  /**
   * @public
   * Export Intent
   */
  exportIntent: ExportIntent | string | undefined;
  exportContent?: ExportContext 
}

/**
 * @public
 * Structure to represent ExportResultArchive response.
 */
export interface ExportResultArchiveResponse {
  /**
   * @public
   * Response Stream
   */
  body: AsyncIterable<ResultArchiveStream> | undefined;
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
   * @public
   * Structure to represent the current state of a chat conversation.
   */
  conversationState: ConversationState | undefined;

  /**
   * @public
   * Represents a Workspace state uploaded to S3 for Async Code Actions
   */
  workspaceState: WorkspaceState | undefined;
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
   * @public
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
