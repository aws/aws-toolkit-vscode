// smithy-typescript generated code
import { QDeveloperStreamingServiceException as __BaseException } from "./QDeveloperStreamingServiceException";
import {
  SENSITIVE_STRING,
  ExceptionOptionType as __ExceptionOptionType,
} from "@aws-sdk/smithy-client";

export enum AccessDeniedExceptionReason {
  UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS = "UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS",
}

/**
 * This exception is thrown when the user does not have sufficient access to perform this action.
 */
export class AccessDeniedException extends __BaseException {
  readonly name: "AccessDeniedException" = "AccessDeniedException";
  readonly $fault: "client" = "client";
  /**
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

export enum ThrottlingExceptionReason {
  MONTHLY_REQUEST_COUNT = "MONTHLY_REQUEST_COUNT",
}

/**
 * This exception is thrown when request was denied due to request throttling.
 */
export class ThrottlingException extends __BaseException {
  readonly name: "ThrottlingException" = "ThrottlingException";
  readonly $fault: "client" = "client";
  $retryable = {
    throttling: true,
  };
  /**
   * Reason for ThrottlingException
   */
  reason?: ThrottlingExceptionReason | string;

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
    this.reason = opts.reason;
  }
}

export enum ValidationExceptionReason {
  CONTENT_LENGTH_EXCEEDS_THRESHOLD = "CONTENT_LENGTH_EXCEEDS_THRESHOLD",
  INVALID_CONVERSATION_ID = "INVALID_CONVERSATION_ID",
  INVALID_KMS_GRANT = "INVALID_KMS_GRANT",
}

/**
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
 * Description of a user's context when they are calling Q Chat from AppStudio
 */
export interface AppStudioState {
  /**
   * The namespace of the context. Examples: 'ui.Button', 'ui.Table.DataSource', 'ui.Table.RowActions.Button', 'logic.invokeAWS', 'logic.JavaScript'
   */
  namespace: string;

  /**
   * The name of the property. Examples: 'visibility', 'disability', 'value', 'code'
   */
  propertyName: string;

  /**
   * The value of the property.
   */
  propertyValue?: string;

  /**
   * Context about how the property is used
   */
  propertyContext: string;
}

/**
 * @internal
 */
export const AppStudioStateFilterSensitiveLog = (obj: AppStudioState): any => ({
  ...obj,
  ...(obj.namespace && { namespace:
    SENSITIVE_STRING
  }),
  ...(obj.propertyName && { propertyName:
    SENSITIVE_STRING
  }),
  ...(obj.propertyValue && { propertyValue:
    SENSITIVE_STRING
  }),
  ...(obj.propertyContext && { propertyContext:
    SENSITIVE_STRING
  }),
})

/**
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

export enum UserIntent {
  /**
   * Apply Common Best Practices
   */
  APPLY_COMMON_BEST_PRACTICES = "APPLY_COMMON_BEST_PRACTICES",
  /**
   * Cite Sources
   */
  CITE_SOURCES = "CITE_SOURCES",
  /**
   * generate code
   */
  CODE_GENERATION = "CODE_GENERATION",
  /**
   * Explain Code Selection
   */
  EXPLAIN_CODE_SELECTION = "EXPLAIN_CODE_SELECTION",
  /**
   * Explain Code Line By Line
   */
  EXPLAIN_LINE_BY_LINE = "EXPLAIN_LINE_BY_LINE",
  /**
   * Generate CloudFormation Template
   */
  GENERATE_CLOUDFORMATION_TEMPLATE = "GENERATE_CLOUDFORMATION_TEMPLATE",
  /**
   * Generate Unit Tests
   */
  GENERATE_UNIT_TESTS = "GENERATE_UNIT_TESTS",
  /**
   * Improve Code
   */
  IMPROVE_CODE = "IMPROVE_CODE",
  /**
   * Show More Examples
   */
  SHOW_EXAMPLES = "SHOW_EXAMPLES",
  /**
   * Suggest Alternative Implementation
   */
  SUGGEST_ALTERNATE_IMPLEMENTATION = "SUGGEST_ALTERNATE_IMPLEMENTATION",
}

/**
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
 * Represents span in a text
 */
export interface Span {
  start?: number;
  end?: number;
}

/**
 * @internal
 */
export const SpanFilterSensitiveLog = (obj: Span): any => ({
  ...obj,
})

/**
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
 * @internal
 */
export const ReferenceFilterSensitiveLog = (obj: Reference): any => ({
  ...obj,
})

/**
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

export enum ConflictExceptionReason {
  CUSTOMER_KMS_KEY_DISABLED = "CUSTOMER_KMS_KEY_DISABLED",
  CUSTOMER_KMS_KEY_INVALID_KEY_POLICY = "CUSTOMER_KMS_KEY_INVALID_KEY_POLICY",
  MISMATCHED_KMS_KEY = "MISMATCHED_KMS_KEY",
}

/**
 * This exception is thrown when the action to perform could not be completed because the resource is in a conflicting state.
 */
export class ConflictException extends __BaseException {
  readonly name: "ConflictException" = "ConflictException";
  readonly $fault: "client" = "client";
  /**
   * Reason for ConflictException
   */
  reason?: ConflictExceptionReason | string;

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
    this.reason = opts.reason;
  }
}

/**
 * Programming Languages supported by CodeWhisperer
 */
export interface ProgrammingLanguage {
  languageName: string;
}

/**
 * @internal
 */
export const ProgrammingLanguageFilterSensitiveLog = (obj: ProgrammingLanguage): any => ({
  ...obj,
})

/**
 * Information about the state of the AWS management console page from which the user is calling
 */
export interface ConsoleState {
  region?: string;
  consoleUrl?: string;
  serviceId?: string;
  serviceConsolePage?: string;
  serviceSubconsolePage?: string;
  taskName?: string;
}

/**
 * @internal
 */
export const ConsoleStateFilterSensitiveLog = (obj: ConsoleState): any => ({
  ...obj,
  ...(obj.consoleUrl && { consoleUrl:
    SENSITIVE_STRING
  }),
  ...(obj.taskName && { taskName:
    SENSITIVE_STRING
  }),
})

export enum DiagnosticSeverity {
  ERROR = "ERROR",
  HINT = "HINT",
  INFORMATION = "INFORMATION",
  WARNING = "WARNING",
}

/**
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

export enum SymbolType {
  DECLARATION = "DECLARATION",
  USAGE = "USAGE",
}

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
 * @internal
 */
export const DocumentSymbolFilterSensitiveLog = (obj: DocumentSymbol): any => ({
  ...obj,
})

/**
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
 * @internal
 */
