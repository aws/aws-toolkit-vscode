"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendMessageCommand = exports.$Command = void 0;
const models_0_1 = require("../models/models_0");
const Aws_json1_0_1 = require("../protocols/Aws_json1_0");
const middleware_serde_1 = require("@smithy/middleware-serde");
const smithy_client_1 = require("@smithy/smithy-client");
Object.defineProperty(exports, "$Command", { enumerable: true, get: function () { return smithy_client_1.Command; } });
class SendMessageCommand extends smithy_client_1.Command.classBuilder()
    .m(function (Command, cs, config, o) {
    return [
        (0, middleware_serde_1.getSerdePlugin)(config, this.serialize, this.deserialize),
    ];
})
    .s("AmazonQDeveloperStreamingService", "SendMessage", {
    eventStream: {
        output: true,
    },
})
    .n("QDeveloperStreamingClient", "SendMessageCommand")
    .f(models_0_1.SendMessageRequestFilterSensitiveLog, models_0_1.SendMessageResponseFilterSensitiveLog)
    .ser(Aws_json1_0_1.se_SendMessageCommand)
    .de(Aws_json1_0_1.de_SendMessageCommand)
    .build() {
}
exports.SendMessageCommand = SendMessageCommand;
