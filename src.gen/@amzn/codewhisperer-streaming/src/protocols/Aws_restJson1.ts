// smithy-typescript generated code
import {
  ExportResultArchiveCommandInput,
  ExportResultArchiveCommandOutput,
} from "../commands/ExportResultArchiveCommand";
import {
  GenerateAssistantResponseCommandInput,
  GenerateAssistantResponseCommandOutput,
} from "../commands/GenerateAssistantResponseCommand";
import {
  GenerateTaskAssistPlanCommandInput,
  GenerateTaskAssistPlanCommandOutput,
} from "../commands/GenerateTaskAssistPlanCommand";
import { CodeWhispererStreamingServiceException as __BaseException } from "../models/CodeWhispererStreamingServiceException";
import {
  AccessDeniedException,
  AssistantResponseEvent,
  AssistantResponseMessage,
  BinaryMetadataEvent,
  BinaryPayloadEvent,
  ChatMessage,
  ChatResponseStream,
  CodeReferenceEvent,
  ConflictException,
  ConversationState,
  CursorState,
  Diagnostic,
  DocumentSymbol,
  EditorState,
  FollowupPrompt,
  FollowupPromptEvent,
  InternalServerException,
  InvalidStateEvent,
  MessageMetadataEvent,
  Position,
  ProgrammingLanguage,
  Range,
  Reference,
  ResourceNotFoundException,
  ResultArchiveStream,
  RuntimeDiagnostic,
  Span,
  SupplementaryWebLink,
  SupplementaryWebLinksEvent,
  TextDocument,
  TextDocumentDiagnostic,
  ThrottlingException,
  UserInputMessage,
  UserInputMessageContext,
  ValidationException,
  WorkspaceState,
} from "../models/models_0";
import {
  HttpRequest as __HttpRequest,
  HttpResponse as __HttpResponse,
} from "@smithy/protocol-http";
import {
  decorateServiceException as __decorateServiceException,
  expectString as __expectString,
  _json,
  collectBody,
  map,
  take,
  withBaseException,
} from "@smithy/smithy-client";
import {
  Endpoint as __Endpoint,
  EventStreamSerdeContext as __EventStreamSerdeContext,
  ResponseMetadata as __ResponseMetadata,
  SerdeContext as __SerdeContext,
} from "@smithy/types";
import { v4 as generateIdempotencyToken } from "uuid";

/**
 * serializeAws_restJson1ExportResultArchiveCommand
 */