export const PositionFilterSensitiveLog = (obj: Position): any => ({
  ...obj,
})

/**
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
 * @internal
 */
export const RangeFilterSensitiveLog = (obj: Range): any => ({
  ...obj,
})

/**
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
 * Represents a Diagnostic message
 */
export type Diagnostic =
  | Diagnostic.RuntimeDiagnosticMember
  | Diagnostic.TextDocumentDiagnosticMember
  | Diagnostic.$UnknownMember

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
 * Represents the state of the Cursor in an Editor
 */
export type CursorState =
  | CursorState.PositionMember
  | CursorState.RangeMember
  | CursorState.$UnknownMember

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
 * @internal
 */
export const CursorStateFilterSensitiveLog = (obj: CursorState): any => {
  if (obj.position !== undefined) return {position:
    PositionFilterSensitiveLog(obj.position)
  };
  if (obj.range !== undefined) return {range:
    RangeFilterSensitiveLog(obj.range)
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * Represents an IDE retrieved relevant Text Document / File
 */
export interface RelevantTextDocument {
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
export const RelevantTextDocumentFilterSensitiveLog = (obj: RelevantTextDocument): any => ({
  ...obj,
  ...(obj.relativeFilePath && { relativeFilePath:
    SENSITIVE_STRING
  }),
  ...(obj.text && { text:
    SENSITIVE_STRING
  }),
})

/**
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

  /**
   * Represents IDE provided relevant files
   */
  relevantDocuments?: (RelevantTextDocument)[];

  /**
   * Whether service should use relevant document in prompt
   */
  useRelevantDocuments?: boolean;
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
    CursorStateFilterSensitiveLog(obj.cursorState)
  }),
  ...(obj.relevantDocuments && { relevantDocuments:
    obj.relevantDocuments.map(
      item =>
      RelevantTextDocumentFilterSensitiveLog(item)
    )
  }),
})

/**
 * An environment variable
 */
export interface EnvironmentVariable {
  /**
   * The key of an environment variable
   */
  key?: string;

  /**
   * The value of an environment variable
   */
  value?: string;
}

/**
 * @internal
 */
export const EnvironmentVariableFilterSensitiveLog = (obj: EnvironmentVariable): any => ({
  ...obj,
  ...(obj.key && { key:
    SENSITIVE_STRING
  }),
  ...(obj.value && { value:
    SENSITIVE_STRING
  }),
})

/**
 * State related to the user's environment
 */
export interface EnvState {
  /**
   * The name of the operating system in use
   */
  operatingSystem?: string;

  /**
   * The current working directory of the environment
   */
  currentWorkingDirectory?: string;

  /**
   * The environment variables set in the current environment
   */
  environmentVariables?: (EnvironmentVariable)[];

  /**
   * Local timezone offset of the client. For more information, see documentation https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
   */
  timezoneOffset?: number;
}

/**
 * @internal
 */
export const EnvStateFilterSensitiveLog = (obj: EnvState): any => ({
  ...obj,
  ...(obj.currentWorkingDirectory && { currentWorkingDirectory:
    SENSITIVE_STRING
  }),
  ...(obj.environmentVariables && { environmentVariables:
    obj.environmentVariables.map(
      item =>
      EnvironmentVariableFilterSensitiveLog(item)
    )
  }),
})

/**
 * State related to the Git VSC
 */
export interface GitState {
  /**
   * The output of the command `git status --porcelain=v1 -b`
   */
  status?: string;
}

/**
 * @internal
 */
export const GitStateFilterSensitiveLog = (obj: GitState): any => ({
  ...obj,
  ...(obj.status && { status:
    SENSITIVE_STRING
  }),
})

/**
 * An single entry in the shell history
 */
export interface ShellHistoryEntry {
  /**
   * The shell command that was run
   */
  command: string;

  /**
   * The directory the command was ran in
   */
  directory?: string;

  /**
   * The exit code of the command after it finished
   */
  exitCode?: number;

  /**
   * The stdout from the command
   */
  stdout?: string;

  /**
   * The stderr from the command
   */
  stderr?: string;
}

/**
 * @internal
 */
export const ShellHistoryEntryFilterSensitiveLog = (obj: ShellHistoryEntry): any => ({
  ...obj,
  ...(obj.command && { command:
    SENSITIVE_STRING
  }),
  ...(obj.directory && { directory:
    SENSITIVE_STRING
  }),
  ...(obj.stdout && { stdout:
    SENSITIVE_STRING
  }),
  ...(obj.stderr && { stderr:
    SENSITIVE_STRING
  }),
})

/**
 * Represents the state of a shell
 */
export interface ShellState {
  /**
   * The name of the current shell
   */
  shellName: string;

  /**
   * The history previous shell commands for the current shell
   */
  shellHistory?: (ShellHistoryEntry)[];
}

/**
 * @internal
 */
export const ShellStateFilterSensitiveLog = (obj: ShellState): any => ({
  ...obj,
  ...(obj.shellHistory && { shellHistory:
    obj.shellHistory.map(
      item =>
      ShellHistoryEntryFilterSensitiveLog(item)
    )
  }),
})

/**
 * Settings information passed by the Q widget
 */
export interface UserSettings {
  hasConsentedToCrossRegionCalls?: boolean;
}

/**
 * @internal
 */
export const UserSettingsFilterSensitiveLog = (obj: UserSettings): any => ({
  ...obj,
})

/**
 * Additional Chat message context associated with the Chat Message
 */
export interface UserInputMessageContext {
  /**
   * Editor state chat message context.
   */
  editorState?: EditorState;

  /**
   * Shell state chat message context.
   */
  shellState?: ShellState;

  /**
   * Git state chat message context.
   */
  gitState?: GitState;

  /**
   * Environment state chat message context.
   */
  envState?: EnvState;

  /**
   * The state of a user's AppStudio UI when sending a message.
   */
  appStudioContext?: AppStudioState;

  /**
   * Diagnostic chat message context.
   */
  diagnostic?: Diagnostic;

  /**
   * Contextual information about the environment from which the user is calling.
   */
  consoleState?: ConsoleState;

  /**
   * Settings information, e.g., whether the user has enabled cross-region API calls.
   */
  userSettings?: UserSettings;
}

/**
 * @internal
 */
