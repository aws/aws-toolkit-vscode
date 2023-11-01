// smithy-typescript generated code
import {
  ChatCommandInput,
  ChatCommandOutput,
} from "../commands/ChatCommand";
import {
  ExportResultArchiveCommandInput,
  ExportResultArchiveCommandOutput,
} from "../commands/ExportResultArchiveCommand";
import {
  GenerateTaskAssistPlanCommandInput,
  GenerateTaskAssistPlanCommandOutput,
} from "../commands/GenerateTaskAssistPlanCommand";
import {
  StartConversationCommandInput,
  StartConversationCommandOutput,
} from "../commands/StartConversationCommand";
import { CodeWhispererStreamingServiceException as __BaseException } from "../models/CodeWhispererStreamingServiceException";
import {
  AccessDeniedException,
  AssistantResponseEvent,
  AssistantResponseMessage,
  BinaryMetadataEvent,
  BinaryPayloadEvent,
  ChatMessage,
  ChatRequest,
  ChatResponseStream,
  CodeReferenceEvent,
  ConversationState,
  CursorState,
  Diagnostic,
  DocumentSymbol,
  EditorState,
  ExportResultArchiveRequest,
  FollowupPrompt,
  FollowupPromptEvent,
  GenerateTaskAssistPlanRequest,
  InternalServerException,
  MessageMetadataEvent,
  PayloadPart,
  Position,
  ProgrammingLanguage,
  Range,
  Reference,
  ResponseStream,
  ResultArchiveStream,
  RuntimeDiagnostic,
  Span,
  StartConversationRequest,
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
  _json,
  collectBody,
  take,
  withBaseException,
} from "@smithy/smithy-client";
import {
  Endpoint as __Endpoint,
  EventStreamSerdeContext as __EventStreamSerdeContext,
  HeaderBag as __HeaderBag,
  ResponseMetadata as __ResponseMetadata,
  SerdeContext as __SerdeContext,
} from "@smithy/types";
import { v4 as generateIdempotencyToken } from "uuid";

/**
 * serializeAws_json1_0ChatCommand
 */
export const se_ChatCommand = async(
  input: ChatCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const headers: __HeaderBag = sharedHeaders("Chat")
  let body: any;
  body = JSON.stringify(se_ChatRequest(input, context));
  return buildHttpRpcRequest(context, headers, "/", undefined, body);
}

/**
 * serializeAws_json1_0ExportResultArchiveCommand
 */
export const se_ExportResultArchiveCommand = async(
  input: ExportResultArchiveCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const headers: __HeaderBag = sharedHeaders("ExportResultArchive")
  let body: any;
  body = JSON.stringify(_json(input));
  return buildHttpRpcRequest(context, headers, "/", undefined, body);
}

/**
 * serializeAws_json1_0GenerateTaskAssistPlanCommand
 */
export const se_GenerateTaskAssistPlanCommand = async(
  input: GenerateTaskAssistPlanCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const headers: __HeaderBag = sharedHeaders("GenerateTaskAssistPlan")
  let body: any;
  body = JSON.stringify(se_GenerateTaskAssistPlanRequest(input, context));
  return buildHttpRpcRequest(context, headers, "/", undefined, body);
}

/**
 * serializeAws_json1_0StartConversationCommand
 */
export const se_StartConversationCommand = async(
  input: StartConversationCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const headers: __HeaderBag = sharedHeaders("StartConversation")
  let body: any;
  body = JSON.stringify(_json(input));
  return buildHttpRpcRequest(context, headers, "/", undefined, body);
}

/**
 * deserializeAws_json1_0ChatCommand
 */
export const de_ChatCommand = async(
  output: __HttpResponse,
  context: __SerdeContext & __EventStreamSerdeContext
): Promise<ChatCommandOutput> => {
  if (output.statusCode >= 300) {
    return de_ChatCommandError(output, context);
  }
  const contents = { chatResponse: de_ChatResponseStream(output.body, context) };
  const response: ChatCommandOutput = {
    $metadata: deserializeMetadata(output),
    ...contents,
  };
  return response;
}

/**
 * deserializeAws_json1_0ChatCommandError
 */
