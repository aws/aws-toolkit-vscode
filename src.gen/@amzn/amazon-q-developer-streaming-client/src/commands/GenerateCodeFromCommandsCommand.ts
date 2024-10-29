// smithy-typescript generated code
import {
  QDeveloperStreamingClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../QDeveloperStreamingClient";
import {
  GenerateCodeFromCommandsRequest,
  GenerateCodeFromCommandsRequestFilterSensitiveLog,
  GenerateCodeFromCommandsResponse,
  GenerateCodeFromCommandsResponseFilterSensitiveLog,
} from "../models/models_0";
import {
  de_GenerateCodeFromCommandsCommand,
  se_GenerateCodeFromCommandsCommand,
} from "../protocols/Aws_json1_0";
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
 * The input for {@link GenerateCodeFromCommandsCommand}.
 */
export interface GenerateCodeFromCommandsCommandInput extends GenerateCodeFromCommandsRequest {}
/**
 * @public
 *
 * The output of {@link GenerateCodeFromCommandsCommand}.
 */
export interface GenerateCodeFromCommandsCommandOutput extends GenerateCodeFromCommandsResponse, __MetadataBearer {}

/**
 * API to generate infrastructure as code from cli commands.
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { QDeveloperStreamingClient, GenerateCodeFromCommandsCommand } from "@amzn/amazon-q-developer-streaming-client"; // ES Modules import
 * // const { QDeveloperStreamingClient, GenerateCodeFromCommandsCommand } = require("@amzn/amazon-q-developer-streaming-client"); // CommonJS import
 * const client = new QDeveloperStreamingClient(config);
 * const input = { // GenerateCodeFromCommandsRequest
 *   outputFormat: "typescript/cdk" || "java/cdk" || "python/cdk" || "yaml/cfn" || "json/cfn", // required
 *   commands: { // CommandInput Union: only one key present
 *     commandsList: [ // CliCommandsList
 *       "STRING_VALUE",
 *     ],
 *   },
 * };
 * const command = new GenerateCodeFromCommandsCommand(input);
 * const response = await client.send(command);
 * // { // GenerateCodeFromCommandsResponse
 * //   generatedCodeFromCommandsResponse: { // GenerateCodeFromCommandsResponseStream Union: only one key present
 * //     codeEvent: { // CodeEvent
 * //       content: "STRING_VALUE", // required
 * //     },
 * //     Error: { // InternalServerException
 * //       message: "STRING_VALUE", // required
 * //     },
 * //     QuotaLevelExceededError: { // ServiceQuotaExceededException
 * //       message: "STRING_VALUE", // required
 * //     },
 * //     ValidationError: { // ValidationException
 * //       message: "STRING_VALUE", // required
 * //       reason: "INVALID_CONVERSATION_ID" || "CONTENT_LENGTH_EXCEEDS_THRESHOLD" || "INVALID_KMS_GRANT",
 * //     },
 * //   },
 * // };
 *
 * ```
 *
 * @param GenerateCodeFromCommandsCommandInput - {@link GenerateCodeFromCommandsCommandInput}
 * @returns {@link GenerateCodeFromCommandsCommandOutput}
 * @see {@link GenerateCodeFromCommandsCommandInput} for command's `input` shape.
 * @see {@link GenerateCodeFromCommandsCommandOutput} for command's `response` shape.
 * @see {@link QDeveloperStreamingClientResolvedConfig | config} for QDeveloperStreamingClient's `config` shape.
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
 * @throws {@link AccessDeniedException} (client fault)
 *  This exception is thrown when the user does not have sufficient access to perform this action.
 *
 * @throws {@link QDeveloperStreamingServiceException}
 * <p>Base exception class for all service exceptions from QDeveloperStreaming service.</p>
 *
 * @public
 */
export class GenerateCodeFromCommandsCommand extends $Command.classBuilder<GenerateCodeFromCommandsCommandInput, GenerateCodeFromCommandsCommandOutput, QDeveloperStreamingClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>()
      .m(function (this: any, Command: any, cs: any, config: QDeveloperStreamingClientResolvedConfig, o: any) {
          return [

  getSerdePlugin(config, this.serialize, this.deserialize),
      ];
  })
  .s("AmazonQDeveloperStreamingService", "GenerateCodeFromCommands", {

    /**
     * @internal
     */
    eventStream: {
      output: true,
    },
  })
  .n("QDeveloperStreamingClient", "GenerateCodeFromCommandsCommand")
  .f(GenerateCodeFromCommandsRequestFilterSensitiveLog, GenerateCodeFromCommandsResponseFilterSensitiveLog)
  .ser(se_GenerateCodeFromCommandsCommand)
  .de(de_GenerateCodeFromCommandsCommand)
.build() {
/** @internal type navigation helper, not in runtime. */
declare protected static __types: {
  api: {
      input: GenerateCodeFromCommandsRequest;
      output: GenerateCodeFromCommandsResponse;
  };
  sdk: {
      input: GenerateCodeFromCommandsCommandInput;
      output: GenerateCodeFromCommandsCommandOutput;
  };
};
}
