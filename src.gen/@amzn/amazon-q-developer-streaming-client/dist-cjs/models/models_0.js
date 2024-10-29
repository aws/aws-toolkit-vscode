"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressComponentFilterSensitiveLog = exports.StepFilterSensitiveLog = exports.StepState = exports.StepComponentFilterSensitiveLog = exports.InfrastructureUpdateFilterSensitiveLog = exports.InfrastructureUpdateTransitionFilterSensitiveLog = exports.AlertFilterSensitiveLog = exports.AlertType = exports.AlertComponentFilterSensitiveLog = exports.TextFilterSensitiveLog = exports.IntentsEventFilterSensitiveLog = exports.IntentDataType = exports.IntentType = exports.FollowupPromptEventFilterSensitiveLog = exports.CodeEventFilterSensitiveLog = exports.ChatMessageFilterSensitiveLog = exports.ChatMessage = exports.UserInputMessageFilterSensitiveLog = exports.UserInputMessageContextFilterSensitiveLog = exports.ShellStateFilterSensitiveLog = exports.ShellHistoryEntryFilterSensitiveLog = exports.GitStateFilterSensitiveLog = exports.EnvStateFilterSensitiveLog = exports.EnvironmentVariableFilterSensitiveLog = exports.EditorStateFilterSensitiveLog = exports.RelevantTextDocumentFilterSensitiveLog = exports.CursorState = exports.DiagnosticFilterSensitiveLog = exports.Diagnostic = exports.TextDocumentDiagnosticFilterSensitiveLog = exports.TextDocumentFilterSensitiveLog = exports.SymbolType = exports.RuntimeDiagnosticFilterSensitiveLog = exports.DiagnosticSeverity = exports.ConsoleStateFilterSensitiveLog = exports.ConflictException = exports.ConflictExceptionReason = exports.AssistantResponseMessageFilterSensitiveLog = exports.SupplementaryWebLinkFilterSensitiveLog = exports.FollowupPromptFilterSensitiveLog = exports.UserIntent = exports.AssistantResponseEventFilterSensitiveLog = exports.AppStudioStateFilterSensitiveLog = exports.ValidationException = exports.ValidationExceptionReason = exports.ThrottlingException = exports.ResourceNotFoundException = exports.InternalServerException = exports.AccessDeniedException = exports.AccessDeniedExceptionReason = void 0;
exports.GenerateCodeFromCommandsResponseFilterSensitiveLog = exports.GenerateCodeFromCommandsResponseStreamFilterSensitiveLog = exports.GenerateCodeFromCommandsResponseStream = exports.GenerateCodeFromCommandsRequestFilterSensitiveLog = exports.SendMessageResponseFilterSensitiveLog = exports.SendMessageRequestFilterSensitiveLog = exports.Origin = exports.ServiceQuotaExceededException = exports.OutputFormat = exports.DryRunOperationException = exports.ConversationStateFilterSensitiveLog = exports.CommandInputFilterSensitiveLog = exports.CommandInput = exports.ChatTriggerType = exports.ChatResponseStreamFilterSensitiveLog = exports.ChatResponseStream = exports.SupplementaryWebLinksEventFilterSensitiveLog = exports.InvalidStateReason = exports.InteractionComponentsEventFilterSensitiveLog = exports.InteractionComponentEntryFilterSensitiveLog = exports.InteractionComponentFilterSensitiveLog = exports.TaskDetailsFilterSensitiveLog = exports.TaskOverviewFilterSensitiveLog = exports.TaskComponentFilterSensitiveLog = exports.TaskActionFilterSensitiveLog = exports.TaskActionNoteFilterSensitiveLog = exports.TaskActionNoteType = exports.TaskActionConfirmationFilterSensitiveLog = exports.SectionFilterSensitiveLog = exports.SectionComponentFilterSensitiveLog = exports.SectionComponent = exports.ResourceListFilterSensitiveLog = exports.ActionFilterSensitiveLog = exports.Action = exports.WebLinkFilterSensitiveLog = exports.ModuleLinkFilterSensitiveLog = exports.ModuleLink = exports.CloudWatchTroubleshootingLinkFilterSensitiveLog = exports.ResourceFilterSensitiveLog = exports.ProgressFilterSensitiveLog = void 0;
const QDeveloperStreamingServiceException_1 = require("./QDeveloperStreamingServiceException");
const smithy_client_1 = require("@smithy/smithy-client");
exports.AccessDeniedExceptionReason = {
    UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS: "UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS",
};
class AccessDeniedException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
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
class InternalServerException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
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
class ResourceNotFoundException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
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
class ThrottlingException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
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
    INVALID_KMS_GRANT: "INVALID_KMS_GRANT",
};
class ValidationException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
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
    CODE_GENERATION: "CODE_GENERATION",
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
exports.ConflictExceptionReason = {
    CUSTOMER_KMS_KEY_DISABLED: "CUSTOMER_KMS_KEY_DISABLED",
    CUSTOMER_KMS_KEY_INVALID_KEY_POLICY: "CUSTOMER_KMS_KEY_INVALID_KEY_POLICY",
    MISMATCHED_KMS_KEY: "MISMATCHED_KMS_KEY",
};
class ConflictException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
    constructor(opts) {
        super({
            name: "ConflictException",
            $fault: "client",
            ...opts
        });
        this.name = "ConflictException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ConflictException.prototype);
        this.reason = opts.reason;
    }
}
exports.ConflictException = ConflictException;
const ConsoleStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.consoleUrl && { consoleUrl: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.taskName && { taskName: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.ConsoleStateFilterSensitiveLog = ConsoleStateFilterSensitiveLog;
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
    ...(obj.consoleState && { consoleState: (0, exports.ConsoleStateFilterSensitiveLog)(obj.consoleState)
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
const TextFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.TextFilterSensitiveLog = TextFilterSensitiveLog;
const AlertComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: (0, exports.TextFilterSensitiveLog)(obj.text)
    }),
});
exports.AlertComponentFilterSensitiveLog = AlertComponentFilterSensitiveLog;
exports.AlertType = {
    ERROR: "ERROR",
    INFO: "INFO",
    WARNING: "WARNING",
};
const AlertFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: obj.content.map(item => (0, exports.AlertComponentFilterSensitiveLog)(item))
    }),
});
exports.AlertFilterSensitiveLog = AlertFilterSensitiveLog;
const InfrastructureUpdateTransitionFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.currentState && { currentState: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.nextState && { nextState: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.InfrastructureUpdateTransitionFilterSensitiveLog = InfrastructureUpdateTransitionFilterSensitiveLog;
const InfrastructureUpdateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.transition && { transition: (0, exports.InfrastructureUpdateTransitionFilterSensitiveLog)(obj.transition)
    }),
});
exports.InfrastructureUpdateFilterSensitiveLog = InfrastructureUpdateFilterSensitiveLog;
const StepComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: (0, exports.TextFilterSensitiveLog)(obj.text)
    }),
});
exports.StepComponentFilterSensitiveLog = StepComponentFilterSensitiveLog;
exports.StepState = {
    FAILED: "FAILED",
    IN_PROGRESS: "IN_PROGRESS",
    LOADING: "LOADING",
    PAUSED: "PAUSED",
    PENDING: "PENDING",
    STOPPED: "STOPPED",
    SUCCEEDED: "SUCCEEDED",
};
const StepFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.content && { content: obj.content.map(item => (0, exports.StepComponentFilterSensitiveLog)(item))
    }),
});
exports.StepFilterSensitiveLog = StepFilterSensitiveLog;
const ProgressComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.step && { step: (0, exports.StepFilterSensitiveLog)(obj.step)
    }),
});
exports.ProgressComponentFilterSensitiveLog = ProgressComponentFilterSensitiveLog;
const ProgressFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: obj.content.map(item => (0, exports.ProgressComponentFilterSensitiveLog)(item))
    }),
});
exports.ProgressFilterSensitiveLog = ProgressFilterSensitiveLog;
const ResourceFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.title && { title: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.link && { link: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.description && { description: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.type && { type: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.ARN && { ARN: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.resourceJsonString && { resourceJsonString: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.ResourceFilterSensitiveLog = ResourceFilterSensitiveLog;
const CloudWatchTroubleshootingLinkFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.investigationPayload && { investigationPayload: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.defaultText && { defaultText: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.CloudWatchTroubleshootingLinkFilterSensitiveLog = CloudWatchTroubleshootingLinkFilterSensitiveLog;
var ModuleLink;
(function (ModuleLink) {
    ModuleLink.visit = (value, visitor) => {
        if (value.cloudWatchTroubleshootingLink !== undefined)
            return visitor.cloudWatchTroubleshootingLink(value.cloudWatchTroubleshootingLink);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(ModuleLink = exports.ModuleLink || (exports.ModuleLink = {}));
const ModuleLinkFilterSensitiveLog = (obj) => {
    if (obj.cloudWatchTroubleshootingLink !== undefined)
        return { cloudWatchTroubleshootingLink: (0, exports.CloudWatchTroubleshootingLinkFilterSensitiveLog)(obj.cloudWatchTroubleshootingLink)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.ModuleLinkFilterSensitiveLog = ModuleLinkFilterSensitiveLog;
const WebLinkFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.url && { url: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.WebLinkFilterSensitiveLog = WebLinkFilterSensitiveLog;
var Action;
(function (Action) {
    Action.visit = (value, visitor) => {
        if (value.webLink !== undefined)
            return visitor.webLink(value.webLink);
        if (value.moduleLink !== undefined)
            return visitor.moduleLink(value.moduleLink);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(Action = exports.Action || (exports.Action = {}));
const ActionFilterSensitiveLog = (obj) => {
    if (obj.webLink !== undefined)
        return { webLink: (0, exports.WebLinkFilterSensitiveLog)(obj.webLink)
        };
    if (obj.moduleLink !== undefined)
        return { moduleLink: (0, exports.ModuleLinkFilterSensitiveLog)(obj.moduleLink)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.ActionFilterSensitiveLog = ActionFilterSensitiveLog;
const ResourceListFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.action && { action: (0, exports.ActionFilterSensitiveLog)(obj.action)
    }),
    ...(obj.items && { items: obj.items.map(item => (0, exports.ResourceFilterSensitiveLog)(item))
    }),
});
exports.ResourceListFilterSensitiveLog = ResourceListFilterSensitiveLog;
var SectionComponent;
(function (SectionComponent) {
    SectionComponent.visit = (value, visitor) => {
        if (value.text !== undefined)
            return visitor.text(value.text);
        if (value.alert !== undefined)
            return visitor.alert(value.alert);
        if (value.resource !== undefined)
            return visitor.resource(value.resource);
        if (value.resourceList !== undefined)
            return visitor.resourceList(value.resourceList);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(SectionComponent = exports.SectionComponent || (exports.SectionComponent = {}));
const SectionComponentFilterSensitiveLog = (obj) => {
    if (obj.text !== undefined)
        return { text: (0, exports.TextFilterSensitiveLog)(obj.text)
        };
    if (obj.alert !== undefined)
        return { alert: (0, exports.AlertFilterSensitiveLog)(obj.alert)
        };
    if (obj.resource !== undefined)
        return { resource: (0, exports.ResourceFilterSensitiveLog)(obj.resource)
        };
    if (obj.resourceList !== undefined)
        return { resourceList: (0, exports.ResourceListFilterSensitiveLog)(obj.resourceList)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.SectionComponentFilterSensitiveLog = SectionComponentFilterSensitiveLog;
const SectionFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.title && { title: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.content && { content: obj.content.map(item => (0, exports.SectionComponentFilterSensitiveLog)(item))
    }),
});
exports.SectionFilterSensitiveLog = SectionFilterSensitiveLog;
const TaskActionConfirmationFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.TaskActionConfirmationFilterSensitiveLog = TaskActionConfirmationFilterSensitiveLog;
exports.TaskActionNoteType = {
    INFO: "INFO",
    WARNING: "WARNING",
};
const TaskActionNoteFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.TaskActionNoteFilterSensitiveLog = TaskActionNoteFilterSensitiveLog;
const TaskActionFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.note && { note: (0, exports.TaskActionNoteFilterSensitiveLog)(obj.note)
    }),
    ...(obj.payload && { payload: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.confirmation && { confirmation: (0, exports.TaskActionConfirmationFilterSensitiveLog)(obj.confirmation)
    }),
});
exports.TaskActionFilterSensitiveLog = TaskActionFilterSensitiveLog;
const TaskComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: (0, exports.TextFilterSensitiveLog)(obj.text)
    }),
    ...(obj.infrastructureUpdate && { infrastructureUpdate: (0, exports.InfrastructureUpdateFilterSensitiveLog)(obj.infrastructureUpdate)
    }),
    ...(obj.alert && { alert: (0, exports.AlertFilterSensitiveLog)(obj.alert)
    }),
    ...(obj.progress && { progress: (0, exports.ProgressFilterSensitiveLog)(obj.progress)
    }),
});
exports.TaskComponentFilterSensitiveLog = TaskComponentFilterSensitiveLog;
const TaskOverviewFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: smithy_client_1.SENSITIVE_STRING
    }),
    ...(obj.description && { description: smithy_client_1.SENSITIVE_STRING
    }),
});
exports.TaskOverviewFilterSensitiveLog = TaskOverviewFilterSensitiveLog;
const TaskDetailsFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.overview && { overview: (0, exports.TaskOverviewFilterSensitiveLog)(obj.overview)
    }),
    ...(obj.content && { content: obj.content.map(item => (0, exports.TaskComponentFilterSensitiveLog)(item))
    }),
    ...(obj.actions && { actions: obj.actions.map(item => (0, exports.TaskActionFilterSensitiveLog)(item))
    }),
});
exports.TaskDetailsFilterSensitiveLog = TaskDetailsFilterSensitiveLog;
const InteractionComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: (0, exports.TextFilterSensitiveLog)(obj.text)
    }),
    ...(obj.alert && { alert: (0, exports.AlertFilterSensitiveLog)(obj.alert)
    }),
    ...(obj.infrastructureUpdate && { infrastructureUpdate: (0, exports.InfrastructureUpdateFilterSensitiveLog)(obj.infrastructureUpdate)
    }),
    ...(obj.progress && { progress: (0, exports.ProgressFilterSensitiveLog)(obj.progress)
    }),
    ...(obj.step && { step: (0, exports.StepFilterSensitiveLog)(obj.step)
    }),
    ...(obj.taskDetails && { taskDetails: (0, exports.TaskDetailsFilterSensitiveLog)(obj.taskDetails)
    }),
    ...(obj.section && { section: (0, exports.SectionFilterSensitiveLog)(obj.section)
    }),
    ...(obj.resource && { resource: (0, exports.ResourceFilterSensitiveLog)(obj.resource)
    }),
    ...(obj.resourceList && { resourceList: (0, exports.ResourceListFilterSensitiveLog)(obj.resourceList)
    }),
});
exports.InteractionComponentFilterSensitiveLog = InteractionComponentFilterSensitiveLog;
const InteractionComponentEntryFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.interactionComponent && { interactionComponent: (0, exports.InteractionComponentFilterSensitiveLog)(obj.interactionComponent)
    }),
});
exports.InteractionComponentEntryFilterSensitiveLog = InteractionComponentEntryFilterSensitiveLog;
const InteractionComponentsEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.interactionComponentEntries && { interactionComponentEntries: obj.interactionComponentEntries.map(item => (0, exports.InteractionComponentEntryFilterSensitiveLog)(item))
    }),
});
exports.InteractionComponentsEventFilterSensitiveLog = InteractionComponentsEventFilterSensitiveLog;
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
        if (value.dryRunSucceedEvent !== undefined)
            return visitor.dryRunSucceedEvent(value.dryRunSucceedEvent);
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
        if (value.interactionComponentsEvent !== undefined)
            return visitor.interactionComponentsEvent(value.interactionComponentsEvent);
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
    if (obj.dryRunSucceedEvent !== undefined)
        return { dryRunSucceedEvent: obj.dryRunSucceedEvent
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
    if (obj.interactionComponentsEvent !== undefined)
        return { interactionComponentsEvent: (0, exports.InteractionComponentsEventFilterSensitiveLog)(obj.interactionComponentsEvent)
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
    INLINE_CHAT: "INLINE_CHAT",
    MANUAL: "MANUAL",
};
var CommandInput;
(function (CommandInput) {
    CommandInput.visit = (value, visitor) => {
        if (value.commandsList !== undefined)
            return visitor.commandsList(value.commandsList);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(CommandInput = exports.CommandInput || (exports.CommandInput = {}));
const CommandInputFilterSensitiveLog = (obj) => {
    if (obj.commandsList !== undefined)
        return { commandsList: smithy_client_1.SENSITIVE_STRING
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.CommandInputFilterSensitiveLog = CommandInputFilterSensitiveLog;
const ConversationStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.history && { history: obj.history.map(item => (0, exports.ChatMessageFilterSensitiveLog)(item))
    }),
    ...(obj.currentMessage && { currentMessage: (0, exports.ChatMessageFilterSensitiveLog)(obj.currentMessage)
    }),
});
exports.ConversationStateFilterSensitiveLog = ConversationStateFilterSensitiveLog;
class DryRunOperationException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
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
exports.OutputFormat = {
    JAVA_CDK: "java/cdk",
    JSON_CFN: "json/cfn",
    PYTHON_CDK: "python/cdk",
    TYPESCRIPT_CDK: "typescript/cdk",
    YAML_CFN: "yaml/cfn",
};
class ServiceQuotaExceededException extends QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException {
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
const SendMessageRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.conversationState && { conversationState: (0, exports.ConversationStateFilterSensitiveLog)(obj.conversationState)
    }),
});
exports.SendMessageRequestFilterSensitiveLog = SendMessageRequestFilterSensitiveLog;
const SendMessageResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.sendMessageResponse && { sendMessageResponse: 'STREAMING_CONTENT'
    }),
});
exports.SendMessageResponseFilterSensitiveLog = SendMessageResponseFilterSensitiveLog;
const GenerateCodeFromCommandsRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.commands && { commands: (0, exports.CommandInputFilterSensitiveLog)(obj.commands)
    }),
});
exports.GenerateCodeFromCommandsRequestFilterSensitiveLog = GenerateCodeFromCommandsRequestFilterSensitiveLog;
var GenerateCodeFromCommandsResponseStream;
(function (GenerateCodeFromCommandsResponseStream) {
    GenerateCodeFromCommandsResponseStream.visit = (value, visitor) => {
        if (value.codeEvent !== undefined)
            return visitor.codeEvent(value.codeEvent);
        if (value.Error !== undefined)
            return visitor.Error(value.Error);
        if (value.QuotaLevelExceededError !== undefined)
            return visitor.QuotaLevelExceededError(value.QuotaLevelExceededError);
        if (value.ValidationError !== undefined)
            return visitor.ValidationError(value.ValidationError);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(GenerateCodeFromCommandsResponseStream = exports.GenerateCodeFromCommandsResponseStream || (exports.GenerateCodeFromCommandsResponseStream = {}));
const GenerateCodeFromCommandsResponseStreamFilterSensitiveLog = (obj) => {
    if (obj.codeEvent !== undefined)
        return { codeEvent: (0, exports.CodeEventFilterSensitiveLog)(obj.codeEvent)
        };
    if (obj.Error !== undefined)
        return { Error: obj.Error
        };
    if (obj.QuotaLevelExceededError !== undefined)
        return { QuotaLevelExceededError: obj.QuotaLevelExceededError
        };
    if (obj.ValidationError !== undefined)
        return { ValidationError: obj.ValidationError
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
exports.GenerateCodeFromCommandsResponseStreamFilterSensitiveLog = GenerateCodeFromCommandsResponseStreamFilterSensitiveLog;
const GenerateCodeFromCommandsResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.generatedCodeFromCommandsResponse && { generatedCodeFromCommandsResponse: 'STREAMING_CONTENT'
    }),
});
exports.GenerateCodeFromCommandsResponseFilterSensitiveLog = GenerateCodeFromCommandsResponseFilterSensitiveLog;
