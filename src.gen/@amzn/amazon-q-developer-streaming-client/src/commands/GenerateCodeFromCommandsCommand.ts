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
  deserializeAws_json1_0GenerateCodeFromCommandsCommand,
  serializeAws_json1_0GenerateCodeFromCommandsCommand,
} from "../protocols/Aws_json1_0";
import { getSerdePlugin } from "@aws-sdk/middleware-serde";
import {
  HttpRequest as __HttpRequest,
  HttpResponse as __HttpResponse,
} from "@aws-sdk/protocol-http";
import { Command as $Command } from "@aws-sdk/smithy-client";
import {
  FinalizeHandlerArguments,
  Handler,
  HandlerExecutionContext,
  MiddlewareStack,
  EventStreamSerdeContext as __EventStreamSerdeContext,
  HttpHandlerOptions as __HttpHandlerOptions,
  MetadataBearer as __MetadataBearer,
  SerdeContext as __SerdeContext,
} from "@aws-sdk/types";

export interface GenerateCodeFromCommandsCommandInput extends GenerateCodeFromCommandsRequest {}
export interface GenerateCodeFromCommandsCommandOutput extends GenerateCodeFromCommandsResponse, __MetadataBearer {}

/**
 * API to generate infrastructure as code from cli commands.
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { QDeveloperStreamingClient, GenerateCodeFromCommandsCommand } from "@amzn/amazon-q-developer-streaming-client"; // ES Modules import
 * // const { QDeveloperStreamingClient, GenerateCodeFromCommandsCommand } = require("@amzn/amazon-q-developer-streaming-client"); // CommonJS import
 * const client = new QDeveloperStreamingClient(config);
 * const command = new GenerateCodeFromCommandsCommand(input);
 * const response = await client.send(command);
 * ```
 *
 * @see {@link GenerateCodeFromCommandsCommandInput} for command's `input` shape.
 * @see {@link GenerateCodeFromCommandsCommandOutput} for command's `response` shape.
 * @see {@link QDeveloperStreamingClientResolvedConfig | config} for QDeveloperStreamingClient's `config` shape.
 *
 */
export class GenerateCodeFromCommandsCommand extends $Command<GenerateCodeFromCommandsCommandInput, GenerateCodeFromCommandsCommandOutput, QDeveloperStreamingClientResolvedConfig> {
  // Start section: command_properties
  // End section: command_properties

  constructor(readonly input: GenerateCodeFromCommandsCommandInput) {
    // Start section: command_constructor
    super();
    // End section: command_constructor
  }

  /**
   * @internal
   */
  resolveMiddleware(
    clientStack: MiddlewareStack<ServiceInputTypes, ServiceOutputTypes>,
    configuration: QDeveloperStreamingClientResolvedConfig,
    options?: __HttpHandlerOptions
  ): Handler<GenerateCodeFromCommandsCommandInput, GenerateCodeFromCommandsCommandOutput> {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));

    const stack = clientStack.concat(this.middlewareStack);

    const { logger } = configuration;
    const clientName = "QDeveloperStreamingClient";
    const commandName = "GenerateCodeFromCommandsCommand";
    const handlerExecutionContext: HandlerExecutionContext = {
      logger,
      clientName,
      commandName,
      inputFilterSensitiveLog:
        GenerateCodeFromCommandsRequestFilterSensitiveLog,
      outputFilterSensitiveLog:
        GenerateCodeFromCommandsResponseFilterSensitiveLog,
    }
    const { requestHandler } = configuration;
    return stack.resolve(
      (request: FinalizeHandlerArguments<any>) =>
        requestHandler.handle(request.request as __HttpRequest, options || {}),
      handlerExecutionContext
    );
  }

  private serialize(
    input: GenerateCodeFromCommandsCommandInput,
    context: __SerdeContext
  ): Promise<__HttpRequest> {
    return serializeAws_json1_0GenerateCodeFromCommandsCommand(input, context);
  }

  private deserialize(
    output: __HttpResponse,
    context: __SerdeContext & __EventStreamSerdeContext
  ): Promise<GenerateCodeFromCommandsCommandOutput> {
    return deserializeAws_json1_0GenerateCodeFromCommandsCommand(output, context);
  }

  // Start section: command_body_extra
  // End section: command_body_extra
}
