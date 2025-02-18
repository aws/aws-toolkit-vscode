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
import {
  SendMessageCommandInput,
  SendMessageCommandOutput,
} from "../commands/SendMessageCommand";
import { CodeWhispererStreamingServiceException as __BaseException } from "../models/CodeWhispererStreamingServiceException";
import {
  AccessDeniedException,
  AdditionalContentEntry,
  AppStudioState,
  AssistantResponseEvent,
  AssistantResponseMessage,
  BinaryMetadataEvent,
  BinaryPayloadEvent,
  ChatMessage,
  ChatResponseStream,
  CodeEvent,
  CodeReferenceEvent,
  ConflictException,
  ConsoleState,
  ConversationState,
  CursorState,
  Diagnostic,
  DocumentSymbol,
  DryRunOperationException,
  DryRunSucceedEvent,
  EditorState,
  EnvState,
  EnvironmentVariable,
  ExportContext,
  FollowupPrompt,
  FollowupPromptEvent,
  GitState,
  IntentsEvent,
  InteractionComponent,
  InteractionComponentEntry,
  InteractionComponentsEvent,
  InternalServerException,
  InvalidStateEvent,
  MessageMetadataEvent,
  Position,
  ProgrammingLanguage,
  Range,
  Reference,
  RelevantTextDocument,
  ResourceNotFoundException,
  ResultArchiveStream,
  RuntimeDiagnostic,
  ServiceQuotaExceededException,
  ShellHistoryEntry,
  ShellState,
  Span,
  SupplementaryWebLink,
  SupplementaryWebLinksEvent,
  TextDocument,
  TextDocumentDiagnostic,
  ThrottlingException,
  Tool,
  ToolInputSchema,
  ToolResult,
  ToolResultContentBlock,
  ToolSpecification,
  ToolUseEvent,
  TransformationExportContext,
  UnitTestGenerationExportContext,
  UserInputMessage,
  UserInputMessageContext,
  UserSettings,
  ValidationException,
  WorkspaceState,
} from "../models/models_0";
import {
  loadRestJsonErrorCode,
  parseJsonBody as parseBody,
  parseJsonErrorBody as parseErrorBody,
} from "@aws-sdk/core";
import { requestBuilder as rb } from "@smithy/core";
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
  DocumentType as __DocumentType,
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
  const b = rb(input, context);
  const headers: any = {
    'content-type': 'application/json',
  };
  b.bp("/exportResultArchive");
  let body: any;
  body = JSON.stringify(take(input, {
    'exportContext': _ => _json(_),
    'exportId': [],
    'exportIntent': [],
  }));
  b.m("POST")
  .h(headers)
  .b(body);
  return b.build();
}

/**
 * serializeAws_restJson1GenerateAssistantResponseCommand
 */
export const se_GenerateAssistantResponseCommand = async(
  input: GenerateAssistantResponseCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const b = rb(input, context);
  const headers: any = {
    'content-type': 'application/json',
  };
  b.bp("/generateAssistantResponse");
  let body: any;
  body = JSON.stringify(take(input, {
    'conversationState': _ => se_ConversationState(_, context),
    'profileArn': [],
  }));
  b.m("POST")
  .h(headers)
  .b(body);
  return b.build();
}

/**
 * serializeAws_restJson1GenerateTaskAssistPlanCommand
 */
export const se_GenerateTaskAssistPlanCommand = async(
  input: GenerateTaskAssistPlanCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const b = rb(input, context);
  const headers: any = {
    'content-type': 'application/json',
  };
  b.bp("/generateTaskAssistPlan");
  let body: any;
  body = JSON.stringify(take(input, {
    'conversationState': _ => se_ConversationState(_, context),
    'workspaceState': _ => _json(_),
  }));
  b.m("POST")
  .h(headers)
  .b(body);
  return b.build();
}

/**
 * serializeAws_restJson1SendMessageCommand
 */
export const se_SendMessageCommand = async(
  input: SendMessageCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const b = rb(input, context);
  const headers: any = {
    'content-type': 'application/json',
  };
  b.bp("/SendMessageStreaming");
  let body: any;
  body = JSON.stringify(take(input, {
    'conversationState': _ => se_ConversationState(_, context),
    'dryRun': [],
    'profileArn': [],
    'source': [],
  }));
  b.m("POST")
  .h(headers)
  .b(body);
  return b.build();
}

/**
 * deserializeAws_restJson1ExportResultArchiveCommand
 */
export const de_ExportResultArchiveCommand = async(
  output: __HttpResponse,
  context: __SerdeContext & __EventStreamSerdeContext
): Promise<ExportResultArchiveCommandOutput> => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents: any = map({
    $metadata: deserializeMetadata(output),
  });
  const data: any = output.body;
  contents.body = de_ResultArchiveStream(data, context);
  return contents;
}

