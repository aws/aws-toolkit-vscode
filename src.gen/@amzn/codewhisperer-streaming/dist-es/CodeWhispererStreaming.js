import { CodeWhispererStreamingClient, } from "./CodeWhispererStreamingClient";
import { ConverseStreamCommand, } from "./commands/ConverseStreamCommand";
import { ExportResultArchiveCommand, } from "./commands/ExportResultArchiveCommand";
import { GenerateAssistantResponseCommand, } from "./commands/GenerateAssistantResponseCommand";
import { GenerateTaskAssistPlanCommand, } from "./commands/GenerateTaskAssistPlanCommand";
import { createAggregatedClient } from "@smithy/smithy-client";
const commands = {
    ExportResultArchiveCommand,
    GenerateAssistantResponseCommand,
    GenerateTaskAssistPlanCommand,
    ConverseStreamCommand,
};
export class CodeWhispererStreaming extends CodeWhispererStreamingClient {
}
createAggregatedClient(commands, CodeWhispererStreaming);
