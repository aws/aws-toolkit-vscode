"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.de_SendMessageCommand = exports.de_GenerateCodeFromCommandsCommand = exports.se_SendMessageCommand = exports.se_GenerateCodeFromCommandsCommand = void 0;
const QDeveloperStreamingServiceException_1 = require("../models/QDeveloperStreamingServiceException");
const models_0_1 = require("../models/models_0");
const core_1 = require("@aws-sdk/core");
const protocol_http_1 = require("@smithy/protocol-http");
const smithy_client_1 = require("@smithy/smithy-client");
const se_GenerateCodeFromCommandsCommand = async (input, context) => {
    const headers = sharedHeaders("GenerateCodeFromCommands");
    let body;
    body = JSON.stringify((0, smithy_client_1._json)(input));
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
exports.se_GenerateCodeFromCommandsCommand = se_GenerateCodeFromCommandsCommand;
const se_SendMessageCommand = async (input, context) => {
    const headers = sharedHeaders("SendMessage");
    let body;
    body = JSON.stringify(se_SendMessageRequest(input, context));
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
exports.se_SendMessageCommand = se_SendMessageCommand;
const de_GenerateCodeFromCommandsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CommandError(output, context);
    }
    const contents = { generatedCodeFromCommandsResponse: de_GenerateCodeFromCommandsResponseStream(output.body, context) };
    const response = {
        $metadata: deserializeMetadata(output),
        ...contents,
    };
    return response;
};
exports.de_GenerateCodeFromCommandsCommand = de_GenerateCodeFromCommandsCommand;
const de_SendMessageCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CommandError(output, context);
    }
    const contents = { sendMessageResponse: de_ChatResponseStream(output.body, context) };
    const response = {
        $metadata: deserializeMetadata(output),
        ...contents,
    };
    return response;
};
exports.de_SendMessageCommand = de_SendMessageCommand;
const de_CommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await (0, core_1.parseJsonErrorBody)(output.body, context)
    };
    const errorCode = (0, core_1.loadRestJsonErrorCode)(output, parsedOutput.body);
    switch (errorCode) {
        case "AccessDeniedException":
        case "com.amazon.aws.codewhisperer#AccessDeniedException":
            throw await de_AccessDeniedExceptionRes(parsedOutput, context);
        case "InternalServerException":
        case "com.amazon.aws.codewhisperer#InternalServerException":
            throw await de_InternalServerExceptionRes(parsedOutput, context);
        case "ThrottlingException":
        case "com.amazon.aws.codewhisperer#ThrottlingException":
            throw await de_ThrottlingExceptionRes(parsedOutput, context);
        case "ValidationException":
        case "com.amazon.aws.codewhisperer#ValidationException":
            throw await de_ValidationExceptionRes(parsedOutput, context);
        case "ConflictException":
        case "com.amazon.aws.codewhisperer#ConflictException":
            throw await de_ConflictExceptionRes(parsedOutput, context);
        case "DryRunOperationException":
        case "com.amazon.aws.codewhisperer#DryRunOperationException":
            throw await de_DryRunOperationExceptionRes(parsedOutput, context);
        case "ResourceNotFoundException":
        case "com.amazon.aws.codewhisperer#ResourceNotFoundException":
            throw await de_ResourceNotFoundExceptionRes(parsedOutput, context);
        case "ServiceQuotaExceededException":
        case "com.amazon.aws.codewhisperer#ServiceQuotaExceededException":
            throw await de_ServiceQuotaExceededExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
const de_AccessDeniedExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.AccessDeniedException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_ConflictExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.ConflictException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_DryRunOperationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.DryRunOperationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_InternalServerExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.InternalServerException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_ResourceNotFoundExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.ResourceNotFoundException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_ServiceQuotaExceededExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.ServiceQuotaExceededException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_ThrottlingExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.ThrottlingException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_ValidationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = (0, smithy_client_1._json)(body);
    const exception = new models_0_1.ValidationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return (0, smithy_client_1.decorateServiceException)(exception, body);
};
const de_ChatResponseStream = (output, context) => {
    return context.eventStreamMarshaller.deserialize(output, async (event) => {
        if (event["messageMetadataEvent"] != null) {
            return {
                messageMetadataEvent: await de_MessageMetadataEvent_event(event["messageMetadataEvent"], context),
            };
        }
        if (event["assistantResponseEvent"] != null) {
            return {
                assistantResponseEvent: await de_AssistantResponseEvent_event(event["assistantResponseEvent"], context),
            };
        }
        if (event["dryRunSucceedEvent"] != null) {
            return {
                dryRunSucceedEvent: await de_DryRunSucceedEvent_event(event["dryRunSucceedEvent"], context),
            };
        }
        if (event["codeReferenceEvent"] != null) {
            return {
                codeReferenceEvent: await de_CodeReferenceEvent_event(event["codeReferenceEvent"], context),
            };
        }
        if (event["supplementaryWebLinksEvent"] != null) {
            return {
                supplementaryWebLinksEvent: await de_SupplementaryWebLinksEvent_event(event["supplementaryWebLinksEvent"], context),
            };
        }
        if (event["followupPromptEvent"] != null) {
            return {
                followupPromptEvent: await de_FollowupPromptEvent_event(event["followupPromptEvent"], context),
            };
        }
        if (event["codeEvent"] != null) {
            return {
                codeEvent: await de_CodeEvent_event(event["codeEvent"], context),
            };
        }
        if (event["intentsEvent"] != null) {
            return {
                intentsEvent: await de_IntentsEvent_event(event["intentsEvent"], context),
            };
        }
        if (event["interactionComponentsEvent"] != null) {
            return {
                interactionComponentsEvent: await de_InteractionComponentsEvent_event(event["interactionComponentsEvent"], context),
            };
        }
        if (event["invalidStateEvent"] != null) {
            return {
                invalidStateEvent: await de_InvalidStateEvent_event(event["invalidStateEvent"], context),
            };
        }
        if (event["error"] != null) {
            return {
                error: await de_InternalServerException_event(event["error"], context),
            };
        }
        return { $unknown: output };
    });
};
const de_GenerateCodeFromCommandsResponseStream = (output, context) => {
    return context.eventStreamMarshaller.deserialize(output, async (event) => {
        if (event["codeEvent"] != null) {
            return {
                codeEvent: await de_CodeEvent_event(event["codeEvent"], context),
            };
        }
        if (event["Error"] != null) {
            return {
                Error: await de_InternalServerException_event(event["Error"], context),
            };
        }
        if (event["QuotaLevelExceededError"] != null) {
            return {
                QuotaLevelExceededError: await de_ServiceQuotaExceededException_event(event["QuotaLevelExceededError"], context),
            };
        }
        if (event["ValidationError"] != null) {
            return {
                ValidationError: await de_ValidationException_event(event["ValidationError"], context),
            };
        }
        return { $unknown: output };
    });
};
const de_AssistantResponseEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_CodeEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_CodeReferenceEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_DryRunSucceedEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_FollowupPromptEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_IntentsEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_InteractionComponentsEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, de_InteractionComponentsEvent(data, context));
    return contents;
};
const de_InternalServerException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await (0, core_1.parseJsonBody)(output.body, context)
    };
    return de_InternalServerExceptionRes(parsedOutput, context);
};
const de_InvalidStateEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_MessageMetadataEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_ServiceQuotaExceededException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await (0, core_1.parseJsonBody)(output.body, context)
    };
    return de_ServiceQuotaExceededExceptionRes(parsedOutput, context);
};
const de_SupplementaryWebLinksEvent_event = async (output, context) => {
    const contents = {};
    const data = await (0, core_1.parseJsonBody)(output.body, context);
    Object.assign(contents, (0, smithy_client_1._json)(data));
    return contents;
};
const de_ValidationException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await (0, core_1.parseJsonBody)(output.body, context)
    };
    return de_ValidationExceptionRes(parsedOutput, context);
};
const se_SendMessageRequest = (input, context) => {
    return (0, smithy_client_1.take)(input, {
        'conversationState': smithy_client_1._json,
        'dryRun': [],
        'profileArn': [],
        'source': [],
    });
};
const de_InteractionComponentEntry = (output, context) => {
    return (0, smithy_client_1.take)(output, {
        'interactionComponent': (_) => de_InteractionComponent(_, context),
        'interactionComponentId': smithy_client_1.expectString,
    });
};
const de_InteractionComponentEntryList = (output, context) => {
    const retVal = (output || []).filter((e) => e != null).map((entry) => {
        return de_InteractionComponentEntry(entry, context);
    });
    return retVal;
};
const de_InteractionComponentsEvent = (output, context) => {
    return (0, smithy_client_1.take)(output, {
        'interactionComponentEntries': (_) => de_InteractionComponentEntryList(_, context),
    });
};
const de_InteractionComponent = (output, context) => {
    return (0, smithy_client_1.take)(output, {
        'alert': smithy_client_1._json,
        'infrastructureUpdate': smithy_client_1._json,
        'progress': smithy_client_1._json,
        'resource': smithy_client_1._json,
        'resourceList': smithy_client_1._json,
        'section': smithy_client_1._json,
        'step': smithy_client_1._json,
        'suggestions': smithy_client_1._json,
        'taskDetails': smithy_client_1._json,
        'taskReference': smithy_client_1._json,
        'text': smithy_client_1._json,
    });
};
const deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});
const collectBodyString = (streamBody, context) => (0, smithy_client_1.collectBody)(streamBody, context).then(body => context.utf8Encoder(body));
const throwDefaultError = (0, smithy_client_1.withBaseException)(QDeveloperStreamingServiceException_1.QDeveloperStreamingServiceException);
const buildHttpRpcRequest = async (context, headers, path, resolvedHostname, body) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const contents = {
        protocol,
        hostname,
        port,
        method: "POST",
        path: basePath.endsWith("/") ? basePath.slice(0, -1) + path : basePath + path,
        headers,
    };
    if (resolvedHostname !== undefined) {
        contents.hostname = resolvedHostname;
    }
    if (body !== undefined) {
        contents.body = body;
    }
    return new protocol_http_1.HttpRequest(contents);
};
function sharedHeaders(operation) {
    return {
        'content-type': "application/x-amz-json-1.0",
        'x-amz-target': `AmazonQDeveloperStreamingService.${operation}`,
    };
}
;
