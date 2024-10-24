import { QDeveloperStreamingServiceException as __BaseException } from "./QDeveloperStreamingServiceException";
import { ExceptionOptionType as __ExceptionOptionType } from "@smithy/smithy-client";
/**
 * @public
 * @enum
 */
export declare const AccessDeniedExceptionReason: {
    readonly UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS: "UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS";
};
/**
 * @public
 */
export type AccessDeniedExceptionReason = typeof AccessDeniedExceptionReason[keyof typeof AccessDeniedExceptionReason];
/**
 * This exception is thrown when the user does not have sufficient access to perform this action.
 * @public
 */
export declare class AccessDeniedException extends __BaseException {
    readonly name: "AccessDeniedException";
    readonly $fault: "client";
    /**
     * Reason for AccessDeniedException
     * @public
     */
    reason?: AccessDeniedExceptionReason;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<AccessDeniedException, __BaseException>);
}
/**
 * This exception is thrown when an unexpected error occurred during the processing of a request.
 * @public
 */
export declare class InternalServerException extends __BaseException {
    readonly name: "InternalServerException";
    readonly $fault: "server";
    $retryable: {};
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<InternalServerException, __BaseException>);
}
/**
 * This exception is thrown when describing a resource that does not exist.
 * @public
 */
export declare class ResourceNotFoundException extends __BaseException {
    readonly name: "ResourceNotFoundException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ResourceNotFoundException, __BaseException>);
}
/**
 * This exception is thrown when request was denied due to request throttling.
 * @public
 */
export declare class ThrottlingException extends __BaseException {
    readonly name: "ThrottlingException";
    readonly $fault: "client";
    $retryable: {
        throttling: boolean;
    };
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ThrottlingException, __BaseException>);
}
/**
 * @public
 * @enum
 */
export declare const ValidationExceptionReason: {
    readonly CONTENT_LENGTH_EXCEEDS_THRESHOLD: "CONTENT_LENGTH_EXCEEDS_THRESHOLD";
    readonly INVALID_CONVERSATION_ID: "INVALID_CONVERSATION_ID";
    readonly INVALID_KMS_GRANT: "INVALID_KMS_GRANT";
};
/**
 * @public
 */
export type ValidationExceptionReason = typeof ValidationExceptionReason[keyof typeof ValidationExceptionReason];
/**
 * This exception is thrown when the input fails to satisfy the constraints specified by the service.
 * @public
 */
export declare class ValidationException extends __BaseException {
    readonly name: "ValidationException";
    readonly $fault: "client";
    /**
     * Reason for ValidationException
     * @public
     */
    reason?: ValidationExceptionReason;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ValidationException, __BaseException>);
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
    namespace: string | undefined;
    /**
     * The name of the property. Examples: 'visibility', 'disability', 'value', 'code'
     * @public
     */
    propertyName: string | undefined;
    /**
     * The value of the property.
     * @public
     */
    propertyValue?: string;
    /**
     * Context about how the property is used
     * @public
     */
    propertyContext: string | undefined;
}
/**
 * @internal
 */
export declare const AppStudioStateFilterSensitiveLog: (obj: AppStudioState) => any;
/**
 * Streaming Response Event for Assistant Markdown text message.
 * @public
 */
export interface AssistantResponseEvent {
    /**
     * The content of the text message in markdown format.
     * @public
     */
    content: string | undefined;
}
/**
 * @internal
 */
export declare const AssistantResponseEventFilterSensitiveLog: (obj: AssistantResponseEvent) => any;
/**
 * @public
 * @enum
 */
export declare const UserIntent: {
    /**
     * Apply Common Best Practices
     */
    readonly APPLY_COMMON_BEST_PRACTICES: "APPLY_COMMON_BEST_PRACTICES";
    /**
     * Cite Sources
     */
    readonly CITE_SOURCES: "CITE_SOURCES";
    /**
     * generate code
     */
    readonly CODE_GENERATION: "CODE_GENERATION";
    /**
     * Explain Code Selection
     */
    readonly EXPLAIN_CODE_SELECTION: "EXPLAIN_CODE_SELECTION";
    /**
     * Explain Code Line By Line
     */
    readonly EXPLAIN_LINE_BY_LINE: "EXPLAIN_LINE_BY_LINE";
    /**
     * Generate CloudFormation Template
     */
    readonly GENERATE_CLOUDFORMATION_TEMPLATE: "GENERATE_CLOUDFORMATION_TEMPLATE";
    /**
     * Generate Unit Tests
     */
    readonly GENERATE_UNIT_TESTS: "GENERATE_UNIT_TESTS";
    /**
     * Improve Code
     */
    readonly IMPROVE_CODE: "IMPROVE_CODE";
    /**
     * Show More Examples
     */
    readonly SHOW_EXAMPLES: "SHOW_EXAMPLES";
    /**
     * Suggest Alternative Implementation
     */
    readonly SUGGEST_ALTERNATE_IMPLEMENTATION: "SUGGEST_ALTERNATE_IMPLEMENTATION";
};
/**
 * @public
 */
export type UserIntent = typeof UserIntent[keyof typeof UserIntent];
/**
 * Followup Prompt for the Assistant Response
 * @public
 */
export interface FollowupPrompt {
    /**
     * The content of the text message in markdown format.
     * @public
     */
    content: string | undefined;
    /**
     * User Intent
     * @public
     */
    userIntent?: UserIntent;
}
/**
 * @internal
 */
export declare const FollowupPromptFilterSensitiveLog: (obj: FollowupPrompt) => any;
/**
 * Represents span in a text
 * @public
 */
export interface Span {
    start?: number;
    end?: number;
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
    licenseName?: string;
    /**
     * Code Repsitory for the associated reference
     * @public
     */
    repository?: string;
    /**
     * Respository URL
     * @public
     */
    url?: string;
    /**
     * Span / Range for the Reference
     * @public
     */
    recommendationContentSpan?: Span;
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
    url: string | undefined;
    /**
     * Title of the web reference link
     * @public
     */
    title: string | undefined;
    /**
     * Relevant text snippet from the link
     * @public
     */
    snippet?: string;
}
/**
 * @internal
 */
