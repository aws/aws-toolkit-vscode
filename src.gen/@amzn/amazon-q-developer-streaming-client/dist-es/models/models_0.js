import { QDeveloperStreamingServiceException as __BaseException } from "./QDeveloperStreamingServiceException";
import { SENSITIVE_STRING, } from "@smithy/smithy-client";
export const AccessDeniedExceptionReason = {
    UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS: "UNAUTHORIZED_CUSTOMIZATION_RESOURCE_ACCESS",
};
export class AccessDeniedException extends __BaseException {
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
export class InternalServerException extends __BaseException {
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
export class ResourceNotFoundException extends __BaseException {
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
export class ThrottlingException extends __BaseException {
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
export const ValidationExceptionReason = {
    CONTENT_LENGTH_EXCEEDS_THRESHOLD: "CONTENT_LENGTH_EXCEEDS_THRESHOLD",
    INVALID_CONVERSATION_ID: "INVALID_CONVERSATION_ID",
    INVALID_KMS_GRANT: "INVALID_KMS_GRANT",
};
export class ValidationException extends __BaseException {
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
export const AppStudioStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.namespace && { namespace: SENSITIVE_STRING
    }),
    ...(obj.propertyName && { propertyName: SENSITIVE_STRING
    }),
    ...(obj.propertyValue && { propertyValue: SENSITIVE_STRING
    }),
    ...(obj.propertyContext && { propertyContext: SENSITIVE_STRING
    }),
});
export const AssistantResponseEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
});
export const UserIntent = {
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
export const FollowupPromptFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
});
export const SupplementaryWebLinkFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.url && { url: SENSITIVE_STRING
    }),
    ...(obj.title && { title: SENSITIVE_STRING
    }),
    ...(obj.snippet && { snippet: SENSITIVE_STRING
    }),
});
export const AssistantResponseMessageFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
    ...(obj.supplementaryWebLinks && { supplementaryWebLinks: obj.supplementaryWebLinks.map(item => SupplementaryWebLinkFilterSensitiveLog(item))
    }),
    ...(obj.followupPrompt && { followupPrompt: FollowupPromptFilterSensitiveLog(obj.followupPrompt)
    }),
});
export const ConflictExceptionReason = {
    CUSTOMER_KMS_KEY_DISABLED: "CUSTOMER_KMS_KEY_DISABLED",
    CUSTOMER_KMS_KEY_INVALID_KEY_POLICY: "CUSTOMER_KMS_KEY_INVALID_KEY_POLICY",
    MISMATCHED_KMS_KEY: "MISMATCHED_KMS_KEY",
};
export class ConflictException extends __BaseException {
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
export const ConsoleStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.consoleUrl && { consoleUrl: SENSITIVE_STRING
    }),
    ...(obj.taskName && { taskName: SENSITIVE_STRING
    }),
});
export const DiagnosticSeverity = {
    ERROR: "ERROR",
    HINT: "HINT",
    INFORMATION: "INFORMATION",
    WARNING: "WARNING",
};
export const RuntimeDiagnosticFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.source && { source: SENSITIVE_STRING
    }),
    ...(obj.message && { message: SENSITIVE_STRING
    }),
});
export const SymbolType = {
    DECLARATION: "DECLARATION",
    USAGE: "USAGE",
};
export const TextDocumentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.relativeFilePath && { relativeFilePath: SENSITIVE_STRING
    }),
    ...(obj.text && { text: SENSITIVE_STRING
    }),
});
export const TextDocumentDiagnosticFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.document && { document: TextDocumentFilterSensitiveLog(obj.document)
    }),
    ...(obj.source && { source: SENSITIVE_STRING
    }),
    ...(obj.message && { message: SENSITIVE_STRING
    }),
});
export var Diagnostic;
(function (Diagnostic) {
    Diagnostic.visit = (value, visitor) => {
        if (value.textDocumentDiagnostic !== undefined)
            return visitor.textDocumentDiagnostic(value.textDocumentDiagnostic);
        if (value.runtimeDiagnostic !== undefined)
            return visitor.runtimeDiagnostic(value.runtimeDiagnostic);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(Diagnostic || (Diagnostic = {}));
export const DiagnosticFilterSensitiveLog = (obj) => {
    if (obj.textDocumentDiagnostic !== undefined)
        return { textDocumentDiagnostic: TextDocumentDiagnosticFilterSensitiveLog(obj.textDocumentDiagnostic)
        };
    if (obj.runtimeDiagnostic !== undefined)
        return { runtimeDiagnostic: RuntimeDiagnosticFilterSensitiveLog(obj.runtimeDiagnostic)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
export var CursorState;
(function (CursorState) {
    CursorState.visit = (value, visitor) => {
        if (value.position !== undefined)
            return visitor.position(value.position);
        if (value.range !== undefined)
            return visitor.range(value.range);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(CursorState || (CursorState = {}));
export const RelevantTextDocumentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.relativeFilePath && { relativeFilePath: SENSITIVE_STRING
    }),
    ...(obj.text && { text: SENSITIVE_STRING
    }),
});
export const EditorStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.document && { document: TextDocumentFilterSensitiveLog(obj.document)
    }),
    ...(obj.cursorState && { cursorState: obj.cursorState
    }),
    ...(obj.relevantDocuments && { relevantDocuments: obj.relevantDocuments.map(item => RelevantTextDocumentFilterSensitiveLog(item))
    }),
});
export const EnvironmentVariableFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.key && { key: SENSITIVE_STRING
    }),
    ...(obj.value && { value: SENSITIVE_STRING
    }),
});
export const EnvStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.currentWorkingDirectory && { currentWorkingDirectory: SENSITIVE_STRING
    }),
    ...(obj.environmentVariables && { environmentVariables: obj.environmentVariables.map(item => EnvironmentVariableFilterSensitiveLog(item))
    }),
});
export const GitStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.status && { status: SENSITIVE_STRING
    }),
});
export const ShellHistoryEntryFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.command && { command: SENSITIVE_STRING
    }),
    ...(obj.directory && { directory: SENSITIVE_STRING
    }),
    ...(obj.stdout && { stdout: SENSITIVE_STRING
    }),
    ...(obj.stderr && { stderr: SENSITIVE_STRING
    }),
});
export const ShellStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.shellHistory && { shellHistory: obj.shellHistory.map(item => ShellHistoryEntryFilterSensitiveLog(item))
    }),
});
export const UserInputMessageContextFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.editorState && { editorState: EditorStateFilterSensitiveLog(obj.editorState)
    }),
    ...(obj.shellState && { shellState: ShellStateFilterSensitiveLog(obj.shellState)
    }),
    ...(obj.gitState && { gitState: GitStateFilterSensitiveLog(obj.gitState)
    }),
    ...(obj.envState && { envState: EnvStateFilterSensitiveLog(obj.envState)
    }),
    ...(obj.appStudioContext && { appStudioContext: AppStudioStateFilterSensitiveLog(obj.appStudioContext)
    }),
    ...(obj.diagnostic && { diagnostic: DiagnosticFilterSensitiveLog(obj.diagnostic)
    }),
    ...(obj.consoleState && { consoleState: ConsoleStateFilterSensitiveLog(obj.consoleState)
    }),
});
export const UserInputMessageFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
    ...(obj.userInputMessageContext && { userInputMessageContext: UserInputMessageContextFilterSensitiveLog(obj.userInputMessageContext)
    }),
});
export var ChatMessage;
(function (ChatMessage) {
    ChatMessage.visit = (value, visitor) => {
        if (value.userInputMessage !== undefined)
            return visitor.userInputMessage(value.userInputMessage);
        if (value.assistantResponseMessage !== undefined)
            return visitor.assistantResponseMessage(value.assistantResponseMessage);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(ChatMessage || (ChatMessage = {}));
export const ChatMessageFilterSensitiveLog = (obj) => {
    if (obj.userInputMessage !== undefined)
        return { userInputMessage: UserInputMessageFilterSensitiveLog(obj.userInputMessage)
        };
    if (obj.assistantResponseMessage !== undefined)
        return { assistantResponseMessage: AssistantResponseMessageFilterSensitiveLog(obj.assistantResponseMessage)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
export const CodeEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
});
export const FollowupPromptEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.followupPrompt && { followupPrompt: FollowupPromptFilterSensitiveLog(obj.followupPrompt)
    }),
});
export const IntentType = {
    GLUE_SENSEI: "GLUE_SENSEI",
    RESOURCE_DATA: "RESOURCE_DATA",
    SUPPORT: "SUPPORT",
};
export var IntentDataType;
(function (IntentDataType) {
    IntentDataType.visit = (value, visitor) => {
        if (value.string !== undefined)
            return visitor.string(value.string);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(IntentDataType || (IntentDataType = {}));
export const IntentsEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.intents && { intents: SENSITIVE_STRING
    }),
});
export const TextFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
});
export const AlertComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: TextFilterSensitiveLog(obj.text)
    }),
});
export const AlertType = {
    ERROR: "ERROR",
    INFO: "INFO",
    WARNING: "WARNING",
};
export const AlertFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: obj.content.map(item => AlertComponentFilterSensitiveLog(item))
    }),
});
export const InfrastructureUpdateTransitionFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.currentState && { currentState: SENSITIVE_STRING
    }),
    ...(obj.nextState && { nextState: SENSITIVE_STRING
    }),
});
export const InfrastructureUpdateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.transition && { transition: InfrastructureUpdateTransitionFilterSensitiveLog(obj.transition)
    }),
});
export const StepComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: TextFilterSensitiveLog(obj.text)
    }),
});
export const StepState = {
    FAILED: "FAILED",
    IN_PROGRESS: "IN_PROGRESS",
    LOADING: "LOADING",
    PAUSED: "PAUSED",
    PENDING: "PENDING",
    STOPPED: "STOPPED",
    SUCCEEDED: "SUCCEEDED",
};
export const StepFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: SENSITIVE_STRING
    }),
    ...(obj.content && { content: obj.content.map(item => StepComponentFilterSensitiveLog(item))
    }),
});
export const ProgressComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.step && { step: StepFilterSensitiveLog(obj.step)
    }),
});
export const ProgressFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: obj.content.map(item => ProgressComponentFilterSensitiveLog(item))
    }),
});
export const ResourceFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.title && { title: SENSITIVE_STRING
    }),
    ...(obj.link && { link: SENSITIVE_STRING
    }),
    ...(obj.description && { description: SENSITIVE_STRING
    }),
    ...(obj.type && { type: SENSITIVE_STRING
    }),
    ...(obj.ARN && { ARN: SENSITIVE_STRING
    }),
    ...(obj.resourceJsonString && { resourceJsonString: SENSITIVE_STRING
    }),
});
export const CloudWatchTroubleshootingLinkFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: SENSITIVE_STRING
    }),
    ...(obj.investigationPayload && { investigationPayload: SENSITIVE_STRING
    }),
    ...(obj.defaultText && { defaultText: SENSITIVE_STRING
    }),
});
export var ModuleLink;
(function (ModuleLink) {
    ModuleLink.visit = (value, visitor) => {
        if (value.cloudWatchTroubleshootingLink !== undefined)
            return visitor.cloudWatchTroubleshootingLink(value.cloudWatchTroubleshootingLink);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(ModuleLink || (ModuleLink = {}));
export const ModuleLinkFilterSensitiveLog = (obj) => {
    if (obj.cloudWatchTroubleshootingLink !== undefined)
        return { cloudWatchTroubleshootingLink: CloudWatchTroubleshootingLinkFilterSensitiveLog(obj.cloudWatchTroubleshootingLink)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
export const WebLinkFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: SENSITIVE_STRING
    }),
    ...(obj.url && { url: SENSITIVE_STRING
    }),
});
export var Action;
(function (Action) {
    Action.visit = (value, visitor) => {
        if (value.webLink !== undefined)
            return visitor.webLink(value.webLink);
        if (value.moduleLink !== undefined)
            return visitor.moduleLink(value.moduleLink);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(Action || (Action = {}));
export const ActionFilterSensitiveLog = (obj) => {
    if (obj.webLink !== undefined)
        return { webLink: WebLinkFilterSensitiveLog(obj.webLink)
        };
    if (obj.moduleLink !== undefined)
        return { moduleLink: ModuleLinkFilterSensitiveLog(obj.moduleLink)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
export const ResourceListFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.action && { action: ActionFilterSensitiveLog(obj.action)
    }),
    ...(obj.items && { items: obj.items.map(item => ResourceFilterSensitiveLog(item))
    }),
});
export var SectionComponent;
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
})(SectionComponent || (SectionComponent = {}));
export const SectionComponentFilterSensitiveLog = (obj) => {
    if (obj.text !== undefined)
        return { text: TextFilterSensitiveLog(obj.text)
        };
    if (obj.alert !== undefined)
        return { alert: AlertFilterSensitiveLog(obj.alert)
        };
    if (obj.resource !== undefined)
        return { resource: ResourceFilterSensitiveLog(obj.resource)
        };
    if (obj.resourceList !== undefined)
        return { resourceList: ResourceListFilterSensitiveLog(obj.resourceList)
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
export const SectionFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.title && { title: SENSITIVE_STRING
    }),
    ...(obj.content && { content: obj.content.map(item => SectionComponentFilterSensitiveLog(item))
    }),
});
export const TaskActionConfirmationFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
});
export const TaskActionNoteType = {
    INFO: "INFO",
    WARNING: "WARNING",
};
export const TaskActionNoteFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.content && { content: SENSITIVE_STRING
    }),
});
export const TaskActionFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: SENSITIVE_STRING
    }),
    ...(obj.note && { note: TaskActionNoteFilterSensitiveLog(obj.note)
    }),
    ...(obj.payload && { payload: SENSITIVE_STRING
    }),
    ...(obj.confirmation && { confirmation: TaskActionConfirmationFilterSensitiveLog(obj.confirmation)
    }),
});
export const TaskComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: TextFilterSensitiveLog(obj.text)
    }),
    ...(obj.infrastructureUpdate && { infrastructureUpdate: InfrastructureUpdateFilterSensitiveLog(obj.infrastructureUpdate)
    }),
    ...(obj.alert && { alert: AlertFilterSensitiveLog(obj.alert)
    }),
    ...(obj.progress && { progress: ProgressFilterSensitiveLog(obj.progress)
    }),
});
export const TaskOverviewFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.label && { label: SENSITIVE_STRING
    }),
    ...(obj.description && { description: SENSITIVE_STRING
    }),
});
export const TaskDetailsFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.overview && { overview: TaskOverviewFilterSensitiveLog(obj.overview)
    }),
    ...(obj.content && { content: obj.content.map(item => TaskComponentFilterSensitiveLog(item))
    }),
    ...(obj.actions && { actions: obj.actions.map(item => TaskActionFilterSensitiveLog(item))
    }),
});
export const InteractionComponentFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.text && { text: TextFilterSensitiveLog(obj.text)
    }),
    ...(obj.alert && { alert: AlertFilterSensitiveLog(obj.alert)
    }),
    ...(obj.infrastructureUpdate && { infrastructureUpdate: InfrastructureUpdateFilterSensitiveLog(obj.infrastructureUpdate)
    }),
    ...(obj.progress && { progress: ProgressFilterSensitiveLog(obj.progress)
    }),
    ...(obj.step && { step: StepFilterSensitiveLog(obj.step)
    }),
    ...(obj.taskDetails && { taskDetails: TaskDetailsFilterSensitiveLog(obj.taskDetails)
    }),
    ...(obj.section && { section: SectionFilterSensitiveLog(obj.section)
    }),
    ...(obj.resource && { resource: ResourceFilterSensitiveLog(obj.resource)
    }),
    ...(obj.resourceList && { resourceList: ResourceListFilterSensitiveLog(obj.resourceList)
    }),
});
export const InteractionComponentEntryFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.interactionComponent && { interactionComponent: InteractionComponentFilterSensitiveLog(obj.interactionComponent)
    }),
});
export const InteractionComponentsEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.interactionComponentEntries && { interactionComponentEntries: obj.interactionComponentEntries.map(item => InteractionComponentEntryFilterSensitiveLog(item))
    }),
});
export const InvalidStateReason = {
    INVALID_TASK_ASSIST_PLAN: "INVALID_TASK_ASSIST_PLAN",
};
export const SupplementaryWebLinksEventFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.supplementaryWebLinks && { supplementaryWebLinks: obj.supplementaryWebLinks.map(item => SupplementaryWebLinkFilterSensitiveLog(item))
    }),
});
export var ChatResponseStream;
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
})(ChatResponseStream || (ChatResponseStream = {}));
export const ChatResponseStreamFilterSensitiveLog = (obj) => {
    if (obj.messageMetadataEvent !== undefined)
        return { messageMetadataEvent: obj.messageMetadataEvent
        };
    if (obj.assistantResponseEvent !== undefined)
        return { assistantResponseEvent: AssistantResponseEventFilterSensitiveLog(obj.assistantResponseEvent)
        };
    if (obj.dryRunSucceedEvent !== undefined)
        return { dryRunSucceedEvent: obj.dryRunSucceedEvent
        };
    if (obj.codeReferenceEvent !== undefined)
        return { codeReferenceEvent: obj.codeReferenceEvent
        };
    if (obj.supplementaryWebLinksEvent !== undefined)
        return { supplementaryWebLinksEvent: SupplementaryWebLinksEventFilterSensitiveLog(obj.supplementaryWebLinksEvent)
        };
    if (obj.followupPromptEvent !== undefined)
        return { followupPromptEvent: FollowupPromptEventFilterSensitiveLog(obj.followupPromptEvent)
        };
    if (obj.codeEvent !== undefined)
        return { codeEvent: CodeEventFilterSensitiveLog(obj.codeEvent)
        };
    if (obj.intentsEvent !== undefined)
        return { intentsEvent: IntentsEventFilterSensitiveLog(obj.intentsEvent)
        };
    if (obj.interactionComponentsEvent !== undefined)
        return { interactionComponentsEvent: InteractionComponentsEventFilterSensitiveLog(obj.interactionComponentsEvent)
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
export const ChatTriggerType = {
    DIAGNOSTIC: "DIAGNOSTIC",
    INLINE_CHAT: "INLINE_CHAT",
    MANUAL: "MANUAL",
};
export var CommandInput;
(function (CommandInput) {
    CommandInput.visit = (value, visitor) => {
        if (value.commandsList !== undefined)
            return visitor.commandsList(value.commandsList);
        return visitor._(value.$unknown[0], value.$unknown[1]);
    };
})(CommandInput || (CommandInput = {}));
export const CommandInputFilterSensitiveLog = (obj) => {
    if (obj.commandsList !== undefined)
        return { commandsList: SENSITIVE_STRING
        };
    if (obj.$unknown !== undefined)
        return { [obj.$unknown[0]]: 'UNKNOWN' };
};
export const ConversationStateFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.history && { history: obj.history.map(item => ChatMessageFilterSensitiveLog(item))
    }),
    ...(obj.currentMessage && { currentMessage: ChatMessageFilterSensitiveLog(obj.currentMessage)
    }),
});
export class DryRunOperationException extends __BaseException {
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
export const OutputFormat = {
    JAVA_CDK: "java/cdk",
    JSON_CFN: "json/cfn",
    PYTHON_CDK: "python/cdk",
    TYPESCRIPT_CDK: "typescript/cdk",
    YAML_CFN: "yaml/cfn",
};
export class ServiceQuotaExceededException extends __BaseException {
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
export const Origin = {
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
export const SendMessageRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.conversationState && { conversationState: ConversationStateFilterSensitiveLog(obj.conversationState)
    }),
});
export const SendMessageResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.sendMessageResponse && { sendMessageResponse: 'STREAMING_CONTENT'
    }),
});
export const GenerateCodeFromCommandsRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.commands && { commands: CommandInputFilterSensitiveLog(obj.commands)
    }),
});
export var GenerateCodeFromCommandsResponseStream;
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
})(GenerateCodeFromCommandsResponseStream || (GenerateCodeFromCommandsResponseStream = {}));
export const GenerateCodeFromCommandsResponseStreamFilterSensitiveLog = (obj) => {
    if (obj.codeEvent !== undefined)
        return { codeEvent: CodeEventFilterSensitiveLog(obj.codeEvent)
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
export const GenerateCodeFromCommandsResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.generatedCodeFromCommandsResponse && { generatedCodeFromCommandsResponse: 'STREAMING_CONTENT'
    }),
});