/**
 * deserializeAws_restJson1GenerateAssistantResponseCommand
 */
export const de_GenerateAssistantResponseCommand = async(
  output: __HttpResponse,
  context: __SerdeContext & __EventStreamSerdeContext
): Promise<GenerateAssistantResponseCommandOutput> => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents: any = map({
    $metadata: deserializeMetadata(output),
    [_cI]: [, output.headers[_xacci]],
  });
  const data: any = output.body;
  contents.generateAssistantResponseResponse = de_ChatResponseStream(data, context);
  return contents;
}

/**
 * deserializeAws_restJson1GenerateTaskAssistPlanCommand
 */
export const de_GenerateTaskAssistPlanCommand = async(
  output: __HttpResponse,
  context: __SerdeContext & __EventStreamSerdeContext
): Promise<GenerateTaskAssistPlanCommandOutput> => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents: any = map({
    $metadata: deserializeMetadata(output),
  });
  const data: any = output.body;
  contents.planningResponseStream = de_ChatResponseStream(data, context);
  return contents;
}

/**
 * deserializeAws_restJson1SendMessageCommand
 */
export const de_SendMessageCommand = async(
  output: __HttpResponse,
  context: __SerdeContext & __EventStreamSerdeContext
): Promise<SendMessageCommandOutput> => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents: any = map({
    $metadata: deserializeMetadata(output),
  });
  const data: any = output.body;
  contents.sendMessageResponse = de_ChatResponseStream(data, context);
  return contents;
}

/**
 * deserialize_Aws_restJson1CommandError
 */
