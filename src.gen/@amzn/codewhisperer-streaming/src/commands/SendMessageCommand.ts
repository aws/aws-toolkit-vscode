// smithy-typescript generated code
import {
  CodeWhispererStreamingClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../CodeWhispererStreamingClient";
import {
  SendMessageRequest,
  SendMessageRequestFilterSensitiveLog,
  SendMessageResponse,
  SendMessageResponseFilterSensitiveLog,
} from "../models/models_0";
import {
  de_SendMessageCommand,
  se_SendMessageCommand,
} from "../protocols/Aws_restJson1";
import { getSerdePlugin } from "@smithy/middleware-serde";
import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";

/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link SendMessageCommand}.
 */
export interface SendMessageCommandInput extends SendMessageRequest {}
/**
 * @public
 *
 * The output of {@link SendMessageCommand}.
 */
export interface SendMessageCommandOutput extends SendMessageResponse, __MetadataBearer {}

/**
 * @public
 *
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { CodeWhispererStreamingClient, SendMessageCommand } from "@amzn/codewhisperer-streaming"; // ES Modules import
 * // const { CodeWhispererStreamingClient, SendMessageCommand } = require("@amzn/codewhisperer-streaming"); // CommonJS import
 * const client = new CodeWhispererStreamingClient(config);
 * const input = { // SendMessageRequest
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
 *               relevantDocuments: [ // RelevantDocumentList
 *                 { // RelevantTextDocument
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
 *               ],
 *               useRelevantDocuments: true || false,
 *             },
 *             shellState: { // ShellState
 *               shellName: "STRING_VALUE", // required
 *               shellHistory: [ // ShellHistory
 *                 { // ShellHistoryEntry
 *                   command: "STRING_VALUE", // required
 *                   directory: "STRING_VALUE",
 *                   exitCode: Number("int"),
 *                   stdout: "STRING_VALUE",
 *                   stderr: "STRING_VALUE",
 *                 },
 *               ],
 *             },
 *             gitState: { // GitState
 *               status: "STRING_VALUE",
 *             },
 *             envState: { // EnvState
 *               operatingSystem: "STRING_VALUE",
 *               currentWorkingDirectory: "STRING_VALUE",
 *               environmentVariables: [ // EnvironmentVariables
 *                 { // EnvironmentVariable
 *                   key: "STRING_VALUE",
 *                   value: "STRING_VALUE",
 *                 },
 *               ],
 *               timezoneOffset: Number("int"),
 *             },
 *             appStudioContext: { // AppStudioState
 *               namespace: "STRING_VALUE", // required
 *               propertyName: "STRING_VALUE", // required
 *               propertyValue: "STRING_VALUE",
 *               propertyContext: "STRING_VALUE", // required
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
 *             consoleState: { // ConsoleState
 *               region: "STRING_VALUE",
 *               consoleUrl: "STRING_VALUE",
 *               serviceId: "STRING_VALUE",
 *               serviceConsolePage: "STRING_VALUE",
 *               serviceSubconsolePage: "STRING_VALUE",
 *               taskName: "STRING_VALUE",
 *             },
 *             userSettings: { // UserSettings
 *               hasConsentedToCrossRegionCalls: true || false,
 *             },
 *             additionalContext: [ // AdditionalContentList
 *               { // AdditionalContentEntry
 *                 name: "STRING_VALUE", // required
 *                 description: "STRING_VALUE", // required
 *                 innerContext: "STRING_VALUE",
 *               },
 *             ],
 *             toolResults: [ // ToolResults
 *               { // ToolResult
 *                 toolUseId: "STRING_VALUE", // required
 *                 content: [ // ToolResultContent // required
 *                   { // ToolResultContentBlock Union: only one key present
 *                     text: "STRING_VALUE",
 *                     json: "DOCUMENT_VALUE",
 *                   },
 *                 ],
 *                 status: "success" || "error",
 *               },
 *             ],
 *             tools: [ // Tools
 *               { // Tool Union: only one key present
 *                 toolSpecification: { // ToolSpecification
 *                   inputSchema: { // ToolInputSchema
 *                     json: "DOCUMENT_VALUE",
 *                   },
 *                   name: "STRING_VALUE", // required
 *                   description: "STRING_VALUE",
 *                 },
 *               },
 *             ],
 *           },
 *           userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION" || "GENERATE_CLOUDFORMATION_TEMPLATE" || "GENERATE_UNIT_TESTS" || "CODE_GENERATION",
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
 *             userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION" || "GENERATE_CLOUDFORMATION_TEMPLATE" || "GENERATE_UNIT_TESTS" || "CODE_GENERATION",
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
 *             relevantDocuments: [
 *               {
 *                 relativeFilePath: "STRING_VALUE", // required
 *                 programmingLanguage: {
 *                   languageName: "STRING_VALUE", // required
 *                 },
 *                 text: "STRING_VALUE",
 *                 documentSymbols: [
 *                   {
 *                     name: "STRING_VALUE", // required
 *                     type: "DECLARATION" || "USAGE", // required
 *                     source: "STRING_VALUE",
 *                   },
 *                 ],
 *               },
 *             ],
 *             useRelevantDocuments: true || false,
 *           },
 *           shellState: {
 *             shellName: "STRING_VALUE", // required
 *             shellHistory: [
 *               {
 *                 command: "STRING_VALUE", // required
 *                 directory: "STRING_VALUE",
 *                 exitCode: Number("int"),
 *                 stdout: "STRING_VALUE",
 *                 stderr: "STRING_VALUE",
 *               },
 *             ],
 *           },
 *           gitState: {
 *             status: "STRING_VALUE",
 *           },
 *           envState: {
 *             operatingSystem: "STRING_VALUE",
 *             currentWorkingDirectory: "STRING_VALUE",
 *             environmentVariables: [
 *               {
 *                 key: "STRING_VALUE",
 *                 value: "STRING_VALUE",
 *               },
 *             ],
 *             timezoneOffset: Number("int"),
 *           },
 *           appStudioContext: {
 *             namespace: "STRING_VALUE", // required
 *             propertyName: "STRING_VALUE", // required
 *             propertyValue: "STRING_VALUE",
 *             propertyContext: "STRING_VALUE", // required
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
 *           consoleState: {
 *             region: "STRING_VALUE",
 *             consoleUrl: "STRING_VALUE",
 *             serviceId: "STRING_VALUE",
 *             serviceConsolePage: "STRING_VALUE",
 *             serviceSubconsolePage: "STRING_VALUE",
 *             taskName: "STRING_VALUE",
 *           },
 *           userSettings: {
 *             hasConsentedToCrossRegionCalls: true || false,
 *           },
 *           additionalContext: [
 *             {
 *               name: "STRING_VALUE", // required
 *               description: "STRING_VALUE", // required
 *               innerContext: "STRING_VALUE",
 *             },
 *           ],
 *           toolResults: [
 *             {
 *               toolUseId: "STRING_VALUE", // required
 *               content: [ // required
 *                 {//  Union: only one key present
 *                   text: "STRING_VALUE",
 *                   json: "DOCUMENT_VALUE",
 *                 },
 *               ],
 *               status: "success" || "error",
 *             },
 *           ],
 *           tools: [
 *             {//  Union: only one key present
 *               toolSpecification: {
 *                 inputSchema: {
 *                   json: "DOCUMENT_VALUE",
 *                 },
 *                 name: "STRING_VALUE", // required
 *                 description: "STRING_VALUE",
 *               },
 *             },
 *           ],
 *         },
 *         userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION" || "GENERATE_CLOUDFORMATION_TEMPLATE" || "GENERATE_UNIT_TESTS" || "CODE_GENERATION",
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
 *           userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION" || "GENERATE_CLOUDFORMATION_TEMPLATE" || "GENERATE_UNIT_TESTS" || "CODE_GENERATION",
 *         },
 *       },
 *     },
 *     chatTriggerType: "MANUAL" || "DIAGNOSTIC" || "INLINE_CHAT", // required
 *     customizationArn: "STRING_VALUE",
 *   },
 *   profileArn: "STRING_VALUE",
 *   source: "STRING_VALUE",
 *   dryRun: true || false,
 * };
 * const command = new SendMessageCommand(input);
 * const response = await client.send(command);
 * // { // SendMessageResponse
 * //   sendMessageResponse: { // ChatResponseStream Union: only one key present
 * //     messageMetadataEvent: { // MessageMetadataEvent
 * //       conversationId: "STRING_VALUE",
 * //       utteranceId: "STRING_VALUE",
 * //     },
 * //     assistantResponseEvent: { // AssistantResponseEvent
 * //       content: "STRING_VALUE", // required
 * //     },
 * //     dryRunSucceedEvent: {},
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
 * //         userIntent: "SUGGEST_ALTERNATE_IMPLEMENTATION" || "APPLY_COMMON_BEST_PRACTICES" || "IMPROVE_CODE" || "SHOW_EXAMPLES" || "CITE_SOURCES" || "EXPLAIN_LINE_BY_LINE" || "EXPLAIN_CODE_SELECTION" || "GENERATE_CLOUDFORMATION_TEMPLATE" || "GENERATE_UNIT_TESTS" || "CODE_GENERATION",
 * //       },
 * //     },
 * //     codeEvent: { // CodeEvent
 * //       content: "STRING_VALUE", // required
 * //     },
 * //     intentsEvent: { // IntentsEvent
 * //       intents: { // IntentMap
 * //         "<keys>": { // IntentData
 * //           "<keys>": { // IntentDataType Union: only one key present
 * //             string: "STRING_VALUE",
 * //           },
 * //         },
 * //       },
 * //     },
 * //     interactionComponentsEvent: { // InteractionComponentsEvent
 * //       interactionComponentEntries: [ // InteractionComponentEntryList // required
 * //         { // InteractionComponentEntry
 * //           interactionComponentId: "STRING_VALUE",
 * //           interactionComponent: { // InteractionComponent
 * //             text: { // Text
 * //               content: "STRING_VALUE", // required
 * //             },
 * //             alert: { // Alert
 * //               type: "INFO" || "ERROR" || "WARNING", // required
 * //               content: [ // AlertComponentList // required
 * //                 { // AlertComponent
 * //                   text: {
 * //                     content: "STRING_VALUE", // required
 * //                   },
 * //                 },
 * //               ],
 * //             },
 * //             infrastructureUpdate: { // InfrastructureUpdate
 * //               transition: { // InfrastructureUpdateTransition
 * //                 currentState: "STRING_VALUE", // required
 * //                 nextState: "STRING_VALUE", // required
 * //               },
 * //             },
 * //             progress: { // Progress
 * //               content: [ // ProgressComponentList // required
 * //                 { // ProgressComponent
 * //                   step: { // Step
 * //                     id: Number("int"), // required
 * //                     state: "FAILED" || "SUCCEEDED" || "STOPPED" || "PENDING" || "IN_PROGRESS" || "LOADING" || "PAUSED", // required
 * //                     label: "STRING_VALUE", // required
 * //                     content: [ // StepComponentList
 * //                       { // StepComponent
 * //                         text: "<Text>",
 * //                       },
 * //                     ],
 * //                   },
 * //                 },
 * //               ],
 * //             },
 * //             step: {
 * //               id: Number("int"), // required
 * //               state: "FAILED" || "SUCCEEDED" || "STOPPED" || "PENDING" || "IN_PROGRESS" || "LOADING" || "PAUSED", // required
 * //               label: "STRING_VALUE", // required
 * //               content: [
 * //                 {
 * //                   text: "<Text>",
 * //                 },
 * //               ],
 * //             },
 * //             taskDetails: { // TaskDetails
 * //               overview: { // TaskOverview
 * //                 label: "STRING_VALUE", // required
 * //                 description: "STRING_VALUE", // required
 * //               },
 * //               content: [ // TaskComponentList // required
 * //                 { // TaskComponent
 * //                   text: "<Text>",
 * //                   infrastructureUpdate: {
 * //                     transition: {
 * //                       currentState: "STRING_VALUE", // required
 * //                       nextState: "STRING_VALUE", // required
 * //                     },
 * //                   },
 * //                   alert: {
 * //                     type: "INFO" || "ERROR" || "WARNING", // required
 * //                     content: [ // required
 * //                       {
 * //                         text: "<Text>",
 * //                       },
 * //                     ],
 * //                   },
 * //                   progress: {
 * //                     content: [ // required
 * //                       {
 * //                         step: "<Step>",
 * //                       },
 * //                     ],
 * //                   },
 * //                 },
 * //               ],
 * //               actions: [ // TaskActionList
 * //                 { // TaskAction
 * //                   label: "STRING_VALUE", // required
 * //                   note: { // TaskActionNote
 * //                     content: "STRING_VALUE", // required
 * //                     type: "INFO" || "WARNING",
 * //                   },
 * //                   primary: true || false,
 * //                   disabled: true || false,
 * //                   payload: { // TaskActionPayload // required
 * //                     "<keys>": "STRING_VALUE",
 * //                   },
 * //                   confirmation: { // TaskActionConfirmation
 * //                     content: "STRING_VALUE",
 * //                   },
 * //                 },
 * //               ],
 * //             },
 * //             taskReference: { // TaskReference
 * //               taskId: "STRING_VALUE", // required
 * //             },
 * //             suggestions: { // Suggestions
 * //               items: [ // SuggestionList // required
 * //                 { // Suggestion
 * //                   value: "STRING_VALUE", // required
 * //                 },
 * //               ],
 * //             },
 * //             section: { // Section
 * //               title: "STRING_VALUE", // required
 * //               content: [ // SectionComponentList // required
 * //                 { // SectionComponent
 * //                   text: "<Text>",
 * //                   alert: {
 * //                     type: "INFO" || "ERROR" || "WARNING", // required
 * //                     content: [ // required
 * //                       {
 * //                         text: "<Text>",
 * //                       },
 * //                     ],
 * //                   },
 * //                   resource: { // Resource
 * //                     title: "STRING_VALUE", // required
 * //                     link: "STRING_VALUE", // required
 * //                     description: "STRING_VALUE", // required
 * //                     type: "STRING_VALUE", // required
 * //                     ARN: "STRING_VALUE", // required
 * //                     resourceJsonString: "STRING_VALUE", // required
 * //                   },
 * //                   resourceList: { // ResourceList
 * //                     action: { // Action
 * //                       webLink: { // WebLink
 * //                         label: "STRING_VALUE", // required
 * //                         url: "STRING_VALUE", // required
 * //                       },
 * //                       moduleLink: { // ModuleLink
 * //                         cloudWatchTroubleshootingLink: { // CloudWatchTroubleshootingLink
 * //                           label: "STRING_VALUE", // required
 * //                           investigationPayload: "STRING_VALUE", // required
 * //                           defaultText: "STRING_VALUE",
 * //                         },
 * //                       },
 * //                     },
 * //                     items: [ // Resources // required
 * //                       {
 * //                         title: "STRING_VALUE", // required
 * //                         link: "STRING_VALUE", // required
 * //                         description: "STRING_VALUE", // required
 * //                         type: "STRING_VALUE", // required
 * //                         ARN: "STRING_VALUE", // required
 * //                         resourceJsonString: "STRING_VALUE", // required
 * //                       },
 * //                     ],
 * //                   },
 * //                 },
 * //               ],
 * //               action: {
 * //                 webLink: {
 * //                   label: "STRING_VALUE", // required
 * //                   url: "STRING_VALUE", // required
 * //                 },
 * //                 moduleLink: {
 * //                   cloudWatchTroubleshootingLink: {
 * //                     label: "STRING_VALUE", // required
 * //                     investigationPayload: "STRING_VALUE", // required
 * //                     defaultText: "STRING_VALUE",
 * //                   },
 * //                 },
 * //               },
 * //             },
 * //             resource: "<Resource>",
 * //             resourceList: {
 * //               action: {
 * //                 webLink: {
 * //                   label: "STRING_VALUE", // required
 * //                   url: "STRING_VALUE", // required
 * //                 },
 * //                 moduleLink: {
 * //                   cloudWatchTroubleshootingLink: {
 * //                     label: "STRING_VALUE", // required
 * //                     investigationPayload: "STRING_VALUE", // required
 * //                     defaultText: "STRING_VALUE",
 * //                   },
 * //                 },
 * //               },
 * //               items: [ // required
 * //                 "<Resource>",
 * //               ],
 * //             },
 * //             action: "<Action>",
 * //           },
 * //         },
 * //       ],
 * //     },
 * //     toolUseEvent: { // ToolUseEvent
 * //       toolUseId: "STRING_VALUE", // required
 * //       name: "STRING_VALUE", // required
 * //       input: "STRING_VALUE",
 * //       stop: true || false,
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
 * @param SendMessageCommandInput - {@link SendMessageCommandInput}
 * @returns {@link SendMessageCommandOutput}
 * @see {@link SendMessageCommandInput} for command's `input` shape.
 * @see {@link SendMessageCommandOutput} for command's `response` shape.
 * @see {@link CodeWhispererStreamingClientResolvedConfig | config} for CodeWhispererStreamingClient's `config` shape.
 *
 * @throws {@link InternalServerException} (server fault)
 *  This exception is thrown when an unexpected error occurred during the processing of a request.
 *
 * @throws {@link ServiceQuotaExceededException} (client fault)
 *  This exception is thrown when request was denied due to caller exceeding their usage limits
 *
 * @throws {@link DryRunOperationException} (client fault)
 *  This exception is translated to a 204 as it succeeded the IAM Auth.
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
export class SendMessageCommand extends $Command.classBuilder<SendMessageCommandInput, SendMessageCommandOutput, CodeWhispererStreamingClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>()
      .m(function (this: any, Command: any, cs: any, config: CodeWhispererStreamingClientResolvedConfig, o: any) {
          return [

  getSerdePlugin(config, this.serialize, this.deserialize),
      ];
  })
  .s("AmazonCodeWhispererStreamingService", "SendMessage", {

    /**
     * @internal
     */
    eventStream: {
      output: true,
    },
  })
  .n("CodeWhispererStreamingClient", "SendMessageCommand")
  .f(SendMessageRequestFilterSensitiveLog, SendMessageResponseFilterSensitiveLog)
  .ser(se_SendMessageCommand)
  .de(de_SendMessageCommand)
.build() {
/** @internal type navigation helper, not in runtime. */
declare protected static __types: {
  api: {
      input: SendMessageRequest;
      output: SendMessageResponse;
  };
  sdk: {
      input: SendMessageCommandInput;
      output: SendMessageCommandOutput;
  };
};
}
