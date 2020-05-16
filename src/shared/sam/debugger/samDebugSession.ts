/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DebugSession, InitializedEvent, Logger, logger, TerminatedEvent } from 'vscode-debugadapter'
import { DebugProtocol } from 'vscode-debugprotocol'
import { NodejsDebugConfiguration, PythonDebugConfiguration } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as csharpDebug from './csharpSamDebug'
import * as pythonDebug from './pythonSamDebug'
import * as invokeTypescriptLambda from './typescriptSamDebug'
import { ExtContext } from '../../extensions'
import { ChannelLogger } from '../../utilities/vsCodeUtils'
import { SamLocalInvokeCommand } from '../cli/samCliLocalInvoke'
import { AwsSamDebuggerConfiguration } from './awsSamDebugConfiguration.gen'
import { Timeout } from '../../utilities/timeoutUtils'

/**
 * SAM-specific launch attributes (which are not part of the DAP).
 *
 * Schema for these attributes lives in package.json
 * ("configurationAttributes").
 *
 * @see AwsSamDebuggerConfiguration
 * @see AwsSamDebugConfigurationProvider.resolveDebugConfiguration
 */
export interface SamLaunchRequestArgs extends DebugProtocol.AttachRequestArguments, AwsSamDebuggerConfiguration {
    // readonly type: 'node' | 'python' | 'coreclr' | 'aws-sam'
    readonly request: 'attach' | 'launch' | 'direct-invoke'

    runtime: string
    runtimeFamily: RuntimeFamily
    handlerName: string
    workspaceFolder: vscode.WorkspaceFolder
    /**
     * Absolute path to the SAM project root, calculated from any of:
     *  - `codeUri` in `template.yaml`
     *  - `projectRoot` for the case of `target=code`
     *  - provider-specific heuristic (last resort)
     */
    codeRoot: string
    outFilePath?: string

    baseBuildDir?: string
    /**
     * URI of the current editor document.
     * Used as a last resort for deciding `codeRoot` (when there is no `launch.json` nor `template.yaml`)
     */
    documentUri: vscode.Uri
    /**
     * SAM template absolute path used for SAM CLI invoke.
     * - For `target=code` this is the _generated_ template path.
     * - For `target=template` this is the template found in the workspace.
     */
    samTemplatePath: string

    //
    // Debug properties (when user runs with debugging enabled).
    //
    /** vscode implicit field, set if user user invokes "Run (Start Without Debugging)". */
    noDebug?: boolean
    debuggerPath?: string
    debugPort?: number

    //
    //  Invocation properties (for "execute" phase, after "config" phase).
    //  Non-serializable...
    //
    samLocalInvokeCommand?: SamLocalInvokeCommand
    onWillAttachDebugger?(debugPort: number, timeout: Timeout, channelLogger: ChannelLogger): Promise<void>
}

/**
 * Wraps a DebugAdapter.
 *
 * Currently implements launchRequest() and not much else, but could be
 * expanded later. Note: the empty stubs are necessary, to avoid confusing
 * the DAP client (vscode).
 */
