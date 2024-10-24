import { GenerateTaskAssistPlanRequestFilterSensitiveLog, GenerateTaskAssistPlanResponseFilterSensitiveLog, } from "../models/models_0";
import { de_GenerateTaskAssistPlanCommand, se_GenerateTaskAssistPlanCommand, } from "../protocols/Aws_restJson1";
import { getSerdePlugin } from "@smithy/middleware-serde";
import { Command as $Command } from "@smithy/smithy-client";
import { SMITHY_CONTEXT_KEY, } from "@smithy/types";
export { $Command };
export class GenerateTaskAssistPlanCommand extends $Command {
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "CodeWhispererStreamingClient";
        const commandName = "GenerateTaskAssistPlanCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: GenerateTaskAssistPlanRequestFilterSensitiveLog,
            outputFilterSensitiveLog: GenerateTaskAssistPlanResponseFilterSensitiveLog,
            [SMITHY_CONTEXT_KEY]: {
                service: "AmazonCodeWhispererStreamingService",
                operation: "GenerateTaskAssistPlan",
            },
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GenerateTaskAssistPlanCommand(input, context);
    }
    deserialize(output, context) {
        return de_GenerateTaskAssistPlanCommand(output, context);
    }
}
