// smithy-typescript generated code
import { QDeveloperStreamingServiceException as __BaseException } from "./QDeveloperStreamingServiceException";
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
 * This exception is thrown when the user does not have sufficient access to perform this action.
 * @public
 */
export class AccessDeniedException extends __BaseException {
  readonly name: "AccessDeniedException" = "AccessDeniedException";
  readonly $fault: "client" = "client";
  /**
   * Reason for AccessDeniedException
   * @public
   */
  reason?: AccessDeniedExceptionReason | undefined;

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
 * @public
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
 * @public
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
 * @enum
 */
export const ThrottlingExceptionReason = {
  MONTHLY_REQUEST_COUNT: "MONTHLY_REQUEST_COUNT",
} as const
/**
 * @public
 */
export type ThrottlingExceptionReason = typeof ThrottlingExceptionReason[keyof typeof ThrottlingExceptionReason]

/**
 * This exception is thrown when request was denied due to request throttling.
 * @public
 */
export class ThrottlingException extends __BaseException {
  readonly name: "ThrottlingException" = "ThrottlingException";
  readonly $fault: "client" = "client";
  $retryable = {
    throttling: true,
  };
  /**
   * Reason for ThrottlingException
   * @public
   */
  reason?: ThrottlingExceptionReason | undefined;

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

/**
 * @public
 * @enum
 */
export const ValidationExceptionReason = {
  CONTENT_LENGTH_EXCEEDS_THRESHOLD: "CONTENT_LENGTH_EXCEEDS_THRESHOLD",
  INVALID_CONVERSATION_ID: "INVALID_CONVERSATION_ID",
  INVALID_KMS_GRANT: "INVALID_KMS_GRANT",
} as const
/**
 * @public
 */
export type ValidationExceptionReason = typeof ValidationExceptionReason[keyof typeof ValidationExceptionReason]

/**
 * This exception is thrown when the input fails to satisfy the constraints specified by the service.
 * @public
 */
export class ValidationException extends __BaseException {
  readonly name: "ValidationException" = "ValidationException";
  readonly $fault: "client" = "client";
  /**
   * Reason for ValidationException
   * @public
   */
  reason?: ValidationExceptionReason | undefined;

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
 * @public
 */
export interface AppStudioState {
  /**
   * The namespace of the context. Examples: 'ui.Button', 'ui.Table.DataSource', 'ui.Table.RowActions.Button', 'logic.invokeAWS', 'logic.JavaScript'
   * @public
   */
  namespace: string;

  /**
   * The name of the property. Examples: 'visibility', 'disability', 'value', 'code'
   * @public
   */
  propertyName: string;

  /**
   * The value of the property.
   * @public
   */
  propertyValue?: string | undefined;

  /**
   * Context about how the property is used
   * @public
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
 * @public
 */
export interface AssistantResponseEvent {
  /**
   * The content of the text message in markdown format.
   * @public
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
   * generate code
   */
  CODE_GENERATION: "CODE_GENERATION",
  /**
   * Explain Code Selection
   */
  EXPLAIN_CODE_SELECTION: "EXPLAIN_CODE_SELECTION",
  /**
   * Explain Code Line By Line
   */
  EXPLAIN_LINE_BY_LINE: "EXPLAIN_LINE_BY_LINE",
  /**
   * Generate CloudFormation Template
   */
  GENERATE_CLOUDFORMATION_TEMPLATE: "GENERATE_CLOUDFORMATION_TEMPLATE",
  /**
   * Generate Unit Tests
   */
  GENERATE_UNIT_TESTS: "GENERATE_UNIT_TESTS",
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
 * Followup Prompt for the Assistant Response
 * @public
 */
export interface FollowupPrompt {
  /**
   * The content of the text message in markdown format.
   * @public
   */
  content: string;

  /**
   * User Intent
   * @public
   */
  userIntent?: UserIntent | undefined;
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
 * @public
 */
export interface Span {
  start?: number | undefined;
  end?: number | undefined;
}

/**
 * Code Reference / Repository details
 * @public
 */
export interface Reference {
  /**
   * License name
   * @public
   */
  licenseName?: string | undefined;

