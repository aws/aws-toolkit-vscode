import { SendMessageRequestFilterSensitiveLog, SendMessageResponseFilterSensitiveLog, } from "../models/models_0";
import { de_SendMessageCommand, se_SendMessageCommand, } from "../protocols/Aws_json1_0";
import { getSerdePlugin } from "@smithy/middleware-serde";
import { Command as $Command } from "@smithy/smithy-client";
export { $Command };
export class SendMessageCommand extends $Command.classBuilder()
    .m(function (Command, cs, config, o) {
    return [
        getSerdePlugin(config, this.serialize, this.deserialize),
    ];
})
    .s("AmazonQDeveloperStreamingService", "SendMessage", {
    eventStream: {
        output: true,
    },
})
    .n("QDeveloperStreamingClient", "SendMessageCommand")
    .f(SendMessageRequestFilterSensitiveLog, SendMessageResponseFilterSensitiveLog)
    .ser(se_SendMessageCommand)
    .de(de_SendMessageCommand)
    .build() {
}