const de_ChatCommandError = async(
  output: __HttpResponse,
  context: __SerdeContext,
): Promise<ChatCommandOutput> => {
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
   * deserializeAws_json1_0ExportResultArchiveCommand
   */
  export const de_ExportResultArchiveCommand = async(
    output: __HttpResponse,
    context: __SerdeContext & __EventStreamSerdeContext
  ): Promise<ExportResultArchiveCommandOutput> => {
    if (output.statusCode >= 300) {
      return de_ExportResultArchiveCommandError(output, context);
    }
    const contents = { body: de_ResultArchiveStream(output.body, context) };
    const response: ExportResultArchiveCommandOutput = {
      $metadata: deserializeMetadata(output),
      ...contents,
    };
    return response;
  }

  /**
   * deserializeAws_json1_0ExportResultArchiveCommandError
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
     * deserializeAws_json1_0GenerateTaskAssistPlanCommand
     */
    export const de_GenerateTaskAssistPlanCommand = async(
      output: __HttpResponse,
      context: __SerdeContext & __EventStreamSerdeContext
    ): Promise<GenerateTaskAssistPlanCommandOutput> => {
      if (output.statusCode >= 300) {
        return de_GenerateTaskAssistPlanCommandError(output, context);
      }
      const contents = { planningResponseStream: de_ChatResponseStream(output.body, context) };
      const response: GenerateTaskAssistPlanCommandOutput = {
        $metadata: deserializeMetadata(output),
        ...contents,
      };
      return response;
    }

    /**
     * deserializeAws_json1_0GenerateTaskAssistPlanCommandError
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
       * deserializeAws_json1_0StartConversationCommand
       */
      export const de_StartConversationCommand = async(
        output: __HttpResponse,
        context: __SerdeContext & __EventStreamSerdeContext
      ): Promise<StartConversationCommandOutput> => {
        if (output.statusCode >= 300) {
          return de_StartConversationCommandError(output, context);
        }
        const contents = { body: de_ResponseStream(output.body, context) };
        const response: StartConversationCommandOutput = {
          $metadata: deserializeMetadata(output),
          ...contents,
        };
        return response;
      }

      /**
       * deserializeAws_json1_0StartConversationCommandError
       */
      const de_StartConversationCommandError = async(
        output: __HttpResponse,
        context: __SerdeContext,
      ): Promise<StartConversationCommandOutput> => {
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
         * deserializeAws_json1_0AccessDeniedExceptionRes
         */
        const de_AccessDeniedExceptionRes = async (
          parsedOutput: any,
          context: __SerdeContext
        ): Promise<AccessDeniedException> => {
          const body = parsedOutput.body
          const deserialized: any = _json(body);
          const exception = new AccessDeniedException({
            $metadata: deserializeMetadata(parsedOutput),
            ...deserialized
          });
          return __decorateServiceException(exception, body);
        };

        /**
         * deserializeAws_json1_0InternalServerExceptionRes
         */
        const de_InternalServerExceptionRes = async (
          parsedOutput: any,
          context: __SerdeContext
        ): Promise<InternalServerException> => {
          const body = parsedOutput.body
          const deserialized: any = _json(body);
          const exception = new InternalServerException({
            $metadata: deserializeMetadata(parsedOutput),
            ...deserialized
          });
          return __decorateServiceException(exception, body);
        };

        /**
         * deserializeAws_json1_0ThrottlingExceptionRes
         */
        const de_ThrottlingExceptionRes = async (
          parsedOutput: any,
          context: __SerdeContext
        ): Promise<ThrottlingException> => {
          const body = parsedOutput.body
          const deserialized: any = _json(body);
          const exception = new ThrottlingException({
            $metadata: deserializeMetadata(parsedOutput),
            ...deserialized
          });
          return __decorateServiceException(exception, body);
        };

        /**
         * deserializeAws_json1_0ValidationExceptionRes
         */
        const de_ValidationExceptionRes = async (
          parsedOutput: any,
          context: __SerdeContext
        ): Promise<ValidationException> => {
          const body = parsedOutput.body
          const deserialized: any = _json(body);
          const exception = new ValidationException({
            $metadata: deserializeMetadata(parsedOutput),
            ...deserialized
          });
          return __decorateServiceException(exception, body);
        };

        /**
         * deserializeAws_json1_0ChatResponseStream
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
         * deserializeAws_json1_0ResponseStream
         */
        const de_ResponseStream = (
          output: any,
          context: __SerdeContext & __EventStreamSerdeContext
        ): AsyncIterable<ResponseStream> => {
          return context.eventStreamMarshaller.deserialize(
            output,
            async event => {
              if (event["chunk"] != null) {
                return {
                  chunk: await de_PayloadPart_event(event["chunk"], context),
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
        /**
         * deserializeAws_json1_0ResultArchiveStream
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
        const de_MessageMetadataEvent_event = async (
          output: any,
          context: __SerdeContext
        ): Promise<MessageMetadataEvent> => {
          const contents: MessageMetadataEvent = {} as any;
          const data: any = await parseBody(output.body, context);
          Object.assign(contents, _json(data));
          return contents;
        }
        const de_PayloadPart_event = async (
          output: any,
          context: __SerdeContext
        ): Promise<PayloadPart> => {
          const contents: PayloadPart = {} as any;
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

        // se_PayloadPart omitted.

        // se_Position omitted.

        // se_ProgrammingLanguage omitted.

        // se_Range omitted.

        // se_Reference omitted.

        // se_References omitted.

        // se_RuntimeDiagnostic omitted.

        // se_Span omitted.

        // se_StartConversationRequest omitted.

        // se_SupplementaryWebLink omitted.

        // se_SupplementaryWebLinks omitted.

        // se_TextDocument omitted.

        // se_TextDocumentDiagnostic omitted.

        // se_UserInputMessage omitted.

        // se_UserInputMessageContext omitted.

        // se_WorkspaceState omitted.

        /**
         * serializeAws_json1_0ChatRequest
         */
        const se_ChatRequest = (
          input: ChatRequest,
          context: __SerdeContext
        ): any => {
          return take(input, {
            'conversationState': _json,
          });
        }

        // se_ExportResultArchiveRequest omitted.

        /**
         * serializeAws_json1_0GenerateTaskAssistPlanRequest
         */
        const se_GenerateTaskAssistPlanRequest = (
          input: GenerateTaskAssistPlanRequest,
          context: __SerdeContext
        ): any => {
          return take(input, {
            'conversationState': _json,
            'workspaceState': _json,
          });
        }

        // de_AccessDeniedException omitted.

        // de_AssistantResponseEvent omitted.

        // de_BinaryMetadataEvent omitted.

        /**
         * deserializeAws_json1_0BinaryPayloadEvent
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

        // de_InternalServerException omitted.

        // de_MessageMetadataEvent omitted.

        // de_PayloadPart omitted.

        // de_Reference omitted.

        // de_References omitted.

        // de_Span omitted.

        // de_SupplementaryWebLink omitted.

        // de_SupplementaryWebLinks omitted.

        // de_SupplementaryWebLinksEvent omitted.

        // de_ThrottlingException omitted.

        // de_ValidationException omitted.

        const deserializeMetadata = (output: __HttpResponse): __ResponseMetadata => ({
          httpStatusCode: output.statusCode,
          requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
          extendedRequestId: output.headers["x-amz-id-2"],
          cfId: output.headers["x-amz-cf-id"],
        });

        // Encode Uint8Array data into string with utf-8.
        const collectBodyString = (streamBody: any, context: __SerdeContext): Promise<string> => collectBody(streamBody, context).then(body => context.utf8Encoder(body))

        const throwDefaultError = withBaseException(__BaseException);
        const buildHttpRpcRequest = async (
          context: __SerdeContext,
          headers: __HeaderBag,
          path: string,
          resolvedHostname: string | undefined,
          body: any,
        ): Promise<__HttpRequest> => {
          const {hostname, protocol = "https", port, path: basePath} = await context.endpoint();
          const contents: any = {
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
        function sharedHeaders(operation: string): __HeaderBag { return {
          'content-type': "application/x-amz-json-1.0",
          'x-amz-target': `AmazonCodeWhispererStreamingService.${operation}`,
        }};

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
