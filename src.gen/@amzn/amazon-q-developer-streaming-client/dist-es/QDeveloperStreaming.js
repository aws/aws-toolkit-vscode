import { QDeveloperStreamingClient, } from "./QDeveloperStreamingClient";
import { GenerateCodeFromCommandsCommand, } from "./commands/GenerateCodeFromCommandsCommand";
import { SendMessageCommand, } from "./commands/SendMessageCommand";
import { createAggregatedClient } from "@smithy/smithy-client";
const commands = {
    GenerateCodeFromCommandsCommand,
    SendMessageCommand,
};
export class QDeveloperStreaming extends QDeveloperStreamingClient {
}
createAggregatedClient(commands, QDeveloperStreaming);