export const UserInputMessageContextFilterSensitiveLog = (obj: UserInputMessageContext): any => ({
  ...obj,
  ...(obj.editorState && { editorState:
    EditorStateFilterSensitiveLog(obj.editorState)
  }),
  ...(obj.shellState && { shellState:
    ShellStateFilterSensitiveLog(obj.shellState)
  }),
  ...(obj.gitState && { gitState:
    GitStateFilterSensitiveLog(obj.gitState)
  }),
  ...(obj.envState && { envState:
    EnvStateFilterSensitiveLog(obj.envState)
  }),
  ...(obj.appStudioContext && { appStudioContext:
    AppStudioStateFilterSensitiveLog(obj.appStudioContext)
  }),
  ...(obj.diagnostic && { diagnostic:
    DiagnosticFilterSensitiveLog(obj.diagnostic)
  }),
  ...(obj.consoleState && { consoleState:
    ConsoleStateFilterSensitiveLog(obj.consoleState)
  }),
})

/**
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

export type ChatMessage =
  | ChatMessage.AssistantResponseMessageMember
  | ChatMessage.UserInputMessageMember
  | ChatMessage.$UnknownMember

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
 * Streaming response event for generated code text.
 */
export interface CodeEvent {
  /**
   * Generated code snippet.
   */
  content: string;
}

/**
 * @internal
 */
export const CodeEventFilterSensitiveLog = (obj: CodeEvent): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
})

/**
 * Streaming Response Event for CodeReferences
 */
export interface CodeReferenceEvent {
  /**
   * Code References for Assistant Response Message
   */
  references?: (Reference)[];
}

/**
 * @internal
 */
export const CodeReferenceEventFilterSensitiveLog = (obj: CodeReferenceEvent): any => ({
  ...obj,
})

/**
 * Streaming Response Event when DryRun is succeessful
 */
export interface DryRunSucceedEvent {
}

/**
 * @internal
 */
export const DryRunSucceedEventFilterSensitiveLog = (obj: DryRunSucceedEvent): any => ({
  ...obj,
})

/**
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

export enum IntentType {
  GLUE_SENSEI = "GLUE_SENSEI",
  RESOURCE_DATA = "RESOURCE_DATA",
  SUPPORT = "SUPPORT",
}

export type IntentDataType =
  | IntentDataType.StringMember
  | IntentDataType.$UnknownMember

export namespace IntentDataType {

  export interface StringMember {
    string: string;
    $unknown?: never;
  }

  export interface $UnknownMember {
    string?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    string: (value: string) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: IntentDataType,
    visitor: Visitor<T>
  ): T => {
    if (value.string !== undefined) return visitor.string(value.string);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const IntentDataTypeFilterSensitiveLog = (obj: IntentDataType): any => {
  if (obj.string !== undefined) return {string:
    obj.string
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * Streaming Response Event for Intents
 */
export interface IntentsEvent {
  /**
   * A map of Intent objects
   */
  intents?: Record<string, Record<string, IntentDataType>>;
}

/**
 * @internal
 */
export const IntentsEventFilterSensitiveLog = (obj: IntentsEvent): any => ({
  ...obj,
  ...(obj.intents && { intents:
    SENSITIVE_STRING
  }),
})

/**
 * For CloudWatch Troubleshooting Link Module
 */
export interface CloudWatchTroubleshootingLink {
  /**
   * A label for the link.
   */
  label: string;

  /**
   * Stringified JSON payload. See spec here https://code.amazon.com/packages/CloudWatchOdysseyModel/blobs/50c0832f0e393e4ab68827eb4f04d832366821c1/--/model/events.smithy#L28 .
   */
  investigationPayload: string;

  /**
   * Fallback string, if target channel does not support the CloudWatchTroubleshootingLink.
   */
  defaultText?: string;
}

/**
 * @internal
 */
export const CloudWatchTroubleshootingLinkFilterSensitiveLog = (obj: CloudWatchTroubleshootingLink): any => ({
  ...obj,
  ...(obj.label && { label:
    SENSITIVE_STRING
  }),
  ...(obj.investigationPayload && { investigationPayload:
    SENSITIVE_STRING
  }),
  ...(obj.defaultText && { defaultText:
    SENSITIVE_STRING
  }),
})

export interface ModuleLink {
  /**
   * For CloudWatch Troubleshooting Link Module
   */
  cloudWatchTroubleshootingLink?: CloudWatchTroubleshootingLink;
}

/**
 * @internal
 */
export const ModuleLinkFilterSensitiveLog = (obj: ModuleLink): any => ({
  ...obj,
  ...(obj.cloudWatchTroubleshootingLink && { cloudWatchTroubleshootingLink:
    CloudWatchTroubleshootingLinkFilterSensitiveLog(obj.cloudWatchTroubleshootingLink)
  }),
})

export interface WebLink {
  /**
   * A label for the link
   */
  label: string;

  /**
   * URL of the Weblink
   */
  url: string;
}

/**
 * @internal
 */
export const WebLinkFilterSensitiveLog = (obj: WebLink): any => ({
  ...obj,
  ...(obj.label && { label:
    SENSITIVE_STRING
  }),
  ...(obj.url && { url:
    SENSITIVE_STRING
  }),
})

export interface Action {
  webLink?: WebLink;
  moduleLink?: ModuleLink;
}

/**
 * @internal
 */
export const ActionFilterSensitiveLog = (obj: Action): any => ({
  ...obj,
  ...(obj.webLink && { webLink:
    WebLinkFilterSensitiveLog(obj.webLink)
  }),
  ...(obj.moduleLink && { moduleLink:
    ModuleLinkFilterSensitiveLog(obj.moduleLink)
  }),
})

/**
 * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
 */
export interface Text {
  /**
   * Contains text content that may include sensitive information and can support Markdown formatting.
   */
  content: string;
}

/**
 * @internal
 */
export const TextFilterSensitiveLog = (obj: Text): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
})

export interface AlertComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   */
  text?: Text;
}

/**
 * @internal
 */
export const AlertComponentFilterSensitiveLog = (obj: AlertComponent): any => ({
  ...obj,
  ...(obj.text && { text:
    TextFilterSensitiveLog(obj.text)
  }),
})

export enum AlertType {
  /**
   * Alert indicating an error or failure that requires attention.
   */
  ERROR = "ERROR",
  /**
   * Informational alert providing general information.
   */
  INFO = "INFO",
  /**
   * Alert indicating a warning or potential issue that should be noted.
   */
  WARNING = "WARNING",
}

/**
 * Structure representing an alert with a type and content.
 */
export interface Alert {
  /**
   * Enum defining types of alerts that can be issued.
   */
  type: AlertType | string;

  /**
   * Contains the content of the alert, which may include sensitive information.
   */
  content: (AlertComponent)[];
}

/**
 * @internal
 */
export const AlertFilterSensitiveLog = (obj: Alert): any => ({
  ...obj,
  ...(obj.content && { content:
    obj.content.map(
      item =>
      AlertComponentFilterSensitiveLog(item)
    )
  }),
})