  /**
   * Code Repsitory for the associated reference
   * @public
   */
  repository?: string | undefined;

  /**
   * Respository URL
   * @public
   */
  url?: string | undefined;

  /**
   * Span / Range for the Reference
   * @public
   */
  recommendationContentSpan?: Span | undefined;
}

/**
 * Represents an additional reference link retured with the Chat message
 * @public
 */
export interface SupplementaryWebLink {
  /**
   * URL of the web reference link
   * @public
   */
  url: string;

  /**
   * Title of the web reference link
   * @public
   */
  title: string;

  /**
   * Relevant text snippet from the link
   * @public
   */
  snippet?: string | undefined;
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
 * @public
 */
export interface AssistantResponseMessage {
  /**
   * Unique identifier for the chat message
   * @public
   */
  messageId?: string | undefined;

  /**
   * The content of the text message in markdown format.
   * @public
   */
  content: string;

  /**
   * Web References
   * @public
   */
  supplementaryWebLinks?: (SupplementaryWebLink)[] | undefined;

  /**
   * Code References
   * @public
   */
  references?: (Reference)[] | undefined;

  /**
   * Followup Prompt
   * @public
   */
  followupPrompt?: FollowupPrompt | undefined;
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
export const ConflictExceptionReason = {
  CUSTOMER_KMS_KEY_DISABLED: "CUSTOMER_KMS_KEY_DISABLED",
  CUSTOMER_KMS_KEY_INVALID_KEY_POLICY: "CUSTOMER_KMS_KEY_INVALID_KEY_POLICY",
  MISMATCHED_KMS_KEY: "MISMATCHED_KMS_KEY",
} as const
/**
 * @public
 */
export type ConflictExceptionReason = typeof ConflictExceptionReason[keyof typeof ConflictExceptionReason]

/**
 * This exception is thrown when the action to perform could not be completed because the resource is in a conflicting state.
 * @public
 */
export class ConflictException extends __BaseException {
  readonly name: "ConflictException" = "ConflictException";
  readonly $fault: "client" = "client";
  /**
   * Reason for ConflictException
   * @public
   */
  reason?: ConflictExceptionReason | undefined;

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
 * @public
 */
export interface ProgrammingLanguage {
  languageName: string;
}

/**
 * Information about the state of the AWS management console page from which the user is calling
 * @public
 */
export interface ConsoleState {
  region?: string | undefined;
  consoleUrl?: string | undefined;
  serviceId?: string | undefined;
  serviceConsolePage?: string | undefined;
  serviceSubconsolePage?: string | undefined;
  taskName?: string | undefined;
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
 * Structure to represent metadata about a Runtime Diagnostics
 * @public
 */
export interface RuntimeDiagnostic {
  /**
   * A human-readable string describing the source of the diagnostic
   * @public
   */
  source: string;

  /**
   * Diagnostic Error type
   * @public
   */
  severity: DiagnosticSeverity;

  /**
   * The diagnostic's message.
   * @public
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
   * @public
   */
  name: string;

  /**
   * Symbol type - DECLARATION / USAGE
   * @public
   */
  type: SymbolType;

  /**
   * Symbol package / source for FullyQualified names
   * @public
   */
  source?: string | undefined;
}

/**
 * Represents a Text Document / File
 * @public
 */
export interface TextDocument {
  /**
   * Filepath relative to the root of the workspace
   * @public
   */
  relativeFilePath: string;

  /**
   * The text document's language identifier.
   * @public
   */
  programmingLanguage?: ProgrammingLanguage | undefined;

  /**
   * Content of the text document
   * @public
   */
  text?: string | undefined;

  /**
   * DocumentSymbols parsed from a text document
   * @public
   */
  documentSymbols?: (DocumentSymbol)[] | undefined;
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
 * @public
 */
export interface Position {
  /**
   * Line position in a document.
   * @public
   */
  line: number;

  /**
   * Character offset on a line in a document (zero-based)
   * @public
   */
  character: number;
}

/**
 * Indicates Range / Span in a Text Document
 * @public
 */
export interface Range {
  /**
   * The range's start position.
   * @public
   */
  start: Position;

