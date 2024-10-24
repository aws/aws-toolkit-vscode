"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QDeveloperStreaming = void 0;
const QDeveloperStreamingClient_1 = require("./QDeveloperStreamingClient");
const GenerateCodeFromCommandsCommand_1 = require("./commands/GenerateCodeFromCommandsCommand");
const SendMessageCommand_1 = require("./commands/SendMessageCommand");
const smithy_client_1 = require("@smithy/smithy-client");
const commands = {
    GenerateCodeFromCommandsCommand: GenerateCodeFromCommandsCommand_1.GenerateCodeFromCommandsCommand,
    SendMessageCommand: SendMessageCommand_1.SendMessageCommand,
};
class QDeveloperStreaming extends QDeveloperStreamingClient_1.QDeveloperStreamingClient {
}
exports.QDeveloperStreaming = QDeveloperStreaming;
(0, smithy_client_1.createAggregatedClient)(commands, QDeveloperStreaming);
