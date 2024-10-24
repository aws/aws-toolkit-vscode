"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportResultArchiveCommand = exports.$Command = void 0;
const models_0_1 = require("../models/models_0");
const Aws_restJson1_1 = require("../protocols/Aws_restJson1");
const middleware_serde_1 = require("@smithy/middleware-serde");
const smithy_client_1 = require("@smithy/smithy-client");
Object.defineProperty(exports, "$Command", { enumerable: true, get: function () { return smithy_client_1.Command; } });
const types_1 = require("@smithy/types");
class ExportResultArchiveCommand extends smithy_client_1.Command {
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use((0, middleware_serde_1.getSerdePlugin)(configuration, this.serialize, this.deserialize));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "CodeWhispererStreamingClient";
        const commandName = "ExportResultArchiveCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: models_0_1.ExportResultArchiveResponseFilterSensitiveLog,
            [types_1.SMITHY_CONTEXT_KEY]: {
                service: "AmazonCodeWhispererStreamingService",
                operation: "ExportResultArchive",
            },
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return (0, Aws_restJson1_1.se_ExportResultArchiveCommand)(input, context);
    }
    deserialize(output, context) {
        return (0, Aws_restJson1_1.de_ExportResultArchiveCommand)(output, context);
    }
}
exports.ExportResultArchiveCommand = ExportResultArchiveCommand;