export declare const SupplementaryWebLinkFilterSensitiveLog: (obj: SupplementaryWebLink) => any;
/**
 * Markdown text message.
 * @public
 */
export interface AssistantResponseMessage {
    /**
     * Unique identifier for the chat message
     * @public
     */
    messageId?: string;
    /**
     * The content of the text message in markdown format.
     * @public
     */
    content: string | undefined;
    /**
     * Web References
     * @public
     */
    supplementaryWebLinks?: (SupplementaryWebLink)[];
    /**
     * Code References
     * @public
     */
    references?: (Reference)[];
    /**
     * Followup Prompt
     * @public
     */
    followupPrompt?: FollowupPrompt;
}
/**
 * @internal
 */
export declare const AssistantResponseMessageFilterSensitiveLog: (obj: AssistantResponseMessage) => any;
/**
 * @public
 * @enum
 */
export declare const ConflictExceptionReason: {
    readonly CUSTOMER_KMS_KEY_DISABLED: "CUSTOMER_KMS_KEY_DISABLED";
    readonly CUSTOMER_KMS_KEY_INVALID_KEY_POLICY: "CUSTOMER_KMS_KEY_INVALID_KEY_POLICY";
    readonly MISMATCHED_KMS_KEY: "MISMATCHED_KMS_KEY";
};
/**
 * @public
 */
export type ConflictExceptionReason = typeof ConflictExceptionReason[keyof typeof ConflictExceptionReason];
/**
 * This exception is thrown when the action to perform could not be completed because the resource is in a conflicting state.
 * @public
 */
export declare class ConflictException extends __BaseException {
    readonly name: "ConflictException";
    readonly $fault: "client";
    /**
     * Reason for ConflictException
     * @public
     */
    reason?: ConflictExceptionReason;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>);
}
/**
 * Programming Languages supported by CodeWhisperer
 * @public
 */
export interface ProgrammingLanguage {
    languageName: string | undefined;
}
/**
 * Information about the state of the AWS management console page from which the user is calling
 * @public
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
export declare const ConsoleStateFilterSensitiveLog: (obj: ConsoleState) => any;
/**
 * @public
 * @enum
 */
export declare const DiagnosticSeverity: {
    readonly ERROR: "ERROR";
    readonly HINT: "HINT";
    readonly INFORMATION: "INFORMATION";
    readonly WARNING: "WARNING";
};
/**
 * @public
 */
export type DiagnosticSeverity = typeof DiagnosticSeverity[keyof typeof DiagnosticSeverity];
/**
 * Structure to represent metadata about a Runtime Diagnostics
 * @public
 */
export interface RuntimeDiagnostic {
    /**
     * A human-readable string describing the source of the diagnostic
     * @public
     */
    source: string | undefined;
    /**
     * Diagnostic Error type
     * @public
     */
    severity: DiagnosticSeverity | undefined;
    /**
     * The diagnostic's message.
     * @public
     */
    message: string | undefined;
}
/**
 * @internal
 */
export declare const RuntimeDiagnosticFilterSensitiveLog: (obj: RuntimeDiagnostic) => any;
/**
 * @public
 * @enum
 */
export declare const SymbolType: {
    readonly DECLARATION: "DECLARATION";
    readonly USAGE: "USAGE";
};
/**
 * @public
 */
export type SymbolType = typeof SymbolType[keyof typeof SymbolType];
/**
 * @public
 */
export interface DocumentSymbol {
    /**
     * Name of the Document Symbol
     * @public
     */
    name: string | undefined;
    /**
     * Symbol type - DECLARATION / USAGE
     * @public
     */
    type: SymbolType | undefined;
    /**
     * Symbol package / source for FullyQualified names
     * @public
     */
    source?: string;
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
    relativeFilePath: string | undefined;
    /**
     * The text document's language identifier.
     * @public
     */
    programmingLanguage?: ProgrammingLanguage;
    /**
     * Content of the text document
     * @public
     */
    text?: string;
    /**
     * DocumentSymbols parsed from a text document
     * @public
     */
    documentSymbols?: (DocumentSymbol)[];
}
/**
 * @internal
 */
export declare const TextDocumentFilterSensitiveLog: (obj: TextDocument) => any;
/**
 * Indicates Cursor postion in a Text Document
 * @public
 */
export interface Position {
    /**
     * Line position in a document.
     * @public
     */
    line: number | undefined;
    /**
     * Character offset on a line in a document (zero-based)
     * @public
     */
    character: number | undefined;
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
    start: Position | undefined;
    /**
     * The range's end position.
     * @public
     */
    end: Position | undefined;
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
    document: TextDocument | undefined;
    /**
     * The range at which the message applies.
     * @public
     */
    range: Range | undefined;
    /**
     * A human-readable string describing the source of the diagnostic
     * @public
     */
    source: string | undefined;
    /**
     * Diagnostic Error type
     * @public
     */
    severity: DiagnosticSeverity | undefined;
    /**
     * The diagnostic's message.
     * @public
     */
    message: string | undefined;
}
/**
 * @internal
 */
export declare const TextDocumentDiagnosticFilterSensitiveLog: (obj: TextDocumentDiagnostic) => any;
/**
 * Represents a Diagnostic message
 * @public
 */
export type Diagnostic = Diagnostic.RuntimeDiagnosticMember | Diagnostic.TextDocumentDiagnosticMember | Diagnostic.$UnknownMember;
/**
 * @public
 */
