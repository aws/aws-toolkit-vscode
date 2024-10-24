import { CodeWhispererStreamingClient } from "./CodeWhispererStreamingClient";
import { ConverseStreamCommandInput, ConverseStreamCommandOutput } from "./commands/ConverseStreamCommand";
import { ExportResultArchiveCommandInput, ExportResultArchiveCommandOutput } from "./commands/ExportResultArchiveCommand";
import { GenerateAssistantResponseCommandInput, GenerateAssistantResponseCommandOutput } from "./commands/GenerateAssistantResponseCommand";
import { GenerateTaskAssistPlanCommandInput, GenerateTaskAssistPlanCommandOutput } from "./commands/GenerateTaskAssistPlanCommand";
import { HttpHandlerOptions as __HttpHandlerOptions } from "@smithy/types";
export interface CodeWhispererStreaming {
    /**
     * @see {@link ExportResultArchiveCommand}
     */
    exportResultArchive(args: ExportResultArchiveCommandInput, options?: __HttpHandlerOptions): Promise<ExportResultArchiveCommandOutput>;
    exportResultArchive(args: ExportResultArchiveCommandInput, cb: (err: any, data?: ExportResultArchiveCommandOutput) => void): void;
    exportResultArchive(args: ExportResultArchiveCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ExportResultArchiveCommandOutput) => void): void;
    /**
     * @see {@link GenerateAssistantResponseCommand}
     */
    generateAssistantResponse(args: GenerateAssistantResponseCommandInput, options?: __HttpHandlerOptions): Promise<GenerateAssistantResponseCommandOutput>;
    generateAssistantResponse(args: GenerateAssistantResponseCommandInput, cb: (err: any, data?: GenerateAssistantResponseCommandOutput) => void): void;
    generateAssistantResponse(args: GenerateAssistantResponseCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GenerateAssistantResponseCommandOutput) => void): void;
    /**
     * @see {@link GenerateTaskAssistPlanCommand}
     */
    generateTaskAssistPlan(args: GenerateTaskAssistPlanCommandInput, options?: __HttpHandlerOptions): Promise<GenerateTaskAssistPlanCommandOutput>;
    generateTaskAssistPlan(args: GenerateTaskAssistPlanCommandInput, cb: (err: any, data?: GenerateTaskAssistPlanCommandOutput) => void): void;
    generateTaskAssistPlan(args: GenerateTaskAssistPlanCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GenerateTaskAssistPlanCommandOutput) => void): void;
    /**
     * @see {@link ConverseStreamCommand}
     */
    converseStream(args: ConverseStreamCommandInput, options?: __HttpHandlerOptions): Promise<ConverseStreamCommandOutput>;
    converseStream(args: ConverseStreamCommandInput, cb: (err: any, data?: ConverseStreamCommandOutput) => void): void;
    converseStream(args: ConverseStreamCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ConverseStreamCommandOutput) => void): void;
}
/**
 * @public
 */
export declare class CodeWhispererStreaming extends CodeWhispererStreamingClient implements CodeWhispererStreaming {
}
