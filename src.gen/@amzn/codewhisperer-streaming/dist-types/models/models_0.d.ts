import { CodeWhispererStreamingServiceException as __BaseException } from "./CodeWhispererStreamingServiceException";
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
 * @public
 * This exception is thrown when the user does not have sufficient access to perform this action.
 */
export declare class AccessDeniedException extends __BaseException {
    readonly name: "AccessDeniedException";
    readonly $fault: "client";
    /**
     * @public
     * Reason for AccessDeniedException
     */
    reason?: AccessDeniedExceptionReason | string;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<AccessDeniedException, __BaseException>);
}
/**
 * @public
 * This exception is thrown when an unexpected error occurred during the processing of a request.
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
 * @public
 * This exception is thrown when describing a resource that does not exist.
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
 * @public
 * This exception is thrown when request was denied due to request throttling.
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
};
/**
 * @public
 */
export type ValidationExceptionReason = typeof ValidationExceptionReason[keyof typeof ValidationExceptionReason];
/**
 * @public
 * This exception is thrown when the input fails to satisfy the constraints specified by the service.
 */
export declare class ValidationException extends __BaseException {
    readonly name: "ValidationException";
    readonly $fault: "client";
    /**
     * @public
     * Reason for ValidationException
     */
    reason?: ValidationExceptionReason | string;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ValidationException, __BaseException>);
}
/**
 * @public
 * Description of a user's context when they are calling Q Chat from AppStudio
 */
export interface AppStudioState {
    /**
     * @public
     * The namespace of the context. Examples: 'ui.Button', 'ui.Table.DataSource', 'ui.Table.RowActions.Button', 'logic.invokeAWS', 'logic.JavaScript'
     */
    namespace: string | undefined;
    /**
     * @public
     * The name of the property. Examples: 'visibility', 'disability', 'value', 'code'
     */
    propertyName: string | undefined;
    /**
     * @public
     * The value of the property.
     */
    propertyValue?: string;
    /**
     * @public
     * Context about how the property is used
     */
    propertyContext: string | undefined;
}
/**
 * @internal
 */
export declare const AppStudioStateFilterSensitiveLog: (obj: AppStudioState) => any;
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
export declare const FollowupPromptFilterSensitiveLog: (obj: FollowupPrompt) => any;
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
export declare const SupplementaryWebLinkFilterSensitiveLog: (obj: SupplementaryWebLink) => any;
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
export declare const AssistantResponseMessageFilterSensitiveLog: (obj: AssistantResponseMessage) => any;
/**
 * @public
 * This exception is thrown when the action to perform could not be completed because the resource is in a conflicting state.
 */
