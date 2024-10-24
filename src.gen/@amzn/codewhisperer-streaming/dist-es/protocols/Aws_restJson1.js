import { CodeWhispererStreamingServiceException as __BaseException } from "../models/CodeWhispererStreamingServiceException";
import { AccessDeniedException, ConflictException, DryRunOperationException, InternalServerException, ResourceNotFoundException, ServiceQuotaExceededException, ThrottlingException, ValidationException, } from "../models/models_0";
import { HttpRequest as __HttpRequest, } from "@smithy/protocol-http";
import { decorateServiceException as __decorateServiceException, expectString as __expectString, _json, collectBody, map, take, withBaseException, } from "@smithy/smithy-client";
export const se_ExportResultArchiveCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = {
        'content-type': 'application/json',
    };
    let resolvedPath = `${basePath?.endsWith('/') ? basePath.slice(0, -1) : (basePath || '')}` + "/exportResultArchive";
    let body;
    body = JSON.stringify(take(input, {
        'exportContext': _ => _json(_),
        'exportId': [],
        'exportIntent': [],
    }));
    return new __HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body,
    });
};
export const se_GenerateAssistantResponseCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = {
        'content-type': 'application/json',
    };
    let resolvedPath = `${basePath?.endsWith('/') ? basePath.slice(0, -1) : (basePath || '')}` + "/generateAssistantResponse";
    let body;
    body = JSON.stringify(take(input, {
        'conversationState': _ => _json(_),
        'profileArn': [],
    }));
    return new __HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body,
    });
};
export const se_GenerateTaskAssistPlanCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = {
        'content-type': 'application/json',
    };
    let resolvedPath = `${basePath?.endsWith('/') ? basePath.slice(0, -1) : (basePath || '')}` + "/generateTaskAssistPlan";
    let body;
    body = JSON.stringify(take(input, {
        'conversationState': _ => _json(_),
        'workspaceState': _ => _json(_),
    }));
    return new __HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body,
    });
};
export const se_ConverseStreamCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = {
        'content-type': 'application/json',
    };
    let resolvedPath = `${basePath?.endsWith('/') ? basePath.slice(0, -1) : (basePath || '')}` + "/ConverseStream";
    let body;
    body = JSON.stringify(take(input, {
        'conversationState': _ => _json(_),
        'dryRun': [],
        'profileArn': [],
        'source': [],
    }));
    return new __HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body,
    });
};
export const de_ExportResultArchiveCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_ExportResultArchiveCommandError(output, context);
    }
    const contents = map({
        $metadata: deserializeMetadata(output),
    });
    const data = output.body;
    contents.body = de_ResultArchiveStream(data, context);
    return contents;
};
const de_ExportResultArchiveCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context)
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccessDeniedException":
        case "com.amazon.aws.codewhisperer#AccessDeniedException":
            throw await de_AccessDeniedExceptionRes(parsedOutput, context);
        case "ConflictException":
        case "com.amazon.aws.codewhisperer#ConflictException":
            throw await de_ConflictExceptionRes(parsedOutput, context);
        case "InternalServerException":
        case "com.amazon.aws.codewhisperer#InternalServerException":
            throw await de_InternalServerExceptionRes(parsedOutput, context);
        case "ResourceNotFoundException":
        case "com.amazon.aws.codewhisperer#ResourceNotFoundException":
            throw await de_ResourceNotFoundExceptionRes(parsedOutput, context);
        case "ThrottlingException":
        case "com.amazon.aws.codewhisperer#ThrottlingException":
            throw await de_ThrottlingExceptionRes(parsedOutput, context);
        case "ValidationException":
        case "com.amazon.aws.codewhisperer#ValidationException":
            throw await de_ValidationExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
export const de_GenerateAssistantResponseCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_GenerateAssistantResponseCommandError(output, context);
    }
    const contents = map({
        $metadata: deserializeMetadata(output),
        conversationId: [, output.headers['x-amzn-codewhisperer-conversation-id']],
    });
    const data = output.body;
    contents.generateAssistantResponseResponse = de_ChatResponseStream(data, context);
    return contents;
};
const de_GenerateAssistantResponseCommandError = async (output, context) => {
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
        default:
            const parsedBody = parsedOutput.body;
            return throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
export const de_GenerateTaskAssistPlanCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_GenerateTaskAssistPlanCommandError(output, context);
    }
    const contents = map({
        $metadata: deserializeMetadata(output),
    });
    const data = output.body;
    contents.planningResponseStream = de_ChatResponseStream(data, context);
    return contents;
};
const de_GenerateTaskAssistPlanCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context)
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccessDeniedException":
        case "com.amazon.aws.codewhisperer#AccessDeniedException":
            throw await de_AccessDeniedExceptionRes(parsedOutput, context);
        case "ConflictException":
        case "com.amazon.aws.codewhisperer#ConflictException":
            throw await de_ConflictExceptionRes(parsedOutput, context);
        case "InternalServerException":
        case "com.amazon.aws.codewhisperer#InternalServerException":
            throw await de_InternalServerExceptionRes(parsedOutput, context);
        case "ResourceNotFoundException":
        case "com.amazon.aws.codewhisperer#ResourceNotFoundException":
            throw await de_ResourceNotFoundExceptionRes(parsedOutput, context);
        case "ServiceQuotaExceededException":
        case "com.amazon.aws.codewhisperer#ServiceQuotaExceededException":
            throw await de_ServiceQuotaExceededExceptionRes(parsedOutput, context);
        case "ThrottlingException":
        case "com.amazon.aws.codewhisperer#ThrottlingException":
            throw await de_ThrottlingExceptionRes(parsedOutput, context);
        case "ValidationException":
        case "com.amazon.aws.codewhisperer#ValidationException":
            throw await de_ValidationExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