export declare namespace Diagnostic {
    /**
     * Diagnostics originating from a TextDocument
     * @public
     */
    interface TextDocumentDiagnosticMember {
        textDocumentDiagnostic: TextDocumentDiagnostic;
        runtimeDiagnostic?: never;
        $unknown?: never;
    }
    /**
     * Diagnostics originating from a Runtime
     * @public
     */
    interface RuntimeDiagnosticMember {
        textDocumentDiagnostic?: never;
        runtimeDiagnostic: RuntimeDiagnostic;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        textDocumentDiagnostic?: never;
        runtimeDiagnostic?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        textDocumentDiagnostic: (value: TextDocumentDiagnostic) => T;
        runtimeDiagnostic: (value: RuntimeDiagnostic) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: Diagnostic, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const DiagnosticFilterSensitiveLog: (obj: Diagnostic) => any;
/**
 * Represents the state of the Cursor in an Editor
 * @public
 */
export type CursorState = CursorState.PositionMember | CursorState.RangeMember | CursorState.$UnknownMember;
/**
 * @public
 */
export declare namespace CursorState {
    /**
     * Represents a cursor position in a Text Document
     * @public
     */
    interface PositionMember {
        position: Position;
        range?: never;
        $unknown?: never;
    }
    /**
     * Represents a text selection in a Text Document
     * @public
     */
    interface RangeMember {
        position?: never;
        range: Range;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        position?: never;
        range?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        position: (value: Position) => T;
        range: (value: Range) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: CursorState, visitor: Visitor<T>) => T;
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
    relativeFilePath: string | undefined;
    /**
     * The text document's language identifier.
     * @public
     */
    programmingLanguage?: ProgrammingLanguage;
    /**
     * Content of the text document
     * @public
     */
    text?: string;
    /**
     * DocumentSymbols parsed from a text document
     * @public
     */
    documentSymbols?: (DocumentSymbol)[];
}
/**
 * @internal
 */
export declare const RelevantTextDocumentFilterSensitiveLog: (obj: RelevantTextDocument) => any;
/**
 * Represents the state of an Editor
 * @public
 */
export interface EditorState {
    /**
     * Represents currently edited file
     * @public
     */
    document?: TextDocument;
    /**
     * Position of the cursor
     * @public
     */
    cursorState?: CursorState;
    /**
     * Represents IDE provided relevant files
     * @public
     */
    relevantDocuments?: (RelevantTextDocument)[];
    /**
     * Whether service should use relevant document in prompt
     * @public
     */
    useRelevantDocuments?: boolean;
}
/**
 * @internal
 */
export declare const EditorStateFilterSensitiveLog: (obj: EditorState) => any;
/**
 * An environment variable
 * @public
 */
export interface EnvironmentVariable {
    /**
     * The key of an environment variable
     * @public
     */
    key?: string;
    /**
     * The value of an environment variable
     * @public
     */
    value?: string;
}
/**
 * @internal
 */
export declare const EnvironmentVariableFilterSensitiveLog: (obj: EnvironmentVariable) => any;
/**
 * State related to the user's environment
 * @public
 */
export interface EnvState {
    /**
     * The name of the operating system in use
     * @public
     */
    operatingSystem?: string;
    /**
     * The current working directory of the environment
     * @public
     */
    currentWorkingDirectory?: string;
    /**
     * The environment variables set in the current environment
     * @public
     */
    environmentVariables?: (EnvironmentVariable)[];
}
/**
 * @internal
 */
export declare const EnvStateFilterSensitiveLog: (obj: EnvState) => any;
/**
 * State related to the Git VSC
 * @public
 */
export interface GitState {
    /**
     * The output of the command `git status --porcelain=v1 -b`
     * @public
     */
    status?: string;
}
/**
 * @internal
 */
export declare const GitStateFilterSensitiveLog: (obj: GitState) => any;
/**
 * An single entry in the shell history
 * @public
 */
export interface ShellHistoryEntry {
    /**
     * The shell command that was run
     * @public
     */
    command: string | undefined;
    /**
     * The directory the command was ran in
     * @public
     */
    directory?: string;
    /**
     * The exit code of the command after it finished
     * @public
     */
    exitCode?: number;
    /**
     * The stdout from the command
     * @public
     */
    stdout?: string;
    /**
     * The stderr from the command
     * @public
     */
    stderr?: string;
}
/**
 * @internal
 */
export declare const ShellHistoryEntryFilterSensitiveLog: (obj: ShellHistoryEntry) => any;
/**
 * Represents the state of a shell
 * @public
 */
export interface ShellState {
    /**
     * The name of the current shell
     * @public
     */
    shellName: string | undefined;
    /**
     * The history previous shell commands for the current shell
     * @public
     */
    shellHistory?: (ShellHistoryEntry)[];
}
/**
 * @internal
 */
export declare const ShellStateFilterSensitiveLog: (obj: ShellState) => any;
/**
 * Settings information passed by the Q widget
 * @public
 */
export interface UserSettings {
    hasConsentedToCrossRegionCalls?: boolean;
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
    editorState?: EditorState;
    /**
     * Shell state chat message context.
     * @public
     */
    shellState?: ShellState;
    /**
     * Git state chat message context.
     * @public
     */
    gitState?: GitState;
    /**
     * Environment state chat message context.
     * @public
     */
    envState?: EnvState;
    /**
     * The state of a user's AppStudio UI when sending a message.
     * @public
     */
    appStudioContext?: AppStudioState;
    /**
     * Diagnostic chat message context.
     * @public
     */
    diagnostic?: Diagnostic;
    /**
     * Contextual information about the environment from which the user is calling.
     * @public
     */
    consoleState?: ConsoleState;
    /**
     * Settings information, e.g., whether the user has enabled cross-region API calls.
     * @public
     */
    userSettings?: UserSettings;
}
/**
 * @internal
 */
export declare const UserInputMessageContextFilterSensitiveLog: (obj: UserInputMessageContext) => any;
/**
 * Structure to represent a chat input message from User
 * @public
 */
export interface UserInputMessage {
    /**
     * The content of the chat message.
     * @public
     */
    content: string | undefined;
    /**
     * Chat message context associated with the Chat Message
     * @public
     */
    userInputMessageContext?: UserInputMessageContext;
    /**
     * User Intent
     * @public
     */
    userIntent?: UserIntent;
}
/**
 * @internal
 */
export declare const UserInputMessageFilterSensitiveLog: (obj: UserInputMessage) => any;
/**
 * @public
 */
export type ChatMessage = ChatMessage.AssistantResponseMessageMember | ChatMessage.UserInputMessageMember | ChatMessage.$UnknownMember;
/**
 * @public
 */
export declare namespace ChatMessage {
    /**
     * Structure to represent a chat input message from User
     * @public
     */
    interface UserInputMessageMember {
        userInputMessage: UserInputMessage;
        assistantResponseMessage?: never;
        $unknown?: never;
    }
    /**
     * Markdown text message.
     * @public
     */
    interface AssistantResponseMessageMember {
        userInputMessage?: never;
        assistantResponseMessage: AssistantResponseMessage;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        userInputMessage?: never;
        assistantResponseMessage?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        userInputMessage: (value: UserInputMessage) => T;
        assistantResponseMessage: (value: AssistantResponseMessage) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: ChatMessage, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const ChatMessageFilterSensitiveLog: (obj: ChatMessage) => any;
/**
 * Streaming response event for generated code text.
 * @public
 */
export interface CodeEvent {
    /**
     * Generated code snippet.
     * @public
     */
    content: string | undefined;
}
/**
 * @internal
 */
export declare const CodeEventFilterSensitiveLog: (obj: CodeEvent) => any;
/**
 * Streaming Response Event for CodeReferences
 * @public
 */
export interface CodeReferenceEvent {
    /**
     * Code References for Assistant Response Message
     * @public
     */
    references?: (Reference)[];
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
    followupPrompt?: FollowupPrompt;
}
/**
 * @internal
 */
export declare const FollowupPromptEventFilterSensitiveLog: (obj: FollowupPromptEvent) => any;
/**
 * @public
 * @enum
 */
export declare const IntentType: {
    readonly GLUE_SENSEI: "GLUE_SENSEI";
    readonly RESOURCE_DATA: "RESOURCE_DATA";
    readonly SUPPORT: "SUPPORT";
};
/**
 * @public
 */
export type IntentType = typeof IntentType[keyof typeof IntentType];
/**
 * @public
 */
export type IntentDataType = IntentDataType.StringMember | IntentDataType.$UnknownMember;
/**
 * @public
 */
export declare namespace IntentDataType {
    interface StringMember {
        string: string;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        string?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        string: (value: string) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: IntentDataType, visitor: Visitor<T>) => T;
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
    intents?: Partial<Record<IntentType, Record<string, IntentDataType>>>;
}
/**
 * @internal
 */
export declare const IntentsEventFilterSensitiveLog: (obj: IntentsEvent) => any;
/**
 * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
 * @public
 */
export interface Text {
    /**
     * Contains text content that may include sensitive information and can support Markdown formatting.
     * @public
     */
    content: string | undefined;
}
/**
 * @internal
 */
export declare const TextFilterSensitiveLog: (obj: Text) => any;
/**
 * @public
 */
export interface AlertComponent {
    /**
     * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
     * @public
     */
    text?: Text;
}
/**
 * @internal
 */
export declare const AlertComponentFilterSensitiveLog: (obj: AlertComponent) => any;
/**
 * @public
 * @enum
 */
export declare const AlertType: {
    /**
     * Alert indicating an error or failure that requires attention.
     */
    readonly ERROR: "ERROR";
    /**
     * Informational alert providing general information.
     */
    readonly INFO: "INFO";
    /**
     * Alert indicating a warning or potential issue that should be noted.
     */
    readonly WARNING: "WARNING";
};
/**
 * @public
 */
export type AlertType = typeof AlertType[keyof typeof AlertType];
/**
 * Structure representing an alert with a type and content.
 * @public
 */
export interface Alert {
    /**
     * Enum defining types of alerts that can be issued.
     * @public
     */
    type: AlertType | undefined;
    /**
     * Contains the content of the alert, which may include sensitive information.
     * @public
     */
    content: (AlertComponent)[] | undefined;
}
/**
 * @internal
 */
export declare const AlertFilterSensitiveLog: (obj: Alert) => any;
/**
 * Structure describing a transition between two states in an infrastructure update.
 * @public
 */
export interface InfrastructureUpdateTransition {
    /**
     * The current state of the infrastructure before the update.
     * @public
     */
    currentState: string | undefined;
    /**
     * The next state of the infrastructure following the update.
     * @public
     */
    nextState: string | undefined;
}
/**
 * @internal
 */
export declare const InfrastructureUpdateTransitionFilterSensitiveLog: (obj: InfrastructureUpdateTransition) => any;
/**
 * Structure representing different types of infrastructure updates.
 * @public
 */
export interface InfrastructureUpdate {
    /**
     * Structure describing a transition between two states in an infrastructure update.
     * @public
     */
    transition?: InfrastructureUpdateTransition;
}
/**
 * @internal
 */
export declare const InfrastructureUpdateFilterSensitiveLog: (obj: InfrastructureUpdate) => any;
/**
 * @public
 */
export interface StepComponent {
    /**
     * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
     * @public
     */
    text?: Text;
}
/**
 * @internal
 */
export declare const StepComponentFilterSensitiveLog: (obj: StepComponent) => any;
/**
 * @public
 * @enum
 */
export declare const StepState: {
    /**
     * Indicates a failure or issue that needs to be addressed.
     */
    readonly FAILED: "FAILED";
    /**
     * Indicates that the step is currently being processed. This is a non-terminal state, meaning the process is active and ongoing.
     */
    readonly IN_PROGRESS: "IN_PROGRESS";
    /**
     * Indicates that the step is being loaded or initialized. This is a non-terminal state, meaning the process is in the setup phase.
     */
    readonly LOADING: "LOADING";
    /**
     * Indicates that the step is temporarily halted but can resume. This is a non-terminal state, representing a temporary pause.
     */
    readonly PAUSED: "PAUSED";
    /**
     * Indicates that the step is waiting for some condition or input. This is a non-terminal state, meaning the process is paused but not complete.
     */
    readonly PENDING: "PENDING";
    /**
     * Indicates that the step was stopped, either intentionally or unintentionally.
     */
    readonly STOPPED: "STOPPED";
    /**
     * Indicates successful completion of the step.
     */
    readonly SUCCEEDED: "SUCCEEDED";
};
/**
 * @public
 */
export type StepState = typeof StepState[keyof typeof StepState];
/**
 * Structure representing an individual step in a process.
 * @public
 */
export interface Step {
    /**
     * A unique identifier for the step. It must be a non-negative integer to ensure each step is distinct.
     * @public
     */
    id: number | undefined;
    /**
     * Enum representing all possible step states, combining terminal and non-terminal states.
     * @public
     */
    state: StepState | undefined;
    /**
     * A label for the step, providing a concise description.
     * @public
     */
    label: string | undefined;
    /**
     * Optional content providing additional details about the step.
     * @public
     */
    content?: (StepComponent)[];
}
/**
 * @internal
 */
export declare const StepFilterSensitiveLog: (obj: Step) => any;
/**
 * @public
 */
export interface ProgressComponent {
    /**
     * Structure representing an individual step in a process.
     * @public
     */
    step?: Step;
}
/**
 * @internal
 */
export declare const ProgressComponentFilterSensitiveLog: (obj: ProgressComponent) => any;
/**
 * Structure representing a collection of steps in a process.
 * @public
 */
export interface Progress {
    /**
     * A collection of steps that make up a process. Each step is detailed using the Step structure.
     * @public
     */
    content: (ProgressComponent)[] | undefined;
}
/**
 * @internal
 */
export declare const ProgressFilterSensitiveLog: (obj: Progress) => any;
/**
 * Structure representing a resource item
 * @public
 */
export interface Resource {
    /**
     * Card title.
     * @public
     */
    title: string | undefined;
    /**
     * Link for the resource item
     * @public
     */
    link: string | undefined;
    /**
     * Short text about that resource for example Region: us-east-1
     * @public
     */
    description: string | undefined;
    /**
     * Resource type e.g AWS EC2
     * @public
     */
    type: string | undefined;
    /**
     * Amazon resource number e.g arn:aws:aec:.....
     * @public
     */
    ARN: string | undefined;
    /**
     * A stringified object
     * @public
     */
    resourceJsonString: string | undefined;
}
/**
 * @internal
 */
export declare const ResourceFilterSensitiveLog: (obj: Resource) => any;
/**
 * For CloudWatch Troubleshooting Link Module
 * @public
 */
export interface CloudWatchTroubleshootingLink {
    /**
     * A label for the link.
     * @public
     */
    label: string | undefined;
    /**
     * Stringified JSON payload. See spec here https://code.amazon.com/packages/CloudWatchOdysseyModel/blobs/50c0832f0e393e4ab68827eb4f04d832366821c1/--/model/events.smithy#L28 .
     * @public
     */
    investigationPayload: string | undefined;
    /**
     * Fallback string, if target channel does not support the CloudWatchTroubleshootingLink.
     * @public
     */
    defaultText?: string;
}
/**
 * @internal
 */
export declare const CloudWatchTroubleshootingLinkFilterSensitiveLog: (obj: CloudWatchTroubleshootingLink) => any;
/**
 * @public
 */
export type ModuleLink = ModuleLink.CloudWatchTroubleshootingLinkMember | ModuleLink.$UnknownMember;
/**
 * @public
 */
export declare namespace ModuleLink {
    /**
     * For CloudWatch Troubleshooting Link Module
     * @public
     */
    interface CloudWatchTroubleshootingLinkMember {
        cloudWatchTroubleshootingLink: CloudWatchTroubleshootingLink;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        cloudWatchTroubleshootingLink?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        cloudWatchTroubleshootingLink: (value: CloudWatchTroubleshootingLink) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: ModuleLink, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const ModuleLinkFilterSensitiveLog: (obj: ModuleLink) => any;
/**
 * @public
 */
export interface WebLink {
    /**
     * A label for the link
     * @public
     */
    label: string | undefined;
    /**
     * URL of the Weblink
     * @public
     */
    url: string | undefined;
}
/**
 * @internal
 */
export declare const WebLinkFilterSensitiveLog: (obj: WebLink) => any;
/**
 * @public
 */
export type Action = Action.ModuleLinkMember | Action.WebLinkMember | Action.$UnknownMember;
/**
 * @public
 */
export declare namespace Action {
    interface WebLinkMember {
        webLink: WebLink;
        moduleLink?: never;
        $unknown?: never;
    }
    interface ModuleLinkMember {
        webLink?: never;
        moduleLink: ModuleLink;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        webLink?: never;
        moduleLink?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        webLink: (value: WebLink) => T;
        moduleLink: (value: ModuleLink) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: Action, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const ActionFilterSensitiveLog: (obj: Action) => any;
/**
 * Structure representing a list of Items
 * @public
 */
export interface ResourceList {
    /**
     * Action associated with the list
     * @public
     */
    action?: Action;
    /**
     * List of resources
     * @public
     */
    items: (Resource)[] | undefined;
}
/**
 * @internal
 */
export declare const ResourceListFilterSensitiveLog: (obj: ResourceList) => any;
/**
 * @public
 */
export type SectionComponent = SectionComponent.AlertMember | SectionComponent.ResourceMember | SectionComponent.ResourceListMember | SectionComponent.TextMember | SectionComponent.$UnknownMember;
/**
 * @public
 */
export declare namespace SectionComponent {
    /**
     * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
     * @public
     */
    interface TextMember {
        text: Text;
        alert?: never;
        resource?: never;
        resourceList?: never;
        $unknown?: never;
    }
    /**
     * Structure representing an alert with a type and content.
     * @public
     */
    interface AlertMember {
        text?: never;
        alert: Alert;
        resource?: never;
        resourceList?: never;
        $unknown?: never;
    }
    /**
     * Structure representing a resource item
     * @public
     */
    interface ResourceMember {
        text?: never;
        alert?: never;
        resource: Resource;
        resourceList?: never;
        $unknown?: never;
    }
    /**
     * Structure representing a list of Items
     * @public
     */
    interface ResourceListMember {
        text?: never;
        alert?: never;
        resource?: never;
        resourceList: ResourceList;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        text?: never;
        alert?: never;
        resource?: never;
        resourceList?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        text: (value: Text) => T;
        alert: (value: Alert) => T;
        resource: (value: Resource) => T;
        resourceList: (value: ResourceList) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: SectionComponent, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const SectionComponentFilterSensitiveLog: (obj: SectionComponent) => any;
/**
 * Structure representing a collapsable section
 * @public
 */
export interface Section {
    /**
     * Contains text content that may include sensitive information and can support Markdown formatting.
     * @public
     */
    title: string | undefined;
    /**
     * Contains a list of interaction components e.g Text, Alert ,List ...etc
     * @public
     */
    content: (SectionComponent)[] | undefined;
}
/**
 * @internal
 */
export declare const SectionFilterSensitiveLog: (obj: Section) => any;
/**
 * Structure representing a suggestion for follow-ups.
 * @public
 */
export interface Suggestion {
    value: string | undefined;
}
/**
 * Structure containing a list of suggestions.
 * @public
 */
export interface Suggestions {
    items: (Suggestion)[] | undefined;
}
/**
 * Structure representing a confirmation message related to a task action.
 * @public
 */
export interface TaskActionConfirmation {
    /**
     * Confirmation message related to the action note, which may include sensitive information.
     * @public
     */
    content?: string;
}
/**
 * @internal
 */
export declare const TaskActionConfirmationFilterSensitiveLog: (obj: TaskActionConfirmation) => any;
/**
 * @public
 * @enum
 */
export declare const TaskActionNoteType: {
    /**
     * Information note providing general details.
     */
    readonly INFO: "INFO";
    /**
     * Warning note indicating a potential issue.
     */
    readonly WARNING: "WARNING";
};
/**
 * @public
 */
export type TaskActionNoteType = typeof TaskActionNoteType[keyof typeof TaskActionNoteType];
/**
 * Structure representing a note associated with a task action.
 * @public
 */
export interface TaskActionNote {
    /**
     * Content of the note, which may include sensitive information.
     * @public
     */
    content: string | undefined;
    /**
     * Enum defining the types of notes that can be associated with a task action.
     * @public
     */
    type?: TaskActionNoteType;
}
/**
 * @internal
 */
export declare const TaskActionNoteFilterSensitiveLog: (obj: TaskActionNote) => any;
/**
 * Structure representing an action associated with a task.
 * @public
 */
export interface TaskAction {
    /**
     * A label for the action.
     * @public
     */
    label: string | undefined;
    /**
     * Structure representing a note associated with a task action.
     * @public
     */
    note?: TaskActionNote;
    /**
     * Indicates whether the action is primary or not.
     * @public
     */
    primary?: boolean;
    /**
     * Indicates whether the action is disabled or not.
     * @public
     */
    disabled?: boolean;
    /**
     * Map representing key-value pairs for the payload of a task action.
     * @public
     */
    payload: Record<string, string> | undefined;
    /**
     * Structure representing a confirmation message related to a task action.
     * @public
     */
    confirmation?: TaskActionConfirmation;
}
/**
 * @internal
 */
export declare const TaskActionFilterSensitiveLog: (obj: TaskAction) => any;
/**
 * Structure representing different types of components that can be part of a task.
 * @public
 */
export interface TaskComponent {
    /**
     * Structure representing a simple text component with sensitive content, which can include Markdown formatting.
     * @public
     */
    text?: Text;
    /**
     * Structure representing different types of infrastructure updates.
     * @public
     */
    infrastructureUpdate?: InfrastructureUpdate;
    /**
     * Structure representing an alert with a type and content.
     * @public
     */
    alert?: Alert;
    /**
     * Structure representing a collection of steps in a process.
     * @public
     */
    progress?: Progress;
}
/**
 * @internal
 */
export declare const TaskComponentFilterSensitiveLog: (obj: TaskComponent) => any;
/**
 * Structure representing an overview of a task, including a label and description.
 * @public
 */
export interface TaskOverview {
    /**
     * A label for the task overview.
     * @public
     */
    label: string | undefined;
    /**
     * Text description providing details about the task. This field may include sensitive information and supports Markdown formatting.
     * @public
     */
    description: string | undefined;
}
/**
 * @internal
 */
export declare const TaskOverviewFilterSensitiveLog: (obj: TaskOverview) => any;
/**
 * Structure containing details about a task.
 * @public
 */
export interface TaskDetails {
    /**
     * Structure representing an overview of a task, including a label and description.
     * @public
     */
    overview: TaskOverview | undefined;
    /**
     * Lists the components that can be used to form the task's content.
     * @public
     */
    content: (TaskComponent)[] | undefined;
    /**
     * Optional list of actions associated with the task.
     * @public
     */
    actions?: (TaskAction)[];
}
/**
 * @internal
 */
export declare const TaskDetailsFilterSensitiveLog: (obj: TaskDetails) => any;
/**
 * Structure representing a reference to a task.
 * @public
 */
export interface TaskReference {
    /**
     * Unique identifier for the task.
     * @public
     */
    taskId: string | undefined;
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
    text?: Text;
    /**
     * Structure representing an alert with a type and content.
     * @public
     */
    alert?: Alert;
    /**
     * Structure representing different types of infrastructure updates.
     * @public
     */
    infrastructureUpdate?: InfrastructureUpdate;
    /**
     * Structure representing a collection of steps in a process.
     * @public
     */
    progress?: Progress;
    /**
     * Structure representing an individual step in a process.
     * @public
     */
    step?: Step;
    /**
     * Structure containing details about a task.
     * @public
     */
    taskDetails?: TaskDetails;
    /**
     * Structure representing a reference to a task.
     * @public
     */
    taskReference?: TaskReference;
    /**
     * Structure containing a list of suggestions.
     * @public
     */
    suggestions?: Suggestions;
    /**
     * Structure representing a collapsable section
     * @public
     */
    section?: Section;
    /**
     * Structure representing a resource item
     * @public
     */
    resource?: Resource;
    /**
     * Structure representing a list of Items
     * @public
     */
    resourceList?: ResourceList;
}
/**
 * @internal
 */
export declare const InteractionComponentFilterSensitiveLog: (obj: InteractionComponent) => any;
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
    interactionComponentId?: string;
    /**
     * Interaction component
     * @public
     */
    interactionComponent: InteractionComponent | undefined;
}
/**
 * @internal
 */
export declare const InteractionComponentEntryFilterSensitiveLog: (obj: InteractionComponentEntry) => any;
/**
 * Streaming Event for interaction components list
 * @public
 */
export interface InteractionComponentsEvent {
    /**
     * List of identifiable interaction components
     * @public
     */
    interactionComponentEntries: (InteractionComponentEntry)[] | undefined;
}
/**
 * @internal
 */
export declare const InteractionComponentsEventFilterSensitiveLog: (obj: InteractionComponentsEvent) => any;
/**
 * @public
 * @enum
 */
export declare const InvalidStateReason: {
    readonly INVALID_TASK_ASSIST_PLAN: "INVALID_TASK_ASSIST_PLAN";
};
/**
 * @public
 */
export type InvalidStateReason = typeof InvalidStateReason[keyof typeof InvalidStateReason];
/**
 * Streaming Response Event when an Invalid State is reached
 * @public
 */
export interface InvalidStateEvent {
    /**
     * Reasons for Invalid State Event
     * @public
     */
    reason: InvalidStateReason | undefined;
    message: string | undefined;
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
    conversationId?: string;
    /**
     * Unique identifier for the utterance
     * @public
     */
    utteranceId?: string;
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
    supplementaryWebLinks?: (SupplementaryWebLink)[];
}
/**
 * @internal
 */
export declare const SupplementaryWebLinksEventFilterSensitiveLog: (obj: SupplementaryWebLinksEvent) => any;
/**
 * Streaming events from UniDirectional Streaming Conversational APIs.
 * @public
 */
export type ChatResponseStream = ChatResponseStream.AssistantResponseEventMember | ChatResponseStream.CodeEventMember | ChatResponseStream.CodeReferenceEventMember | ChatResponseStream.DryRunSucceedEventMember | ChatResponseStream.ErrorMember | ChatResponseStream.FollowupPromptEventMember | ChatResponseStream.IntentsEventMember | ChatResponseStream.InteractionComponentsEventMember | ChatResponseStream.InvalidStateEventMember | ChatResponseStream.MessageMetadataEventMember | ChatResponseStream.SupplementaryWebLinksEventMember | ChatResponseStream.$UnknownMember;
/**
 * @public
 */
export declare namespace ChatResponseStream {
    /**
     * Message Metadata event
     * @public
     */
    interface MessageMetadataEventMember {
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
    interface AssistantResponseEventMember {
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
    interface DryRunSucceedEventMember {
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
    interface CodeReferenceEventMember {
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
    interface SupplementaryWebLinksEventMember {
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
    interface FollowupPromptEventMember {
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
    interface CodeEventMember {
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
    interface IntentsEventMember {
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
    interface InteractionComponentsEventMember {
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
    interface InvalidStateEventMember {
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
    interface ErrorMember {
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
    interface $UnknownMember {
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
    interface Visitor<T> {
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
    const visit: <T>(value: ChatResponseStream, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const ChatResponseStreamFilterSensitiveLog: (obj: ChatResponseStream) => any;
/**
 * @public
 * @enum
 */
export declare const ChatTriggerType: {
    /**
     * Indicates the Chat was triggered in response to a IDE diagnostic
     */
    readonly DIAGNOSTIC: "DIAGNOSTIC";
    /**
     * Indicates the Chat was triggered in response to an inline chat event
     */
    readonly INLINE_CHAT: "INLINE_CHAT";
    /**
     * Indicates the Chat was triggered due to an explicit chat request by an end-user
     */
    readonly MANUAL: "MANUAL";
};
/**
 * @public
 */
export type ChatTriggerType = typeof ChatTriggerType[keyof typeof ChatTriggerType];
/**
 * CommandInput can be extended to either a list of strings or a single string.
 * @public
 */
export type CommandInput = CommandInput.CommandsListMember | CommandInput.$UnknownMember;
/**
 * @public
 */
export declare namespace CommandInput {
    /**
     * The list of context items used to generate output.
     * @public
     */
    interface CommandsListMember {
        commandsList: (string)[];
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        commandsList?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        commandsList: (value: (string)[]) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: CommandInput, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const CommandInputFilterSensitiveLog: (obj: CommandInput) => any;
/**
 * Structure to represent the current state of a chat conversation.
 * @public
 */
export interface ConversationState {
    /**
     * Unique identifier for the chat conversation stream
     * @public
     */
    conversationId?: string;
    /**
     * Holds the history of chat messages.
     * @public
     */
    history?: (ChatMessage)[];
    /**
     * Holds the current message being processed or displayed.
     * @public
     */
    currentMessage: ChatMessage | undefined;
    /**
     * Trigger Reason for Chat
     * @public
     */
    chatTriggerType: ChatTriggerType | undefined;
    customizationArn?: string;
}
/**
 * @internal
 */
export declare const ConversationStateFilterSensitiveLog: (obj: ConversationState) => any;
/**
 * This exception is translated to a 204 as it succeeded the IAM Auth.
 * @public
 */
export declare class DryRunOperationException extends __BaseException {
    readonly name: "DryRunOperationException";
    readonly $fault: "client";
    responseCode?: number;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<DryRunOperationException, __BaseException>);
}
/**
 * @public
 * @enum
 */
export declare const OutputFormat: {
    readonly JAVA_CDK: "java/cdk";
    readonly JSON_CFN: "json/cfn";
    readonly PYTHON_CDK: "python/cdk";
    readonly TYPESCRIPT_CDK: "typescript/cdk";
    readonly YAML_CFN: "yaml/cfn";
};
/**
 * @public
 */
export type OutputFormat = typeof OutputFormat[keyof typeof OutputFormat];
/**
 * This exception is thrown when request was denied due to caller exceeding their usage limits
 * @public
 */
export declare class ServiceQuotaExceededException extends __BaseException {
    readonly name: "ServiceQuotaExceededException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ServiceQuotaExceededException, __BaseException>);
}
/**
 * @public
 * @enum
 */
export declare const Origin: {
    /**
     * AWS Chatbot
     */
    readonly CHATBOT: "CHATBOT";
    /**
     * AWS Management Console (https://<region>.console.aws.amazon.com)
     */
    readonly CONSOLE: "CONSOLE";
    /**
     * AWS Documentation Website (https://docs.aws.amazon.com)
     */
    readonly DOCUMENTATION: "DOCUMENTATION";
    /**
     * Any IDE caller.
     */
    readonly IDE: "IDE";
    /**
     * AWS Marketing Website (https://aws.amazon.com)
     */
    readonly MARKETING: "MARKETING";
    /**
     * MD.
     */
    readonly MD: "MD";
    /**
     * AWS Mobile Application (ACMA)
     */
    readonly MOBILE: "MOBILE";
    /**
     * Internal Service Traffic (Integ Tests, Canaries, etc.). This is the default when no Origin header present in request.
     */
    readonly SERVICE_INTERNAL: "SERVICE_INTERNAL";
    /**
     * Unified Search in AWS Management Console (https://<region>.console.aws.amazon.com)
     */
    readonly UNIFIED_SEARCH: "UNIFIED_SEARCH";
    /**
     * Origin header is not set.
     */
    readonly UNKNOWN: "UNKNOWN";
};
/**
 * @public
 */
export type Origin = typeof Origin[keyof typeof Origin];
/**
 * Structure to represent a SendMessage request.
 * @public
 */
export interface SendMessageRequest {
    /**
     * Structure to represent the current state of a chat conversation.
     * @public
     */
    conversationState: ConversationState | undefined;
    profileArn?: string;
    /**
     * The origin of the caller
     * @public
     */
    source?: Origin;
    dryRun?: boolean;
}
/**
 * @internal
 */
export declare const SendMessageRequestFilterSensitiveLog: (obj: SendMessageRequest) => any;
/**
 * Structure to represent a SendMessage response.
 * @public
 */
export interface SendMessageResponse {
    /**
     * Streaming events from UniDirectional Streaming Conversational APIs.
     * @public
     */
    sendMessageResponse: AsyncIterable<ChatResponseStream> | undefined;
}
/**
 * @internal
 */
export declare const SendMessageResponseFilterSensitiveLog: (obj: SendMessageResponse) => any;
/**
 * @public
 */
export interface GenerateCodeFromCommandsRequest {
    /**
     * Format of the output - language/format eg. typescript/cdk
     * @public
     */
    outputFormat: OutputFormat | undefined;
    /**
     * CommandInput can be extended to either a list of strings or a single string.
     * @public
     */
    commands: CommandInput | undefined;
}
/**
 * @internal
 */
export declare const GenerateCodeFromCommandsRequestFilterSensitiveLog: (obj: GenerateCodeFromCommandsRequest) => any;
/**
 * Streaming events from UniDirectional streaming infrastructure code generation APIs.
 * @public
 */
export type GenerateCodeFromCommandsResponseStream = GenerateCodeFromCommandsResponseStream.ErrorMember | GenerateCodeFromCommandsResponseStream.QuotaLevelExceededErrorMember | GenerateCodeFromCommandsResponseStream.ValidationErrorMember | GenerateCodeFromCommandsResponseStream.CodeEventMember | GenerateCodeFromCommandsResponseStream.$UnknownMember;
/**
 * @public
 */
export declare namespace GenerateCodeFromCommandsResponseStream {
    /**
     * Generated code snippet
     * @public
     */
    interface CodeEventMember {
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
    interface ErrorMember {
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
    interface QuotaLevelExceededErrorMember {
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
    interface ValidationErrorMember {
        codeEvent?: never;
        Error?: never;
        QuotaLevelExceededError?: never;
        ValidationError: ValidationException;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        codeEvent?: never;
        Error?: never;
        QuotaLevelExceededError?: never;
        ValidationError?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        codeEvent: (value: CodeEvent) => T;
        Error: (value: InternalServerException) => T;
        QuotaLevelExceededError: (value: ServiceQuotaExceededException) => T;
        ValidationError: (value: ValidationException) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: GenerateCodeFromCommandsResponseStream, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const GenerateCodeFromCommandsResponseStreamFilterSensitiveLog: (obj: GenerateCodeFromCommandsResponseStream) => any;
/**
 * Structure to represent generated code response.
 * @public
 */
export interface GenerateCodeFromCommandsResponse {
    /**
     * Streaming events from UniDirectional streaming infrastructure code generation APIs.
     * @public
     */
    generatedCodeFromCommandsResponse: AsyncIterable<GenerateCodeFromCommandsResponseStream> | undefined;
}
/**
 * @internal
 */
export declare const GenerateCodeFromCommandsResponseFilterSensitiveLog: (obj: GenerateCodeFromCommandsResponse) => any;
