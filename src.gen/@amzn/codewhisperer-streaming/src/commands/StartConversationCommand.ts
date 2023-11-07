// smithy-typescript generated code
import {
    CodeWhispererStreamingClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes,
} from '../CodeWhispererStreamingClient'
import {
    StartConversationRequest,
    StartConversationRequestFilterSensitiveLog,
    StartConversationResponse,
    StartConversationResponseFilterSensitiveLog,
} from '../models/models_0'
import { de_StartConversationCommand, se_StartConversationCommand } from '../protocols/Aws_restJson1'
import { getSerdePlugin } from '@smithy/middleware-serde'
import { HttpRequest as __HttpRequest, HttpResponse as __HttpResponse } from '@smithy/protocol-http'
import { Command as $Command } from '@smithy/smithy-client'
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
} from '@smithy/types'

/**
 * @public
 */
export { __MetadataBearer, $Command }
/**
 * @public
 *
 * The input for {@link StartConversationCommand}.
 */
export interface StartConversationCommandInput extends StartConversationRequest {}
/**
 * @public
 *
 * The output of {@link StartConversationCommand}.
 */
export interface StartConversationCommandOutput extends StartConversationResponse, __MetadataBearer {}

/**
 * @public
 * generate a multimodal completion from cwspr with streaming response
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { CodeWhispererStreamingClient, StartConversationCommand } from "@amzn/codewhisperer-streaming"; // ES Modules import
 * // const { CodeWhispererStreamingClient, StartConversationCommand } = require("@amzn/codewhisperer-streaming"); // CommonJS import
 * const client = new CodeWhispererStreamingClient(config);
 * const input = { // StartConversationRequest
 *   body: { // PayloadPart
 *     string: "STRING_VALUE",
 *   },
 * };
 * const command = new StartConversationCommand(input);
 * const response = await client.send(command);
 * // { // StartConversationResponse
 * //   body: { // ResponseStream Union: only one key present
 * //     chunk: { // PayloadPart
 * //       string: "STRING_VALUE",
 * //     },
 * //     internalServerException: { // InternalServerException
 * //       message: "STRING_VALUE", // required
 * //     },
 * //   },
 * // };
 *
 * ```
 *
 * @param StartConversationCommandInput - {@link StartConversationCommandInput}
 * @returns {@link StartConversationCommandOutput}
 * @see {@link StartConversationCommandInput} for command's `input` shape.
 * @see {@link StartConversationCommandOutput} for command's `response` shape.
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
export class StartConversationCommand extends $Command<
    StartConversationCommandInput,
    StartConversationCommandOutput,
    CodeWhispererStreamingClientResolvedConfig
> {
    // Start section: command_properties
    // End section: command_properties

    /**
     * @public
     */
    constructor(readonly input: StartConversationCommandInput) {
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
    ): Handler<StartConversationCommandInput, StartConversationCommandOutput> {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize))

        const stack = clientStack.concat(this.middlewareStack)

        const { logger } = configuration
        const clientName = 'CodeWhispererStreamingClient'
        const commandName = 'StartConversationCommand'
        const handlerExecutionContext: HandlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: StartConversationRequestFilterSensitiveLog,
            outputFilterSensitiveLog: StartConversationResponseFilterSensitiveLog,
            [SMITHY_CONTEXT_KEY]: {
                service: 'AmazonCodeWhispererStreamingService',
                operation: 'StartConversation',
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
    private serialize(input: StartConversationCommandInput, context: __SerdeContext): Promise<__HttpRequest> {
        return se_StartConversationCommand(input, context)
    }

    /**
     * @internal
     */
    private deserialize(
        output: __HttpResponse,
        context: __SerdeContext & __EventStreamSerdeContext
    ): Promise<StartConversationCommandOutput> {
        return de_StartConversationCommand(output, context)
    }

    // Start section: command_body_extra
    // End section: command_body_extra
}