  /**
   * The range's end position.
   * @public
   */
  end: Position;
}

/**
 * Structure to represent metadata about a TextDocument Diagnostic
 * @public
 */
export interface TextDocumentDiagnostic {
  /**
   * Represents a Text Document associated with Diagnostic
   * @public
   */
  document: TextDocument;

  /**
   * The range at which the message applies.
   * @public
   */
  range: Range;

  /**
   * A human-readable string describing the source of the diagnostic
   * @public
   */
  source: string;

  /**
   * Diagnostic Error type
   * @public
   */
  severity: DiagnosticSeverity;

  /**
   * The diagnostic's message.
   * @public
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
 * @public
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
   * @public
   */
  export interface TextDocumentDiagnosticMember {
    textDocumentDiagnostic: TextDocumentDiagnostic;
    runtimeDiagnostic?: never;
    $unknown?: never;
  }

  /**
   * Diagnostics originating from a Runtime
   * @public
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
 * Represents the state of the Cursor in an Editor
 * @public
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
   * @public
   */
  export interface PositionMember {
    position: Position;
    range?: never;
    $unknown?: never;
  }

  /**
   * Represents a text selection in a Text Document
   * @public
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
 * Represents an IDE retrieved relevant Text Document / File
 * @public
 */
export interface RelevantTextDocument {
  /**
   * Filepath relative to the root of the workspace
   * @public
   */
  relativeFilePath: string;

  /**
   * The text document's language identifier.
   * @public
   */
  programmingLanguage?: ProgrammingLanguage | undefined;

  /**
   * Content of the text document
   * @public
   */
  text?: string | undefined;

  /**
   * DocumentSymbols parsed from a text document
   * @public
   */
  documentSymbols?: (DocumentSymbol)[] | undefined;
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
 * @public
 */
export interface EditorState {
  /**
   * Represents currently edited file
   * @public
   */
  document?: TextDocument | undefined;

  /**
   * Position of the cursor
   * @public
   */
  cursorState?: CursorState | undefined;

  /**
   * Represents IDE provided relevant files
   * @public
   */
  relevantDocuments?: (RelevantTextDocument)[] | undefined;

  /**
   * Whether service should use relevant document in prompt
   * @public
   */
  useRelevantDocuments?: boolean | undefined;
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
  ...(obj.relevantDocuments && { relevantDocuments:
    obj.relevantDocuments.map(
      item =>
      RelevantTextDocumentFilterSensitiveLog(item)
    )
  }),
})

/**
 * An environment variable
 * @public
 */
export interface EnvironmentVariable {
  /**
   * The key of an environment variable
   * @public
   */
  key?: string | undefined;

  /**
   * The value of an environment variable
   * @public
   */
  value?: string | undefined;
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
 * @public
 */
export interface EnvState {
  /**
   * The name of the operating system in use
   * @public
   */
  operatingSystem?: string | undefined;

  /**
   * The current working directory of the environment
   * @public
   */
  currentWorkingDirectory?: string | undefined;

  /**
   * The environment variables set in the current environment
   * @public
   */
  environmentVariables?: (EnvironmentVariable)[] | undefined;

  /**
   * Local timezone offset of the client. For more information, see documentation https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
   * @public
   */
  timezoneOffset?: number | undefined;
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
 * @public
 */
export interface GitState {
  /**
   * The output of the command `git status --porcelain=v1 -b`
   * @public
   */
  status?: string | undefined;
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
 * @public
 */
export interface ShellHistoryEntry {
  /**
   * The shell command that was run
   * @public
   */
  command: string;

  /**
   * The directory the command was ran in
   * @public
   */
  directory?: string | undefined;

  /**
   * The exit code of the command after it finished
   * @public
   */
  exitCode?: number | undefined;

  /**
   * The stdout from the command
   * @public
   */
  stdout?: string | undefined;

  /**
   * The stderr from the command
   * @public
   */
  stderr?: string | undefined;
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
 * @public
 */
export interface ShellState {
  /**
   * The name of the current shell
   * @public
   */
  shellName: string;