/**
 * Structure describing a transition between two states in an infrastructure update.
 */
export interface InfrastructureUpdateTransition {
  /**
   * The current state of the infrastructure before the update.
   */
  currentState: string;

  /**
   * The next state of the infrastructure following the update.
   */
  nextState: string;
}

/**
 * @internal
 */
export const InfrastructureUpdateTransitionFilterSensitiveLog = (obj: InfrastructureUpdateTransition): any => ({
  ...obj,
  ...(obj.currentState && { currentState:
    SENSITIVE_STRING
  }),
  ...(obj.nextState && { nextState:
    SENSITIVE_STRING
  }),
})

/**
 * Structure representing different types of infrastructure updates.
 */
export interface InfrastructureUpdate {
  /**
   * Structure describing a transition between two states in an infrastructure update.
   */
  transition?: InfrastructureUpdateTransition;
}

/**
 * @internal
 */
export const InfrastructureUpdateFilterSensitiveLog = (obj: InfrastructureUpdate): any => ({
  ...obj,
  ...(obj.transition && { transition:
    InfrastructureUpdateTransitionFilterSensitiveLog(obj.transition)
  }),
})

export interface StepComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   */
  text?: Text;
}

/**
 * @internal
 */
export const StepComponentFilterSensitiveLog = (obj: StepComponent): any => ({
  ...obj,
  ...(obj.text && { text:
    TextFilterSensitiveLog(obj.text)
  }),
})

export enum StepState {
  /**
   * Indicates a failure or issue that needs to be addressed.
   */
  FAILED = "FAILED",
  /**
   * Indicates that the step is currently being processed. This is a non-terminal state, meaning the process is active and ongoing.
   */
  IN_PROGRESS = "IN_PROGRESS",
  /**
   * Indicates that the step is being loaded or initialized. This is a non-terminal state, meaning the process is in the setup phase.
   */
  LOADING = "LOADING",
  /**
   * Indicates that the step is temporarily halted but can resume. This is a non-terminal state, representing a temporary pause.
   */
  PAUSED = "PAUSED",
  /**
   * Indicates that the step is waiting for some condition or input. This is a non-terminal state, meaning the process is paused but not complete.
   */
  PENDING = "PENDING",
  /**
   * Indicates that the step was stopped, either intentionally or unintentionally.
   */
  STOPPED = "STOPPED",
  /**
   * Indicates successful completion of the step.
   */
  SUCCEEDED = "SUCCEEDED",
}

/**
 * Structure representing an individual step in a process.
 */
export interface Step {
  /**
   * A unique identifier for the step. It must be a non-negative integer to ensure each step is distinct.
   */
  id: number;

  /**
   * Enum representing all possible step states, combining terminal and non-terminal states.
   */
  state: StepState | string;

  /**
   * A label for the step, providing a concise description.
   */
  label: string;

  /**
   * Optional content providing additional details about the step.
   */
  content?: (StepComponent)[];
}

/**
 * @internal
 */
export const StepFilterSensitiveLog = (obj: Step): any => ({
  ...obj,
  ...(obj.label && { label:
    SENSITIVE_STRING
  }),
  ...(obj.content && { content:
    obj.content.map(
      item =>
      StepComponentFilterSensitiveLog(item)
    )
  }),
})

export interface ProgressComponent {
  /**
   * Structure representing an individual step in a process.
   */
  step?: Step;
}

/**
 * @internal
 */
export const ProgressComponentFilterSensitiveLog = (obj: ProgressComponent): any => ({
  ...obj,
  ...(obj.step && { step:
    StepFilterSensitiveLog(obj.step)
  }),
})

/**
 * Structure representing a collection of steps in a process.
 */
export interface Progress {
  /**
   * A collection of steps that make up a process. Each step is detailed using the Step structure.
   */
  content: (ProgressComponent)[];
}

/**
 * @internal
 */
export const ProgressFilterSensitiveLog = (obj: Progress): any => ({
  ...obj,
  ...(obj.content && { content:
    obj.content.map(
      item =>
      ProgressComponentFilterSensitiveLog(item)
    )
  }),
})

/**
 * Structure representing a resource item
 */
export interface Resource {
  /**
   * Card title.
   */
  title: string;

  /**
   * Link for the resource item
   */
  link: string;

  /**
   * Short text about that resource for example Region: us-east-1
   */
  description: string;

  /**
   * Resource type e.g AWS EC2
   */
  type: string;

  /**
   * Amazon resource number e.g arn:aws:aec:.....
   */
  ARN: string;

  /**
   * A stringified object
   */
  resourceJsonString: string;
}

/**
 * @internal
 */
export const ResourceFilterSensitiveLog = (obj: Resource): any => ({
  ...obj,
  ...(obj.title && { title:
    SENSITIVE_STRING
  }),
  ...(obj.link && { link:
    SENSITIVE_STRING
  }),
  ...(obj.description && { description:
    SENSITIVE_STRING
  }),
  ...(obj.type && { type:
    SENSITIVE_STRING
  }),
  ...(obj.ARN && { ARN:
    SENSITIVE_STRING
  }),
  ...(obj.resourceJsonString && { resourceJsonString:
    SENSITIVE_STRING
  }),
})

/**
 * Structure representing a list of Items
 */
export interface ResourceList {
  /**
   * Action associated with the list
   */
  action?: Action;

  /**
   * List of resources
   */
  items: (Resource)[];
}

/**
 * @internal
 */
export const ResourceListFilterSensitiveLog = (obj: ResourceList): any => ({
  ...obj,
  ...(obj.action && { action:
    ActionFilterSensitiveLog(obj.action)
  }),
  ...(obj.items && { items:
    obj.items.map(
      item =>
      ResourceFilterSensitiveLog(item)
    )
  }),
})

export interface SectionComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   */
  text?: Text;

  /**
   * Structure representing an alert with a type and content.
   */
  alert?: Alert;

  /**
   * Structure representing a resource item
   */
  resource?: Resource;

  /**
   * Structure representing a list of Items
   */
  resourceList?: ResourceList;
}

/**
 * @internal
 */
export const SectionComponentFilterSensitiveLog = (obj: SectionComponent): any => ({
  ...obj,
  ...(obj.text && { text:
    TextFilterSensitiveLog(obj.text)
  }),
  ...(obj.alert && { alert:
    AlertFilterSensitiveLog(obj.alert)
  }),
  ...(obj.resource && { resource:
    ResourceFilterSensitiveLog(obj.resource)
  }),
  ...(obj.resourceList && { resourceList:
    ResourceListFilterSensitiveLog(obj.resourceList)
  }),
})

