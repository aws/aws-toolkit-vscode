import { GenerateCodeFromCommandsRequestFilterSensitiveLog, GenerateCodeFromCommandsResponseFilterSensitiveLog, } from "../models/models_0";
import { de_GenerateCodeFromCommandsCommand, se_GenerateCodeFromCommandsCommand, } from "../protocols/Aws_json1_0";
import { getSerdePlugin } from "@smithy/middleware-serde";
import { Command as $Command } from "@smithy/smithy-client";
export { $Command };
export class GenerateCodeFromCommandsCommand extends $Command.classBuilder()
    .m(function (Command, cs, config, o) {
    return [
        getSerdePlugin(config, this.serialize, this.deserialize),
    ];
})
    .s("AmazonQDeveloperStreamingService", "GenerateCodeFromCommands", {
    eventStream: {
        output: true,
    },
})
    .n("QDeveloperStreamingClient", "GenerateCodeFromCommandsCommand")
    .f(GenerateCodeFromCommandsRequestFilterSensitiveLog, GenerateCodeFromCommandsResponseFilterSensitiveLog)
    .ser(se_GenerateCodeFromCommandsCommand)
    .de(de_GenerateCodeFromCommandsCommand)
    .build() {
}
