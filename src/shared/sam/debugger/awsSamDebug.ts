import { basename } from 'path';
import { ExtContext } from '../../extensions';
import * as vscode from 'vscode';
import { Breakpoint, BreakpointEvent, Handles, InitializedEvent, Logger, logger, LoggingDebugSession, OutputEvent, ProgressEndEvent, ProgressStartEvent, ProgressUpdateEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { CodeLensProviderParams } from '../../../shared/codelens/codeLensUtils';
import { getLogger } from '../../../shared/logger';
import * as tsLensProvider from '../../codelens/typescriptCodeLensProvider';
import { MockBreakpoint, MockRuntime } from './awsSamRuntime';
import { LambdaLocalInvokeParams } from '../../codelens/localLambdaRunner';
import { DefaultValidatingSamCliProcessInvoker } from '../cli/defaultValidatingSamCliProcessInvoker';
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke';
const { Subject } = require('await-notify');

function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * SAM-specific launch attributes (which are not part of the DAP).
 * 
 * TODO: Schema for these attributes lives in package.json.
 */
interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the "program" to debug. */
    program: string;
    /** Automatically stop target after launch. If not specified, target does not stop. */
    stopOnEntry?: boolean;
    /** enable logging the Debug Adapter Protocol */
    trace?: boolean;

    // TODO
    fixme: CodeLensProviderParams
}

export class MockDebugSession extends LoggingDebugSession {
    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    private static THREAD_ID = 1;
    // a Mock runtime (or debugger)
    private _runtime: MockRuntime;
    private _variableHandles = new Handles<string>();
    private _configurationDone = new Subject();
    private _cancelationTokens = new Map<number, boolean>();
    private _isLongrunning = new Map<number, boolean>();
    private _reportProgress = false;
    private _progressId = 10000;
    private _cancelledProgressId: string | undefined = undefined;
    private _isProgressCancellable = true;

    /**
     * Creates a new debug adapter used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    public constructor(readonly ctx:ExtContext) {
        super("mock-debug.txt");

        // this debugger uses zero-based lines and columns
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        this._runtime = new MockRuntime();

        // setup event handlers
        this._runtime.on('stopOnEntry', () => {
            this.sendEvent(new StoppedEvent('entry', MockDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnStep', () => {
            this.sendEvent(new StoppedEvent('step', MockDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnBreakpoint', () => {
            this.sendEvent(new StoppedEvent('breakpoint', MockDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnDataBreakpoint', () => {
            this.sendEvent(new StoppedEvent('data breakpoint', MockDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnException', () => {
            this.sendEvent(new StoppedEvent('exception', MockDebugSession.THREAD_ID));
        });
        this._runtime.on('breakpointValidated', (bp: MockBreakpoint) => {
            getLogger().info(`breakpointValidated: ${JSON.stringify(bp)}`)
            this.sendEvent(new BreakpointEvent('changed', <DebugProtocol.Breakpoint>{ verified: bp.verified, id: bp.id }));
        });
        this._runtime.on('output', (text, filePath, line, column) => {
            const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);

            if (text === 'start' || text === 'startCollapsed' || text === 'end') {
                e.body.group = text;
                e.body.output = `group-${text}\n`;
            }

            e.body.source = this.createSource(filePath);
            e.body.line = this.convertDebuggerLineToClient(line);
            e.body.column = this.convertDebuggerColumnToClient(column);
            this.sendEvent(e);
        });
        this._runtime.on('end', () => {
            this.sendEvent(new TerminatedEvent());
        });
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

        if (args.supportsProgressReporting) {
            this._reportProgress = true;
        }

        // build and return the capabilities of this debug adapter:
        response.body = response.body || {};

        // the adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;

        // make VS Code to use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = true;

        // make VS Code to show a 'step back' button
        response.body.supportsStepBack = true;

        // make VS Code to support data breakpoints
        response.body.supportsDataBreakpoints = true;

        // make VS Code to support completion in REPL
        response.body.supportsCompletionsRequest = true;
        response.body.completionTriggerCharacters = [ ".", "[" ];

        // make VS Code to send cancelRequests
        response.body.supportsCancelRequest = true;

        // make VS Code send the breakpointLocations request
        response.body.supportsBreakpointLocationsRequest = true;

        this.sendResponse(response);

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());
    }

    /**
     * Called at the end of the configuration sequence.
     * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
     */
    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        super.configurationDoneRequest(response, args);

