// smithy-typescript generated code
import {
  GenerateCodeFromCommandsCommandInput,
  GenerateCodeFromCommandsCommandOutput,
} from "../commands/GenerateCodeFromCommandsCommand";
import {
  SendMessageCommandInput,
  SendMessageCommandOutput,
} from "../commands/SendMessageCommand";
import { QDeveloperStreamingServiceException as __BaseException } from "../models/QDeveloperStreamingServiceException";
import {
  AccessDeniedException,
  Action,
  Alert,
  AlertComponent,
  AppStudioState,
  AssistantResponseEvent,
  AssistantResponseMessage,
  ChatMessage,
  ChatResponseStream,
  CloudWatchTroubleshootingLink,
  CodeEvent,
  CodeReferenceEvent,
  CommandInput,
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
  FollowupPrompt,
  FollowupPromptEvent,
  GenerateCodeFromCommandsRequest,
  GenerateCodeFromCommandsResponseStream,
  GitState,
  InfrastructureUpdate,
  InfrastructureUpdateTransition,
  IntentDataType,
  IntentType,
  IntentsEvent,
  InteractionComponent,
  InteractionComponentEntry,
  InteractionComponentsEvent,
  InternalServerException,
  InvalidStateEvent,
  MessageMetadataEvent,
  ModuleLink,
  Position,
  ProgrammingLanguage,
  Progress,
  ProgressComponent,
  Range,
  Reference,
  RelevantTextDocument,
  Resource,
  ResourceList,
  ResourceNotFoundException,
  RuntimeDiagnostic,
  Section,
  SectionComponent,
  SendMessageRequest,
  ServiceQuotaExceededException,
  ShellHistoryEntry,
  ShellState,
  Span,
  Step,
  StepComponent,
  Suggestion,
  Suggestions,
  SupplementaryWebLink,
  SupplementaryWebLinksEvent,
  TaskAction,
  TaskActionConfirmation,
  TaskActionNote,
  TaskComponent,
  TaskDetails,
  TaskOverview,
  TaskReference,
  Text,
  TextDocument,
  TextDocumentDiagnostic,
  ThrottlingException,
  UserInputMessage,
  UserInputMessageContext,
  UserSettings,
  ValidationException,
  WebLink,
} from "../models/models_0";
import {
  HttpRequest as __HttpRequest,
  HttpResponse as __HttpResponse,
} from "@aws-sdk/protocol-http";
import {
  decorateServiceException as __decorateServiceException,
  expectBoolean as __expectBoolean,
  expectInt32 as __expectInt32,
  expectString as __expectString,
  expectUnion as __expectUnion,
  throwDefaultError,
} from "@aws-sdk/smithy-client";
import {
  Endpoint as __Endpoint,
  EventStreamSerdeContext as __EventStreamSerdeContext,
  HeaderBag as __HeaderBag,
  ResponseMetadata as __ResponseMetadata,
  SerdeContext as __SerdeContext,
} from "@aws-sdk/types";
import { v4 as generateIdempotencyToken } from "uuid";

export const serializeAws_json1_0GenerateCodeFromCommandsCommand = async(
  input: GenerateCodeFromCommandsCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const headers: __HeaderBag = {
    'content-type': "application/x-amz-json-1.0",
    'x-amz-target': "AmazonQDeveloperStreamingService.GenerateCodeFromCommands",
  };
  let body: any;
  body = JSON.stringify(serializeAws_json1_0GenerateCodeFromCommandsRequest(input, context));
  return buildHttpRpcRequest(context, headers, "/", undefined, body);
}

export const serializeAws_json1_0SendMessageCommand = async(
  input: SendMessageCommandInput,
  context: __SerdeContext
): Promise<__HttpRequest> => {
  const headers: __HeaderBag = {
    'content-type': "application/x-amz-json-1.0",
    'x-amz-target': "AmazonQDeveloperStreamingService.SendMessage",
  };
  let body: any;
  body = JSON.stringify(serializeAws_json1_0SendMessageRequest(input, context));
  return buildHttpRpcRequest(context, headers, "/", undefined, body);
}

export const deserializeAws_json1_0GenerateCodeFromCommandsCommand = async(
  output: __HttpResponse,
  context: __SerdeContext & __EventStreamSerdeContext
): Promise<GenerateCodeFromCommandsCommandOutput> => {
  if (output.statusCode >= 300) {
    return deserializeAws_json1_0GenerateCodeFromCommandsCommandError(output, context);
  }
  const contents = { generatedCodeFromCommandsResponse: deserializeAws_json1_0GenerateCodeFromCommandsResponseStream(output.body, context) };
  const response: GenerateCodeFromCommandsCommandOutput = {
    $metadata: deserializeMetadata(output),
    ...contents,
  };
  return Promise.resolve(response);
}

