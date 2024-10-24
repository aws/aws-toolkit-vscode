import { ExportResultArchiveResponseFilterSensitiveLog, } from "../models/models_0";
import { de_ExportResultArchiveCommand, se_ExportResultArchiveCommand, } from "../protocols/Aws_restJson1";
import { getSerdePlugin } from "@smithy/middleware-serde";
import { Command as $Command } from "@smithy/smithy-client";
import { SMITHY_CONTEXT_KEY, } from "@smithy/types";
export { $Command };
export class ExportResultArchiveCommand extends $Command {
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "CodeWhispererStreamingClient";
        const commandName = "ExportResultArchiveCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: ExportResultArchiveResponseFilterSensitiveLog,
            [SMITHY_CONTEXT_KEY]: {
                service: "AmazonCodeWhispererStreamingService",
                operation: "ExportResultArchive",
            },
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ExportResultArchiveCommand(input, context);
    }
    deserialize(output, context) {
        return de_ExportResultArchiveCommand(output, context);
    }
}
