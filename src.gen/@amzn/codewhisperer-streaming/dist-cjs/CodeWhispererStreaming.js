"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeWhispererStreaming = void 0;
const CodeWhispererStreamingClient_1 = require("./CodeWhispererStreamingClient");
const ConverseStreamCommand_1 = require("./commands/ConverseStreamCommand");
const ExportResultArchiveCommand_1 = require("./commands/ExportResultArchiveCommand");
const GenerateAssistantResponseCommand_1 = require("./commands/GenerateAssistantResponseCommand");
const GenerateTaskAssistPlanCommand_1 = require("./commands/GenerateTaskAssistPlanCommand");
const smithy_client_1 = require("@smithy/smithy-client");
const commands = {
    ExportResultArchiveCommand: ExportResultArchiveCommand_1.ExportResultArchiveCommand,
    GenerateAssistantResponseCommand: GenerateAssistantResponseCommand_1.GenerateAssistantResponseCommand,
    GenerateTaskAssistPlanCommand: GenerateTaskAssistPlanCommand_1.GenerateTaskAssistPlanCommand,
    ConverseStreamCommand: ConverseStreamCommand_1.ConverseStreamCommand,
};
class CodeWhispererStreaming extends CodeWhispererStreamingClient_1.CodeWhispererStreamingClient {
}
exports.CodeWhispererStreaming = CodeWhispererStreaming;
(0, smithy_client_1.createAggregatedClient)(commands, CodeWhispererStreaming);
