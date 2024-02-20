// smithy-typescript generated code
import {
  CodeWhispererStreamingClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../CodeWhispererStreamingClient";
import {
  GenerateTaskAssistPlanRequest,
  GenerateTaskAssistPlanRequestFilterSensitiveLog,
  GenerateTaskAssistPlanResponse,
  GenerateTaskAssistPlanResponseFilterSensitiveLog,
} from "../models/models_0";
import {
  de_GenerateTaskAssistPlanCommand,
  se_GenerateTaskAssistPlanCommand,
} from "../protocols/Aws_restJson1";
import { getSerdePlugin } from "@smithy/middleware-serde";
import {
  HttpRequest as __HttpRequest,
  HttpResponse as __HttpResponse,
} from "@smithy/protocol-http";
import { Command as $Command } from "@smithy/smithy-client";
import {
  FinalizeHandlerArguments,
  Handler,
  HandlerExecutionContext,
  MiddlewareStack,
  SMITHY_CONTEXT_KEY,
  EventStreamSerdeContext as __EventStreamSerdeContext,
  HttpHandlerOptions as __HttpHandlerOptions,
  MetadataBearer as __MetadataBearer,
  SerdeContext as __SerdeContext,
} from "@smithy/types";

/**
 * @public
 */
export { __MetadataBearer, $Command };
/**
 * @public
 *
 * The input for {@link GenerateTaskAssistPlanCommand}.
 */
export interface GenerateTaskAssistPlanCommandInput extends GenerateTaskAssistPlanRequest {}
/**
 * @public
 *
 * The output of {@link GenerateTaskAssistPlanCommand}.
 */
export interface GenerateTaskAssistPlanCommandOutput extends GenerateTaskAssistPlanResponse, __MetadataBearer {}

/**
 * @public
 * API to generate task assit plan.
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { CodeWhispererStreamingClient, GenerateTaskAssistPlanCommand } from "@amzn/codewhisperer-streaming"; // ES Modules import
 * // const { CodeWhispererStreamingClient, GenerateTaskAssistPlanCommand } = require("@amzn/codewhisperer-streaming"); // CommonJS import
 * const client = new CodeWhispererStreamingClient(config);
 * const input = { // GenerateTaskAssistPlanRequest
 *   conversationState: { // ConversationState
 *     conversationId: "STRING_VALUE",
 *     history: [ // ChatHistory
 *       { // ChatMessage Union: only one key present
 *         userInputMessage: { // UserInputMessage
 *           content: "STRING_VALUE", // required
 *           userInputMessageContext: { // UserInputMessageContext
 *             editorState: { // EditorState
 *               document: { // TextDocument
 *                 relativeFilePath: "STRING_VALUE", // required
 *                 programmingLanguage: { // ProgrammingLanguage
 *                   languageName: "STRING_VALUE", // required
 *                 },
 *                 text: "STRING_VALUE",
 *                 documentSymbols: [ // DocumentSymbols
 *                   { // DocumentSymbol
 *                     name: "STRING_VALUE", // required
 *                     type: "DECLARATION" || "USAGE", // required
 *                     source: "STRING_VALUE",
 *                   },
 *                 ],
 *               },
 *               cursorState: { // CursorState Union: only one key present
 *                 position: { // Position
 *                   line: Number("int"), // required
 *                   character: Number("int"), // required
 *                 },
 *                 range: { // Range
 *                   start: {
 *                     line: Number("int"), // required
 *                     character: Number("int"), // required
 *                   },
 *                   end: {
 *                     line: Number("int"), // required
 *                     character: Number("int"), // required
 *                   },
 *                 },
 *               },
 *             },
 *             diagnostic: { // Diagnostic Union: only one key present
 *               textDocumentDiagnostic: { // TextDocumentDiagnostic
 *                 document: {
 *                   relativeFilePath: "STRING_VALUE", // required
 *                   programmingLanguage: {
 *                     languageName: "STRING_VALUE", // required
 *                   },
 *                   text: "STRING_VALUE",
 *                   documentSymbols: [
 *                     {
 *                       name: "STRING_VALUE", // required
 *                       type: "DECLARATION" || "USAGE", // required
 *                       source: "STRING_VALUE",
 *                     },
 *                   ],
 *                 },
 *                 range: {
 *                   start: {
 *                     line: Number("int"), // required
 *                     character: Number("int"), // required
 *                   },
 *                   end: {
 *                     line: Number("int"), // required
 *                     character: Number("int"), // required
 *                   },
 *                 },
 *                 source: "STRING_VALUE", // required
 *                 severity: "ERROR" || "WARNING" || "INFORMATION" || "HINT", // required
 *                 message: "STRING_VALUE", // required
 *               },
 *               runtimeDiagnostic: { // RuntimeDiagnostic
 *                 source: "STRING_VALUE", // required
 *                 severity: "ERROR" || "WARNING" || "INFORMATION" || "HINT", // required
 *                 message: "STRING_VALUE", // required
 *               },
 *             },
 *           },
 *           userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION",
 *         },
 *         assistantResponseMessage: { // AssistantResponseMessage
 *           messageId: "STRING_VALUE",
 *           content: "STRING_VALUE", // required
 *           supplementaryWebLinks: [ // SupplementaryWebLinks
 *             { // SupplementaryWebLink
 *               url: "STRING_VALUE", // required
 *               title: "STRING_VALUE", // required
 *               snippet: "STRING_VALUE",
 *             },
 *           ],
 *           references: [ // References
 *             { // Reference
 *               licenseName: "STRING_VALUE",
 *               repository: "STRING_VALUE",
 *               url: "STRING_VALUE",
 *               recommendationContentSpan: { // Span
 *                 start: Number("int"),
 *                 end: Number("int"),
 *               },
 *             },
 *           ],
 *           followupPrompt: { // FollowupPrompt
 *             content: "STRING_VALUE", // required
 *             userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION",
 *           },
 *         },
 *       },
 *     ],
 *     currentMessage: {//  Union: only one key present
 *       userInputMessage: {
 *         content: "STRING_VALUE", // required
 *         userInputMessageContext: {
 *           editorState: {
 *             document: "<TextDocument>",
 *             cursorState: {//  Union: only one key present
 *               position: "<Position>",
 *               range: {
 *                 start: "<Position>", // required
 *                 end: "<Position>", // required
 *               },
 *             },
 *           },
 *           diagnostic: {//  Union: only one key present
 *             textDocumentDiagnostic: {
 *               document: "<TextDocument>", // required
 *               range: {
 *                 start: "<Position>", // required
 *                 end: "<Position>", // required
 *               },
 *               source: "STRING_VALUE", // required
 *               severity: "ERROR" || "WARNING" || "INFORMATION" || "HINT", // required
 *               message: "STRING_VALUE", // required
 *             },
 *             runtimeDiagnostic: {
 *               source: "STRING_VALUE", // required
 *               severity: "ERROR" || "WARNING" || "INFORMATION" || "HINT", // required
 *               message: "STRING_VALUE", // required
 *             },
 *           },
 *         },
 *         userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION",
 *       },
 *       assistantResponseMessage: {
 *         messageId: "STRING_VALUE",
 *         content: "STRING_VALUE", // required
 *         supplementaryWebLinks: [
 *           {
 *             url: "STRING_VALUE", // required
 *             title: "STRING_VALUE", // required
 *             snippet: "STRING_VALUE",
 *           },
 *         ],
 *         references: [
 *           {
 *             licenseName: "STRING_VALUE",
 *             repository: "STRING_VALUE",
 *             url: "STRING_VALUE",
 *             recommendationContentSpan: {
 *               start: Number("int"),
 *               end: Number("int"),
 *             },
 *           },
 *         ],
 *         followupPrompt: {
 *           content: "STRING_VALUE", // required
 *           userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION",
 *         },
 *       },
 *     },
 *     chatTriggerType: "MANUAL" || "DIAGNOSTIC", // required
 *   },
 *   workspaceState: { // WorkspaceState
 *     uploadId: "STRING_VALUE", // required
 *     programmingLanguage: "<ProgrammingLanguage>", // required
 *     contextTruncationScheme: "ANALYSIS" || "GUMBY",
 *   },
 * };
 * const command = new GenerateTaskAssistPlanCommand(input);
 * const response = await client.send(command);
 * // { // GenerateTaskAssistPlanResponse
 * //   planningResponseStream: { // ChatResponseStream Union: only one key present
 * //     messageMetadataEvent: { // MessageMetadataEvent
 * //       conversationId: "STRING_VALUE",
 * //     },
 * //     assistantResponseEvent: { // AssistantResponseEvent
 * //       content: "STRING_VALUE", // required
 * //     },
 * //     codeReferenceEvent: { // CodeReferenceEvent
 * //       references: [ // References
 * //         { // Reference
 * //           licenseName: "STRING_VALUE",
 * //           repository: "STRING_VALUE",
 * //           url: "STRING_VALUE",
 * //           recommendationContentSpan: { // Span
 * //             start: Number("int"),
 * //             end: Number("int"),
 * //           },
 * //         },
 * //       ],
 * //     },
 * //     supplementaryWebLinksEvent: { // SupplementaryWebLinksEvent
 * //       supplementaryWebLinks: [ // SupplementaryWebLinks
 * //         { // SupplementaryWebLink
 * //           url: "STRING_VALUE", // required
 * //           title: "STRING_VALUE", // required
 * //           snippet: "STRING_VALUE",
 * //         },
 * //       ],
 * //     },
 * //     followupPromptEvent: { // FollowupPromptEvent
 * //       followupPrompt: { // FollowupPrompt
 * //         content: "STRING_VALUE", // required
 * //         userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION",
 * //       },
 * //     },
 * //     invalidStateEvent: { // InvalidStateEvent
 * //       reason: "INVALID_TASK_ASSIST_PLAN", // required
 * //       message: "STRING_VALUE", // required
 * //     },
 * //     error: { // InternalServerException
 * //       message: "STRING_VALUE", // required
 * //     },
 * //   },
 * // };
 *
 * ```
 *
 * @param GenerateTaskAssistPlanCommandInput - {@link GenerateTaskAssistPlanCommandInput}
 * @returns {@link GenerateTaskAssistPlanCommandOutput}
 * @see {@link GenerateTaskAssistPlanCommandInput} for command's `input` shape.
 * @see {@link GenerateTaskAssistPlanCommandOutput} for command's `response` shape.
 * @see {@link CodeWhispererStreamingClientResolvedConfig | config} for CodeWhispererStreamingClient's `config` shape.
 *
 * @throws {@link InternalServerException} (server fault)
 *  This exception is thrown when an unexpected error occurred during the processing of a request.
 *
 * @throws {@link ThrottlingException} (client fault)
 *  This exception is thrown when request was denied due to request throttling.
 *
 * @throws {@link ValidationException} (client fault)
 *  This exception is thrown when the input fails to satisfy the constraints specified by the service.
 *
 * @throws {@link ConflictException} (client fault)
 *  This exception is thrown when the action to perform could not be completed because the resource is in a conflicting state.
 *
 * @throws {@link ResourceNotFoundException} (client fault)
 *  This exception is thrown when describing a resource that does not exist.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  This exception is thrown when the user does not have sufficient access to perform this action.
 *
 * @throws {@link CodeWhispererStreamingServiceException}
 * <p>Base exception class for all service exceptions from CodeWhispererStreaming service.</p>
 *
 */
export class GenerateTaskAssistPlanCommand extends $Command<GenerateTaskAssistPlanCommandInput, GenerateTaskAssistPlanCommandOutput, CodeWhispererStreamingClientResolvedConfig> {
  // Start section: command_properties
  // End section: command_properties

  /**
   * @public
   */
  constructor(readonly input: GenerateTaskAssistPlanCommandInput) {
    // Start section: command_constructor
    super();
    // End section: command_constructor
  }

  /**
   * @internal
   */
  resolveMiddleware(
    clientStack: MiddlewareStack<ServiceInputTypes, ServiceOutputTypes>,
    configuration: CodeWhispererStreamingClientResolvedConfig,
    options?: __HttpHandlerOptions
  ): Handler<GenerateTaskAssistPlanCommandInput, GenerateTaskAssistPlanCommandOutput> {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));

    const stack = clientStack.concat(this.middlewareStack);

    const { logger } = configuration;
    const clientName = "CodeWhispererStreamingClient";
    const commandName = "GenerateTaskAssistPlanCommand";
    const handlerExecutionContext: HandlerExecutionContext = {
      logger,
      clientName,
      commandName,
      inputFilterSensitiveLog:
        GenerateTaskAssistPlanRequestFilterSensitiveLog,
      outputFilterSensitiveLog:
        GenerateTaskAssistPlanResponseFilterSensitiveLog,
      [SMITHY_CONTEXT_KEY]: {
        service: "AmazonCodeWhispererStreamingService",
        operation: "GenerateTaskAssistPlan",
      },
    }
    const { requestHandler } = configuration;
    return stack.resolve(
      (request: FinalizeHandlerArguments<any>) =>
        requestHandler.handle(request.request as __HttpRequest, options || {}),
      handlerExecutionContext
    );
  }

  /**
   * @internal
   */
  private serialize(
    input: GenerateTaskAssistPlanCommandInput,
    context: __SerdeContext
  ): Promise<__HttpRequest> {
    return se_GenerateTaskAssistPlanCommand(input, context);
  }

  /**
   * @internal
   */
  private deserialize(
    output: __HttpResponse,
    context: __SerdeContext & __EventStreamSerdeContext
  ): Promise<GenerateTaskAssistPlanCommandOutput> {
    return de_GenerateTaskAssistPlanCommand(output, context);
  }

  // Start section: command_body_extra
  // End section: command_body_extra
}