  /**
   * The history previous shell commands for the current shell
   * @public
   */
  shellHistory?: (ShellHistoryEntry)[] | undefined;
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
 * @public
 */
export interface UserSettings {
  hasConsentedToCrossRegionCalls?: boolean | undefined;
}

/**
 * Additional Chat message context associated with the Chat Message
 * @public
 */
export interface UserInputMessageContext {
  /**
   * Editor state chat message context.
   * @public
   */
  editorState?: EditorState | undefined;

  /**
   * Shell state chat message context.
   * @public
   */
  shellState?: ShellState | undefined;

  /**
   * Git state chat message context.
   * @public
   */
  gitState?: GitState | undefined;

  /**
   * Environment state chat message context.
   * @public
   */
  envState?: EnvState | undefined;

  /**
   * The state of a user's AppStudio UI when sending a message.
   * @public
   */
  appStudioContext?: AppStudioState | undefined;

  /**
   * Diagnostic chat message context.
   * @public
   */
  diagnostic?: Diagnostic | undefined;

  /**
   * Contextual information about the environment from which the user is calling.
   * @public
   */
  consoleState?: ConsoleState | undefined;

  /**
   * Settings information, e.g., whether the user has enabled cross-region API calls.
   * @public
   */
  userSettings?: UserSettings | undefined;
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
 * @public
 */
export interface UserInputMessage {
  /**
   * The content of the chat message.
   * @public
   */
  content: string;

  /**
   * Chat message context associated with the Chat Message
   * @public
   */
  userInputMessageContext?: UserInputMessageContext | undefined;

  /**
   * User Intent
   * @public
   */
  userIntent?: UserIntent | undefined;
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
   * @public
   */
  export interface UserInputMessageMember {
    userInputMessage: UserInputMessage;
    assistantResponseMessage?: never;
    $unknown?: never;
  }

  /**
   * Markdown text message.
   * @public
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
 * Streaming response event for generated code text.
 * @public
 */
export interface CodeEvent {
  /**
   * Generated code snippet.
   * @public
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
 * @public
 */
export interface CodeReferenceEvent {
  /**
   * Code References for Assistant Response Message
   * @public
   */
  references?: (Reference)[] | undefined;
}

/**
 * Streaming Response Event when DryRun is succeessful
 * @public
 */
export interface DryRunSucceedEvent {
}

/**
 * Streaming Response Event for Followup Prompt.
 * @public
 */
export interface FollowupPromptEvent {
  /**
   * Followup Prompt for the Assistant Response
   * @public
   */
  followupPrompt?: FollowupPrompt | undefined;
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
export const IntentType = {
  GLUE_SENSEI: "GLUE_SENSEI",
  RESOURCE_DATA: "RESOURCE_DATA",
  SUPPORT: "SUPPORT",
} as const
/**
 * @public
 */
export type IntentType = typeof IntentType[keyof typeof IntentType]

/**
 * @public
 */
export type IntentDataType =
  | IntentDataType.StringMember
  | IntentDataType.$UnknownMember

/**
 * @public
 */
export namespace IntentDataType {

  export interface StringMember {
    string: string;
    $unknown?: never;
  }

  /**
   * @public
   */
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
 * Streaming Response Event for Intents
 * @public
 */
export interface IntentsEvent {
  /**
   * A map of Intent objects
   * @public
   */
  intents?: Partial<Record<IntentType, Record<string, IntentDataType>>> | undefined;
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
 * @public
 */
export interface CloudWatchTroubleshootingLink {
  /**
   * A label for the link.
   * @public
   */
  label: string;

  /**
   * Stringified JSON payload. See spec here https://code.amazon.com/packages/CloudWatchOdysseyModel/blobs/50c0832f0e393e4ab68827eb4f04d832366821c1/--/model/events.smithy#L28 .
   * @public
   */
  investigationPayload: string;

  /**
   * Fallback string, if target channel does not support the CloudWatchTroubleshootingLink.
   * @public
   */
  defaultText?: string | undefined;
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

/**
 * @public
 */
export interface ModuleLink {
  /**
   * For CloudWatch Troubleshooting Link Module
   * @public
   */
  cloudWatchTroubleshootingLink?: CloudWatchTroubleshootingLink | undefined;
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

/**
 * @public
 */
export interface WebLink {
  /**
   * A label for the link
   * @public
   */
  label: string;