export const de_ConverseStreamCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_ConverseStreamCommandError(output, context);
    }
    const contents = map({
        $metadata: deserializeMetadata(output),
        conversationId: [, output.headers['x-amzn-q-conversation-id']],
        utteranceId: [, output.headers['x-amzn-q-utterance-id']],
    });
    const data = output.body;
    contents.converseStreamResponse = de_ChatResponseStream(data, context);
    return contents;
};
const de_ConverseStreamCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context)
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccessDeniedException":
        case "com.amazon.aws.codewhisperer#AccessDeniedException":
            throw await de_AccessDeniedExceptionRes(parsedOutput, context);
        case "ConflictException":
        case "com.amazon.aws.codewhisperer#ConflictException":
            throw await de_ConflictExceptionRes(parsedOutput, context);
        case "DryRunOperationException":
        case "com.amazon.aws.codewhisperer#DryRunOperationException":
            throw await de_DryRunOperationExceptionRes(parsedOutput, context);
        case "InternalServerException":
        case "com.amazon.aws.codewhisperer#InternalServerException":
            throw await de_InternalServerExceptionRes(parsedOutput, context);
        case "ResourceNotFoundException":
        case "com.amazon.aws.codewhisperer#ResourceNotFoundException":
            throw await de_ResourceNotFoundExceptionRes(parsedOutput, context);
        case "ServiceQuotaExceededException":
        case "com.amazon.aws.codewhisperer#ServiceQuotaExceededException":
            throw await de_ServiceQuotaExceededExceptionRes(parsedOutput, context);
        case "ThrottlingException":
        case "com.amazon.aws.codewhisperer#ThrottlingException":
            throw await de_ThrottlingExceptionRes(parsedOutput, context);
        case "ValidationException":
        case "com.amazon.aws.codewhisperer#ValidationException":
            throw await de_ValidationExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
const throwDefaultError = withBaseException(__BaseException);
const de_AccessDeniedExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
        'reason': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new AccessDeniedException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
const de_ConflictExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ConflictException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
const de_DryRunOperationExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new DryRunOperationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
const de_InternalServerExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new InternalServerException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
const de_ResourceNotFoundExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ResourceNotFoundException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
const de_ServiceQuotaExceededExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ServiceQuotaExceededException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
const de_ThrottlingExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ThrottlingException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
const de_ValidationExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        'message': __expectString,
        'reason': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ValidationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
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
const de_ResultArchiveStream = (output, context) => {
    return context.eventStreamMarshaller.deserialize(output, async (event) => {
        if (event["binaryMetadataEvent"] != null) {
            return {
                binaryMetadataEvent: await de_BinaryMetadataEvent_event(event["binaryMetadataEvent"], context),
            };
        }
        if (event["binaryPayloadEvent"] != null) {
            return {
                binaryPayloadEvent: await de_BinaryPayloadEvent_event(event["binaryPayloadEvent"], context),
            };
        }
        if (event["internalServerException"] != null) {
            return {
                internalServerException: await de_InternalServerException_event(event["internalServerException"], context),
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
const de_BinaryMetadataEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_BinaryPayloadEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, de_BinaryPayloadEvent(data, context));
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
const de_SupplementaryWebLinksEvent_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
};
const de_BinaryPayloadEvent = (output, context) => {
    return take(output, {
        'bytes': context.base64Decoder,
    });
};
const deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});
const collectBodyString = (streamBody, context) => collectBody(streamBody, context).then(body => context.utf8Encoder(body));
const isSerializableHeaderValue = (value) => value !== undefined &&
    value !== null &&
    value !== "" &&
    (!Object.getOwnPropertyNames(value).includes("length") ||
        value.length != 0) &&
    (!Object.getOwnPropertyNames(value).includes("size") || value.size != 0);
const parseBody = (streamBody, context) => collectBodyString(streamBody, context).then(encoded => {
    if (encoded.length) {
        return JSON.parse(encoded);
    }
    return {};
});
const parseErrorBody = async (errorBody, context) => {
    const value = await parseBody(errorBody, context);
    value.message = value.message ?? value.Message;
    return value;
};
const loadRestJsonErrorCode = (output, data) => {
    const findKey = (object, key) => Object.keys(object).find((k) => k.toLowerCase() === key.toLowerCase());
    const sanitizeErrorCode = (rawValue) => {
        let cleanValue = rawValue;
        if (typeof cleanValue === "number") {
            cleanValue = cleanValue.toString();
        }
        if (cleanValue.indexOf(",") >= 0) {
            cleanValue = cleanValue.split(",")[0];
        }
        if (cleanValue.indexOf(":") >= 0) {
            cleanValue = cleanValue.split(":")[0];
        }
        if (cleanValue.indexOf("#") >= 0) {
            cleanValue = cleanValue.split("#")[1];
        }
        return cleanValue;
    };
    const headerKey = findKey(output.headers, "x-amzn-errortype");
    if (headerKey !== undefined) {
        return sanitizeErrorCode(output.headers[headerKey]);
    }
    if (data.code !== undefined) {
        return sanitizeErrorCode(data.code);
    }
    if (data["__type"] !== undefined) {
        return sanitizeErrorCode(data["__type"]);
    }
};