/**
 * Structure representing a collapsable section
 */
export interface Section {
  /**
   * Contains text content that may include sensitive information and can support Markdown formatting.
   */
  title: string;

  /**
   * Contains a list of interaction components e.g Text, Alert, List, etc.
   */
  content: (SectionComponent)[];

  /**
   * Action associated with the Section
   */
  action?: Action;
}

/**
 * @internal
 */
export const SectionFilterSensitiveLog = (obj: Section): any => ({
  ...obj,
  ...(obj.title && { title:
    SENSITIVE_STRING
  }),
  ...(obj.content && { content:
    obj.content.map(
      item =>
      SectionComponentFilterSensitiveLog(item)
    )
  }),
  ...(obj.action && { action:
    ActionFilterSensitiveLog(obj.action)
  }),
})

/**
 * Structure representing a suggestion for follow-ups.
 */
export interface Suggestion {
  value: string;
}

/**
 * @internal
 */
export const SuggestionFilterSensitiveLog = (obj: Suggestion): any => ({
  ...obj,
  ...(obj.value && { value:
    SENSITIVE_STRING
  }),
})

/**
 * Structure containing a list of suggestions.
 */
export interface Suggestions {
  items: (Suggestion)[];
}

/**
 * @internal
 */
export const SuggestionsFilterSensitiveLog = (obj: Suggestions): any => ({
  ...obj,
  ...(obj.items && { items:
    obj.items.map(
      item =>
      SuggestionFilterSensitiveLog(item)
    )
  }),
})

/**
 * Structure representing a confirmation message related to a task action.
 */
export interface TaskActionConfirmation {
  /**
   * Confirmation message related to the action note, which may include sensitive information.
   */
  content?: string;
}

/**
 * @internal
 */
export const TaskActionConfirmationFilterSensitiveLog = (obj: TaskActionConfirmation): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
})

export enum TaskActionNoteType {
  /**
   * Information note providing general details.
   */
  INFO = "INFO",
  /**
   * Warning note indicating a potential issue.
   */
  WARNING = "WARNING",
}

/**
 * Structure representing a note associated with a task action.
 */
export interface TaskActionNote {
  /**
   * Content of the note, which may include sensitive information.
   */
  content: string;

  /**
   * Enum defining the types of notes that can be associated with a task action.
   */
  type?: TaskActionNoteType | string;
}

/**
 * @internal
 */
export const TaskActionNoteFilterSensitiveLog = (obj: TaskActionNote): any => ({
  ...obj,
  ...(obj.content && { content:
    SENSITIVE_STRING
  }),
})

/**
 * Structure representing an action associated with a task.
 */
export interface TaskAction {
  /**
   * A label for the action.
   */
  label: string;

  /**
   * Structure representing a note associated with a task action.
   */
  note?: TaskActionNote;

  /**
   * Indicates whether the action is primary or not.
   */
  primary?: boolean;

  /**
   * Indicates whether the action is disabled or not.
   */
  disabled?: boolean;

  /**
   * Map representing key-value pairs for the payload of a task action.
   */
  payload: Record<string, string>;

  /**
   * Structure representing a confirmation message related to a task action.
   */
  confirmation?: TaskActionConfirmation;
}

/**
 * @internal
 */
export const TaskActionFilterSensitiveLog = (obj: TaskAction): any => ({
  ...obj,
  ...(obj.label && { label:
    SENSITIVE_STRING
  }),
  ...(obj.note && { note:
    TaskActionNoteFilterSensitiveLog(obj.note)
  }),
  ...(obj.payload && { payload:
    SENSITIVE_STRING
  }),
  ...(obj.confirmation && { confirmation:
    TaskActionConfirmationFilterSensitiveLog(obj.confirmation)
  }),
})

/**
 * Structure representing different types of components that can be part of a task.
 */
export interface TaskComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   */
  text?: Text;

  /**
   * Structure representing different types of infrastructure updates.
   */
  infrastructureUpdate?: InfrastructureUpdate;

  /**
   * Structure representing an alert with a type and content.
   */
  alert?: Alert;

  /**
   * Structure representing a collection of steps in a process.
   */
  progress?: Progress;
}

/**
 * @internal
 */
export const TaskComponentFilterSensitiveLog = (obj: TaskComponent): any => ({
  ...obj,
  ...(obj.text && { text:
    TextFilterSensitiveLog(obj.text)
  }),
  ...(obj.infrastructureUpdate && { infrastructureUpdate:
    InfrastructureUpdateFilterSensitiveLog(obj.infrastructureUpdate)
  }),
  ...(obj.alert && { alert:
    AlertFilterSensitiveLog(obj.alert)
  }),
  ...(obj.progress && { progress:
    ProgressFilterSensitiveLog(obj.progress)
  }),
})

/**
 * Structure representing an overview of a task, including a label and description.
 */
export interface TaskOverview {
  /**
   * A label for the task overview.
   */
  label: string;

  /**
   * Text description providing details about the task. This field may include sensitive information and supports Markdown formatting.
   */
  description: string;
}

/**
 * @internal
 */
export const TaskOverviewFilterSensitiveLog = (obj: TaskOverview): any => ({
  ...obj,
  ...(obj.label && { label:
    SENSITIVE_STRING
  }),
  ...(obj.description && { description:
    SENSITIVE_STRING
  }),
})

/**
 * Structure containing details about a task.
 */
export interface TaskDetails {
  /**
   * Structure representing an overview of a task, including a label and description.
   */
  overview: TaskOverview;

  /**
   * Lists the components that can be used to form the task's content.
   */
  content: (TaskComponent)[];

  /**
   * Optional list of actions associated with the task.
   */
  actions?: (TaskAction)[];
}

/**
 * @internal
 */
export const TaskDetailsFilterSensitiveLog = (obj: TaskDetails): any => ({
  ...obj,
  ...(obj.overview && { overview:
    TaskOverviewFilterSensitiveLog(obj.overview)
  }),
  ...(obj.content && { content:
    obj.content.map(
      item =>
      TaskComponentFilterSensitiveLog(item)
    )
  }),
  ...(obj.actions && { actions:
    obj.actions.map(
      item =>
      TaskActionFilterSensitiveLog(item)
    )
  }),
})

/**
 * Structure representing a reference to a task.
 */
export interface TaskReference {
  /**
   * Unique identifier for the task.
   */
  taskId: string;
}

/**
 * @internal
 */
export const TaskReferenceFilterSensitiveLog = (obj: TaskReference): any => ({
  ...obj,
})

/**
 * Structure representing different types of interaction components.
 */