export class SamDebugSession extends DebugSession {
    /**
     * Creates a new debug adapter used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    public constructor(private readonly ctx: ExtContext) {
        super()
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        // build and return the capabilities of this debug adapter:
        response.body = response.body || {}

        // Adapter implements configurationDoneRequest.
        // response.body.supportsConfigurationDoneRequest = true;

        // make VS Code to use `evaluate` when hovering over source
        response.body.supportsEvaluateForHovers = true

        // make VS Code to show a 'step back' button
        response.body.supportsStepBack = true

        // make VS Code to support data breakpoints
        response.body.supportsDataBreakpoints = true

        // make VS Code to support completion in REPL
        response.body.supportsCompletionsRequest = true
        response.body.completionTriggerCharacters = ['.', '[']

        // make VS Code to send cancelRequests
        response.body.supportsCancelRequest = true

        // make VS Code send the breakpointLocations request
        response.body.supportsBreakpointLocationsRequest = true

        this.sendResponse(response)

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent())
    }

    protected async launchOrAttach(response: DebugProtocol.Response, config: SamLaunchRequestArgs) {
        try {
            switch (config.runtimeFamily) {
                case RuntimeFamily.NodeJS: {
                    config.type = 'node'
                    await invokeTypescriptLambda.invokeTypescriptLambda(this.ctx, config as NodejsDebugConfiguration)
                    response.success = true
                    break
                }
                case RuntimeFamily.Python: {
                    config.type = 'python'
                    await pythonDebug.invokePythonLambda(this.ctx, config as PythonDebugConfiguration)
                    response.success = true
                    break
                }
                case RuntimeFamily.DotNetCore: {
                    config.type = 'coreclr'
                    await csharpDebug.invokeCsharpLambda(this.ctx, config)
                    response.success = true
                    break
                }
                default: {
                    response.success = false
                    response.message = `SAM debug: unknown runtimeFamily: ${config.runtimeFamily}`
                    break
                }
            }
        } catch (e) {
            response.success = false
            response.message = `SAM debug failed: ${e}`
        }
    }

    /**
     * Invokes `sam build`, `sam invoke` _without_ debugging.
     */
    protected async launchRequest(response: DebugProtocol.LaunchResponse, config: SamLaunchRequestArgs) {
        // make sure to 'Stop' the buffered logging if 'trace' is not set
        logger.setup(config.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false)
        await this.launchOrAttach(response, config)
        this.sendResponse(response)
        this.sendEvent(new TerminatedEvent())
    }

    /**
     * Invokes `sam build`, `sam invoke`, then attaches vscode debugger to the
     * debugger port.
     */
    protected async attachRequest(
        response: DebugProtocol.AttachResponse,
        config: SamLaunchRequestArgs,
        request?: DebugProtocol.Request
    ) {
        await this.launchOrAttach(response, config)
        this.sendResponse(response)
        this.sendEvent(new TerminatedEvent())
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        // this.sendResponse(response);
    }

    protected breakpointLocationsRequest(
        response: DebugProtocol.BreakpointLocationsResponse,
        args: DebugProtocol.BreakpointLocationsArguments,
        request?: DebugProtocol.Request
    ): void {
        // this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        // this.sendResponse(response);
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): void {
        // this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        // response.body = {
        //     scopes: [
        //         new Scope("Local", this._variableHandles.create("local"), false),
        //         new Scope("Global", this._variableHandles.create("global"), true)
        //     ]
        // };
        // this.sendResponse(response);
    }

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments,
        request?: DebugProtocol.Request
    ) {
        // this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        // this.sendResponse(response);
    }

    protected reverseContinueRequest(
        response: DebugProtocol.ReverseContinueResponse,
        args: DebugProtocol.ReverseContinueArguments
    ): void {
        // this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        // this.sendResponse(response);
    }

    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
        // this.sendResponse(response);
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        // this.sendResponse(response);
    }

    protected dataBreakpointInfoRequest(
        response: DebugProtocol.DataBreakpointInfoResponse,
        args: DebugProtocol.DataBreakpointInfoArguments
    ): void {
        // this.sendResponse(response);
    }

    protected setDataBreakpointsRequest(
        response: DebugProtocol.SetDataBreakpointsResponse,
        args: DebugProtocol.SetDataBreakpointsArguments
    ): void {
        // this.sendResponse(response);
    }

    protected completionsRequest(
        response: DebugProtocol.CompletionsResponse,
        args: DebugProtocol.CompletionsArguments
    ): void {
        // response.body = {
        //     targets: [
        //         {
        //             label: "item 10",
        //             sortText: "10"
        //         },
        //         {
        //             label: "item 1",
        //             sortText: "01"
        //         },
        //         {
        //             label: "item 2",
        //             sortText: "02"
        //         }
        //     ]
        // };
        // this.sendResponse(response);
    }
}