  /**
   * URL of the Weblink
   * @public
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

/**
 * @public
 */
export interface Action {
  webLink?: WebLink | undefined;
  moduleLink?: ModuleLink | undefined;
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
 * @public
 */
export interface Text {
  /**
   * Contains text content that may include sensitive information and can support Markdown formatting.
   * @public
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

/**
 * @public
 */
export interface AlertComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   * @public
   */
  text?: Text | undefined;
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

/**
 * @public
 * @enum
 */
export const AlertType = {
  /**
   * Alert indicating an error or failure that requires attention.
   */
  ERROR: "ERROR",
  /**
   * Informational alert providing general information.
   */
  INFO: "INFO",
  /**
   * Alert indicating a warning or potential issue that should be noted.
   */
  WARNING: "WARNING",
} as const
/**
 * @public
 */
export type AlertType = typeof AlertType[keyof typeof AlertType]

/**
 * Structure representing an alert with a type and content.
 * @public
 */
export interface Alert {
  /**
   * Enum defining types of alerts that can be issued.
   * @public
   */
  type: AlertType;

  /**
   * Contains the content of the alert, which may include sensitive information.
   * @public
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
 * @public
 */
export interface InfrastructureUpdateTransition {
  /**
   * The current state of the infrastructure before the update.
   * @public
   */
  currentState: string;

  /**
   * The next state of the infrastructure following the update.
   * @public
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
 * @public
 */
export interface InfrastructureUpdate {
  /**
   * Structure describing a transition between two states in an infrastructure update.
   * @public
   */
  transition?: InfrastructureUpdateTransition | undefined;
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

/**
 * @public
 */
export interface StepComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   * @public
   */
  text?: Text | undefined;
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

/**
 * @public
 * @enum
 */
export const StepState = {
  /**
   * Indicates a failure or issue that needs to be addressed.
   */
  FAILED: "FAILED",
  /**
   * Indicates that the step is currently being processed. This is a non-terminal state, meaning the process is active and ongoing.
   */
  IN_PROGRESS: "IN_PROGRESS",
  /**
   * Indicates that the step is being loaded or initialized. This is a non-terminal state, meaning the process is in the setup phase.
   */
  LOADING: "LOADING",
  /**
   * Indicates that the step is temporarily halted but can resume. This is a non-terminal state, representing a temporary pause.
   */
  PAUSED: "PAUSED",
  /**
   * Indicates that the step is waiting for some condition or input. This is a non-terminal state, meaning the process is paused but not complete.
   */
  PENDING: "PENDING",
  /**
   * Indicates that the step was stopped, either intentionally or unintentionally.
   */
  STOPPED: "STOPPED",
  /**
   * Indicates successful completion of the step.
   */
  SUCCEEDED: "SUCCEEDED",
} as const
/**
 * @public
 */
export type StepState = typeof StepState[keyof typeof StepState]

/**
 * Structure representing an individual step in a process.
 * @public
 */
export interface Step {
  /**
   * A unique identifier for the step. It must be a non-negative integer to ensure each step is distinct.
   * @public
   */
  id: number;

  /**
   * Enum representing all possible step states, combining terminal and non-terminal states.
   * @public
   */
  state: StepState;

  /**
   * A label for the step, providing a concise description.
   * @public
   */
  label: string;

  /**
   * Optional content providing additional details about the step.
   * @public
   */
  content?: (StepComponent)[] | undefined;
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

/**
 * @public
 */
export interface ProgressComponent {
  /**
   * Structure representing an individual step in a process.
   * @public
   */
  step?: Step | undefined;
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
 * @public
 */
export interface Progress {
  /**
   * A collection of steps that make up a process. Each step is detailed using the Step structure.
   * @public
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
 * @public
 */
export interface Resource {
  /**
   * Card title.
   * @public
   */
  title: string;

  /**
   * Link for the resource item
   * @public
   */
  link: string;

  /**
   * Short text about that resource for example Region: us-east-1
   * @public
   */
  description: string;

  /**
   * Resource type e.g AWS EC2
   * @public
   */
  type: string;

