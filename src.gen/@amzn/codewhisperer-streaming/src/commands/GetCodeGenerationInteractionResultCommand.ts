// smithy-typescript generated code
import {
    CodeWhispererStreamingClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes,
} from '../CodeWhispererStreamingClient'
import {
    GetCodeGenerationInteractionResultRequest,
    GetCodeGenerationInteractionResultResponse,
} from '../models/models_0'
import {
    de_GetCodeGenerationInteractionResultCommand,
    se_GetCodeGenerationInteractionResultCommand,
} from '../protocols/Aws_json1_0'
import { getSerdePlugin } from '@smithy/middleware-serde'
import { HttpRequest as __HttpRequest, HttpResponse as __HttpResponse } from '@smithy/protocol-http'
import { Command as $Command } from '@smithy/smithy-client'
import {
    FinalizeHandlerArguments,
    Handler,
    HandlerExecutionContext,
    MiddlewareStack,
    SMITHY_CONTEXT_KEY,
    HttpHandlerOptions as __HttpHandlerOptions,
    MetadataBearer as __MetadataBearer,
    SerdeContext as __SerdeContext,
} from '@smithy/types'

/**
 * @public
 */
export { __MetadataBearer, $Command }
/**
 * @public
 *
 * The input for {@link GetCodeGenerationInteractionResultCommand}.
 */
export interface GetCodeGenerationInteractionResultCommandInput extends GetCodeGenerationInteractionResultRequest {}
/**
 * @public
 *
 * The output of {@link GetCodeGenerationInteractionResultCommand}.
 */
export interface GetCodeGenerationInteractionResultCommandOutput
    extends GetCodeGenerationInteractionResultResponse,
        __MetadataBearer {}

/**
 * @public
 * API to get results of code generation.
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { CodeWhispererStreamingClient, GetCodeGenerationInteractionResultCommand } from "@amzn/codewhisperer-streaming"; // ES Modules import
 * // const { CodeWhispererStreamingClient, GetCodeGenerationInteractionResultCommand } = require("@amzn/codewhisperer-streaming"); // CommonJS import
 * const client = new CodeWhispererStreamingClient(config);
 * const input = { // GetCodeGenerationInteractionResultRequest
 *   conversationId: "STRING_VALUE", // required
 * };
 * const command = new GetCodeGenerationInteractionResultCommand(input);
 * const response = await client.send(command);
 * // { // GetCodeGenerationInteractionResultResponse
 * //   conversationId: "STRING_VALUE", // required
 * //   codeGenStatus: { // CodeGenStatus
 * //     status: "InProgress" || "Complete" || "Failed", // required
 * //     currentStage: "InitialCodeGeneration" || "Debate", // required
 * //   },
 * // };
 *
 * ```
 *
 * @param GetCodeGenerationInteractionResultCommandInput - {@link GetCodeGenerationInteractionResultCommandInput}
 * @returns {@link GetCodeGenerationInteractionResultCommandOutput}
 * @see {@link GetCodeGenerationInteractionResultCommandInput} for command's `input` shape.
 * @see {@link GetCodeGenerationInteractionResultCommandOutput} for command's `response` shape.
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
 * @throws {@link AccessDeniedException} (client fault)
 *  This exception is thrown when the user does not have sufficient access to perform this action.
 *
 * @throws {@link CodeWhispererStreamingServiceException}
 * <p>Base exception class for all service exceptions from CodeWhispererStreaming service.</p>
 *
 */
export class GetCodeGenerationInteractionResultCommand extends $Command<
    GetCodeGenerationInteractionResultCommandInput,
    GetCodeGenerationInteractionResultCommandOutput,
    CodeWhispererStreamingClientResolvedConfig
> {
    // Start section: command_properties
    // End section: command_properties

    /**
     * @public
     */
    constructor(readonly input: GetCodeGenerationInteractionResultCommandInput) {
        // Start section: command_constructor
        super()
        // End section: command_constructor
    }

    /**
     * @internal
     */
    resolveMiddleware(
        clientStack: MiddlewareStack<ServiceInputTypes, ServiceOutputTypes>,
        configuration: CodeWhispererStreamingClientResolvedConfig,
        options?: __HttpHandlerOptions
    ): Handler<GetCodeGenerationInteractionResultCommandInput, GetCodeGenerationInteractionResultCommandOutput> {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize))

        const stack = clientStack.concat(this.middlewareStack)

        const { logger } = configuration
        const clientName = 'CodeWhispererStreamingClient'
        const commandName = 'GetCodeGenerationInteractionResultCommand'
        const handlerExecutionContext: HandlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_: any) => _,
            outputFilterSensitiveLog: (_: any) => _,
            [SMITHY_CONTEXT_KEY]: {
                service: 'AmazonCodeWhispererStreamingService',
                operation: 'GetCodeGenerationInteractionResult',
            },
        }
        const { requestHandler } = configuration
        return stack.resolve(
            (request: FinalizeHandlerArguments<any>) =>
                requestHandler.handle(request.request as __HttpRequest, options || {}),
            handlerExecutionContext
        )
    }

    /**
     * @internal
     */
    private serialize(
        input: GetCodeGenerationInteractionResultCommandInput,
        context: __SerdeContext
    ): Promise<__HttpRequest> {
        return se_GetCodeGenerationInteractionResultCommand(input, context)
    }

    /**
     * @internal
     */
    private deserialize(
        output: __HttpResponse,
        context: __SerdeContext
    ): Promise<GetCodeGenerationInteractionResultCommandOutput> {
        return de_GetCodeGenerationInteractionResultCommand(output, context)
    }

    // Start section: command_body_extra
    // End section: command_body_extra
}
