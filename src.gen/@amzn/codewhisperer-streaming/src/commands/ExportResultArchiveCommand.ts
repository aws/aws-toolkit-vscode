// smithy-typescript generated code
import {
  CodeWhispererStreamingClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../CodeWhispererStreamingClient";
import {
  ExportResultArchiveRequest,
  ExportResultArchiveResponse,
  ExportResultArchiveResponseFilterSensitiveLog,
} from "../models/models_0";
import {
  de_ExportResultArchiveCommand,
  se_ExportResultArchiveCommand,
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
 * The input for {@link ExportResultArchiveCommand}.
 */
export interface ExportResultArchiveCommandInput extends ExportResultArchiveRequest {}
/**
 * @public
 *
 * The output of {@link ExportResultArchiveCommand}.
 */
export interface ExportResultArchiveCommandOutput extends ExportResultArchiveResponse, __MetadataBearer {}

/**
 * API to export operation result as an archive
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { CodeWhispererStreamingClient, ExportResultArchiveCommand } from "@amzn/codewhisperer-streaming"; // ES Modules import
 * // const { CodeWhispererStreamingClient, ExportResultArchiveCommand } = require("@amzn/codewhisperer-streaming"); // CommonJS import
 * const client = new CodeWhispererStreamingClient(config);
 * const input = { // ExportResultArchiveRequest
 *   exportId: "STRING_VALUE", // required
 *   exportIntent: "TRANSFORMATION" || "TASK_ASSIST" || "UNIT_TESTS", // required
 *   exportContext: { // ExportContext Union: only one key present
 *     transformationExportContext: { // TransformationExportContext
 *       downloadArtifactId: "STRING_VALUE", // required
 *       downloadArtifactType: "ClientInstructions" || "Logs" || "GeneratedCode", // required
 *     },
 *     unitTestGenerationExportContext: { // UnitTestGenerationExportContext
 *       testGenerationJobGroupName: "STRING_VALUE", // required
 *       testGenerationJobId: "STRING_VALUE",
 *     },
 *   },
 * };
 * const command = new ExportResultArchiveCommand(input);
 * const response = await client.send(command);
 * // { // ExportResultArchiveResponse
 * //   body: { // ResultArchiveStream Union: only one key present
 * //     binaryMetadataEvent: { // BinaryMetadataEvent
 * //       size: Number("long"),
 * //       mimeType: "STRING_VALUE",
 * //       contentChecksum: "STRING_VALUE",
 * //       contentChecksumType: "SHA_256",
 * //     },
 * //     binaryPayloadEvent: { // BinaryPayloadEvent
 * //       bytes: new Uint8Array(),
 * //     },
 * //     internalServerException: { // InternalServerException
 * //       message: "STRING_VALUE", // required
 * //     },
 * //   },
 * // };
 *
 * ```
 *
 * @param ExportResultArchiveCommandInput - {@link ExportResultArchiveCommandInput}
 * @returns {@link ExportResultArchiveCommandOutput}
 * @see {@link ExportResultArchiveCommandInput} for command's `input` shape.
 * @see {@link ExportResultArchiveCommandOutput} for command's `response` shape.
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
 * @public
 */
export class ExportResultArchiveCommand extends $Command.classBuilder<ExportResultArchiveCommandInput, ExportResultArchiveCommandOutput, CodeWhispererStreamingClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>()
      .m(function (this: any, Command: any, cs: any, config: CodeWhispererStreamingClientResolvedConfig, o: any) {
          return [

  getSerdePlugin(config, this.serialize, this.deserialize),
      ];
  })
  .s("AmazonCodeWhispererStreamingService", "ExportResultArchive", {

    /**
     * @internal
     */
    eventStream: {
      output: true,
    },
  })
  .n("CodeWhispererStreamingClient", "ExportResultArchiveCommand")
  .f(void 0, ExportResultArchiveResponseFilterSensitiveLog)
  .ser(se_ExportResultArchiveCommand)
  .de(de_ExportResultArchiveCommand)
.build() {
/** @internal type navigation helper, not in runtime. */
declare protected static __types: {
  api: {
      input: ExportResultArchiveRequest;
      output: ExportResultArchiveResponse;
  };
  sdk: {
      input: ExportResultArchiveCommandInput;
      output: ExportResultArchiveCommandOutput;
  };
};
}