        // notify the launchRequest that configuration has finished
        this._configurationDone.notify();
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {

        // make sure to 'Stop' the buffered logging if 'trace' is not set
        logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

        // wait until configuration has finished (and configurationDoneRequest has been called)
        await this._configurationDone.wait(1000);

        const providerParams: CodeLensProviderParams = {
            context: this.ctx,
            configuration: this.ctx.settings,
            outputChannel: this.ctx.outputChannel,
            telemetryService: this.ctx.telemetryService,
        }
        const docUri = vscode.Uri.parse('/Volumes/workplace/testsamnode12-3/testnode12-3/hello-world/app.js')
        const cfnTemplateUri = vscode.Uri.parse('/Volumes/workplace/testsamnode12-3/testnode12-3/hello-world/template.yaml')
        const params:LambdaLocalInvokeParams = {
            uri: docUri,
            range: new vscode.Range(1,1,1,1),
            handlerName: 'app.lambdaHandler',
            isDebug: true,  //!!args.noDebug,
            workspaceFolder: vscode.workspace.getWorkspaceFolder(docUri)!!,
            samTemplate: cfnTemplateUri,
        }

        // TODO: await?
        tsLensProvider.invokeLambda({
            ...params,
            runtime: 'nodejs12.x',
            settings: this.ctx.settings,
            processInvoker: new DefaultValidatingSamCliProcessInvoker({}),
            localInvokeCommand: new DefaultSamLocalInvokeCommand(this.ctx.chanLogger, [
                WAIT_FOR_DEBUGGER_MESSAGES.NODEJS
            ]),
            telemetryService: this.ctx.telemetryService,
            outputChannel: this.ctx.outputChannel,
        })
        tsLensProvider.initialize(providerParams)
        // start the program in the runtime
        this._runtime.start(args.program, !!args.stopOnEntry);

        this.sendResponse(response);
    }

    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

        const path = <string>args.source.path;
        const clientLines = args.lines || [];

        // clear all breakpoints for this file
        this._runtime.clearBreakpoints(path);

        // set and verify breakpoint locations
        const actualBreakpoints = clientLines.map(l => {
            let { verified, line, id } = this._runtime.setBreakPoint(path, this.convertClientLineToDebugger(l));
            const bp = <DebugProtocol.Breakpoint> new Breakpoint(verified, this.convertDebuggerLineToClient(line));
            bp.id= id;
            return bp;
        });