const deserializeAws_json1_0GenerateCodeFromCommandsCommandError = async(
  output: __HttpResponse,
  context: __SerdeContext,
): Promise<GenerateCodeFromCommandsCommandOutput> => {
  const parsedOutput: any = {
    ...output,
    body: await parseErrorBody(output.body, context)
  };
  const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
  switch (errorCode) {
    case "AccessDeniedException":
    case "com.amazon.aws.codewhisperer#AccessDeniedException":
      throw await deserializeAws_json1_0AccessDeniedExceptionResponse(parsedOutput, context);
    case "InternalServerException":
    case "com.amazon.aws.codewhisperer#InternalServerException":
      throw await deserializeAws_json1_0InternalServerExceptionResponse(parsedOutput, context);
    case "ThrottlingException":
    case "com.amazon.aws.codewhisperer#ThrottlingException":
      throw await deserializeAws_json1_0ThrottlingExceptionResponse(parsedOutput, context);
    case "ValidationException":
    case "com.amazon.aws.codewhisperer#ValidationException":
      throw await deserializeAws_json1_0ValidationExceptionResponse(parsedOutput, context);
    default:
      const parsedBody = parsedOutput.body;
      throwDefaultError({
        output,
        parsedBody,
        exceptionCtor: __BaseException,
        errorCode
      })
    }
  }

  export const deserializeAws_json1_0SendMessageCommand = async(
    output: __HttpResponse,
    context: __SerdeContext & __EventStreamSerdeContext
  ): Promise<SendMessageCommandOutput> => {
    if (output.statusCode >= 300) {
      return deserializeAws_json1_0SendMessageCommandError(output, context);
    }
    const contents = { sendMessageResponse: deserializeAws_json1_0ChatResponseStream(output.body, context) };
    const response: SendMessageCommandOutput = {
      $metadata: deserializeMetadata(output),
      ...contents,
    };
    return Promise.resolve(response);
  }

  const deserializeAws_json1_0SendMessageCommandError = async(
    output: __HttpResponse,
    context: __SerdeContext,
  ): Promise<SendMessageCommandOutput> => {
    const parsedOutput: any = {
      ...output,
      body: await parseErrorBody(output.body, context)
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
      case "AccessDeniedException":
      case "com.amazon.aws.codewhisperer#AccessDeniedException":
        throw await deserializeAws_json1_0AccessDeniedExceptionResponse(parsedOutput, context);
      case "ConflictException":
      case "com.amazon.aws.codewhisperer#ConflictException":
        throw await deserializeAws_json1_0ConflictExceptionResponse(parsedOutput, context);
      case "DryRunOperationException":
      case "com.amazon.aws.codewhisperer#DryRunOperationException":
        throw await deserializeAws_json1_0DryRunOperationExceptionResponse(parsedOutput, context);
      case "InternalServerException":
      case "com.amazon.aws.codewhisperer#InternalServerException":
        throw await deserializeAws_json1_0InternalServerExceptionResponse(parsedOutput, context);
      case "ResourceNotFoundException":
      case "com.amazon.aws.codewhisperer#ResourceNotFoundException":
        throw await deserializeAws_json1_0ResourceNotFoundExceptionResponse(parsedOutput, context);
      case "ServiceQuotaExceededException":
      case "com.amazon.aws.codewhisperer#ServiceQuotaExceededException":
        throw await deserializeAws_json1_0ServiceQuotaExceededExceptionResponse(parsedOutput, context);
      case "ThrottlingException":
      case "com.amazon.aws.codewhisperer#ThrottlingException":
        throw await deserializeAws_json1_0ThrottlingExceptionResponse(parsedOutput, context);
      case "ValidationException":
      case "com.amazon.aws.codewhisperer#ValidationException":
        throw await deserializeAws_json1_0ValidationExceptionResponse(parsedOutput, context);
      default:
        const parsedBody = parsedOutput.body;
        throwDefaultError({
          output,
          parsedBody,
          exceptionCtor: __BaseException,
          errorCode
        })
      }
    }

    const deserializeAws_json1_0AccessDeniedExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<AccessDeniedException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0AccessDeniedException(body, context);
      const exception = new AccessDeniedException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0ConflictExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<ConflictException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0ConflictException(body, context);
      const exception = new ConflictException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0DryRunOperationExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<DryRunOperationException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0DryRunOperationException(body, context);
      const exception = new DryRunOperationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0InternalServerExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<InternalServerException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0InternalServerException(body, context);
      const exception = new InternalServerException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0ResourceNotFoundExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<ResourceNotFoundException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0ResourceNotFoundException(body, context);
      const exception = new ResourceNotFoundException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0ServiceQuotaExceededExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<ServiceQuotaExceededException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0ServiceQuotaExceededException(body, context);
      const exception = new ServiceQuotaExceededException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0ThrottlingExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<ThrottlingException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0ThrottlingException(body, context);
      const exception = new ThrottlingException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0ValidationExceptionResponse = async (
      parsedOutput: any,
      context: __SerdeContext
    ): Promise<ValidationException> => {
      const body = parsedOutput.body
      const deserialized: any = deserializeAws_json1_0ValidationException(body, context);
      const exception = new ValidationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...deserialized
      });
      return __decorateServiceException(exception, body);
    };

    const deserializeAws_json1_0ChatResponseStream = (
      output: any,
      context: __SerdeContext & __EventStreamSerdeContext
    ): AsyncIterable<ChatResponseStream> => {
      return context.eventStreamMarshaller.deserialize(
        output,
        async event => {
          if (event["messageMetadataEvent"] != null) {
            return {
              messageMetadataEvent: await deserializeAws_json1_0MessageMetadataEvent_event(event["messageMetadataEvent"], context),
            };
          }
          if (event["assistantResponseEvent"] != null) {
            return {
              assistantResponseEvent: await deserializeAws_json1_0AssistantResponseEvent_event(event["assistantResponseEvent"], context),
            };
          }
          if (event["dryRunSucceedEvent"] != null) {
            return {
              dryRunSucceedEvent: await deserializeAws_json1_0DryRunSucceedEvent_event(event["dryRunSucceedEvent"], context),
            };
          }
          if (event["codeReferenceEvent"] != null) {
            return {
              codeReferenceEvent: await deserializeAws_json1_0CodeReferenceEvent_event(event["codeReferenceEvent"], context),
            };
          }
          if (event["supplementaryWebLinksEvent"] != null) {
            return {
              supplementaryWebLinksEvent: await deserializeAws_json1_0SupplementaryWebLinksEvent_event(event["supplementaryWebLinksEvent"], context),
            };
          }
          if (event["followupPromptEvent"] != null) {
            return {
              followupPromptEvent: await deserializeAws_json1_0FollowupPromptEvent_event(event["followupPromptEvent"], context),
            };
          }
          if (event["codeEvent"] != null) {
            return {
              codeEvent: await deserializeAws_json1_0CodeEvent_event(event["codeEvent"], context),
            };
          }
          if (event["intentsEvent"] != null) {
            return {
              intentsEvent: await deserializeAws_json1_0IntentsEvent_event(event["intentsEvent"], context),
            };
          }
          if (event["interactionComponentsEvent"] != null) {
            return {
              interactionComponentsEvent: await deserializeAws_json1_0InteractionComponentsEvent_event(event["interactionComponentsEvent"], context),
            };
          }
          if (event["invalidStateEvent"] != null) {
            return {
              invalidStateEvent: await deserializeAws_json1_0InvalidStateEvent_event(event["invalidStateEvent"], context),
            };
          }
          if (event["error"] != null) {
            return {
              error: await deserializeAws_json1_0InternalServerException_event(event["error"], context),
            };
          }
          return {$unknown: output};
        }
      );
    }
    const deserializeAws_json1_0GenerateCodeFromCommandsResponseStream = (
      output: any,
      context: __SerdeContext & __EventStreamSerdeContext
    ): AsyncIterable<GenerateCodeFromCommandsResponseStream> => {
      return context.eventStreamMarshaller.deserialize(
        output,
        async event => {
          if (event["codeEvent"] != null) {
            return {
              codeEvent: await deserializeAws_json1_0CodeEvent_event(event["codeEvent"], context),
            };
          }
          if (event["Error"] != null) {
            return {
              Error: await deserializeAws_json1_0InternalServerException_event(event["Error"], context),
            };
          }
          if (event["QuotaLevelExceededError"] != null) {
            return {
              QuotaLevelExceededError: await deserializeAws_json1_0ServiceQuotaExceededException_event(event["QuotaLevelExceededError"], context),
            };
          }
          if (event["ValidationError"] != null) {
            return {
              ValidationError: await deserializeAws_json1_0ValidationException_event(event["ValidationError"], context),
            };
          }
          return {$unknown: output};
        }
      );
    }
    const deserializeAws_json1_0AssistantResponseEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<AssistantResponseEvent> => {
      const contents: AssistantResponseEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0AssistantResponseEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0CodeEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<CodeEvent> => {
      const contents: CodeEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0CodeEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0CodeReferenceEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<CodeReferenceEvent> => {
      const contents: CodeReferenceEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0CodeReferenceEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0DryRunSucceedEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<DryRunSucceedEvent> => {
      const contents: DryRunSucceedEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0DryRunSucceedEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0FollowupPromptEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<FollowupPromptEvent> => {
      const contents: FollowupPromptEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0FollowupPromptEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0IntentsEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<IntentsEvent> => {
      const contents: IntentsEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0IntentsEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0InternalServerException_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<InternalServerException> => {
      const parsedOutput: any = {
        ...output,
        body: await parseBody(output.body, context)
      };
      return deserializeAws_json1_0InternalServerExceptionResponse(parsedOutput, context);
    }
    const deserializeAws_json1_0InvalidStateEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<InvalidStateEvent> => {
      const contents: InvalidStateEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0InvalidStateEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0MessageMetadataEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<MessageMetadataEvent> => {
      const contents: MessageMetadataEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0MessageMetadataEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0ServiceQuotaExceededException_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<ServiceQuotaExceededException> => {
      const parsedOutput: any = {
        ...output,
        body: await parseBody(output.body, context)
      };
      return deserializeAws_json1_0ServiceQuotaExceededExceptionResponse(parsedOutput, context);
    }
    const deserializeAws_json1_0SupplementaryWebLinksEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<SupplementaryWebLinksEvent> => {
      const contents: SupplementaryWebLinksEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0SupplementaryWebLinksEvent(data, context));
      return contents;
    }
    const deserializeAws_json1_0ValidationException_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<ValidationException> => {
      const parsedOutput: any = {
        ...output,
        body: await parseBody(output.body, context)
      };
      return deserializeAws_json1_0ValidationExceptionResponse(parsedOutput, context);
    }
    const deserializeAws_json1_0InteractionComponentsEvent_event = async (
      output: any,
      context: __SerdeContext
    ): Promise<InteractionComponentsEvent> => {
      const contents: InteractionComponentsEvent = {} as any;
      const data: any = await parseBody(output.body, context);
      Object.assign(contents, deserializeAws_json1_0InteractionComponentsEvent(data, context));
      return contents;
    }
    const serializeAws_json1_0AppStudioState = (
      input: AppStudioState,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.namespace != null && { "namespace": input.namespace }),
        ...(input.propertyContext != null && { "propertyContext": input.propertyContext }),
        ...(input.propertyName != null && { "propertyName": input.propertyName }),
        ...(input.propertyValue != null && { "propertyValue": input.propertyValue }),
      };
    }

    const serializeAws_json1_0AssistantResponseMessage = (
      input: AssistantResponseMessage,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.content != null && { "content": input.content }),
        ...(input.followupPrompt != null && { "followupPrompt": serializeAws_json1_0FollowupPrompt(input.followupPrompt, context) }),
        ...(input.messageId != null && { "messageId": input.messageId }),
        ...(input.references != null && { "references": serializeAws_json1_0References(input.references, context) }),
        ...(input.supplementaryWebLinks != null && { "supplementaryWebLinks": serializeAws_json1_0SupplementaryWebLinks(input.supplementaryWebLinks, context) }),
      };
    }

    const serializeAws_json1_0ChatHistory = (
      input: (ChatMessage)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return serializeAws_json1_0ChatMessage(entry, context);
      });
    }

    const serializeAws_json1_0ChatMessage = (
      input: ChatMessage,
      context: __SerdeContext
    ): any => {
      return ChatMessage.visit(input, {
        assistantResponseMessage: value => ({ "assistantResponseMessage": serializeAws_json1_0AssistantResponseMessage(value, context) }),
        userInputMessage: value => ({ "userInputMessage": serializeAws_json1_0UserInputMessage(value, context) }),
        _: (name, value) => ({ name: value } as any)
      });
    }

    const serializeAws_json1_0CliCommandsList = (
      input: (string)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return entry;
      });
    }

    const serializeAws_json1_0CommandInput = (
      input: CommandInput,
      context: __SerdeContext
    ): any => {
      return CommandInput.visit(input, {
        commandsList: value => ({ "commandsList": serializeAws_json1_0CliCommandsList(value, context) }),
        _: (name, value) => ({ name: value } as any)
      });
    }

    const serializeAws_json1_0ConsoleState = (
      input: ConsoleState,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.consoleUrl != null && { "consoleUrl": input.consoleUrl }),
        ...(input.region != null && { "region": input.region }),
        ...(input.serviceConsolePage != null && { "serviceConsolePage": input.serviceConsolePage }),
        ...(input.serviceId != null && { "serviceId": input.serviceId }),
        ...(input.serviceSubconsolePage != null && { "serviceSubconsolePage": input.serviceSubconsolePage }),
        ...(input.taskName != null && { "taskName": input.taskName }),
      };
    }

    const serializeAws_json1_0ConversationState = (
      input: ConversationState,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.chatTriggerType != null && { "chatTriggerType": input.chatTriggerType }),
        ...(input.conversationId != null && { "conversationId": input.conversationId }),
        ...(input.currentMessage != null && { "currentMessage": serializeAws_json1_0ChatMessage(input.currentMessage, context) }),
        ...(input.customizationArn != null && { "customizationArn": input.customizationArn }),
        ...(input.history != null && { "history": serializeAws_json1_0ChatHistory(input.history, context) }),
      };
    }

    const serializeAws_json1_0CursorState = (
      input: CursorState,
      context: __SerdeContext
    ): any => {
      return CursorState.visit(input, {
        position: value => ({ "position": serializeAws_json1_0Position(value, context) }),
        range: value => ({ "range": serializeAws_json1_0Range(value, context) }),
        _: (name, value) => ({ name: value } as any)
      });
    }

    const serializeAws_json1_0Diagnostic = (
      input: Diagnostic,
      context: __SerdeContext
    ): any => {
      return Diagnostic.visit(input, {
        runtimeDiagnostic: value => ({ "runtimeDiagnostic": serializeAws_json1_0RuntimeDiagnostic(value, context) }),
        textDocumentDiagnostic: value => ({ "textDocumentDiagnostic": serializeAws_json1_0TextDocumentDiagnostic(value, context) }),
        _: (name, value) => ({ name: value } as any)
      });
    }

    const serializeAws_json1_0DocumentSymbol = (
      input: DocumentSymbol,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.name != null && { "name": input.name }),
        ...(input.source != null && { "source": input.source }),
        ...(input.type != null && { "type": input.type }),
      };
    }

    const serializeAws_json1_0DocumentSymbols = (
      input: (DocumentSymbol)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return serializeAws_json1_0DocumentSymbol(entry, context);
      });
    }

    const serializeAws_json1_0EditorState = (
      input: EditorState,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.cursorState != null && { "cursorState": serializeAws_json1_0CursorState(input.cursorState, context) }),
        ...(input.document != null && { "document": serializeAws_json1_0TextDocument(input.document, context) }),
        ...(input.relevantDocuments != null && { "relevantDocuments": serializeAws_json1_0RelevantDocumentList(input.relevantDocuments, context) }),
        ...(input.useRelevantDocuments != null && { "useRelevantDocuments": input.useRelevantDocuments }),
      };
    }

    const serializeAws_json1_0EnvironmentVariable = (
      input: EnvironmentVariable,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.key != null && { "key": input.key }),
        ...(input.value != null && { "value": input.value }),
      };
    }

    const serializeAws_json1_0EnvironmentVariables = (
      input: (EnvironmentVariable)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return serializeAws_json1_0EnvironmentVariable(entry, context);
      });
    }

    const serializeAws_json1_0EnvState = (
      input: EnvState,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.currentWorkingDirectory != null && { "currentWorkingDirectory": input.currentWorkingDirectory }),
        ...(input.environmentVariables != null && { "environmentVariables": serializeAws_json1_0EnvironmentVariables(input.environmentVariables, context) }),
        ...(input.operatingSystem != null && { "operatingSystem": input.operatingSystem }),
        ...(input.timezoneOffset != null && { "timezoneOffset": input.timezoneOffset }),
      };
    }

    const serializeAws_json1_0FollowupPrompt = (
      input: FollowupPrompt,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.content != null && { "content": input.content }),
        ...(input.userIntent != null && { "userIntent": input.userIntent }),
      };
    }

    const serializeAws_json1_0GitState = (
      input: GitState,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.status != null && { "status": input.status }),
      };
    }

    const serializeAws_json1_0Position = (
      input: Position,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.character != null && { "character": input.character }),
        ...(input.line != null && { "line": input.line }),
      };
    }

    const serializeAws_json1_0ProgrammingLanguage = (
      input: ProgrammingLanguage,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.languageName != null && { "languageName": input.languageName }),
      };
    }

    const serializeAws_json1_0Range = (
      input: Range,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.end != null && { "end": serializeAws_json1_0Position(input.end, context) }),
        ...(input.start != null && { "start": serializeAws_json1_0Position(input.start, context) }),
      };
    }

    const serializeAws_json1_0Reference = (
      input: Reference,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.licenseName != null && { "licenseName": input.licenseName }),
        ...(input.recommendationContentSpan != null && { "recommendationContentSpan": serializeAws_json1_0Span(input.recommendationContentSpan, context) }),
        ...(input.repository != null && { "repository": input.repository }),
        ...(input.url != null && { "url": input.url }),
      };
    }

    const serializeAws_json1_0References = (
      input: (Reference)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return serializeAws_json1_0Reference(entry, context);
      });
    }

    const serializeAws_json1_0RelevantDocumentList = (
      input: (RelevantTextDocument)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return serializeAws_json1_0RelevantTextDocument(entry, context);
      });
    }

    const serializeAws_json1_0RelevantTextDocument = (
      input: RelevantTextDocument,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.documentSymbols != null && { "documentSymbols": serializeAws_json1_0DocumentSymbols(input.documentSymbols, context) }),
        ...(input.programmingLanguage != null && { "programmingLanguage": serializeAws_json1_0ProgrammingLanguage(input.programmingLanguage, context) }),
        ...(input.relativeFilePath != null && { "relativeFilePath": input.relativeFilePath }),
        ...(input.text != null && { "text": input.text }),
      };
    }

    const serializeAws_json1_0RuntimeDiagnostic = (
      input: RuntimeDiagnostic,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.message != null && { "message": input.message }),
        ...(input.severity != null && { "severity": input.severity }),
        ...(input.source != null && { "source": input.source }),
      };
    }

    const serializeAws_json1_0ShellHistory = (
      input: (ShellHistoryEntry)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return serializeAws_json1_0ShellHistoryEntry(entry, context);
      });
    }

    const serializeAws_json1_0ShellHistoryEntry = (
      input: ShellHistoryEntry,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.command != null && { "command": input.command }),
        ...(input.directory != null && { "directory": input.directory }),
        ...(input.exitCode != null && { "exitCode": input.exitCode }),
        ...(input.stderr != null && { "stderr": input.stderr }),
        ...(input.stdout != null && { "stdout": input.stdout }),
      };
    }

    const serializeAws_json1_0ShellState = (
      input: ShellState,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.shellHistory != null && { "shellHistory": serializeAws_json1_0ShellHistory(input.shellHistory, context) }),
        ...(input.shellName != null && { "shellName": input.shellName }),
      };
    }

    const serializeAws_json1_0Span = (
      input: Span,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.end != null && { "end": input.end }),
        ...(input.start != null && { "start": input.start }),
      };
    }

    const serializeAws_json1_0SupplementaryWebLink = (
      input: SupplementaryWebLink,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.snippet != null && { "snippet": input.snippet }),
        ...(input.title != null && { "title": input.title }),
        ...(input.url != null && { "url": input.url }),
      };
    }

    const serializeAws_json1_0SupplementaryWebLinks = (
      input: (SupplementaryWebLink)[],
      context: __SerdeContext
    ): any => {
      return input.filter((e: any) => e != null).map(entry => {
        return serializeAws_json1_0SupplementaryWebLink(entry, context);
      });
    }

    const serializeAws_json1_0TextDocument = (
      input: TextDocument,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.documentSymbols != null && { "documentSymbols": serializeAws_json1_0DocumentSymbols(input.documentSymbols, context) }),
        ...(input.programmingLanguage != null && { "programmingLanguage": serializeAws_json1_0ProgrammingLanguage(input.programmingLanguage, context) }),
        ...(input.relativeFilePath != null && { "relativeFilePath": input.relativeFilePath }),
        ...(input.text != null && { "text": input.text }),
      };
    }

    const serializeAws_json1_0TextDocumentDiagnostic = (
      input: TextDocumentDiagnostic,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.document != null && { "document": serializeAws_json1_0TextDocument(input.document, context) }),
        ...(input.message != null && { "message": input.message }),
        ...(input.range != null && { "range": serializeAws_json1_0Range(input.range, context) }),
        ...(input.severity != null && { "severity": input.severity }),
        ...(input.source != null && { "source": input.source }),
      };
    }

    const serializeAws_json1_0UserInputMessage = (
      input: UserInputMessage,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.content != null && { "content": input.content }),
        ...(input.userInputMessageContext != null && { "userInputMessageContext": serializeAws_json1_0UserInputMessageContext(input.userInputMessageContext, context) }),
        ...(input.userIntent != null && { "userIntent": input.userIntent }),
      };
    }

    const serializeAws_json1_0UserInputMessageContext = (
      input: UserInputMessageContext,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.appStudioContext != null && { "appStudioContext": serializeAws_json1_0AppStudioState(input.appStudioContext, context) }),
        ...(input.consoleState != null && { "consoleState": serializeAws_json1_0ConsoleState(input.consoleState, context) }),
        ...(input.diagnostic != null && { "diagnostic": serializeAws_json1_0Diagnostic(input.diagnostic, context) }),
        ...(input.editorState != null && { "editorState": serializeAws_json1_0EditorState(input.editorState, context) }),
        ...(input.envState != null && { "envState": serializeAws_json1_0EnvState(input.envState, context) }),
        ...(input.gitState != null && { "gitState": serializeAws_json1_0GitState(input.gitState, context) }),
        ...(input.shellState != null && { "shellState": serializeAws_json1_0ShellState(input.shellState, context) }),
        ...(input.userSettings != null && { "userSettings": serializeAws_json1_0UserSettings(input.userSettings, context) }),
      };
    }

    const serializeAws_json1_0UserSettings = (
      input: UserSettings,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.hasConsentedToCrossRegionCalls != null && { "hasConsentedToCrossRegionCalls": input.hasConsentedToCrossRegionCalls }),
      };
    }

    const serializeAws_json1_0GenerateCodeFromCommandsRequest = (
      input: GenerateCodeFromCommandsRequest,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.commands != null && { "commands": serializeAws_json1_0CommandInput(input.commands, context) }),
        ...(input.outputFormat != null && { "outputFormat": input.outputFormat }),
      };
    }

    const serializeAws_json1_0SendMessageRequest = (
      input: SendMessageRequest,
      context: __SerdeContext
    ): any => {
      return {
        ...(input.conversationState != null && { "conversationState": serializeAws_json1_0ConversationState(input.conversationState, context) }),
        ...(input.dryRun != null && { "dryRun": input.dryRun }),
        ...(input.profileArn != null && { "profileArn": input.profileArn }),
        ...(input.source != null && { "source": input.source }),
      };
    }

    const deserializeAws_json1_0AccessDeniedException = (
      output: any,
      context: __SerdeContext
    ): AccessDeniedException => {
      return {
        message: __expectString(output.message),
        reason: __expectString(output.reason),
      } as any;
    }

    const deserializeAws_json1_0AssistantResponseEvent = (
      output: any,
      context: __SerdeContext
    ): AssistantResponseEvent => {
      return {
        content: __expectString(output.content),
      } as any;
    }

    const deserializeAws_json1_0CodeEvent = (
      output: any,
      context: __SerdeContext
    ): CodeEvent => {
      return {
        content: __expectString(output.content),
      } as any;
    }

    const deserializeAws_json1_0CodeReferenceEvent = (
      output: any,
      context: __SerdeContext
    ): CodeReferenceEvent => {
      return {
        references: (output.references != null) ? deserializeAws_json1_0References(output.references, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0ConflictException = (
      output: any,
      context: __SerdeContext
    ): ConflictException => {
      return {
        message: __expectString(output.message),
        reason: __expectString(output.reason),
      } as any;
    }

    const deserializeAws_json1_0DryRunOperationException = (
      output: any,
      context: __SerdeContext
    ): DryRunOperationException => {
      return {
        message: __expectString(output.message),
        responseCode: __expectInt32(output.responseCode),
      } as any;
    }

    const deserializeAws_json1_0DryRunSucceedEvent = (
      output: any,
      context: __SerdeContext
    ): DryRunSucceedEvent => {
      return {
      } as any;
    }

    const deserializeAws_json1_0FollowupPrompt = (
      output: any,
      context: __SerdeContext
    ): FollowupPrompt => {
      return {
        content: __expectString(output.content),
        userIntent: __expectString(output.userIntent),
      } as any;
    }

    const deserializeAws_json1_0FollowupPromptEvent = (
      output: any,
      context: __SerdeContext
    ): FollowupPromptEvent => {
      return {
        followupPrompt: (output.followupPrompt != null) ? deserializeAws_json1_0FollowupPrompt(output.followupPrompt, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0IntentData = (
      output: any,
      context: __SerdeContext
    ): Record<string, IntentDataType> => {
      return Object.entries(output).reduce((acc: Record<string, IntentDataType>, [key, value]: [string, any]) => {
        if (value === null) {
          return acc;
        }
        acc[key] = deserializeAws_json1_0IntentDataType(__expectUnion(value), context);
        return acc;
      }, {});
    }

    const deserializeAws_json1_0IntentDataType = (
      output: any,
      context: __SerdeContext
    ): IntentDataType => {
      if (__expectString(output.string) !== undefined) {
        return { string: __expectString(output.string) as any }
      }
      return { $unknown: Object.entries(output)[0] };
    }

    const deserializeAws_json1_0IntentMap = (
      output: any,
      context: __SerdeContext
    ): Record<string, Record<string, IntentDataType>> => {
      return Object.entries(output).reduce((acc: Record<string, Record<string, IntentDataType>>, [key, value]: [IntentType | string, any]) => {
        if (value === null) {
          return acc;
        }
        acc[key] = deserializeAws_json1_0IntentData(value, context);
        return acc;
      }, {});
    }

    const deserializeAws_json1_0IntentsEvent = (
      output: any,
      context: __SerdeContext
    ): IntentsEvent => {
      return {
        intents: (output.intents != null) ? deserializeAws_json1_0IntentMap(output.intents, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0InternalServerException = (
      output: any,
      context: __SerdeContext
    ): InternalServerException => {
      return {
        message: __expectString(output.message),
      } as any;
    }

    const deserializeAws_json1_0InvalidStateEvent = (
      output: any,
      context: __SerdeContext
    ): InvalidStateEvent => {
      return {
        message: __expectString(output.message),
        reason: __expectString(output.reason),
      } as any;
    }

    const deserializeAws_json1_0MessageMetadataEvent = (
      output: any,
      context: __SerdeContext
    ): MessageMetadataEvent => {
      return {
        conversationId: __expectString(output.conversationId),
        utteranceId: __expectString(output.utteranceId),
      } as any;
    }

    const deserializeAws_json1_0Reference = (
      output: any,
      context: __SerdeContext
    ): Reference => {
      return {
        licenseName: __expectString(output.licenseName),
        recommendationContentSpan: (output.recommendationContentSpan != null) ? deserializeAws_json1_0Span(output.recommendationContentSpan, context): undefined,
        repository: __expectString(output.repository),
        url: __expectString(output.url),
      } as any;
    }

    const deserializeAws_json1_0References = (
      output: any,
      context: __SerdeContext
    ): (Reference)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0Reference(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0ResourceNotFoundException = (
      output: any,
      context: __SerdeContext
    ): ResourceNotFoundException => {
      return {
        message: __expectString(output.message),
      } as any;
    }

    const deserializeAws_json1_0ServiceQuotaExceededException = (
      output: any,
      context: __SerdeContext
    ): ServiceQuotaExceededException => {
      return {
        message: __expectString(output.message),
      } as any;
    }

    const deserializeAws_json1_0Span = (
      output: any,
      context: __SerdeContext
    ): Span => {
      return {
        end: __expectInt32(output.end),
        start: __expectInt32(output.start),
      } as any;
    }

    const deserializeAws_json1_0SupplementaryWebLink = (
      output: any,
      context: __SerdeContext
    ): SupplementaryWebLink => {
      return {
        snippet: __expectString(output.snippet),
        title: __expectString(output.title),
        url: __expectString(output.url),
      } as any;
    }

    const deserializeAws_json1_0SupplementaryWebLinks = (
      output: any,
      context: __SerdeContext
    ): (SupplementaryWebLink)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0SupplementaryWebLink(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0SupplementaryWebLinksEvent = (
      output: any,
      context: __SerdeContext
    ): SupplementaryWebLinksEvent => {
      return {
        supplementaryWebLinks: (output.supplementaryWebLinks != null) ? deserializeAws_json1_0SupplementaryWebLinks(output.supplementaryWebLinks, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0ThrottlingException = (
      output: any,
      context: __SerdeContext
    ): ThrottlingException => {
      return {
        message: __expectString(output.message),
        reason: __expectString(output.reason),
      } as any;
    }

    const deserializeAws_json1_0ValidationException = (
      output: any,
      context: __SerdeContext
    ): ValidationException => {
      return {
        message: __expectString(output.message),
        reason: __expectString(output.reason),
      } as any;
    }

    const deserializeAws_json1_0InteractionComponentsEvent = (
      output: any,
      context: __SerdeContext
    ): InteractionComponentsEvent => {
      return {
        interactionComponentEntries: (output.interactionComponentEntries != null) ? deserializeAws_json1_0InteractionComponentEntryList(output.interactionComponentEntries, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0Action = (
      output: any,
      context: __SerdeContext
    ): Action => {
      return {
        moduleLink: (output.moduleLink != null) ? deserializeAws_json1_0ModuleLink(output.moduleLink, context): undefined,
        webLink: (output.webLink != null) ? deserializeAws_json1_0WebLink(output.webLink, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0Alert = (
      output: any,
      context: __SerdeContext
    ): Alert => {
      return {
        content: (output.content != null) ? deserializeAws_json1_0AlertComponentList(output.content, context): undefined,
        type: __expectString(output.type),
      } as any;
    }

    const deserializeAws_json1_0AlertComponent = (
      output: any,
      context: __SerdeContext
    ): AlertComponent => {
      return {
        text: (output.text != null) ? deserializeAws_json1_0Text(output.text, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0AlertComponentList = (
      output: any,
      context: __SerdeContext
    ): (AlertComponent)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0AlertComponent(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0CloudWatchTroubleshootingLink = (
      output: any,
      context: __SerdeContext
    ): CloudWatchTroubleshootingLink => {
      return {
        defaultText: __expectString(output.defaultText),
        investigationPayload: __expectString(output.investigationPayload),
        label: __expectString(output.label),
      } as any;
    }

    const deserializeAws_json1_0InfrastructureUpdate = (
      output: any,
      context: __SerdeContext
    ): InfrastructureUpdate => {
      return {
        transition: (output.transition != null) ? deserializeAws_json1_0InfrastructureUpdateTransition(output.transition, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0InfrastructureUpdateTransition = (
      output: any,
      context: __SerdeContext
    ): InfrastructureUpdateTransition => {
      return {
        currentState: __expectString(output.currentState),
        nextState: __expectString(output.nextState),
      } as any;
    }

    const deserializeAws_json1_0InteractionComponent = (
      output: any,
      context: __SerdeContext
    ): InteractionComponent => {
      return {
        action: (output.action != null) ? deserializeAws_json1_0Action(output.action, context): undefined,
        alert: (output.alert != null) ? deserializeAws_json1_0Alert(output.alert, context): undefined,
        infrastructureUpdate: (output.infrastructureUpdate != null) ? deserializeAws_json1_0InfrastructureUpdate(output.infrastructureUpdate, context): undefined,
        progress: (output.progress != null) ? deserializeAws_json1_0Progress(output.progress, context): undefined,
        resource: (output.resource != null) ? deserializeAws_json1_0Resource(output.resource, context): undefined,
        resourceList: (output.resourceList != null) ? deserializeAws_json1_0ResourceList(output.resourceList, context): undefined,
        section: (output.section != null) ? deserializeAws_json1_0Section(output.section, context): undefined,
        step: (output.step != null) ? deserializeAws_json1_0Step(output.step, context): undefined,
        suggestions: (output.suggestions != null) ? deserializeAws_json1_0Suggestions(output.suggestions, context): undefined,
        taskDetails: (output.taskDetails != null) ? deserializeAws_json1_0TaskDetails(output.taskDetails, context): undefined,
        taskReference: (output.taskReference != null) ? deserializeAws_json1_0TaskReference(output.taskReference, context): undefined,
        text: (output.text != null) ? deserializeAws_json1_0Text(output.text, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0InteractionComponentEntry = (
      output: any,
      context: __SerdeContext
    ): InteractionComponentEntry => {
      return {
        interactionComponent: (output.interactionComponent != null) ? deserializeAws_json1_0InteractionComponent(output.interactionComponent, context): undefined,
        interactionComponentId: __expectString(output.interactionComponentId),
      } as any;
    }

    const deserializeAws_json1_0InteractionComponentEntryList = (
      output: any,
      context: __SerdeContext
    ): (InteractionComponentEntry)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0InteractionComponentEntry(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0ModuleLink = (
      output: any,
      context: __SerdeContext
    ): ModuleLink => {
      return {
        cloudWatchTroubleshootingLink: (output.cloudWatchTroubleshootingLink != null) ? deserializeAws_json1_0CloudWatchTroubleshootingLink(output.cloudWatchTroubleshootingLink, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0Progress = (
      output: any,
      context: __SerdeContext
    ): Progress => {
      return {
        content: (output.content != null) ? deserializeAws_json1_0ProgressComponentList(output.content, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0ProgressComponent = (
      output: any,
      context: __SerdeContext
    ): ProgressComponent => {
      return {
        step: (output.step != null) ? deserializeAws_json1_0Step(output.step, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0ProgressComponentList = (
      output: any,
      context: __SerdeContext
    ): (ProgressComponent)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0ProgressComponent(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0Resource = (
      output: any,
      context: __SerdeContext
    ): Resource => {
      return {
        ARN: __expectString(output.ARN),
        description: __expectString(output.description),
        link: __expectString(output.link),
        resourceJsonString: __expectString(output.resourceJsonString),
        title: __expectString(output.title),
        type: __expectString(output.type),
      } as any;
    }

    const deserializeAws_json1_0ResourceList = (
      output: any,
      context: __SerdeContext
    ): ResourceList => {
      return {
        action: (output.action != null) ? deserializeAws_json1_0Action(output.action, context): undefined,
        items: (output.items != null) ? deserializeAws_json1_0Resources(output.items, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0Resources = (
      output: any,
      context: __SerdeContext
    ): (Resource)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0Resource(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0Section = (
      output: any,
      context: __SerdeContext
    ): Section => {
      return {
        action: (output.action != null) ? deserializeAws_json1_0Action(output.action, context): undefined,
        content: (output.content != null) ? deserializeAws_json1_0SectionComponentList(output.content, context): undefined,
        title: __expectString(output.title),
      } as any;
    }

    const deserializeAws_json1_0SectionComponent = (
      output: any,
      context: __SerdeContext
    ): SectionComponent => {
      return {
        alert: (output.alert != null) ? deserializeAws_json1_0Alert(output.alert, context): undefined,
        resource: (output.resource != null) ? deserializeAws_json1_0Resource(output.resource, context): undefined,
        resourceList: (output.resourceList != null) ? deserializeAws_json1_0ResourceList(output.resourceList, context): undefined,
        text: (output.text != null) ? deserializeAws_json1_0Text(output.text, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0SectionComponentList = (
      output: any,
      context: __SerdeContext
    ): (SectionComponent)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0SectionComponent(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0Step = (
      output: any,
      context: __SerdeContext
    ): Step => {
      return {
        content: (output.content != null) ? deserializeAws_json1_0StepComponentList(output.content, context): undefined,
        id: __expectInt32(output.id),
        label: __expectString(output.label),
        state: __expectString(output.state),
      } as any;
    }

    const deserializeAws_json1_0StepComponent = (
      output: any,
      context: __SerdeContext
    ): StepComponent => {
      return {
        text: (output.text != null) ? deserializeAws_json1_0Text(output.text, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0StepComponentList = (
      output: any,
      context: __SerdeContext
    ): (StepComponent)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0StepComponent(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0Suggestion = (
      output: any,
      context: __SerdeContext
    ): Suggestion => {
      return {
        value: __expectString(output.value),
      } as any;
    }

    const deserializeAws_json1_0SuggestionList = (
      output: any,
      context: __SerdeContext
    ): (Suggestion)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0Suggestion(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0Suggestions = (
      output: any,
      context: __SerdeContext
    ): Suggestions => {
      return {
        items: (output.items != null) ? deserializeAws_json1_0SuggestionList(output.items, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0TaskAction = (
      output: any,
      context: __SerdeContext
    ): TaskAction => {
      return {
        confirmation: (output.confirmation != null) ? deserializeAws_json1_0TaskActionConfirmation(output.confirmation, context): undefined,
        disabled: __expectBoolean(output.disabled),
        label: __expectString(output.label),
        note: (output.note != null) ? deserializeAws_json1_0TaskActionNote(output.note, context): undefined,
        payload: (output.payload != null) ? deserializeAws_json1_0TaskActionPayload(output.payload, context): undefined,
        primary: __expectBoolean(output.primary),
      } as any;
    }

    const deserializeAws_json1_0TaskActionConfirmation = (
      output: any,
      context: __SerdeContext
    ): TaskActionConfirmation => {
      return {
        content: __expectString(output.content),
      } as any;
    }

    const deserializeAws_json1_0TaskActionList = (
      output: any,
      context: __SerdeContext
    ): (TaskAction)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0TaskAction(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0TaskActionNote = (
      output: any,
      context: __SerdeContext
    ): TaskActionNote => {
      return {
        content: __expectString(output.content),
        type: __expectString(output.type),
      } as any;
    }

    const deserializeAws_json1_0TaskActionPayload = (
      output: any,
      context: __SerdeContext
    ): Record<string, string> => {
      return Object.entries(output).reduce((acc: Record<string, string>, [key, value]: [string, any]) => {
        if (value === null) {
          return acc;
        }
        acc[key] = __expectString(value) as any;
        return acc;
      }, {});
    }

    const deserializeAws_json1_0TaskComponent = (
      output: any,
      context: __SerdeContext
    ): TaskComponent => {
      return {
        alert: (output.alert != null) ? deserializeAws_json1_0Alert(output.alert, context): undefined,
        infrastructureUpdate: (output.infrastructureUpdate != null) ? deserializeAws_json1_0InfrastructureUpdate(output.infrastructureUpdate, context): undefined,
        progress: (output.progress != null) ? deserializeAws_json1_0Progress(output.progress, context): undefined,
        text: (output.text != null) ? deserializeAws_json1_0Text(output.text, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0TaskComponentList = (
      output: any,
      context: __SerdeContext
    ): (TaskComponent)[] => {
      const retVal = (output || []).filter((e: any) => e != null).map((entry: any) => {
        if (entry === null) {
          return null as any;
        }
        return deserializeAws_json1_0TaskComponent(entry, context);
      });
      return retVal;
    }

    const deserializeAws_json1_0TaskDetails = (
      output: any,
      context: __SerdeContext
    ): TaskDetails => {
      return {
        actions: (output.actions != null) ? deserializeAws_json1_0TaskActionList(output.actions, context): undefined,
        content: (output.content != null) ? deserializeAws_json1_0TaskComponentList(output.content, context): undefined,
        overview: (output.overview != null) ? deserializeAws_json1_0TaskOverview(output.overview, context): undefined,
      } as any;
    }

    const deserializeAws_json1_0TaskOverview = (
      output: any,
      context: __SerdeContext
    ): TaskOverview => {
      return {
        description: __expectString(output.description),
        label: __expectString(output.label),
      } as any;
    }

    const deserializeAws_json1_0TaskReference = (
      output: any,
      context: __SerdeContext
    ): TaskReference => {
      return {
        taskId: __expectString(output.taskId),
      } as any;
    }

    const deserializeAws_json1_0Text = (
      output: any,
      context: __SerdeContext
    ): Text => {
      return {
        content: __expectString(output.content),
      } as any;
    }

    const deserializeAws_json1_0WebLink = (
      output: any,
      context: __SerdeContext
    ): WebLink => {
      return {
        label: __expectString(output.label),
        url: __expectString(output.url),
      } as any;
    }

    const deserializeMetadata = (output: __HttpResponse): __ResponseMetadata => ({
      httpStatusCode: output.statusCode,
      requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
      extendedRequestId: output.headers["x-amz-id-2"],
      cfId: output.headers["x-amz-cf-id"],
    });

    // Collect low-level response body stream to Uint8Array.
    const collectBody = (streamBody: any = new Uint8Array(), context: __SerdeContext): Promise<Uint8Array> => {
      if (streamBody instanceof Uint8Array) {
        return Promise.resolve(streamBody);
      }
      return context.streamCollector(streamBody) || Promise.resolve(new Uint8Array());
    };

    // Encode Uint8Array data into string with utf-8.
    const collectBodyString = (streamBody: any, context: __SerdeContext): Promise<string> => collectBody(streamBody, context).then(body => context.utf8Encoder(body))

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
