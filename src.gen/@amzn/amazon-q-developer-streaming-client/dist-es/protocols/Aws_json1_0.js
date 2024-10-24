import { QDeveloperStreamingServiceException as __BaseException } from "../models/QDeveloperStreamingServiceException";
import { AccessDeniedException, ConflictException, DryRunOperationException, InternalServerException, ResourceNotFoundException, ServiceQuotaExceededException, ThrottlingException, ValidationException, } from "../models/models_0";
import { loadRestJsonErrorCode, parseJsonBody as parseBody, parseJsonErrorBody as parseErrorBody, } from "@aws-sdk/core";
import { HttpRequest as __HttpRequest, } from "@smithy/protocol-http";
import { decorateServiceException as __decorateServiceException, expectString as __expectString, _json, collectBody, take, withBaseException, } from "@smithy/smithy-client";
export const se_GenerateCodeFromCommandsCommand = async (input, context) => {
    const headers = sharedHeaders("GenerateCodeFromCommands");
    let body;
    body = JSON.stringify(_json(input));
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
export const se_SendMessageCommand = async (input, context) => {
    const headers = sharedHeaders("SendMessage");
    let body;
    body = JSON.stringify(se_SendMessageRequest(input, context));
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
export const de_GenerateCodeFromCommandsCommand = async (output, context) => {
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
export const de_SendMessageCommand = async (output, context) => {
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
const de_CommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context)
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
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
    const deserialized = _json(body);
    const exception = new AccessDeniedException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
};
const de_ConflictExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = _json(body);
    const exception = new ConflictException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
};
const de_DryRunOperationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = _json(body);
    const exception = new DryRunOperationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
};
const de_InternalServerExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = _json(body);
    const exception = new InternalServerException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
};
const de_ResourceNotFoundExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = _json(body);
    const exception = new ResourceNotFoundException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
};
const de_ServiceQuotaExceededExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = _json(body);
    const exception = new ServiceQuotaExceededException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
};
const de_ThrottlingExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = _json(body);
    const exception = new ThrottlingException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
};
const de_ValidationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = _json(body);
    const exception = new ValidationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
    });
    return __decorateServiceException(exception, body);
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
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_CodeEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_CodeReferenceEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_DryRunSucceedEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_FollowupPromptEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_IntentsEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_InteractionComponentsEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, de_InteractionComponentsEvent(data, context));
    return contents;
};
const de_InternalServerException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context)
    };
    return de_InternalServerExceptionRes(parsedOutput, context);
};
const de_InvalidStateEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_MessageMetadataEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_ServiceQuotaExceededException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context)
    };
    return de_ServiceQuotaExceededExceptionRes(parsedOutput, context);
};
const de_SupplementaryWebLinksEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_ValidationException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context)
    };
    return de_ValidationExceptionRes(parsedOutput, context);
};
const se_SendMessageRequest = (input, context) => {
    return take(input, {
        'conversationState': _json,
        'dryRun': [],
        'profileArn': [],
        'source': [],
    });
};
const de_InteractionComponentEntry = (output, context) => {
    return take(output, {
        'interactionComponent': (_) => de_InteractionComponent(_, context),
        'interactionComponentId': __expectString,
    });
};
const de_InteractionComponentEntryList = (output, context) => {
    const retVal = (output || []).filter((e) => e != null).map((entry) => {
        return de_InteractionComponentEntry(entry, context);
    });
    return retVal;
};
const de_InteractionComponentsEvent = (output, context) => {
    return take(output, {
        'interactionComponentEntries': (_) => de_InteractionComponentEntryList(_, context),
    });
};
const de_InteractionComponent = (output, context) => {
    return take(output, {
        'alert': _json,
        'infrastructureUpdate': _json,
        'progress': _json,
        'resource': _json,
        'resourceList': _json,
        'section': _json,
        'step': _json,
        'suggestions': _json,
        'taskDetails': _json,
        'taskReference': _json,
        'text': _json,
    });
};
const deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});
const collectBodyString = (streamBody, context) => collectBody(streamBody, context).then(body => context.utf8Encoder(body));
const throwDefaultError = withBaseException(__BaseException);
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
    return new __HttpRequest(contents);
};
function sharedHeaders(operation) {
    return {
        'content-type': "application/x-amz-json-1.0",
        'x-amz-target': `AmazonQDeveloperStreamingService.${operation}`,
    };
}
;