        // send back the actual breakpoint positions
        response.body = {
            breakpoints: actualBreakpoints
        };
        this.sendResponse(response);
    }

    protected breakpointLocationsRequest(response: DebugProtocol.BreakpointLocationsResponse, args: DebugProtocol.BreakpointLocationsArguments, request?: DebugProtocol.Request): void {

        if (args.source.path) {
            const bps = this._runtime.getBreakpoints(args.source.path, this.convertClientLineToDebugger(args.line));
            response.body = {
                breakpoints: bps.map(col => {
                    return {
                        line: args.line,
                        column: this.convertDebuggerColumnToClient(col)
                    }
                })
            };
        } else {
            response.body = {
                breakpoints: []
            };
        }
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

        // runtime supports no threads so just return a default thread.
        response.body = {
            threads: [
                new Thread(MockDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {

        const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
        const endFrame = startFrame + maxLevels;

        const stk = this._runtime.stack(startFrame, endFrame);

        response.body = {
            stackFrames: stk.frames.map((f:any) => new StackFrame(f.index, f.name, this.createSource(f.file), this.convertDebuggerLineToClient(f.line))),
            totalFrames: stk.count
        };
        this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {

        response.body = {
            scopes: [
                new Scope("Local", this._variableHandles.create("local"), false),
                new Scope("Global", this._variableHandles.create("global"), true)
            ]
        };
        this.sendResponse(response);
    }

    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request) {

        const variables: DebugProtocol.Variable[] = [];

        if (this._isLongrunning.get(args.variablesReference)) {
            // long running

            if (request) {
                this._cancelationTokens.set(request.seq, false);
            }

            for (let i = 0; i < 100; i++) {
                await timeout(1000);
                variables.push({
                    name: `i_${i}`,
                    type: "integer",
                    value: `${i}`,
                    variablesReference: 0
                });
                if (request && this._cancelationTokens.get(request.seq)) {
                    break;
                }
            }

            if (request) {
                this._cancelationTokens.delete(request.seq);
            }

        } else {

            const id = this._variableHandles.get(args.variablesReference);

            if (id) {
                variables.push({
                    name: id + "_i",
                    type: "integer",
                    value: "123",
                    variablesReference: 0
                });
                variables.push({
                    name: id + "_f",
                    type: "float",
                    value: "3.14",
                    variablesReference: 0
                });
                variables.push({
                    name: id + "_s",
                    type: "string",
                    value: "hello world",
                    variablesReference: 0
                });
                variables.push({
                    name: id + "_o",
                    type: "object",
                    value: "Object",
                    variablesReference: this._variableHandles.create(id + "_o")
                });

                // cancelation support for long running requests
                const nm = id + "_long_running";
                const ref = this._variableHandles.create(id + "_lr");
                variables.push({
                    name: nm,
                    type: "object",
                    value: "Object",
                    variablesReference: ref
                });
                this._isLongrunning.set(ref, true);
            }
        }

        response.body = {
            variables: variables
        };
        this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this._runtime.continue();
        this.sendResponse(response);
    }

    protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) : void {
        this._runtime.continue(true);
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this._runtime.step();
        this.sendResponse(response);
    }

    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
        this._runtime.step(true);
        this.sendResponse(response);
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {

        let reply: string | undefined = undefined;

        if (args.context === 'repl') {
            // 'evaluate' supports to create and delete breakpoints from the 'repl':
            const matches = /new +([0-9]+)/.exec(args.expression);
            if (matches && matches.length === 2) {
                const mbp = this._runtime.setBreakPoint(this._runtime.sourceFile, this.convertClientLineToDebugger(parseInt(matches[1])));
                const bp = <DebugProtocol.Breakpoint> new Breakpoint(mbp.verified, this.convertDebuggerLineToClient(mbp.line), undefined, this.createSource(this._runtime.sourceFile));
                bp.id= mbp.id;
                this.sendEvent(new BreakpointEvent('new', bp));
                reply = `breakpoint created`;
            } else {
                const matches = /del +([0-9]+)/.exec(args.expression);
                if (matches && matches.length === 2) {
                    const mbp = this._runtime.clearBreakPoint(this._runtime.sourceFile, this.convertClientLineToDebugger(parseInt(matches[1])));
                    if (mbp) {
                        const bp = <DebugProtocol.Breakpoint> new Breakpoint(false);
                        bp.id= mbp.id;
                        this.sendEvent(new BreakpointEvent('removed', bp));
                        reply = `breakpoint deleted`;
                    }
                } else {
                    const matches = /progress/.exec(args.expression);
                    if (matches && matches.length === 1) {
                        if (this._reportProgress) {
                            reply = `progress started`;
                            this.progressSequence();
                        } else {
                            reply = `frontend doesn't support progress (capability 'supportsProgressReporting' not set)`;
                        }
                    }
                }
            }
        }

        response.body = {
            result: reply ? reply : `evaluate(context: '${args.context}', '${args.expression}')`,
            variablesReference: 0
        };
        this.sendResponse(response);
    }

    private async progressSequence() {

        const ID = '' + this._progressId++;

        await timeout(100);

        const title = this._isProgressCancellable ? 'Cancellable operation' : 'Long running operation';
        const startEvent: DebugProtocol.ProgressStartEvent = new ProgressStartEvent(ID, title);
        startEvent.body.cancellable = this._isProgressCancellable;
        this._isProgressCancellable = !this._isProgressCancellable;
        this.sendEvent(startEvent);

        let endMessage = 'progress ended';

        for (let i = 0; i < 100; i++) {
            await timeout(500);
            this.sendEvent(new ProgressUpdateEvent(ID, `progress: ${i}`));
            if (this._cancelledProgressId === ID) {
                endMessage = 'progress cancelled';
                this._cancelledProgressId = undefined;
                break;
            }
        }
        this.sendEvent(new ProgressEndEvent(ID, endMessage));

        this._cancelledProgressId = undefined;
    }

    protected dataBreakpointInfoRequest(response: DebugProtocol.DataBreakpointInfoResponse, args: DebugProtocol.DataBreakpointInfoArguments): void {

        response.body = {
            dataId: null,
            description: "cannot break on data access",
            accessTypes: undefined,
            canPersist: false
        };

        if (args.variablesReference && args.name) {
            const id = this._variableHandles.get(args.variablesReference);
            if (id.startsWith("global_")) {
                response.body.dataId = args.name;
                response.body.description = args.name;
                response.body.accessTypes = [ "read" ];
                response.body.canPersist = true;
            }
        }

        this.sendResponse(response);
    }

    protected setDataBreakpointsRequest(response: DebugProtocol.SetDataBreakpointsResponse, args: DebugProtocol.SetDataBreakpointsArguments): void {

        // clear all data breakpoints
        this._runtime.clearAllDataBreakpoints();

        response.body = {
            breakpoints: []
        };

        for (let dbp of args.breakpoints) {
            // assume that id is the "address" to break on
            const ok = this._runtime.setDataBreakpoint(dbp.dataId);
            response.body.breakpoints.push({
                verified: ok
            });
        }

        this.sendResponse(response);
    }

    protected completionsRequest(response: DebugProtocol.CompletionsResponse, args: DebugProtocol.CompletionsArguments): void {

        response.body = {
            targets: [
                {
                    label: "item 10",
                    sortText: "10"
                },
                {
                    label: "item 1",
                    sortText: "01"
                },
                {
                    label: "item 2",
                    sortText: "02"
                }
            ]
        };
        this.sendResponse(response);
    }

    protected cancelRequest(response: DebugProtocol.CancelResponse, args: DebugProtocol.CancelArguments) {
        if (args.requestId) {
            this._cancelationTokens.set(args.requestId, true);
        }
        if (args.progressId) {
            this._cancelledProgressId= args.progressId;
        }
    }

    //---- helpers

    private createSource(filePath: string): Source {
        return new Source(basename(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined, 'mock-adapter-data');
    }
}