  /**
   * Amazon resource number e.g arn:aws:aec:.....
   * @public
   */
  ARN: string;

  /**
   * A stringified object
   * @public
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
 * @public
 */
export interface ResourceList {
  /**
   * Action associated with the list
   * @public
   */
  action?: Action | undefined;

  /**
   * List of resources
   * @public
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

/**
 * @public
 */
export interface SectionComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   * @public
   */
  text?: Text | undefined;

  /**
   * Structure representing an alert with a type and content.
   * @public
   */
  alert?: Alert | undefined;

  /**
   * Structure representing a resource item
   * @public
   */
  resource?: Resource | undefined;

  /**
   * Structure representing a list of Items
   * @public
   */
  resourceList?: ResourceList | undefined;
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
 * @public
 */
export interface Section {
  /**
   * Contains text content that may include sensitive information and can support Markdown formatting.
   * @public
   */
  title: string;

  /**
   * Contains a list of interaction components e.g Text, Alert, List, etc.
   * @public
   */
  content: (SectionComponent)[];

  /**
   * Action associated with the Section
   * @public
   */
  action?: Action | undefined;
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
 * @public
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
 * @public
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
 * @public
 */
export interface TaskActionConfirmation {
  /**
   * Confirmation message related to the action note, which may include sensitive information.
   * @public
   */
  content?: string | undefined;
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

/**
 * @public
 * @enum
 */
export const TaskActionNoteType = {
  /**
   * Information note providing general details.
   */
  INFO: "INFO",
  /**
   * Warning note indicating a potential issue.
   */
  WARNING: "WARNING",
} as const
/**
 * @public
 */
export type TaskActionNoteType = typeof TaskActionNoteType[keyof typeof TaskActionNoteType]

/**
 * Structure representing a note associated with a task action.
 * @public
 */
export interface TaskActionNote {
  /**
   * Content of the note, which may include sensitive information.
   * @public
   */
  content: string;

  /**
   * Enum defining the types of notes that can be associated with a task action.
   * @public
   */
  type?: TaskActionNoteType | undefined;
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
 * @public
 */
export interface TaskAction {
  /**
   * A label for the action.
   * @public
   */
  label: string;

  /**
   * Structure representing a note associated with a task action.
   * @public
   */
  note?: TaskActionNote | undefined;

  /**
   * Indicates whether the action is primary or not.
   * @public
   */
  primary?: boolean | undefined;

  /**
   * Indicates whether the action is disabled or not.
   * @public
   */
  disabled?: boolean | undefined;

  /**
   * Map representing key-value pairs for the payload of a task action.
   * @public
   */
  payload: Record<string, string>;

  /**
   * Structure representing a confirmation message related to a task action.
   * @public
   */
  confirmation?: TaskActionConfirmation | undefined;
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
 * @public
 */
export interface TaskComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   * @public
   */
  text?: Text | undefined;

  /**
   * Structure representing different types of infrastructure updates.
   * @public
   */
  infrastructureUpdate?: InfrastructureUpdate | undefined;

  /**
   * Structure representing an alert with a type and content.
   * @public
   */
  alert?: Alert | undefined;

  /**
   * Structure representing a collection of steps in a process.
   * @public
   */
  progress?: Progress | undefined;
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
 * @public
 */
export interface TaskOverview {
  /**
   * A label for the task overview.
   * @public
   */
  label: string;

  /**
   * Text description providing details about the task. This field may include sensitive information and supports Markdown formatting.
   * @public
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
 * @public
 */
export interface TaskDetails {
  /**
   * Structure representing an overview of a task, including a label and description.
   * @public
   */
  overview: TaskOverview;

  /**
   * Lists the components that can be used to form the task's content.
   * @public
   */
  content: (TaskComponent)[];

  /**
   * Optional list of actions associated with the task.
   * @public
   */
  actions?: (TaskAction)[] | undefined;
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
 * @public
 */
export interface TaskReference {
  /**
   * Unique identifier for the task.
   * @public
   */
  taskId: string;
}

/**
 * Structure representing different types of interaction components.
 * @public
 */
export interface InteractionComponent {
  /**
   * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
   * @public
   */
  text?: Text | undefined;