const de_CommandError = async(
  output: __HttpResponse,
  context: __SerdeContext,
): Promise<never> => {
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
    case "ServiceQuotaExceededException":
    case "com.amazon.aws.codewhisperer#ServiceQuotaExceededException":
      throw await de_ServiceQuotaExceededExceptionRes(parsedOutput, context);
    case "DryRunOperationException":
    case "com.amazon.aws.codewhisperer#DryRunOperationException":
      throw await de_DryRunOperationExceptionRes(parsedOutput, context);
    default:
      const parsedBody = parsedOutput.body;
      return throwDefaultError({
        output,
        parsedBody,
        errorCode
      }) as never
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
      'reason': __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ConflictException({
      $metadata: deserializeMetadata(parsedOutput),
      ...contents
    });
    return __decorateServiceException(exception, parsedOutput.body);
  };

  /**
   * deserializeAws_restJson1DryRunOperationExceptionRes
   */
  const de_DryRunOperationExceptionRes = async (
    parsedOutput: any,
    context: __SerdeContext
  ): Promise<DryRunOperationException> => {
    const contents: any = map({
    });
    const data: any = parsedOutput.body;
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
   * deserializeAws_restJson1ServiceQuotaExceededExceptionRes
   */
  const de_ServiceQuotaExceededExceptionRes = async (
    parsedOutput: any,
    context: __SerdeContext
  ): Promise<ServiceQuotaExceededException> => {
    const contents: any = map({
    });
    const data: any = parsedOutput.body;
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
      'reason': __expectString,
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
        if (event["toolUseEvent"] != null) {
          return {
            toolUseEvent: await de_ToolUseEvent_event(event["toolUseEvent"], context),
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
  const de_CodeEvent_event = async (
    output: any,
    context: __SerdeContext
  ): Promise<CodeEvent> => {
    const contents: CodeEvent = {} as any;
    const data: any = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
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
  const de_DryRunSucceedEvent_event = async (
    output: any,
    context: __SerdeContext
  ): Promise<DryRunSucceedEvent> => {
    const contents: DryRunSucceedEvent = {} as any;
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
  const de_IntentsEvent_event = async (
    output: any,
    context: __SerdeContext
  ): Promise<IntentsEvent> => {
    const contents: IntentsEvent = {} as any;
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
  const de_ToolUseEvent_event = async (
    output: any,
    context: __SerdeContext
  ): Promise<ToolUseEvent> => {
    const contents: ToolUseEvent = {} as any;
    const data: any = await parseBody(output.body, context);
    Object.assign(contents, _json(data));
    return contents;
  }
  const de_InteractionComponentsEvent_event = async (
    output: any,
    context: __SerdeContext
  ): Promise<InteractionComponentsEvent> => {
    const contents: InteractionComponentsEvent = {} as any;
    const data: any = await parseBody(output.body, context);
    Object.assign(contents, de_InteractionComponentsEvent(data, context));
    return contents;
  }
  // se_AdditionalContentEntry omitted.

  // se_AdditionalContentList omitted.

  // se_AppStudioState omitted.

  // se_AssistantResponseMessage omitted.

  /**
   * serializeAws_restJson1ChatHistory
   */
  const se_ChatHistory = (
    input: (ChatMessage)[],
    context: __SerdeContext
  ): any => {
    return input.filter((e: any) => e != null).map(entry => {
      return se_ChatMessage(entry, context);
    });
  }

  /**
   * serializeAws_restJson1ChatMessage
   */
  const se_ChatMessage = (
    input: ChatMessage,
    context: __SerdeContext
  ): any => {
    return ChatMessage.visit(input, {
      assistantResponseMessage: value => ({ "assistantResponseMessage": _json(value) }),
      userInputMessage: value => ({ "userInputMessage": se_UserInputMessage(value, context) }),
      _: (name, value) => ({ name: value } as any)
    });
  }

  // se_ConsoleState omitted.

  /**
   * serializeAws_restJson1ConversationState
   */
  const se_ConversationState = (
    input: ConversationState,
    context: __SerdeContext
  ): any => {
    return take(input, {
      'chatTriggerType': [],
      'conversationId': [],
      'currentMessage': _ => se_ChatMessage(_, context),
      'customizationArn': [],
      'history': _ => se_ChatHistory(_, context),
    });
  }

  // se_CursorState omitted.

  // se_Diagnostic omitted.

  // se_DocumentSymbol omitted.

  // se_DocumentSymbols omitted.

  // se_EditorState omitted.

  // se_EnvironmentVariable omitted.

  // se_EnvironmentVariables omitted.

  // se_EnvState omitted.

  // se_ExportContext omitted.

  // se_FollowupPrompt omitted.

  // se_GitState omitted.

  // se_Position omitted.

  // se_ProgrammingLanguage omitted.

  // se_Range omitted.

  // se_Reference omitted.

  // se_References omitted.

  // se_RelevantDocumentList omitted.

  // se_RelevantTextDocument omitted.

  // se_RuntimeDiagnostic omitted.

  /**
   * serializeAws_restJson1SensitiveDocument
   */
  const se_SensitiveDocument = (
    input: __DocumentType,
    context: __SerdeContext
  ): any => {
    return input;
  }

  // se_ShellHistory omitted.

  // se_ShellHistoryEntry omitted.

  // se_ShellState omitted.

  // se_Span omitted.

  // se_SupplementaryWebLink omitted.

  // se_SupplementaryWebLinks omitted.

  // se_TextDocument omitted.

  // se_TextDocumentDiagnostic omitted.

  /**
   * serializeAws_restJson1Tool
   */
  const se_Tool = (
    input: Tool,
    context: __SerdeContext
  ): any => {
    return Tool.visit(input, {
      toolSpecification: value => ({ "toolSpecification": se_ToolSpecification(value, context) }),
      _: (name, value) => ({ name: value } as any)
    });
  }

  /**
   * serializeAws_restJson1ToolInputSchema
   */
  const se_ToolInputSchema = (
    input: ToolInputSchema,
    context: __SerdeContext
  ): any => {
    return take(input, {
      'json': _ => se_SensitiveDocument(_, context),
    });
  }

  /**
   * serializeAws_restJson1ToolResult
   */
  const se_ToolResult = (
    input: ToolResult,
    context: __SerdeContext
  ): any => {
    return take(input, {
      'content': _ => se_ToolResultContent(_, context),
      'status': [],
      'toolUseId': [],
    });
  }

  /**
   * serializeAws_restJson1ToolResultContent
   */
  const se_ToolResultContent = (
    input: (ToolResultContentBlock)[],
    context: __SerdeContext
  ): any => {
    return input.filter((e: any) => e != null).map(entry => {
      return se_ToolResultContentBlock(entry, context);
    });
  }

  /**
   * serializeAws_restJson1ToolResultContentBlock
   */
  const se_ToolResultContentBlock = (
    input: ToolResultContentBlock,
    context: __SerdeContext
  ): any => {
    return ToolResultContentBlock.visit(input, {
      json: value => ({ "json": se_SensitiveDocument(value, context) }),
      text: value => ({ "text": value }),
      _: (name, value) => ({ name: value } as any)
    });
  }

  /**
   * serializeAws_restJson1ToolResults
   */
  const se_ToolResults = (
    input: (ToolResult)[],
    context: __SerdeContext
  ): any => {
    return input.filter((e: any) => e != null).map(entry => {
      return se_ToolResult(entry, context);
    });
  }

  /**
   * serializeAws_restJson1Tools
   */
  const se_Tools = (
    input: (Tool)[],
    context: __SerdeContext
  ): any => {
    return input.filter((e: any) => e != null).map(entry => {
      return se_Tool(entry, context);
    });
  }

  /**
   * serializeAws_restJson1ToolSpecification
   */
  const se_ToolSpecification = (
    input: ToolSpecification,
    context: __SerdeContext
  ): any => {
    return take(input, {
      'description': [],
      'inputSchema': _ => se_ToolInputSchema(_, context),
      'name': [],
    });
  }

  // se_TransformationExportContext omitted.

  // se_UnitTestGenerationExportContext omitted.

  /**
   * serializeAws_restJson1UserInputMessage
   */
  const se_UserInputMessage = (
    input: UserInputMessage,
    context: __SerdeContext
  ): any => {
    return take(input, {
      'content': [],
      'userInputMessageContext': _ => se_UserInputMessageContext(_, context),
      'userIntent': [],
    });
  }

  /**
   * serializeAws_restJson1UserInputMessageContext
   */
  const se_UserInputMessageContext = (
    input: UserInputMessageContext,
    context: __SerdeContext
  ): any => {
    return take(input, {
      'additionalContext': _json,
      'appStudioContext': _json,
      'consoleState': _json,
      'diagnostic': _json,
      'editorState': _json,
      'envState': _json,
      'gitState': _json,
      'shellState': _json,
      'toolResults': _ => se_ToolResults(_, context),
      'tools': _ => se_Tools(_, context),
      'userSettings': _json,
    });
  }

  // se_UserSettings omitted.

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

  // de_CodeEvent omitted.

  // de_CodeReferenceEvent omitted.

  // de_DryRunSucceedEvent omitted.

  // de_FollowupPrompt omitted.

  // de_FollowupPromptEvent omitted.

  // de_IntentData omitted.

  // de_IntentDataType omitted.

  // de_IntentMap omitted.

  // de_IntentsEvent omitted.

  // de_InvalidStateEvent omitted.

  // de_MessageMetadataEvent omitted.

  // de_Reference omitted.

  // de_References omitted.

  // de_Span omitted.

  // de_SupplementaryWebLink omitted.

  // de_SupplementaryWebLinks omitted.

  // de_SupplementaryWebLinksEvent omitted.

  // de_ToolUseEvent omitted.

  /**
   * deserializeAws_restJson1InteractionComponentsEvent
   */
  const de_InteractionComponentsEvent = (
    output: any,
    context: __SerdeContext
  ): InteractionComponentsEvent => {
    return take(output, {
      'interactionComponentEntries': (_: any) => de_InteractionComponentEntryList(_, context),
    }) as any;
  }

  // de_Action omitted.

  // de_Alert omitted.

  // de_AlertComponent omitted.

  // de_AlertComponentList omitted.

  // de_CloudWatchTroubleshootingLink omitted.

  // de_InfrastructureUpdate omitted.

  // de_InfrastructureUpdateTransition omitted.

  /**
   * deserializeAws_restJson1InteractionComponent
   */
  const de_InteractionComponent = (
    output: any,
    context: __SerdeContext
  ): InteractionComponent => {
    return take(output, {
      'action': _json,
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
    }) as any;
  }

  /**
   * deserializeAws_restJson1InteractionComponentEntry
   */
  const de_InteractionComponentEntry = (
    output: any,
    context: __SerdeContext
  ): InteractionComponentEntry => {
    return take(output, {
      'interactionComponent': (_: any) => de_InteractionComponent(_, context),
      'interactionComponentId': __expectString,
    }) as any;
  }

  /**
   * deserializeAws_restJson1InteractionComponentEntryList
   */
  const de_InteractionComponentEntryList = (
    output: any,
    context: __SerdeContext
  ): (InteractionComponentEntry)[] => {
    const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
      return de_InteractionComponentEntry(entry, context);
    });
    return retVal;
  }

  // de_ModuleLink omitted.

  // de_Progress omitted.

  // de_ProgressComponent omitted.

  // de_ProgressComponentList omitted.

  // de_Resource omitted.

  // de_ResourceList omitted.

  // de_Resources omitted.

  // de_Section omitted.

  // de_SectionComponent omitted.

  // de_SectionComponentList omitted.

  // de_Step omitted.

  // de_StepComponent omitted.

  // de_StepComponentList omitted.

  // de_Suggestion omitted.

  // de_SuggestionList omitted.

  // de_Suggestions omitted.

  // de_TaskAction omitted.

  // de_TaskActionConfirmation omitted.

  // de_TaskActionList omitted.

  // de_TaskActionNote omitted.

  // de_TaskActionPayload omitted.

  // de_TaskComponent omitted.

  // de_TaskComponentList omitted.

  // de_TaskDetails omitted.

  // de_TaskOverview omitted.

  // de_TaskReference omitted.

  // de_Text omitted.

  // de_WebLink omitted.

  const deserializeMetadata = (output: __HttpResponse): __ResponseMetadata => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
  });

  // Encode Uint8Array data into string with utf-8.
  const collectBodyString = (streamBody: any, context: __SerdeContext): Promise<string> => collectBody(streamBody, context).then(body => context.utf8Encoder(body))

  const _cI = "conversationId";
  const _xacci = "x-amzn-codewhisperer-conversation-id";