export const se_ExportResultArchiveCommand = async(
  input: ExportResultArchiveCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const {hostname, protocol = "https", port, path: basePath} = await context.endpoint();
  const headers: any = {
    'content-type': 'application/json',
  };
  let resolvedPath = `${basePath?.endsWith('/') ? basePath.slice(0, -1) : (basePath || '')}` + "/exportResultArchive";
  let body: any;
  body = JSON.stringify(take(input, {
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
}

/**
 * serializeAws_restJson1GenerateAssistantResponseCommand
 */
export const se_GenerateAssistantResponseCommand = async(
  input: GenerateAssistantResponseCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const {hostname, protocol = "https", port, path: basePath} = await context.endpoint();
  const headers: any = {
    'content-type': 'application/json',
  };
  let resolvedPath = `${basePath?.endsWith('/') ? basePath.slice(0, -1) : (basePath || '')}` + "/generateAssistantResponse";
  let body: any;
  body = JSON.stringify(take(input, {
    'conversationState': _ => _json(_),
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
}

/**
 * serializeAws_restJson1GenerateTaskAssistPlanCommand
 */
export const se_GenerateTaskAssistPlanCommand = async(
  input: GenerateTaskAssistPlanCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const {hostname, protocol = "https", port, path: basePath} = await context.endpoint();
  const headers: any = {
    'content-type': 'application/json',
  };
  let resolvedPath = `${basePath?.endsWith('/') ? basePath.slice(0, -1) : (basePath || '')}` + "/generateTaskAssistPlan";
  let body: any;
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
}

/**
 * deserializeAws_restJson1ExportResultArchiveCommand
 */
export const de_ExportResultArchiveCommand = async(
  output: __HttpResponse,
  context: __SerdeContext & __EventStreamSerdeContext
): Promise<ExportResultArchiveCommandOutput> => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_ExportResultArchiveCommandError(output, context);
  }
  const contents: any = map({
    $metadata: deserializeMetadata(output),
  });
  const data: any = output.body;
  contents.body = de_ResultArchiveStream(data, context);
  return contents;
}

/**
 * deserializeAws_restJson1ExportResultArchiveCommandError
 */
const de_ExportResultArchiveCommandError = async(
  output: __HttpResponse,
  context: __SerdeContext,
): Promise<ExportResultArchiveCommandOutput> => {
  const parsedOutput: any = {
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
      })
    }
  }

  /**
   * deserializeAws_restJson1GenerateAssistantResponseCommand
   */
  export const de_GenerateAssistantResponseCommand = async(
    output: __HttpResponse,
    context: __SerdeContext & __EventStreamSerdeContext
  ): Promise<GenerateAssistantResponseCommandOutput> => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
      return de_GenerateAssistantResponseCommandError(output, context);
    }
    const contents: any = map({
      $metadata: deserializeMetadata(output),
      conversationId: [, output.headers['x-amzn-codewhisperer-conversation-id']],
    });
    const data: any = output.body;
    contents.generateAssistantResponseResponse = de_ChatResponseStream(data, context);
    return contents;
  }

  /**
   * deserializeAws_restJson1GenerateAssistantResponseCommandError
   */
  const de_GenerateAssistantResponseCommandError = async(
    output: __HttpResponse,
    context: __SerdeContext,
  ): Promise<GenerateAssistantResponseCommandOutput> => {
    const parsedOutput: any = {
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
        })
      }
    }

    /**
     * deserializeAws_restJson1GenerateTaskAssistPlanCommand
     */
    export const de_GenerateTaskAssistPlanCommand = async(
      output: __HttpResponse,
      context: __SerdeContext & __EventStreamSerdeContext
    ): Promise<GenerateTaskAssistPlanCommandOutput> => {
      if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_GenerateTaskAssistPlanCommandError(output, context);
      }
      const contents: any = map({
        $metadata: deserializeMetadata(output),
      });
      const data: any = output.body;
      contents.planningResponseStream = de_ChatResponseStream(data, context);
      return contents;
    }

    /**
     * deserializeAws_restJson1GenerateTaskAssistPlanCommandError
     */
    const de_GenerateTaskAssistPlanCommandError = async(
      output: __HttpResponse,
      context: __SerdeContext,
    ): Promise<GenerateTaskAssistPlanCommandOutput> => {
      const parsedOutput: any = {
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
          })
        }
      }

      const throwDefaultError = withBaseException(__BaseException);
      /**
       * deserializeAws_restJson1AccessDeniedExceptionRes
       */
      const de_AccessDeniedExceptionRes = async (
        parsedOutput: any,
        context: __SerdeContext
      ): Promise<AccessDeniedException> => {
        const contents: any = map({
        });
        const data: any = parsedOutput.body;
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

      /**
       * deserializeAws_restJson1ConflictExceptionRes
       */
      const de_ConflictExceptionRes = async (
        parsedOutput: any,
        context: __SerdeContext
      ): Promise<ConflictException> => {
        const contents: any = map({
        });
        const data: any = parsedOutput.body;
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

      /**
       * deserializeAws_restJson1InternalServerExceptionRes
       */
      const de_InternalServerExceptionRes = async (
        parsedOutput: any,
        context: __SerdeContext
      ): Promise<InternalServerException> => {
        const contents: any = map({
        });
        const data: any = parsedOutput.body;
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

      /**
       * deserializeAws_restJson1ResourceNotFoundExceptionRes
       */
      const de_ResourceNotFoundExceptionRes = async (
        parsedOutput: any,
        context: __SerdeContext
      ): Promise<ResourceNotFoundException> => {
        const contents: any = map({
        });
        const data: any = parsedOutput.body;
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

      /**
       * deserializeAws_restJson1ThrottlingExceptionRes
       */
      const de_ThrottlingExceptionRes = async (
        parsedOutput: any,
        context: __SerdeContext
      ): Promise<ThrottlingException> => {
        const contents: any = map({
        });
        const data: any = parsedOutput.body;
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

      /**
       * deserializeAws_restJson1ValidationExceptionRes
       */
      const de_ValidationExceptionRes = async (
        parsedOutput: any,
        context: __SerdeContext
      ): Promise<ValidationException> => {
        const contents: any = map({
        });
        const data: any = parsedOutput.body;
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

      /**
       * deserializeAws_restJson1ChatResponseStream
       */
      const de_ChatResponseStream = (
        output: any,
        context: __SerdeContext & __EventStreamSerdeContext
      ): AsyncIterable<ChatResponseStream> => {
        return context.eventStreamMarshaller.deserialize(
          output,
          async event => {
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
            return {$unknown: output};
          }
        );
      }
      /**
       * deserializeAws_restJson1ResultArchiveStream
       */
      const de_ResultArchiveStream = (
        output: any,
        context: __SerdeContext & __EventStreamSerdeContext
      ): AsyncIterable<ResultArchiveStream> => {
        return context.eventStreamMarshaller.deserialize(
          output,
          async event => {
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
            return {$unknown: output};
          }
        );
      }
      const de_AssistantResponseEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<AssistantResponseEvent> => {
        const contents: AssistantResponseEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, _json(data));
        return contents;
      }
      const de_BinaryMetadataEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<BinaryMetadataEvent> => {
        const contents: BinaryMetadataEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, _json(data));
        return contents;
      }
      const de_BinaryPayloadEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<BinaryPayloadEvent> => {
        const contents: BinaryPayloadEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, de_BinaryPayloadEvent(data, context));
        return contents;
      }
      const de_CodeReferenceEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<CodeReferenceEvent> => {
        const contents: CodeReferenceEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, _json(data));
        return contents;
      }
      const de_FollowupPromptEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<FollowupPromptEvent> => {
        const contents: FollowupPromptEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, _json(data));
        return contents;
      }
      const de_InternalServerException_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<InternalServerException> => {
        const parsedOutput: any = {
          ...output,
          body: await parseBody(output.body, context)
        };
        return de_InternalServerExceptionRes(parsedOutput, context);
      }
      const de_InvalidStateEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<InvalidStateEvent> => {
        const contents: InvalidStateEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, _json(data));
        return contents;
      }
      const de_MessageMetadataEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<MessageMetadataEvent> => {
        const contents: MessageMetadataEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, _json(data));
        return contents;
      }
      const de_SupplementaryWebLinksEvent_event = async (
        output: any,
        context: __SerdeContext
      ): Promise<SupplementaryWebLinksEvent> => {
        const contents: SupplementaryWebLinksEvent = {} as any;
        const data: any = await parseBody(output.body, context);
        Object.assign(contents, _json(data));
        return contents;
      }
      // se_AssistantResponseMessage omitted.

      // se_ChatHistory omitted.

      // se_ChatMessage omitted.

      // se_ConversationState omitted.

      // se_CursorState omitted.

      // se_Diagnostic omitted.

      // se_DocumentSymbol omitted.

      // se_DocumentSymbols omitted.

      // se_EditorState omitted.

      // se_FollowupPrompt omitted.

      // se_Position omitted.

      // se_ProgrammingLanguage omitted.

      // se_Range omitted.

      // se_Reference omitted.

      // se_References omitted.

      // se_RuntimeDiagnostic omitted.

      // se_Span omitted.

      // se_SupplementaryWebLink omitted.

      // se_SupplementaryWebLinks omitted.

      // se_TextDocument omitted.

      // se_TextDocumentDiagnostic omitted.

      // se_UserInputMessage omitted.

      // se_UserInputMessageContext omitted.

      // se_WorkspaceState omitted.

      // de_AssistantResponseEvent omitted.

      // de_BinaryMetadataEvent omitted.

      /**
       * deserializeAws_restJson1BinaryPayloadEvent
       */
      const de_BinaryPayloadEvent = (
        output: any,
        context: __SerdeContext
      ): BinaryPayloadEvent => {
        return take(output, {
          'bytes': context.base64Decoder,
        }) as any;
      }

      // de_CodeReferenceEvent omitted.

      // de_FollowupPrompt omitted.

      // de_FollowupPromptEvent omitted.

      // de_InvalidStateEvent omitted.

      // de_MessageMetadataEvent omitted.

      // de_Reference omitted.

      // de_References omitted.

      // de_Span omitted.

      // de_SupplementaryWebLink omitted.

      // de_SupplementaryWebLinks omitted.

      // de_SupplementaryWebLinksEvent omitted.

      const deserializeMetadata = (output: __HttpResponse): __ResponseMetadata => ({
        httpStatusCode: output.statusCode,
        requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
        extendedRequestId: output.headers["x-amz-id-2"],
        cfId: output.headers["x-amz-cf-id"],
      });

      // Encode Uint8Array data into string with utf-8.
      const collectBodyString = (streamBody: any, context: __SerdeContext): Promise<string> => collectBody(streamBody, context).then(body => context.utf8Encoder(body))

      const isSerializableHeaderValue = (value: any): boolean =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        (!Object.getOwnPropertyNames(value).includes("length") ||
          value.length != 0) &&
        (!Object.getOwnPropertyNames(value).includes("size") || value.size != 0);

      const parseBody = (streamBody: any, context: __SerdeContext): any => collectBodyString(streamBody, context).then(encoded => {
        if (encoded.length) {
          return JSON.parse(encoded);
        }
        return {};
      });

      const parseErrorBody = async (errorBody: any, context: __SerdeContext) => {
        const value = await parseBody(errorBody, context);
        value.message = value.message ?? value.Message;
        return value;
      }

      /**
       * Load an error code for the aws.rest-json-1.1 protocol.
       */
      const loadRestJsonErrorCode = (output: __HttpResponse, data: any): string | undefined => {
        const findKey = (object: any, key: string) => Object.keys(object).find((k) => k.toLowerCase() === key.toLowerCase());

        const sanitizeErrorCode = (rawValue: string | number): string => {
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
