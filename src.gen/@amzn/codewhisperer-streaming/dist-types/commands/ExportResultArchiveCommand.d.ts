import { CodeWhispererStreamingClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../CodeWhispererStreamingClient";
import { ExportResultArchiveRequest, ExportResultArchiveResponse } from "../models/models_0";
import { Command as $Command } from "@smithy/smithy-client";
import { Handler, MiddlewareStack, HttpHandlerOptions as __HttpHandlerOptions, MetadataBearer as __MetadataBearer } from "@smithy/types";
/**
 * @public
 */
export { __MetadataBearer, $Command };
/**
 * @public
 *
 * The input for {@link ExportResultArchiveCommand}.
 */
export interface ExportResultArchiveCommandInput extends ExportResultArchiveRequest {
}
/**
 * @public
 *
 * The output of {@link ExportResultArchiveCommand}.
 */
export interface ExportResultArchiveCommandOutput extends ExportResultArchiveResponse, __MetadataBearer {
}
/**
 * @public
 * API to export operation result as an archive
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { CodeWhispererStreamingClient, ExportResultArchiveCommand } from "@amzn/codewhisperer-streaming"; // ES Modules import
 * // const { CodeWhispererStreamingClient, ExportResultArchiveCommand } = require("@amzn/codewhisperer-streaming"); // CommonJS import
 * const client = new CodeWhispererStreamingClient(config);
 * const input = { // ExportResultArchiveRequest
 *   exportId: "STRING_VALUE", // required
 *   exportIntent: "TRANSFORMATION" || "TASK_ASSIST", // required
 *   exportContext: { // ExportContext Union: only one key present
 *     transformationExportContext: { // TransformationExportContext
 *       downloadArtifactId: "STRING_VALUE", // required
 *       downloadArtifactType: "ClientInstructions" || "Logs", // required
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
 * //       bytes: "BLOB_VALUE",
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
 */
export declare class ExportResultArchiveCommand extends $Command<ExportResultArchiveCommandInput, ExportResultArchiveCommandOutput, CodeWhispererStreamingClientResolvedConfig> {
    readonly input: ExportResultArchiveCommandInput;
    /**
     * @public
     */
    constructor(input: ExportResultArchiveCommandInput);
    /**
     * @internal
     */
    resolveMiddleware(clientStack: MiddlewareStack<ServiceInputTypes, ServiceOutputTypes>, configuration: CodeWhispererStreamingClientResolvedConfig, options?: __HttpHandlerOptions): Handler<ExportResultArchiveCommandInput, ExportResultArchiveCommandOutput>;
    /**
     * @internal
     */
    private serialize;
    /**
     * @internal
     */
    private deserialize;
}