export declare class ConflictException extends __BaseException {
    readonly name: "ConflictException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>);
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
export declare const ContentChecksumType: {
    readonly SHA_256: "SHA_256";
};
/**
 * @public
 */
export type ContentChecksumType = typeof ContentChecksumType[keyof typeof ContentChecksumType];
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
export declare const BinaryMetadataEventFilterSensitiveLog: (obj: BinaryMetadataEvent) => any;
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
export declare const BinaryPayloadEventFilterSensitiveLog: (obj: BinaryPayloadEvent) => any;
/**
 * @public
 * Information about the state of the AWS management console page from which the user is calling
 */
export interface ConsoleState {
    region?: string;
}
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
export declare const TextDocumentFilterSensitiveLog: (obj: TextDocument) => any;
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
export declare const TextDocumentDiagnosticFilterSensitiveLog: (obj: TextDocumentDiagnostic) => any;
/**
 * @public
 * Represents a Diagnostic message
 */
export type Diagnostic = Diagnostic.RuntimeDiagnosticMember | Diagnostic.TextDocumentDiagnosticMember | Diagnostic.$UnknownMember;
/**
 * @public
 */
export declare namespace Diagnostic {
    /**
     * @public
     * Diagnostics originating from a TextDocument
     */
    interface TextDocumentDiagnosticMember {
        textDocumentDiagnostic: TextDocumentDiagnostic;
        runtimeDiagnostic?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Diagnostics originating from a Runtime
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
 * @public
 * Represents the state of the Cursor in an Editor
 */
export type CursorState = CursorState.PositionMember | CursorState.RangeMember | CursorState.$UnknownMember;
/**
 * @public
 */
export declare namespace CursorState {
    /**
     * @public
     * Represents a cursor position in a Text Document
     */
    interface PositionMember {
        position: Position;
        range?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Represents a text selection in a Text Document
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
 * @public
 * Represents an IDE retrieved relevant Text Document / File
 */
export interface RelevantTextDocument {
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
export declare const RelevantTextDocumentFilterSensitiveLog: (obj: RelevantTextDocument) => any;
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
    /**
     * @public
     * Represents IDE provided relevant files
     */
    relevantDocuments?: (RelevantTextDocument)[];
    /**
     * @public
     * Whether service should use relevant document in prompt
     */
    useRelevantDocuments?: boolean;
}
/**
 * @internal
 */
export declare const EditorStateFilterSensitiveLog: (obj: EditorState) => any;
/**
 * @public
 * An environment variable
 */
export interface EnvironmentVariable {
    /**
     * @public
     * The key of an environment variable
     */
    key?: string;
    /**
     * @public
     * The value of an environment variable
     */
    value?: string;
}
/**
 * @internal
 */
export declare const EnvironmentVariableFilterSensitiveLog: (obj: EnvironmentVariable) => any;
/**
 * @public
 * State related to the user's environment
 */
export interface EnvState {
    /**
     * @public
     * The name of the operating system in use
     */
    operatingSystem?: string;
    /**
     * @public
     * The current working directory of the environment
     */
    currentWorkingDirectory?: string;
    /**
     * @public
     * The environment variables set in the current environment
     */
    environmentVariables?: (EnvironmentVariable)[];
}
/**
 * @internal
 */
export declare const EnvStateFilterSensitiveLog: (obj: EnvState) => any;
/**
 * @public
 * State related to the Git VSC
 */
export interface GitState {
    /**
     * @public
     * The output of the command `git status --porcelain=v1 -b`
     */
    status?: string;
}
/**
 * @internal
 */
export declare const GitStateFilterSensitiveLog: (obj: GitState) => any;
/**
 * @public
 * An single entry in the shell history
 */
export interface ShellHistoryEntry {
    /**
     * @public
     * The shell command that was run
     */
    command: string | undefined;
    /**
     * @public
     * The directory the command was ran in
     */
    directory?: string;
    /**
     * @public
     * The exit code of the command after it finished
     */
    exitCode?: number;
    /**
     * @public
     * The stdout from the command
     */
    stdout?: string;
    /**
     * @public
     * The stderr from the command
     */
    stderr?: string;
}
/**
 * @internal
 */
export declare const ShellHistoryEntryFilterSensitiveLog: (obj: ShellHistoryEntry) => any;
/**
 * @public
 * Represents the state of a shell
 */
export interface ShellState {
    /**
     * @public
     * The name of the current shell
     */
    shellName: string | undefined;
    /**
     * @public
     * The history previous shell commands for the current shell
     */
    shellHistory?: (ShellHistoryEntry)[];
}
/**
 * @internal
 */
export declare const ShellStateFilterSensitiveLog: (obj: ShellState) => any;
/**
 * @public
 * Settings information passed by the Q widget
 */
export interface UserSettings {
    hasConsentedToCrossRegionCalls?: boolean;
}
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
     * Shell state chat message context.
     */
    shellState?: ShellState;
    /**
     * @public
     * Git state chat message context.
     */
    gitState?: GitState;
    /**
     * @public
     * Environment state chat message context.
     */
    envState?: EnvState;
    /**
     * @public
     * The state of a user's AppStudio UI when sending a message.
     */
    appStudioContext?: AppStudioState;
    /**
     * @public
     * Diagnostic chat message context.
     */
    diagnostic?: Diagnostic;
    /**
     * @public
     * Contextual information about the environment from which the user is calling.
     */
    consoleState?: ConsoleState;
    /**
     * @public
     * Settings information, e.g., whether the user has enabled cross-region API calls.
     */
    userSettings?: UserSettings;
}
/**
 * @internal
 */
export declare const UserInputMessageContextFilterSensitiveLog: (obj: UserInputMessageContext) => any;
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
     * @public
     * Structure to represent a chat input message from User
     */
    interface UserInputMessageMember {
        userInputMessage: UserInputMessage;
        assistantResponseMessage?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Markdown text message.
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
 * @public
 * Streaming response event for generated code text.
 */
export interface CodeEvent {
    /**
     * @public
     * Generated code snippet.
     */
    content: string | undefined;
}
/**
 * @internal
 */
export declare const CodeEventFilterSensitiveLog: (obj: CodeEvent) => any;
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
 * @public
 * Streaming Response Event for Intents
 */
export interface IntentsEvent {
    /**
     * @public
     * A map of Intent objects
     */
    intents?: Record<string, Record<string, IntentDataType>>;
}
/**
 * @internal
 */
export declare const IntentsEventFilterSensitiveLog: (obj: IntentsEvent) => any;
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
export declare const SupplementaryWebLinksEventFilterSensitiveLog: (obj: SupplementaryWebLinksEvent) => any;
/**
 * @public
 * Streaming events from UniDirectional Streaming Conversational APIs.
 */
export type ChatResponseStream = ChatResponseStream.AssistantResponseEventMember | ChatResponseStream.CodeEventMember | ChatResponseStream.CodeReferenceEventMember | ChatResponseStream.ErrorMember | ChatResponseStream.FollowupPromptEventMember | ChatResponseStream.IntentsEventMember | ChatResponseStream.InvalidStateEventMember | ChatResponseStream.MessageMetadataEventMember | ChatResponseStream.SupplementaryWebLinksEventMember | ChatResponseStream.$UnknownMember;
/**
 * @public
 */
export declare namespace ChatResponseStream {
    /**
     * @public
     * Message Metadata event
     */
    interface MessageMetadataEventMember {
        messageMetadataEvent: MessageMetadataEvent;
        assistantResponseEvent?: never;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent?: never;
        invalidStateEvent?: never;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Assistant response event - Text / Code snippet
     */
    interface AssistantResponseEventMember {
        messageMetadataEvent?: never;
        assistantResponseEvent: AssistantResponseEvent;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent?: never;
        invalidStateEvent?: never;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Code References event
     */
    interface CodeReferenceEventMember {
        messageMetadataEvent?: never;
        assistantResponseEvent?: never;
        codeReferenceEvent: CodeReferenceEvent;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent?: never;
        invalidStateEvent?: never;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Web Reference links event
     */
    interface SupplementaryWebLinksEventMember {
        messageMetadataEvent?: never;
        assistantResponseEvent?: never;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent: SupplementaryWebLinksEvent;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent?: never;
        invalidStateEvent?: never;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Followup prompt event
     */
    interface FollowupPromptEventMember {
        messageMetadataEvent?: never;
        assistantResponseEvent?: never;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent: FollowupPromptEvent;
        codeEvent?: never;
        intentsEvent?: never;
        invalidStateEvent?: never;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Code Generated event
     */
    interface CodeEventMember {
        messageMetadataEvent?: never;
        assistantResponseEvent?: never;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent: CodeEvent;
        intentsEvent?: never;
        invalidStateEvent?: never;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Intents event
     */
    interface IntentsEventMember {
        messageMetadataEvent?: never;
        assistantResponseEvent?: never;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent: IntentsEvent;
        invalidStateEvent?: never;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Invalid State event
     */
    interface InvalidStateEventMember {
        messageMetadataEvent?: never;
        assistantResponseEvent?: never;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent?: never;
        invalidStateEvent: InvalidStateEvent;
        error?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Internal Server Exception
     */
    interface ErrorMember {
        messageMetadataEvent?: never;
        assistantResponseEvent?: never;
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent?: never;
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
        codeReferenceEvent?: never;
        supplementaryWebLinksEvent?: never;
        followupPromptEvent?: never;
        codeEvent?: never;
        intentsEvent?: never;
        invalidStateEvent?: never;
        error?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        messageMetadataEvent: (value: MessageMetadataEvent) => T;
        assistantResponseEvent: (value: AssistantResponseEvent) => T;
        codeReferenceEvent: (value: CodeReferenceEvent) => T;
        supplementaryWebLinksEvent: (value: SupplementaryWebLinksEvent) => T;
        followupPromptEvent: (value: FollowupPromptEvent) => T;
        codeEvent: (value: CodeEvent) => T;
        intentsEvent: (value: IntentsEvent) => T;
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
     * Indicates the Chat was triggered due to an explicit chat request by an end-user
     */
    readonly MANUAL: "MANUAL";
};
/**
 * @public
 */
export type ChatTriggerType = typeof ChatTriggerType[keyof typeof ChatTriggerType];
/**
 * @public
 * @enum
 */
export declare const ContextTruncationScheme: {
    readonly ANALYSIS: "ANALYSIS";
    readonly GUMBY: "GUMBY";
};
/**
 * @public
 */
export type ContextTruncationScheme = typeof ContextTruncationScheme[keyof typeof ContextTruncationScheme];
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
    customizationArn?: string;
}
/**
 * @internal
 */
export declare const ConversationStateFilterSensitiveLog: (obj: ConversationState) => any;
/**
 * @public
 * This exception is translated to a 204 as it succeeded the IAM Auth.
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
export declare const TransformationDownloadArtifactType: {
    readonly CLIENT_INSTRUCTIONS: "ClientInstructions";
    readonly LOGS: "Logs";
};
/**
 * @public
 */
export type TransformationDownloadArtifactType = typeof TransformationDownloadArtifactType[keyof typeof TransformationDownloadArtifactType];
/**
 * @public
 * Transformation export context
 */
export interface TransformationExportContext {
    downloadArtifactId: string | undefined;
    downloadArtifactType: TransformationDownloadArtifactType | string | undefined;
}
/**
 * @public
 * Export Context
 */
export type ExportContext = ExportContext.TransformationExportContextMember | ExportContext.$UnknownMember;
/**
 * @public
 */
export declare namespace ExportContext {
    /**
     * @public
     * Transformation export context
     */
    interface TransformationExportContextMember {
        transformationExportContext: TransformationExportContext;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        transformationExportContext?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        transformationExportContext: (value: TransformationExportContext) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: ExportContext, visitor: Visitor<T>) => T;
}
/**
 * @public
 * @enum
 */
export declare const ExportIntent: {
    /**
     * Code Task Assist
     */
    readonly TASK_ASSIST: "TASK_ASSIST";
    /**
     * Code Transformation
     */
    readonly TRANSFORMATION: "TRANSFORMATION";
};
/**
 * @public
 */
export type ExportIntent = typeof ExportIntent[keyof typeof ExportIntent];
/**
 * @public
 * Response Stream
 */
export type ResultArchiveStream = ResultArchiveStream.BinaryMetadataEventMember | ResultArchiveStream.BinaryPayloadEventMember | ResultArchiveStream.InternalServerExceptionMember | ResultArchiveStream.$UnknownMember;
/**
 * @public
 */
export declare namespace ResultArchiveStream {
    /**
     * @public
     * Payload Part
     */
    interface BinaryMetadataEventMember {
        binaryMetadataEvent: BinaryMetadataEvent;
        binaryPayloadEvent?: never;
        internalServerException?: never;
        $unknown?: never;
    }
    /**
     * @public
     * Payload Part
     */
    interface BinaryPayloadEventMember {
        binaryMetadataEvent?: never;
        binaryPayloadEvent: BinaryPayloadEvent;
        internalServerException?: never;
        $unknown?: never;
    }
    /**
     * @public
     * This exception is thrown when an unexpected error occurred during the processing of a request.
     */
    interface InternalServerExceptionMember {
        binaryMetadataEvent?: never;
        binaryPayloadEvent?: never;
        internalServerException: InternalServerException;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        binaryMetadataEvent?: never;
        binaryPayloadEvent?: never;
        internalServerException?: never;
        $unknown: [string, any];
    }
    interface Visitor<T> {
        binaryMetadataEvent: (value: BinaryMetadataEvent) => T;
        binaryPayloadEvent: (value: BinaryPayloadEvent) => T;
        internalServerException: (value: InternalServerException) => T;
        _: (name: string, value: any) => T;
    }
    const visit: <T>(value: ResultArchiveStream, visitor: Visitor<T>) => T;
}
/**
 * @internal
 */
export declare const ResultArchiveStreamFilterSensitiveLog: (obj: ResultArchiveStream) => any;
/**
 * @public
 * This exception is thrown when request was denied due to caller exceeding their usage limits
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
    profileArn?: string;
}
/**
 * @internal
 */
export declare const GenerateAssistantResponseRequestFilterSensitiveLog: (obj: GenerateAssistantResponseRequest) => any;
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
export declare const GenerateAssistantResponseResponseFilterSensitiveLog: (obj: GenerateAssistantResponseResponse) => any;
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
    /**
     * @public
     * Export Context
     */
    exportContext?: ExportContext;
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
export declare const ExportResultArchiveResponseFilterSensitiveLog: (obj: ExportResultArchiveResponse) => any;
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
 * @public
 * Structure to represent a new generate assistant response request.
 */
export interface ConverseStreamRequest {
    /**
     * @public
     * Structure to represent the current state of a chat conversation.
     */
    conversationState: ConversationState | undefined;
    profileArn?: string;
    /**
     * @public
     * The origin of the caller
     */
    source?: Origin | string;
    dryRun?: boolean;
}
/**
 * @internal
 */
export declare const ConverseStreamRequestFilterSensitiveLog: (obj: ConverseStreamRequest) => any;
/**
 * @public
 * Structure to represent generate assistant response response.
 */
export interface ConverseStreamResponse {
    /**
     * @public
     * ID which represents a multi-turn conversation
     */
    conversationId: string | undefined;
    /**
     * @public
     * UtteranceId
     */
    utteranceId?: string;
    /**
     * @public
     * Streaming events from UniDirectional Streaming Conversational APIs.
     */
    converseStreamResponse: AsyncIterable<ChatResponseStream> | undefined;
}
/**
 * @internal
 */
export declare const ConverseStreamResponseFilterSensitiveLog: (obj: ConverseStreamResponse) => any;
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
export declare const GenerateTaskAssistPlanRequestFilterSensitiveLog: (obj: GenerateTaskAssistPlanRequest) => any;
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
export declare const GenerateTaskAssistPlanResponseFilterSensitiveLog: (obj: GenerateTaskAssistPlanResponse) => any;