export interface InteractionComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   */
  text?: Text;

  /**
   * Structure representing an alert with a type and content.
   */
  alert?: Alert;

  /**
   * Structure representing different types of infrastructure updates.
   */
  infrastructureUpdate?: InfrastructureUpdate;

  /**
   * Structure representing a collection of steps in a process.
   */
  progress?: Progress;

  /**
   * Structure representing an individual step in a process.
   */
  step?: Step;

  /**
   * Structure containing details about a task.
   */
  taskDetails?: TaskDetails;

  /**
   * Structure representing a reference to a task.
   */
  taskReference?: TaskReference;

  /**
   * Structure containing a list of suggestions.
   */
  suggestions?: Suggestions;

  /**
   * Structure representing a collapsable section
   */
  section?: Section;

  /**
   * Structure representing a resource item
   */
  resource?: Resource;

  /**
   * Structure representing a list of Items
   */
  resourceList?: ResourceList;

  action?: Action;
}

/**
 * @internal
 */
export const InteractionComponentFilterSensitiveLog = (obj: InteractionComponent): any => ({
  ...obj,
  ...(obj.text && { text:
    TextFilterSensitiveLog(obj.text)
  }),
  ...(obj.alert && { alert:
    AlertFilterSensitiveLog(obj.alert)
  }),
  ...(obj.infrastructureUpdate && { infrastructureUpdate:
    InfrastructureUpdateFilterSensitiveLog(obj.infrastructureUpdate)
  }),
  ...(obj.progress && { progress:
    ProgressFilterSensitiveLog(obj.progress)
  }),
  ...(obj.step && { step:
    StepFilterSensitiveLog(obj.step)
  }),
  ...(obj.taskDetails && { taskDetails:
    TaskDetailsFilterSensitiveLog(obj.taskDetails)
  }),
  ...(obj.suggestions && { suggestions:
    SuggestionsFilterSensitiveLog(obj.suggestions)
  }),
  ...(obj.section && { section:
    SectionFilterSensitiveLog(obj.section)
  }),
  ...(obj.resource && { resource:
    ResourceFilterSensitiveLog(obj.resource)
  }),
  ...(obj.resourceList && { resourceList:
    ResourceListFilterSensitiveLog(obj.resourceList)
  }),
  ...(obj.action && { action:
    ActionFilterSensitiveLog(obj.action)
  }),
})

/**
 * Interaction component with an identifier
 */
export interface InteractionComponentEntry {
  /**
   * Identifier that can uniquely identify the interaction component within
   *         stream response. This field is optional.
   */
  interactionComponentId?: string;

  /**
   * Interaction component
   */
  interactionComponent: InteractionComponent;
}

/**
 * @internal
 */
export const InteractionComponentEntryFilterSensitiveLog = (obj: InteractionComponentEntry): any => ({
  ...obj,
  ...(obj.interactionComponent && { interactionComponent:
    InteractionComponentFilterSensitiveLog(obj.interactionComponent)
  }),
})

/**
 * Streaming Event for interaction components list
 */
export interface InteractionComponentsEvent {
  /**
   * List of identifiable interaction components
   */
  interactionComponentEntries: (InteractionComponentEntry)[];
}

/**
 * @internal
 */
export const InteractionComponentsEventFilterSensitiveLog = (obj: InteractionComponentsEvent): any => ({
  ...obj,
  ...(obj.interactionComponentEntries && { interactionComponentEntries:
    obj.interactionComponentEntries.map(
      item =>
      InteractionComponentEntryFilterSensitiveLog(item)
    )
  }),
})

export enum InvalidStateReason {
  INVALID_TASK_ASSIST_PLAN = "INVALID_TASK_ASSIST_PLAN",
}

/**
 * Streaming Response Event when an Invalid State is reached
 */
export interface InvalidStateEvent {
  /**
   * Reasons for Invalid State Event
   */
  reason: InvalidStateReason | string;

  message: string;
}

/**
 * @internal
 */
export const InvalidStateEventFilterSensitiveLog = (obj: InvalidStateEvent): any => ({
  ...obj,
})

/**
 * Streaming Response Event for AssistantResponse Metadata
 */
export interface MessageMetadataEvent {
  /**
   * Unique identifier for the conversation
   */
  conversationId?: string;

  /**
   * Unique identifier for the utterance
   */
  utteranceId?: string;
}

/**
 * @internal
 */
export const MessageMetadataEventFilterSensitiveLog = (obj: MessageMetadataEvent): any => ({
  ...obj,
})

/**
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
 * Streaming events from UniDirectional Streaming Conversational APIs.
 */
export type ChatResponseStream =
  | ChatResponseStream.AssistantResponseEventMember
  | ChatResponseStream.CodeEventMember
  | ChatResponseStream.CodeReferenceEventMember
  | ChatResponseStream.DryRunSucceedEventMember
  | ChatResponseStream.ErrorMember
  | ChatResponseStream.FollowupPromptEventMember
  | ChatResponseStream.IntentsEventMember
  | ChatResponseStream.InteractionComponentsEventMember
  | ChatResponseStream.InvalidStateEventMember
  | ChatResponseStream.MessageMetadataEventMember
  | ChatResponseStream.SupplementaryWebLinksEventMember
  | ChatResponseStream.$UnknownMember

export namespace ChatResponseStream {

  /**
   * Message Metadata event
   */
  export interface MessageMetadataEventMember {
    messageMetadataEvent: MessageMetadataEvent;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Assistant response event - Text / Code snippet
   */
  export interface AssistantResponseEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent: AssistantResponseEvent;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * DryRun Succeed Event
   */
  export interface DryRunSucceedEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent: DryRunSucceedEvent;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Code References event
   */
  export interface CodeReferenceEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent: CodeReferenceEvent;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Web Reference links event
   */
  export interface SupplementaryWebLinksEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent: SupplementaryWebLinksEvent;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Followup prompt event
   */
  export interface FollowupPromptEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent: FollowupPromptEvent;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Code Generated event
   */
  export interface CodeEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent: CodeEvent;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Intents event
   */
  export interface IntentsEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent: IntentsEvent;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Interactions components event
   */
  export interface InteractionComponentsEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent: InteractionComponentsEvent;
    invalidStateEvent?: never;
    error?: never;
    $unknown?: never;
  }