  /**
   * Structure representing an alert with a type and content.
   * @public
   */
  alert?: Alert | undefined;

  /**
   * Structure representing different types of infrastructure updates.
   * @public
   */
  infrastructureUpdate?: InfrastructureUpdate | undefined;

  /**
   * Structure representing a collection of steps in a process.
   * @public
   */
  progress?: Progress | undefined;

  /**
   * Structure representing an individual step in a process.
   * @public
   */
  step?: Step | undefined;

  /**
   * Structure containing details about a task.
   * @public
   */
  taskDetails?: TaskDetails | undefined;

  /**
   * Structure representing a reference to a task.
   * @public
   */
  taskReference?: TaskReference | undefined;

  /**
   * Structure containing a list of suggestions.
   * @public
   */
  suggestions?: Suggestions | undefined;

  /**
   * Structure representing a collapsable section
   * @public
   */
  section?: Section | undefined;

  /**
   * Structure representing a resource item
   * @public
   */
  resource?: Resource | undefined;

  /**
   * Structure representing a list of Items
   * @public
   */
  resourceList?: ResourceList | undefined;

  action?: Action | undefined;
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
 * @public
 */
export interface InteractionComponentEntry {
  /**
   * Identifier that can uniquely identify the interaction component within
   *         stream response. This field is optional.
   * @public
   */
  interactionComponentId?: string | undefined;

  /**
   * Interaction component
   * @public
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
 * @public
 */
export interface InteractionComponentsEvent {
  /**
   * List of identifiable interaction components
   * @public
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
 * Streaming Response Event when an Invalid State is reached
 * @public
 */
export interface InvalidStateEvent {
  /**
   * Reasons for Invalid State Event
   * @public
   */
  reason: InvalidStateReason;

  message: string;
}

/**
 * Streaming Response Event for AssistantResponse Metadata
 * @public
 */
export interface MessageMetadataEvent {
  /**
   * Unique identifier for the conversation
   * @public
   */
  conversationId?: string | undefined;

  /**
   * Unique identifier for the utterance
   * @public
   */
  utteranceId?: string | undefined;
}

/**
 * Streaming Response Event for SupplementaryWebLinks
 * @public
 */
export interface SupplementaryWebLinksEvent {
  /**
   * Web References for Assistant Response Message
   * @public
   */
  supplementaryWebLinks?: (SupplementaryWebLink)[] | undefined;
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
 * @public
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

/**
 * @public
 */
export namespace ChatResponseStream {

