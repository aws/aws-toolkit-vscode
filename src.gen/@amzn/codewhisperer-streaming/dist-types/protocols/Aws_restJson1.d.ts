import { ConverseStreamCommandInput, ConverseStreamCommandOutput } from "../commands/ConverseStreamCommand";
import { ExportResultArchiveCommandInput, ExportResultArchiveCommandOutput } from "../commands/ExportResultArchiveCommand";
import { GenerateAssistantResponseCommandInput, GenerateAssistantResponseCommandOutput } from "../commands/GenerateAssistantResponseCommand";
import { GenerateTaskAssistPlanCommandInput, GenerateTaskAssistPlanCommandOutput } from "../commands/GenerateTaskAssistPlanCommand";
import { HttpRequest as __HttpRequest, HttpResponse as __HttpResponse } from "@smithy/protocol-http";
import { EventStreamSerdeContext as __EventStreamSerdeContext, SerdeContext as __SerdeContext } from "@smithy/types";
/**
 * serializeAws_restJson1ExportResultArchiveCommand
 */
export declare const se_ExportResultArchiveCommand: (input: ExportResultArchiveCommandInput, context: __SerdeContext) => Promise<__HttpRequest>;
/**
 * serializeAws_restJson1GenerateAssistantResponseCommand
 */
export declare const se_GenerateAssistantResponseCommand: (input: GenerateAssistantResponseCommandInput, context: __SerdeContext) => Promise<__HttpRequest>;
/**
 * serializeAws_restJson1GenerateTaskAssistPlanCommand
 */
export declare const se_GenerateTaskAssistPlanCommand: (input: GenerateTaskAssistPlanCommandInput, context: __SerdeContext) => Promise<__HttpRequest>;
/**
 * serializeAws_restJson1ConverseStreamCommand
 */
export declare const se_ConverseStreamCommand: (input: ConverseStreamCommandInput, context: __SerdeContext) => Promise<__HttpRequest>;
/**
 * deserializeAws_restJson1ExportResultArchiveCommand
 */
export declare const de_ExportResultArchiveCommand: (output: __HttpResponse, context: __SerdeContext & __EventStreamSerdeContext) => Promise<ExportResultArchiveCommandOutput>;
/**
 * deserializeAws_restJson1GenerateAssistantResponseCommand
 */
export declare const de_GenerateAssistantResponseCommand: (output: __HttpResponse, context: __SerdeContext & __EventStreamSerdeContext) => Promise<GenerateAssistantResponseCommandOutput>;
/**
 * deserializeAws_restJson1GenerateTaskAssistPlanCommand
 */
export declare const de_GenerateTaskAssistPlanCommand: (output: __HttpResponse, context: __SerdeContext & __EventStreamSerdeContext) => Promise<GenerateTaskAssistPlanCommandOutput>;
/**
 * deserializeAws_restJson1ConverseStreamCommand
 */
export declare const de_ConverseStreamCommand: (output: __HttpResponse, context: __SerdeContext & __EventStreamSerdeContext) => Promise<ConverseStreamCommandOutput>;
