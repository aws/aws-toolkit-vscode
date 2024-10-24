"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransformationDownloadArtifactType = exports.DryRunOperationException = exports.ConversationStateFilterSensitiveLog = exports.ContextTruncationScheme = exports.ChatTriggerType = exports.ChatResponseStreamFilterSensitiveLog = exports.ChatResponseStream = exports.SupplementaryWebLinksEventFilterSensitiveLog = exports.InvalidStateReason = exports.IntentsEventFilterSensitiveLog = exports.IntentDataType = exports.IntentType = exports.FollowupPromptEventFilterSensitiveLog = exports.CodeEventFilterSensitiveLog = exports.ChatMessageFilterSensitiveLog = exports.ChatMessage = exports.UserInputMessageFilterSensitiveLog = exports.UserInputMessageContextFilterSensitiveLog = exports.ShellStateFilterSensitiveLog = exports.ShellHistoryEntryFilterSensitiveLog = exports.GitStateFilterSensitiveLog = exports.EnvStateFilterSensitiveLog = exports.EnvironmentVariableFilterSensitiveLog = exports.EditorStateFilterSensitiveLog = exports.RelevantTextDocumentFilterSensitiveLog = exports.CursorState = exports.DiagnosticFilterSensitiveLog = exports.Diagnostic = exports.TextDocumentDiagnosticFilterSensitiveLog = exports.TextDocumentFilterSensitiveLog = exports.SymbolType = exports.RuntimeDiagnosticFilterSensitiveLog = exports.DiagnosticSeverity = exports.BinaryPayloadEventFilterSensitiveLog = exports.BinaryMetadataEventFilterSensitiveLog = exports.ContentChecksumType = exports.ConflictException = exports.AssistantResponseMessageFilterSensitiveLog = exports.SupplementaryWebLinkFilterSensitiveLog = exports.FollowupPromptFilterSensitiveLog = exports.UserIntent = exports.AssistantResponseEventFilterSensitiveLog = exports.AppStudioStateFilterSensitiveLog = exports.ValidationException = exports.ValidationExceptionReason = exports.ThrottlingException = exports.ResourceNotFoundException = exports.InternalServerException = exports.AccessDeniedException = exports.AccessDeniedExceptionReason = void 0;
exports.GenerateTaskAssistPlanResponseFilterSensitiveLog = exports.GenerateTaskAssistPlanRequestFilterSensitiveLog = exports.ConverseStreamResponseFilterSensitiveLog = exports.ConverseStreamRequestFilterSensitiveLog = exports.Origin = exports.ExportResultArchiveResponseFilterSensitiveLog = exports.GenerateAssistantResponseResponseFilterSensitiveLog = exports.GenerateAssistantResponseRequestFilterSensitiveLog = exports.ServiceQuotaExceededException = exports.ResultArchiveStreamFilterSensitiveLog = exports.ResultArchiveStream = exports.ExportIntent = exports.ExportContext = void 0;
const CodeWhispererStreamingServiceException_1 = require("./CodeWhispererStreamingServiceException");
const smithy_client_1 = require("@smithy/smithy-client");
exports.AccessDeniedExceptionReason = {
    UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS: "UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS",
};
class AccessDeniedException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "AccessDeniedException",
            $fault: "client",
            ...opts
        });
        this.name = "AccessDeniedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, AccessDeniedException.prototype);
        this.reason = opts.reason;
    }
}
exports.AccessDeniedException = AccessDeniedException;
class InternalServerException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "InternalServerException",
            $fault: "server",
            ...opts
        });
        this.name = "InternalServerException";
        this.$fault = "server";
        this.$retryable = {};
        Object.setPrototypeOf(this, InternalServerException.prototype);
    }
}
exports.InternalServerException = InternalServerException;
class ResourceNotFoundException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "ResourceNotFoundException",
            $fault: "client",
            ...opts
        });
        this.name = "ResourceNotFoundException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
    }
}
exports.ResourceNotFoundException = ResourceNotFoundException;
class ThrottlingException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "ThrottlingException",
            $fault: "client",
            ...opts
        });
        this.name = "ThrottlingException";
        this.$fault = "client";
        this.$retryable = {
            throttling: true,
        };
        Object.setPrototypeOf(this, ThrottlingException.prototype);
    }
}
exports.ThrottlingException = ThrottlingException;
exports.ValidationExceptionReason = {
    CONTENT_LENGTH_EXCEEDS_THRESHOLD: "CONTENT_LENGTH_EXCEEDS_THRESHOLD",
    INVALID_CONVERSATION_ID: "INVALID_CONVERSATION_ID",
};
class ValidationException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "ValidationException",
            $fault: "client",
            ...opts
        });
        this.name = "ValidationException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ValidationException.prototype);
        this.reason = opts.reason;
    }
}
exports.ValidationException = ValidationException;
const AppStudioStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.namespace && { namespace: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.propertyName && { propertyName: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.propertyValue && { propertyValue: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.propertyContext && { propertyContext: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.AppStudioStateFilterSensitiveLog = AppStudioStateFilterSensitiveLog;
const AssistantResponseEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.AssistantResponseEventFilterSensitiveLog = AssistantResponseEventFilterSensitiveLog;
exports.UserIntent = {
    APPLY_COMMON_BEST_PRACTICES: "APPLY_COMMON_BEST_PRACTICES",
    CITE_SOURCES: "CITE_SOURCES",
    EXPLAIN_CODE_SELECTION: "EXPLAIN_CODE_SELECTION",
    EXPLAIN_LINE_BY_LINE: "EXPLAIN_LINE_BY_LINE",
    GENERATE_CLOUDFORMATION_TEMPLATE: "GENERATE_CLOUDFORMATION_TEMPLATE",
    GENERATE_UNIT_TESTS: "GENERATE_UNIT_TESTS",
    IMPROVE_CODE: "IMPROVE_CODE",
    SHOW_EXAMPLES: "SHOW_EXAMPLES",
    SUGGEST_ALTERNATE_IMPLEMENTATION: "SUGGEST_ALTERNATE_IMPLEMENTATION",
};
const FollowupPromptFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.FollowupPromptFilterSensitiveLog = FollowupPromptFilterSensitiveLog;
const SupplementaryWebLinkFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.url && { url: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.title && { title: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.snippet && { snippet: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.SupplementaryWebLinkFilterSensitiveLog = SupplementaryWebLinkFilterSensitiveLog;
const AssistantResponseMessageFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.supplementaryWebLinks && { supplementaryWebLinks: obj.supplementaryWebLinks.map(item => (0, exports.SupplementaryWebLinkFilterSensitiveLog)(item))
    }),
    ...(obj.followupPrompt && { followupPrompt: (0, exports.FollowupPromptFilterSensitiveLog)(obj.followupPrompt)
    }),
});
exports.AssistantResponseMessageFilterSensitiveLog = AssistantResponseMessageFilterSensitiveLog;
class ConflictException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "ConflictException",
            $fault: "client",
            ...opts
        });
        this.name = "ConflictException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ConflictException.prototype);
    }
}
exports.ConflictException = ConflictException;
exports.ContentChecksumType = {
    SHA_256: "SHA_256",
};
const BinaryMetadataEventFilterSensitiveLog = (obj) => ({
    ...obj,
});
exports.BinaryMetadataEventFilterSensitiveLog = BinaryMetadataEventFilterSensitiveLog;
const BinaryPayloadEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.bytes && { bytes: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.BinaryPayloadEventFilterSensitiveLog = BinaryPayloadEventFilterSensitiveLog;
exports.DiagnosticSeverity = {
    ERROR: "ERROR",
    HINT: "HINT",
    INFORMATION: "INFORMATION",
    WARNING: "WARNING",
};
const RuntimeDiagnosticFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.source && { source: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.message && { message: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.RuntimeDiagnosticFilterSensitiveLog = RuntimeDiagnosticFilterSensitiveLog;
exports.SymbolType = {
    DECLARATION: "DECLARATION",
    USAGE: "USAGE",
};
const TextDocumentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.relativeFilePath && { relativeFilePath: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.text && { text: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.TextDocumentFilterSensitiveLog = TextDocumentFilterSensitiveLog;
const TextDocumentDiagnosticFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.document && { document: (0, exports.TextDocumentFilterSensitiveLog)(obj.document)
    }),
    ...(obj.source && { source: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.message && { message: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.TextDocumentDiagnosticFilterSensitiveLog = TextDocumentDiagnosticFilterSensitiveLog;
var Diagnostic;
(function (Diagnostic) {
    Diagnostic.visit = (value, visitor) => {
        if (value.textDocumentDiagnostic !== undefined)
            return visitor.textDocumentDiagnostic(value.textDocumentDiagnostic);
        if (value.runtimeDiagnostic !== undefined)
            return visitor.runtimeDiagnostic(value.runtimeDiagnostic);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(Diagnostic = exports.Diagnostic || (exports.Diagnostic = {}));
const DiagnosticFilterSensitiveLog = (obj) => {
    if (obj.textDocumentDiagnostic !== undefined)
        return { textDocumentDiagnostic: (0, exports.TextDocumentDiagnosticFilterSensitiveLog)(obj.textDocumentDiagnostic)
        };
    if (obj.runtimeDiagnostic !== undefined)
        return { runtimeDiagnostic: (0, exports.RuntimeDiagnosticFilterSensitiveLog)(obj.runtimeDiagnostic)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.DiagnosticFilterSensitiveLog = DiagnosticFilterSensitiveLog;
var CursorState;
(function (CursorState) {
    CursorState.visit = (value, visitor) => {
        if (value.position !== undefined)
            return visitor.position(value.position);
        if (value.range !== undefined)
            return visitor.range(value.range);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(CursorState = exports.CursorState || (exports.CursorState = {}));
const RelevantTextDocumentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.relativeFilePath && { relativeFilePath: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.text && { text: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.RelevantTextDocumentFilterSensitiveLog = RelevantTextDocumentFilterSensitiveLog;
const EditorStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.document && { document: (0, exports.TextDocumentFilterSensitiveLog)(obj.document)
    }),
    ...(obj.cursorState && { cursorState: obj.cursorState
    }),
    ...(obj.relevantDocuments && { relevantDocuments: obj.relevantDocuments.map(item => (0, exports.RelevantTextDocumentFilterSensitiveLog)(item))
    }),
});
exports.EditorStateFilterSensitiveLog = EditorStateFilterSensitiveLog;
const EnvironmentVariableFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.key && { key: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.value && { value: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.EnvironmentVariableFilterSensitiveLog = EnvironmentVariableFilterSensitiveLog;
const EnvStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.currentWorkingDirectory && { currentWorkingDirectory: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.environmentVariables && { environmentVariables: obj.environmentVariables.map(item => (0, exports.EnvironmentVariableFilterSensitiveLog)(item))
    }),
});
exports.EnvStateFilterSensitiveLog = EnvStateFilterSensitiveLog;
const GitStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.status && { status: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.GitStateFilterSensitiveLog = GitStateFilterSensitiveLog;
const ShellHistoryEntryFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.command && { command: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.directory && { directory: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.stdout && { stdout: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.stderr && { stderr: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.ShellHistoryEntryFilterSensitiveLog = ShellHistoryEntryFilterSensitiveLog;
const ShellStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.shellHistory && { shellHistory: obj.shellHistory.map(item => (0, exports.ShellHistoryEntryFilterSensitiveLog)(item))
    }),
});
exports.ShellStateFilterSensitiveLog = ShellStateFilterSensitiveLog;
const UserInputMessageContextFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.editorState && { editorState: (0, exports.EditorStateFilterSensitiveLog)(obj.editorState)
    }),
    ...(obj.shellState && { shellState: (0, exports.ShellStateFilterSensitiveLog)(obj.shellState)
    }),
    ...(obj.gitState && { gitState: (0, exports.GitStateFilterSensitiveLog)(obj.gitState)
    }),
    ...(obj.envState && { envState: (0, exports.EnvStateFilterSensitiveLog)(obj.envState)
    }),
    ...(obj.appStudioContext && { appStudioContext: (0, exports.AppStudioStateFilterSensitiveLog)(obj.appStudioContext)
    }),
    ...(obj.diagnostic && { diagnostic: (0, exports.DiagnosticFilterSensitiveLog)(obj.diagnostic)
    }),
});
exports.UserInputMessageContextFilterSensitiveLog = UserInputMessageContextFilterSensitiveLog;
const UserInputMessageFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.userInputMessageContext && { userInputMessageContext: (0, exports.UserInputMessageContextFilterSensitiveLog)(obj.userInputMessageContext)
    }),
});
exports.UserInputMessageFilterSensitiveLog = UserInputMessageFilterSensitiveLog;
var ChatMessage;
(function (ChatMessage) {
    ChatMessage.visit = (value, visitor) => {
        if (value.userInputMessage !== undefined)
            return visitor.userInputMessage(value.userInputMessage);
        if (value.assistantResponseMessage !== undefined)
            return visitor.assistantResponseMessage(value.assistantResponseMessage);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(ChatMessage = exports.ChatMessage || (exports.ChatMessage = {}));
const ChatMessageFilterSensitiveLog = (obj) => {
    if (obj.userInputMessage !== undefined)
        return { userInputMessage: (0, exports.UserInputMessageFilterSensitiveLog)(obj.userInputMessage)
        };
    if (obj.assistantResponseMessage !== undefined)
        return { assistantResponseMessage: (0, exports.AssistantResponseMessageFilterSensitiveLog)(obj.assistantResponseMessage)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.ChatMessageFilterSensitiveLog = ChatMessageFilterSensitiveLog;
const CodeEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.CodeEventFilterSensitiveLog = CodeEventFilterSensitiveLog;
const FollowupPromptEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.followupPrompt && { followupPrompt: (0, exports.FollowupPromptFilterSensitiveLog)(obj.followupPrompt)
    }),
});
exports.FollowupPromptEventFilterSensitiveLog = FollowupPromptEventFilterSensitiveLog;
exports.IntentType = {
    GLUE_SENSEI: "GLUE_SENSEI",
    RESOURCE_DATA: "RESOURCE_DATA",
    SUPPORT: "SUPPORT",
};
var IntentDataType;
(function (IntentDataType) {
    IntentDataType.visit = (value, visitor) => {
        if (value.string !== undefined)
            return visitor.string(value.string);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(IntentDataType = exports.IntentDataType || (exports.IntentDataType = {}));
const IntentsEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.intents && { intents: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.IntentsEventFilterSensitiveLog = IntentsEventFilterSensitiveLog;
exports.InvalidStateReason = {
    INVALID_TASK_ASSIST_PLAN: "INVALID_TASK_ASSIST_PLAN",
};
const SupplementaryWebLinksEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.supplementaryWebLinks && { supplementaryWebLinks: obj.supplementaryWebLinks.map(item => (0, exports.SupplementaryWebLinkFilterSensitiveLog)(item))
    }),
});
exports.SupplementaryWebLinksEventFilterSensitiveLog = SupplementaryWebLinksEventFilterSensitiveLog;
var ChatResponseStream;
(function (ChatResponseStream) {
    ChatResponseStream.visit = (value, visitor) => {
        if (value.messageMetadataEvent !== undefined)
            return visitor.messageMetadataEvent(value.messageMetadataEvent);
        if (value.assistantResponseEvent !== undefined)
            return visitor.assistantResponseEvent(value.assistantResponseEvent);
        if (value.codeReferenceEvent !== undefined)
            return visitor.codeReferenceEvent(value.codeReferenceEvent);
        if (value.supplementaryWebLinksEvent !== undefined)
            return visitor.supplementaryWebLinksEvent(value.supplementaryWebLinksEvent);
        if (value.followupPromptEvent !== undefined)
            return visitor.followupPromptEvent(value.followupPromptEvent);
        if (value.codeEvent !== undefined)
            return visitor.codeEvent(value.codeEvent);
        if (value.intentsEvent !== undefined)
            return visitor.intentsEvent(value.intentsEvent);
        if (value.invalidStateEvent !== undefined)
            return visitor.invalidStateEvent(value.invalidStateEvent);
        if (value.error !== undefined)
            return visitor.error(value.error);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(ChatResponseStream = exports.ChatResponseStream || (exports.ChatResponseStream = {}));
const ChatResponseStreamFilterSensitiveLog = (obj) => {
    if (obj.messageMetadataEvent !== undefined)
        return { messageMetadataEvent: obj.messageMetadataEvent
        };
    if (obj.assistantResponseEvent !== undefined)
        return { assistantResponseEvent: (0, exports.AssistantResponseEventFilterSensitiveLog)(obj.assistantResponseEvent)
        };
    if (obj.codeReferenceEvent !== undefined)
        return { codeReferenceEvent: obj.codeReferenceEvent
        };
    if (obj.supplementaryWebLinksEvent !== undefined)
        return { supplementaryWebLinksEvent: (0, exports.SupplementaryWebLinksEventFilterSensitiveLog)(obj.supplementaryWebLinksEvent)
        };
    if (obj.followupPromptEvent !== undefined)
        return { followupPromptEvent: (0, exports.FollowupPromptEventFilterSensitiveLog)(obj.followupPromptEvent)
        };
    if (obj.codeEvent !== undefined)
        return { codeEvent: (0, exports.CodeEventFilterSensitiveLog)(obj.codeEvent)
        };
    if (obj.intentsEvent !== undefined)
        return { intentsEvent: (0, exports.IntentsEventFilterSensitiveLog)(obj.intentsEvent)
        };
    if (obj.invalidStateEvent !== undefined)
        return { invalidStateEvent: obj.invalidStateEvent
        };
    if (obj.error !== undefined)
        return { error: obj.error
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.ChatResponseStreamFilterSensitiveLog = ChatResponseStreamFilterSensitiveLog;
exports.ChatTriggerType = {
    DIAGNOSTIC: "DIAGNOSTIC",
    MANUAL: "MANUAL",
};
exports.ContextTruncationScheme = {
    ANALYSIS: "ANALYSIS",
    GUMBY: "GUMBY",
};
const ConversationStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.history && { history: obj.history.map(item => (0, exports.ChatMessageFilterSensitiveLog)(item))
    }),
    ...(obj.currentMessage && { currentMessage: (0, exports.ChatMessageFilterSensitiveLog)(obj.currentMessage)
    }),
});
exports.ConversationStateFilterSensitiveLog = ConversationStateFilterSensitiveLog;
class DryRunOperationException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "DryRunOperationException",
            $fault: "client",
            ...opts
        });
        this.name = "DryRunOperationException";
        this.$fault = "client";
        Object.setPrototypeOf(this, DryRunOperationException.prototype);
        this.responseCode = opts.responseCode;
    }
}
exports.DryRunOperationException = DryRunOperationException;
exports.TransformationDownloadArtifactType = {
    CLIENT_INSTRUCTIONS: "ClientInstructions",
    LOGS: "Logs",
};
var ExportContext;
(function (ExportContext) {
    ExportContext.visit = (value, visitor) => {
        if (value.transformationExportContext !== undefined)
            return visitor.transformationExportContext(value.transformationExportContext);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(ExportContext = exports.ExportContext || (exports.ExportContext = {}));
exports.ExportIntent = {
    TASK_ASSIST: "TASK_ASSIST",
    TRANSFORMATION: "TRANSFORMATION",
};
var ResultArchiveStream;
(function (ResultArchiveStream) {
    ResultArchiveStream.visit = (value, visitor) => {
        if (value.binaryMetadataEvent !== undefined)
            return visitor.binaryMetadataEvent(value.binaryMetadataEvent);
        if (value.binaryPayloadEvent !== undefined)
            return visitor.binaryPayloadEvent(value.binaryPayloadEvent);
        if (value.internalServerException !== undefined)
            return visitor.internalServerException(value.internalServerException);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(ResultArchiveStream = exports.ResultArchiveStream || (exports.ResultArchiveStream = {}));
const ResultArchiveStreamFilterSensitiveLog = (obj) => {
    if (obj.binaryMetadataEvent !== undefined)
        return { binaryMetadataEvent: smithy_client_1.SENSITIVE_STRING
        };
    if (obj.binaryPayloadEvent !== undefined)
        return { binaryPayloadEvent: smithy_client_1.SENSITIVE_STRING
        };
    if (obj.internalServerException !== undefined)
        return { internalServerException: obj.internalServerException
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.ResultArchiveStreamFilterSensitiveLog = ResultArchiveStreamFilterSensitiveLog;
class ServiceQuotaExceededException extends CodeWhispererStreamingServiceException_1.CodeWhispererStreamingServiceException {
    constructor(opts) {
        super({
            name: "ServiceQuotaExceededException",
            $fault: "client",
            ...opts
        });
        this.name = "ServiceQuotaExceededException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ServiceQuotaExceededException.prototype);
    }
}
exports.ServiceQuotaExceededException = ServiceQuotaExceededException;
const GenerateAssistantResponseRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.conversationState && { conversationState: (0, exports.ConversationStateFilterSensitiveLog)(obj.conversationState)
    }),
});
exports.GenerateAssistantResponseRequestFilterSensitiveLog = GenerateAssistantResponseRequestFilterSensitiveLog;
const GenerateAssistantResponseResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.generateAssistantResponseResponse && { generateAssistantResponseResponse: 'STREAMING_CONTENT'
    }),
});
exports.GenerateAssistantResponseResponseFilterSensitiveLog = GenerateAssistantResponseResponseFilterSensitiveLog;
const ExportResultArchiveResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.body && { body: 'STREAMING_CONTENT'
    }),
});
exports.ExportResultArchiveResponseFilterSensitiveLog = ExportResultArchiveResponseFilterSensitiveLog;
exports.Origin = {
    CHATBOT: "CHATBOT",
    CONSOLE: "CONSOLE",
    DOCUMENTATION: "DOCUMENTATION",
    IDE: "IDE",
    MARKETING: "MARKETING",
    MD: "MD",
    MOBILE: "MOBILE",
    SERVICE_INTERNAL: "SERVICE_INTERNAL",
    UNIFIED_SEARCH: "UNIFIED_SEARCH",
    UNKNOWN: "UNKNOWN",
};
const ConverseStreamRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.conversationState && { conversationState: (0, exports.ConversationStateFilterSensitiveLog)(obj.conversationState)
    }),
});
exports.ConverseStreamRequestFilterSensitiveLog = ConverseStreamRequestFilterSensitiveLog;
const ConverseStreamResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.converseStreamResponse && { converseStreamResponse: 'STREAMING_CONTENT'
    }),
});
exports.ConverseStreamResponseFilterSensitiveLog = ConverseStreamResponseFilterSensitiveLog;
const GenerateTaskAssistPlanRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.conversationState && { conversationState: (0, exports.ConversationStateFilterSensitiveLog)(obj.conversationState)
    }),
});
exports.GenerateTaskAssistPlanRequestFilterSensitiveLog = GenerateTaskAssistPlanRequestFilterSensitiveLog;
const GenerateTaskAssistPlanResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.planningResponseStream && { planningResponseStream: 'STREAMING_CONTENT'
    }),
});
exports.GenerateTaskAssistPlanResponseFilterSensitiveLog = GenerateTaskAssistPlanResponseFilterSensitiveLog;
