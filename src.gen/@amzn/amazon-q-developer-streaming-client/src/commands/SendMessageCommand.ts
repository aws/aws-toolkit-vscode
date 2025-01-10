// smithy-typescript generated code
import {
  QDeveloperStreamingClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../QDeveloperStreamingClient";
import {
  SendMessageRequest,
  SendMessageRequestFilterSensitiveLog,
  SendMessageResponse,
  SendMessageResponseFilterSensitiveLog,
} from "../models/models_0";
import {
  deserializeAws_json1_0SendMessageCommand,
  serializeAws_json1_0SendMessageCommand,
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

export interface SendMessageCommandInput extends SendMessageRequest {}
export interface SendMessageCommandOutput extends SendMessageResponse, __MetadataBearer {}

export class SendMessageCommand extends $Command<SendMessageCommandInput, SendMessageCommandOutput, QDeveloperStreamingClientResolvedConfig> {
  // Start section: command_properties
  // End section: command_properties

  constructor(readonly input: SendMessageCommandInput) {
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
  ): Handler<SendMessageCommandInput, SendMessageCommandOutput> {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));

    const stack = clientStack.concat(this.middlewareStack);

    const { logger } = configuration;
    const clientName = "QDeveloperStreamingClient";
    const commandName = "SendMessageCommand";
    const handlerExecutionContext: HandlerExecutionContext = {
      logger,
      clientName,
      commandName,
      inputFilterSensitiveLog:
        SendMessageRequestFilterSensitiveLog,
      outputFilterSensitiveLog:
        SendMessageResponseFilterSensitiveLog,
    }
    const { requestHandler } = configuration;
    return stack.resolve(
      (request: FinalizeHandlerArguments<any>) =>
        requestHandler.handle(request.request as __HttpRequest, options || {}),
      handlerExecutionContext
    );
  }

  private serialize(
    input: SendMessageCommandInput,
    context: __SerdeContext
  ): Promise<__HttpRequest> {
    return serializeAws_json1_0SendMessageCommand(input, context);
  }

  private deserialize(
    output: __HttpResponse,
    context: __SerdeContext & __EventStreamSerdeContext
  ): Promise<SendMessageCommandOutput> {
    return deserializeAws_json1_0SendMessageCommand(output, context);
  }

  // Start section: command_body_extra
  // End section: command_body_extra
}