  /**
   * Invalid State event
   */
  export interface InvalidStateEventMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent: InvalidStateEvent;
    error?: never;
    $unknown?: never;
  }

  /**
   * Internal Server Exception
   */
  export interface ErrorMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error: InternalServerException;
    $unknown?: never;
  }

  export interface $UnknownMember {
    messageMetadataEvent?: never;
    assistantResponseEvent?: never;
    dryRunSucceedEvent?: never;
    codeReferenceEvent?: never;
    supplementaryWebLinksEvent?: never;
    followupPromptEvent?: never;
    codeEvent?: never;
    intentsEvent?: never;
    interactionComponentsEvent?: never;
    invalidStateEvent?: never;
    error?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    messageMetadataEvent: (value: MessageMetadataEvent) => T;
    assistantResponseEvent: (value: AssistantResponseEvent) => T;
    dryRunSucceedEvent: (value: DryRunSucceedEvent) => T;
    codeReferenceEvent: (value: CodeReferenceEvent) => T;
    supplementaryWebLinksEvent: (value: SupplementaryWebLinksEvent) => T;
    followupPromptEvent: (value: FollowupPromptEvent) => T;
    codeEvent: (value: CodeEvent) => T;
    intentsEvent: (value: IntentsEvent) => T;
    interactionComponentsEvent: (value: InteractionComponentsEvent) => T;
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
    if (value.dryRunSucceedEvent !== undefined) return visitor.dryRunSucceedEvent(value.dryRunSucceedEvent);
    if (value.codeReferenceEvent !== undefined) return visitor.codeReferenceEvent(value.codeReferenceEvent);
    if (value.supplementaryWebLinksEvent !== undefined) return visitor.supplementaryWebLinksEvent(value.supplementaryWebLinksEvent);
    if (value.followupPromptEvent !== undefined) return visitor.followupPromptEvent(value.followupPromptEvent);
    if (value.codeEvent !== undefined) return visitor.codeEvent(value.codeEvent);
    if (value.intentsEvent !== undefined) return visitor.intentsEvent(value.intentsEvent);
    if (value.interactionComponentsEvent !== undefined) return visitor.interactionComponentsEvent(value.interactionComponentsEvent);
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
    MessageMetadataEventFilterSensitiveLog(obj.messageMetadataEvent)
  };
  if (obj.assistantResponseEvent !== undefined) return {assistantResponseEvent:
    AssistantResponseEventFilterSensitiveLog(obj.assistantResponseEvent)
  };
  if (obj.dryRunSucceedEvent !== undefined) return {dryRunSucceedEvent:
    DryRunSucceedEventFilterSensitiveLog(obj.dryRunSucceedEvent)
  };
  if (obj.codeReferenceEvent !== undefined) return {codeReferenceEvent:
    CodeReferenceEventFilterSensitiveLog(obj.codeReferenceEvent)
  };
  if (obj.supplementaryWebLinksEvent !== undefined) return {supplementaryWebLinksEvent:
    SupplementaryWebLinksEventFilterSensitiveLog(obj.supplementaryWebLinksEvent)
  };
  if (obj.followupPromptEvent !== undefined) return {followupPromptEvent:
    FollowupPromptEventFilterSensitiveLog(obj.followupPromptEvent)
  };
  if (obj.codeEvent !== undefined) return {codeEvent:
    CodeEventFilterSensitiveLog(obj.codeEvent)
  };
  if (obj.intentsEvent !== undefined) return {intentsEvent:
    IntentsEventFilterSensitiveLog(obj.intentsEvent)
  };
  if (obj.interactionComponentsEvent !== undefined) return {interactionComponentsEvent:
    InteractionComponentsEventFilterSensitiveLog(obj.interactionComponentsEvent)
  };
  if (obj.invalidStateEvent !== undefined) return {invalidStateEvent:
    InvalidStateEventFilterSensitiveLog(obj.invalidStateEvent)
  };
  if (obj.error !== undefined) return {error:
    obj.error
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

export enum ChatTriggerType {
  /**
   * Indicates the Chat was triggered in response to a IDE diagnostic
   */
  DIAGNOSTIC = "DIAGNOSTIC",
  /**
   * Indicates the Chat was triggered in response to an inline chat event
   */
  INLINE_CHAT = "INLINE_CHAT",
  /**
   * Indicates the Chat was triggered due to an explicit chat request by an end-user
   */
  MANUAL = "MANUAL",
}

/**
 * CommandInput can be extended to either a list of strings or a single string.
 */
export type CommandInput =
  | CommandInput.CommandsListMember
  | CommandInput.$UnknownMember

export namespace CommandInput {

  /**
   * The list of context items used to generate output.
   */
  export interface CommandsListMember {
    commandsList: (string)[];
    $unknown?: never;
  }

  export interface $UnknownMember {
    commandsList?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    commandsList: (value: (string)[]) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: CommandInput,
    visitor: Visitor<T>
  ): T => {
    if (value.commandsList !== undefined) return visitor.commandsList(value.commandsList);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const CommandInputFilterSensitiveLog = (obj: CommandInput): any => {
  if (obj.commandsList !== undefined) return {commandsList:
    SENSITIVE_STRING
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
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

  customizationArn?: string;
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
 * This exception is translated to a 204 as it succeeded the IAM Auth.
 */
export class DryRunOperationException extends __BaseException {
  readonly name: "DryRunOperationException" = "DryRunOperationException";
  readonly $fault: "client" = "client";
  responseCode?: number;
  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<DryRunOperationException, __BaseException>) {
    super({
      name: "DryRunOperationException",
      $fault: "client",
      ...opts
    });
    Object.setPrototypeOf(this, DryRunOperationException.prototype);
    this.responseCode = opts.responseCode;
  }
}

export enum OutputFormat {
  JAVA_CDK = "java/cdk",
  JSON_CFN = "json/cfn",
  PYTHON_CDK = "python/cdk",
  TYPESCRIPT_CDK = "typescript/cdk",
  YAML_CFN = "yaml/cfn",
}

/**
 * This exception is thrown when request was denied due to caller exceeding their usage limits
 */
export class ServiceQuotaExceededException extends __BaseException {
  readonly name: "ServiceQuotaExceededException" = "ServiceQuotaExceededException";
  readonly $fault: "client" = "client";
  /**
   * @internal
   */
  constructor(opts: __ExceptionOptionType<ServiceQuotaExceededException, __BaseException>) {
    super({
      name: "ServiceQuotaExceededException",
      $fault: "client",
      ...opts
    });
    Object.setPrototypeOf(this, ServiceQuotaExceededException.prototype);
  }
}

export enum Origin {
  /**
   * AWS Chatbot
   */
  CHATBOT = "CHATBOT",
  /**
   * AWS Management Console (https://<region>.console.aws.amazon.com)
   */
  CONSOLE = "CONSOLE",
  /**
   * AWS Documentation Website (https://docs.aws.amazon.com)
   */
  DOCUMENTATION = "DOCUMENTATION",
  /**
   * Any IDE caller.
   */
  IDE = "IDE",
  /**
   * AWS Marketing Website (https://aws.amazon.com)
   */
  MARKETING = "MARKETING",
  /**
   * MD.
   */
  MD = "MD",
  /**
   * AWS Mobile Application (ACMA)
   */
  MOBILE = "MOBILE",
  /**
   * Amazon SageMaker's Rome Chat.
   */
  SAGE_MAKER = "SAGE_MAKER",
  /**
   * Internal Service Traffic (Integ Tests, Canaries, etc.). This is the default when no Origin header present in request.
   */
  SERVICE_INTERNAL = "SERVICE_INTERNAL",
  /**
   * Unified Search in AWS Management Console (https://<region>.console.aws.amazon.com)
   */
  UNIFIED_SEARCH = "UNIFIED_SEARCH",
  /**
   * Origin header is not set.
   */
  UNKNOWN = "UNKNOWN",
}

/**
 * Structure to represent a SendMessage request.
 */
export interface SendMessageRequest {
  /**
   * Structure to represent the current state of a chat conversation.
   */
  conversationState: ConversationState;

  profileArn?: string;
  /**
   * The origin of the caller
   */
  source?: Origin | string;

  dryRun?: boolean;
}

/**
 * @internal
 */
export const SendMessageRequestFilterSensitiveLog = (obj: SendMessageRequest): any => ({
  ...obj,
  ...(obj.conversationState && { conversationState:
    ConversationStateFilterSensitiveLog(obj.conversationState)
  }),
})

/**
 * Structure to represent a SendMessage response.
 */
export interface SendMessageResponse {
  /**
   * Streaming events from UniDirectional Streaming Conversational APIs.
   */
  sendMessageResponse: AsyncIterable<ChatResponseStream>;
}

/**
 * @internal
 */
export const SendMessageResponseFilterSensitiveLog = (obj: SendMessageResponse): any => ({
  ...obj,
  ...(obj.sendMessageResponse && { sendMessageResponse:
    'STREAMING_CONTENT'
  }),
})

export interface GenerateCodeFromCommandsRequest {
  /**
   * Format of the output - language/format eg. typescript/cdk
   */
  outputFormat: OutputFormat | string;

  /**
   * CommandInput can be extended to either a list of strings or a single string.
   */
  commands: CommandInput;
}

/**
 * @internal
 */
export const GenerateCodeFromCommandsRequestFilterSensitiveLog = (obj: GenerateCodeFromCommandsRequest): any => ({
  ...obj,
  ...(obj.commands && { commands:
    CommandInputFilterSensitiveLog(obj.commands)
  }),
})

/**
 * Streaming events from UniDirectional streaming infrastructure code generation APIs.
 */
export type GenerateCodeFromCommandsResponseStream =
  | GenerateCodeFromCommandsResponseStream.ErrorMember
  | GenerateCodeFromCommandsResponseStream.QuotaLevelExceededErrorMember
  | GenerateCodeFromCommandsResponseStream.ValidationErrorMember
  | GenerateCodeFromCommandsResponseStream.CodeEventMember
  | GenerateCodeFromCommandsResponseStream.$UnknownMember

export namespace GenerateCodeFromCommandsResponseStream {

  /**
   * Generated code snippet
   */
  export interface CodeEventMember {
    codeEvent: CodeEvent;
    Error?: never;
    QuotaLevelExceededError?: never;
    ValidationError?: never;
    $unknown?: never;
  }

  /**
   * Internal Server Exception
   */
  export interface ErrorMember {
    codeEvent?: never;
    Error: InternalServerException;
    QuotaLevelExceededError?: never;
    ValidationError?: never;
    $unknown?: never;
  }

  /**
   * Exceptions for quota level exceeded errors
   */
  export interface QuotaLevelExceededErrorMember {
    codeEvent?: never;
    Error?: never;
    QuotaLevelExceededError: ServiceQuotaExceededException;
    ValidationError?: never;
    $unknown?: never;
  }

  /**
   * Validation errors in the ConsoleToCodeService
   */
  export interface ValidationErrorMember {
    codeEvent?: never;
    Error?: never;
    QuotaLevelExceededError?: never;
    ValidationError: ValidationException;
    $unknown?: never;
  }

  export interface $UnknownMember {
    codeEvent?: never;
    Error?: never;
    QuotaLevelExceededError?: never;
    ValidationError?: never;
    $unknown: [string, any];
  }

  export interface Visitor<T> {
    codeEvent: (value: CodeEvent) => T;
    Error: (value: InternalServerException) => T;
    QuotaLevelExceededError: (value: ServiceQuotaExceededException) => T;
    ValidationError: (value: ValidationException) => T;
    _: (name: string, value: any) => T;
  }

  export const visit = <T>(
    value: GenerateCodeFromCommandsResponseStream,
    visitor: Visitor<T>
  ): T => {
    if (value.codeEvent !== undefined) return visitor.codeEvent(value.codeEvent);
    if (value.Error !== undefined) return visitor.Error(value.Error);
    if (value.QuotaLevelExceededError !== undefined) return visitor.QuotaLevelExceededError(value.QuotaLevelExceededError);
    if (value.ValidationError !== undefined) return visitor.ValidationError(value.ValidationError);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  }

}
/**
 * @internal
 */
export const GenerateCodeFromCommandsResponseStreamFilterSensitiveLog = (obj: GenerateCodeFromCommandsResponseStream): any => {
  if (obj.codeEvent !== undefined) return {codeEvent:
    CodeEventFilterSensitiveLog(obj.codeEvent)
  };
  if (obj.Error !== undefined) return {Error:
    obj.Error
  };
  if (obj.QuotaLevelExceededError !== undefined) return {QuotaLevelExceededError:
    obj.QuotaLevelExceededError
  };
  if (obj.ValidationError !== undefined) return {ValidationError:
    obj.ValidationError
  };
  if (obj.$unknown !== undefined) return {[obj.$unknown[0]]: 'UNKNOWN'};
}

/**
 * Structure to represent generated code response.
 */
export interface GenerateCodeFromCommandsResponse {
  /**
   * Streaming events from UniDirectional streaming infrastructure code generation APIs.
   */
  generatedCodeFromCommandsResponse: AsyncIterable<GenerateCodeFromCommandsResponseStream>;
}

/**
 * @internal
 */
export const GenerateCodeFromCommandsResponseFilterSensitiveLog = (obj: GenerateCodeFromCommandsResponse): any => ({
  ...obj,
  ...(obj.generatedCodeFromCommandsResponse && { generatedCodeFromCommandsResponse:
    'STREAMING_CONTENT'
  }),
})