  /**
   * Message Metadata event
   * @public
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
   * @public
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
   * @public
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
   * @public
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
   * @public
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
   * @public
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
   * @public
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
   * @public
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
   * @public
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
   * @public
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
   * @public
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

  /**
   * @public
   */
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
    obj.messageMetadataEvent
  };
  if (obj.assistantResponseEvent !== undefined) return {assistantResponseEvent:
    AssistantResponseEventFilterSensitiveLog(obj.assistantResponseEvent)
  };
  if (obj.dryRunSucceedEvent !== undefined) return {dryRunSucceedEvent:
    obj.dryRunSucceedEvent
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
   * Indicates the Chat was triggered in response to an inline chat event
   */
  INLINE_CHAT: "INLINE_CHAT",
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
 * CommandInput can be extended to either a list of strings or a single string.
 * @public
 */
export type CommandInput =
  | CommandInput.CommandsListMember
  | CommandInput.$UnknownMember

/**
 * @public
 */
export namespace CommandInput {

  /**
   * The list of context items used to generate output.
   * @public
   */
  export interface CommandsListMember {
    commandsList: (string)[];
    $unknown?: never;
  }

  /**
   * @public
   */
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
 * @public
 */
export interface ConversationState {
  /**
   * Unique identifier for the chat conversation stream
   * @public
   */
  conversationId?: string | undefined;

  /**
   * Holds the history of chat messages.
   * @public
   */
  history?: (ChatMessage)[] | undefined;

  /**
   * Holds the current message being processed or displayed.
   * @public
   */
  currentMessage: ChatMessage;

  /**
   * Trigger Reason for Chat
   * @public
   */
  chatTriggerType: ChatTriggerType;

  customizationArn?: string | undefined;
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
 * @public
 */
export class DryRunOperationException extends __BaseException {
  readonly name: "DryRunOperationException" = "DryRunOperationException";
  readonly $fault: "client" = "client";
  responseCode?: number | undefined;
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

/**
 * @public
 * @enum
 */
export const OutputFormat = {
  JAVA_CDK: "java/cdk",
  JSON_CFN: "json/cfn",
  PYTHON_CDK: "python/cdk",
  TYPESCRIPT_CDK: "typescript/cdk",
  YAML_CFN: "yaml/cfn",
} as const
/**
 * @public
 */
export type OutputFormat = typeof OutputFormat[keyof typeof OutputFormat]

/**
 * This exception is thrown when request was denied due to caller exceeding their usage limits
 * @public
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

/**
 * @public
 * @enum
 */
export const Origin = {
  /**
   * AWS Chatbot
   */
  CHATBOT: "CHATBOT",
  /**
   * AWS Management Console (https://<region>.console.aws.amazon.com)
   */
  CONSOLE: "CONSOLE",
  /**
   * AWS Documentation Website (https://docs.aws.amazon.com)
   */
  DOCUMENTATION: "DOCUMENTATION",
  /**
   * Any IDE caller.
   */
  IDE: "IDE",
  /**
   * AWS Marketing Website (https://aws.amazon.com)
   */
  MARKETING: "MARKETING",
  /**
   * MD.
   */
  MD: "MD",
  /**
   * AWS Mobile Application (ACMA)
   */
  MOBILE: "MOBILE",
  /**
   * Amazon SageMaker's Rome Chat.
   */
  SAGE_MAKER: "SAGE_MAKER",
  /**
   * Internal Service Traffic (Integ Tests, Canaries, etc.). This is the default when no Origin header present in request.
   */
  SERVICE_INTERNAL: "SERVICE_INTERNAL",
  /**
   * Unified Search in AWS Management Console (https://<region>.console.aws.amazon.com)
   */
  UNIFIED_SEARCH: "UNIFIED_SEARCH",
  /**
   * Origin header is not set.
   */
  UNKNOWN: "UNKNOWN",
} as const
/**
 * @public
 */
export type Origin = typeof Origin[keyof typeof Origin]

/**
 * Structure to represent a SendMessage request.
 * @public
 */
export interface SendMessageRequest {
  /**
   * Structure to represent the current state of a chat conversation.
   * @public
   */
  conversationState: ConversationState;

  profileArn?: string | undefined;
  /**
   * The origin of the caller
   * @public
   */
  source?: Origin | undefined;

  dryRun?: boolean | undefined;
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
 * @public
 */
export interface SendMessageResponse {
  /**
   * Streaming events from UniDirectional Streaming Conversational APIs.
   * @public
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

/**
 * @public
 */
export interface GenerateCodeFromCommandsRequest {
  /**
   * Format of the output - language/format eg. typescript/cdk
   * @public
   */
  outputFormat: OutputFormat;

  /**
   * CommandInput can be extended to either a list of strings or a single string.
   * @public
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
 * @public
 */
export type GenerateCodeFromCommandsResponseStream =
  | GenerateCodeFromCommandsResponseStream.ErrorMember
  | GenerateCodeFromCommandsResponseStream.QuotaLevelExceededErrorMember
  | GenerateCodeFromCommandsResponseStream.ValidationErrorMember
  | GenerateCodeFromCommandsResponseStream.CodeEventMember
  | GenerateCodeFromCommandsResponseStream.$UnknownMember

/**
 * @public
 */
export namespace GenerateCodeFromCommandsResponseStream {

  /**
   * Generated code snippet
   * @public
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
   * @public
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
   * @public
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
   * @public
   */
  export interface ValidationErrorMember {
    codeEvent?: never;
    Error?: never;
    QuotaLevelExceededError?: never;
    ValidationError: ValidationException;
    $unknown?: never;
  }

  /**
   * @public
   */
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
 * @public
 */
export interface GenerateCodeFromCommandsResponse {
  /**
   * Streaming events from UniDirectional streaming infrastructure code generation APIs.
   * @public
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
