import { QDeveloperStreamingClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../QDeveloperStreamingClient";
import { SendMessageRequest, SendMessageResponse } from "../models/models_0";
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
export interface SendMessageCommandInput extends SendMessageRequest {
}
/**
 * @public
 *
 * The output of {@link SendMessageCommand}.
 */
export interface SendMessageCommandOutput extends SendMessageResponse, __MetadataBearer {
}
declare const SendMessageCommand_base: {
    new (input: SendMessageCommandInput): import("@smithy/smithy-client").CommandImpl<SendMessageCommandInput, SendMessageCommandOutput, QDeveloperStreamingClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (__0_0: SendMessageCommandInput): import("@smithy/smithy-client").CommandImpl<SendMessageCommandInput, SendMessageCommandOutput, QDeveloperStreamingClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * @public
 *
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { QDeveloperStreamingClient, SendMessageCommand } from "@amzn/amazon-q-developer-streaming-client"; // ES Modules import
 * // const { QDeveloperStreamingClient, SendMessageCommand } = require("@amzn/amazon-q-developer-streaming-client"); // CommonJS import
 * const client = new QDeveloperStreamingClient(config);
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
 * //                 { // SectionComponent Union: only one key present
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
 * //                     action: { // Action Union: only one key present
 * //                       webLink: { // WebLink
 * //                         label: "STRING_VALUE", // required
 * //                         url: "STRING_VALUE", // required
 * //                       },
 * //                       moduleLink: { // ModuleLink Union: only one key present
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
 * //             },
 * //             resource: "<Resource>",
 * //             resourceList: {
 * //               action: {//  Union: only one key present
 * //                 webLink: {
 * //                   label: "STRING_VALUE", // required
 * //                   url: "STRING_VALUE", // required
 * //                 },
 * //                 moduleLink: {//  Union: only one key present
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
 * //           },
 * //         },
 * //       ],
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
 * @see {@link QDeveloperStreamingClientResolvedConfig | config} for QDeveloperStreamingClient's `config` shape.
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
 * @throws {@link QDeveloperStreamingServiceException}
 * <p>Base exception class for all service exceptions from QDeveloperStreaming service.</p>
 *
 */
export declare class SendMessageCommand extends SendMessageCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
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
