/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { _Blob } from 'aws-sdk/clients/lambda'
import { readFileSync } from 'fs' // eslint-disable-line no-restricted-imports
import * as _ from 'lodash'
import * as vscode from 'vscode'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import * as picker from '../../../shared/ui/picker'
import { ExtContext } from '../../../shared/extensions'

import { getLogger } from '../../../shared/logger/logger'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { sampleRequestPath } from '../../constants'
import { LambdaFunctionNode } from '../../explorer/lambdaFunctionNode'
import { getSampleLambdaPayloads, SampleRequest } from '../../utils'

import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { telemetry, Result, Runtime } from '../../../shared/telemetry/telemetry'
import {
    runSamCliRemoteTestEvents,
    SamCliRemoteTestEventsParameters,
    TestEventsOperation,
} from '../../../shared/sam/cli/samCliRemoteTestEvent'
import { getSamCliContext } from '../../../shared/sam/cli/samCliContext'
import { ToolkitError } from '../../../shared/errors'
import { basename } from 'path'
import { decodeBase64 } from '../../../shared/utilities/textUtilities'
import { DebugConfig, RemoteDebugController, revertExistingConfig } from '../../remoteDebugging/ldkController'
import { getCachedLocalPath, openLambdaFile, runDownloadLambda } from '../../commands/downloadLambda'
import { getLambdaHandlerFile } from '../../../awsService/appBuilder/utils'
import { runUploadDirectory } from '../../commands/uploadLambda'
import fs from '../../../shared/fs/fs'
import { showConfirmationMessage, showMessage } from '../../../shared/utilities/messages'
import { getLambdaClientWithAgent } from '../../remoteDebugging/utils'

const localize = nls.loadMessageBundle()

type Event = {
    name: string
    region: string
    arn: string
    event?: string
}

export interface InitialData {
    FunctionName: string
    FunctionArn: string
    FunctionRegion: string
    InputSamples: SampleRequest[]
    TestEvents?: string[]
    Source?: string
    StackName?: string
    LogicalId?: string
    Runtime?: string
    LocalRootPath?: string
    LambdaFunctionNode?: LambdaFunctionNode
    supportCodeDownload?: boolean
    runtimeSupportsRemoteDebug?: boolean
    remoteDebugLayer?: string | undefined
}

// Debug configuration sub-interface
export interface DebugConfiguration {
    debugPort: number
    localRootPath: string
    remoteRootPath: string
    shouldPublishVersion: boolean
    lambdaTimeout: number
    otherDebugParams: string
}

// Debug state sub-interface
export interface DebugState {
    isDebugging: boolean
    debugTimer: number | undefined
    debugTimeRemaining: number
    showDebugTimer: boolean
    handlerFileAvailable: boolean
    remoteDebuggingEnabled: boolean
}

// Runtime-specific debug settings sub-interface
export interface RuntimeDebugSettings {
    // Node.js specific
    sourceMapEnabled: boolean
    skipFiles: string
    outFiles: string | undefined
    // Python specific
    justMyCode: boolean
    // Java specific
    projectName: string
}

// UI state sub-interface
export interface UIState {
    isCollapsed: boolean
    showNameInput: boolean
    payload: string
}

// Payload/Event handling sub-interface
export interface PayloadData {
    selectedSampleRequest: string
    sampleText: string
    selectedFile: string
    selectedFilePath: string
    selectedTestEvent: string
    newTestEventName: string
}

export interface RemoteInvokeData {
    initialData: InitialData
    debugConfig: DebugConfiguration
    debugState: DebugState
    runtimeSettings: RuntimeDebugSettings
    uiState: UIState
    payloadData: PayloadData
}

// Event types for communicating state between backend and frontend
export type StateChangeEvent = {
    isDebugging?: boolean
}
interface SampleQuickPickItem extends vscode.QuickPickItem {
    filename: string
}

export class RemoteInvokeWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/lambda/vue/remoteInvoke/index.js'
    public readonly id = 'remoteInvoke'

    // Event emitter for state changes that need to be synchronized with the frontend
    public readonly onStateChange = new vscode.EventEmitter<StateChangeEvent>()

    // Backend timer that will continue running even when the webview loses focus
    private debugTimerHandle: NodeJS.Timeout | undefined
    private debugTimeRemaining: number = 0
    private isInvoking: boolean = false
    private debugging: boolean = false
    private watcherDisposable: vscode.Disposable | undefined
    private fileWatcherDisposable: vscode.Disposable | undefined
    private handlerFileAvailable: boolean = false
    private isStartingDebug: boolean = false
    private handlerFile: string | undefined
    public constructor(
        private readonly channel: vscode.OutputChannel,
        private readonly client: LambdaClient,
        private readonly data: InitialData
    ) {
        super(RemoteInvokeWebview.sourcePath)
    }

    public init() {
        this.watcherDisposable = vscode.debug.onDidTerminateDebugSession(async (session: vscode.DebugSession) => {
            this.resetServerState()
        })
        return this.data
    }

    public resetServerState() {
        this.stopDebugTimer()
        this.debugging = false
        this.isInvoking = false
        this.isStartingDebug = false
        this.onStateChange.fire({
            isDebugging: false,
        })
    }

    public async disposeServer() {
        this.watcherDisposable?.dispose()
        this.fileWatcherDisposable?.dispose()
        if (this.debugging && RemoteDebugController.instance.isDebugging) {
            await this.stopDebugging()
        }
        this.dispose()
    }

    private setupFileWatcher() {
        // Dispose existing watcher if any
        this.fileWatcherDisposable?.dispose()

        if (!this.data.LocalRootPath) {
            return
        }

        // Create a file system watcher for the local root path
        const pattern = new vscode.RelativePattern(this.data.LocalRootPath, '**/*')
        const watcher = vscode.workspace.createFileSystemWatcher(pattern)

        // Set up event handlers for file changes
        const handleFileChange = async () => {
            const result = await showMessage(
                'info',
                localize(
                    'AWS.lambda.remoteInvoke.codeChangesDetected',
                    'Code changes detected in the local directory. Would you like to update the Lambda function {0}@{1}?',
                    this.data.FunctionName,
                    this.data.FunctionRegion
                ),
                ['Yes', 'No']
            )

            if (result === 'Yes') {
                try {
                    if (this.data.LambdaFunctionNode && this.data.LocalRootPath) {
                        const lambdaFunction = {
                            name: this.data.FunctionName,
                            region: this.data.FunctionRegion,
                            configuration: this.data.LambdaFunctionNode.configuration,
                        }
                        await runUploadDirectory(lambdaFunction, 'zip', vscode.Uri.file(this.data.LocalRootPath))
                    }
                } catch (error) {
                    throw ToolkitError.chain(
                        error,
                        localize('AWS.lambda.remoteInvoke.updateFailed', 'Failed to update Lambda function')
                    )
                }
            }
        }

        // Listen for file changes, creations, and deletions
        watcher.onDidChange(handleFileChange)
        watcher.onDidCreate(handleFileChange)
        watcher.onDidDelete(handleFileChange)

        // Store the disposable so we can clean it up later
        this.fileWatcherDisposable = watcher
    }

    // Method to start the backend timer
    public startDebugTimer() {
        // Clear any existing timer
        this.stopDebugTimer()

        this.debugTimeRemaining = 60

        // Create a new timer that ticks every second
        this.debugTimerHandle = setInterval(async () => {
            this.debugTimeRemaining--

            // When timer reaches zero, stop debugging
            if (this.debugTimeRemaining <= 0) {
                await this.handleTimerExpired()
            }
        }, 1000)
    }

    // Method to stop the timer
    public stopDebugTimer() {
        if (this.debugTimerHandle) {
            clearInterval(this.debugTimerHandle)
            this.debugTimerHandle = undefined
            this.debugTimeRemaining = 0
        }
    }

    // Handler for timer expiration
    private async handleTimerExpired() {
        await this.stopDebugging()
    }

    public async invokeLambda(input: string, source?: string, remoteDebugEnabled: boolean = false): Promise<void> {
        let result: Result = 'Succeeded'
        let qualifier: string | undefined = undefined
        // if debugging, focus on the first editor
        if (remoteDebugEnabled && RemoteDebugController.instance.isDebugging) {
            await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
            qualifier = RemoteDebugController.instance.qualifier
        }

        this.isInvoking = true

        // If debugging is active, reset the timer during invoke
        if (RemoteDebugController.instance.isDebugging) {
            this.stopDebugTimer()
        }

        this.channel.show()
        this.channel.appendLine('Loading response...')

        try {
            const funcResponse = await this.client.invoke(this.data.FunctionArn, input, qualifier)
            const logs = funcResponse.LogResult ? decodeBase64(funcResponse.LogResult) : ''
            const payload = funcResponse.Payload ? funcResponse.Payload : JSON.stringify({})

            this.channel.appendLine(`Invocation result for ${this.data.FunctionArn}`)
            this.channel.appendLine('Logs:')
            this.channel.appendLine(logs)
            this.channel.appendLine('')
            this.channel.appendLine('Payload:')
            this.channel.appendLine(String(payload))
            this.channel.appendLine('')
        } catch (e) {
            const error = e as Error
            this.channel.appendLine(`There was an error invoking ${this.data.FunctionArn}`)
            this.channel.appendLine(error.toString())
            this.channel.appendLine('')
            result = 'Failed'
        } finally {
            telemetry.lambda_invokeRemote.emit({
                result,
                passive: false,
                source: source,
                runtimeString: this.data.Runtime,
                action: remoteDebugEnabled ? 'debug' : 'invoke',
            })

            // Update the session state to indicate we've finished invoking
            this.isInvoking = false

            // If debugging is active, restart the timer
            if (RemoteDebugController.instance.isDebugging) {
                this.startDebugTimer()
            }
            this.channel.show()
        }
    }

    public async promptFile() {
        const fileLocations = await vscode.window.showOpenDialog({
            openLabel: localize('AWS.lambda.remoteInvoke.open', 'Open'),
        })

        if (!fileLocations || fileLocations.length === 0) {
            return undefined
        }

        try {
            const fileContent = readFileSync(fileLocations[0].fsPath, { encoding: 'utf8' })
            return {
                sample: fileContent,
                selectedFilePath: fileLocations[0].fsPath,
                selectedFile: this.getFileName(fileLocations[0].fsPath),
            }
        } catch (e) {
            getLogger().error('readFileSync: Failed to read file at path %s %O', fileLocations[0].fsPath, e)
            throw ToolkitError.chain(
                e,
                localize('AWS.lambda.remoteInvoke.failedToReadFile', 'Failed to read selected file')
            )
        }
    }

    public async promptFolder(): Promise<undefined | string> {
        const fileLocations = await vscode.window.showOpenDialog({
            openLabel: localize('AWS.lambda.remoteInvoke.open', 'Open'),
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
        })

        if (!fileLocations || fileLocations.length === 0) {
            return undefined
        }
        this.data.LocalRootPath = fileLocations[0].fsPath
        // try to find the handler file in this folder, open it if not opened already
        if (!(await this.tryOpenHandlerFile())) {
            const warning = localize(
                'AWS.lambda.remoteInvoke.handlerFileNotFound',
                'Handler {0} not found in selected location. Please select the folder that contains the copy of your handler file',
                this.data.LambdaFunctionNode?.configuration.Handler
            )
            getLogger().warn(warning)
            void vscode.window.showWarningMessage(warning)
        }
        return fileLocations[0].fsPath
    }

    public async tryOpenHandlerFile(path?: string, watchForUpdates: boolean = true): Promise<boolean> {
        this.handlerFile = undefined
        if (path) {
            // path is provided, override init path
            this.data.LocalRootPath = path
        }
        // init path or node not available
        if (!this.data.LocalRootPath || !this.data.LambdaFunctionNode) {
            return false
        }

        const handlerFile = await getLambdaHandlerFile(
            vscode.Uri.file(this.data.LocalRootPath),
            '',
            this.data.LambdaFunctionNode?.configuration.Handler ?? '',
            this.data.Runtime ?? 'unknown'
        )
        if (!handlerFile || !(await fs.exists(handlerFile))) {
            this.handlerFileAvailable = false
            return false
        }
        this.handlerFileAvailable = true
        if (watchForUpdates) {
            this.setupFileWatcher()
        }
        await openLambdaFile(handlerFile.fsPath)
        this.handlerFile = handlerFile.fsPath
        return true
    }

    public async loadFile(fileLocations: string) {
        return await this.readFile(fileLocations)
    }

    private async readFile(filePath: string) {
        if (!filePath) {
            return undefined
        }
        const fileLocation = vscode.Uri.file(filePath)
        try {
            const fileContent = readFileSync(fileLocation.fsPath, { encoding: 'utf8' })

            return {
                sample: fileContent,
                selectedFilePath: fileLocation.fsPath,
                selectedFile: this.getFileName(fileLocation.fsPath),
            }
        } catch (e) {
            getLogger().error('readFileSync: Failed to read file at path %s %O', fileLocation.fsPath, e)
            throw ToolkitError.chain(
                e,
                localize('AWS.lambda.remoteInvoke.failedToReadFile', 'Failed to read selected file')
            )
        }
    }

    private getFileName(filePath: string): string {
        return basename(filePath)
    }

    public async listRemoteTestEvents(functionArn: string, region: string): Promise<string[]> {
        const params: SamCliRemoteTestEventsParameters = {
            functionArn: functionArn,
            operation: TestEventsOperation.List,
            region: region,
        }
        const result = await this.remoteTestEvents(params)
        return result.split('\n')
    }

    public async createRemoteTestEvents(putEvent: Event) {
        const params: SamCliRemoteTestEventsParameters = {
            functionArn: putEvent.arn,
            operation: TestEventsOperation.Put,
            name: putEvent.name,
            eventSample: putEvent.event,
            region: putEvent.region,
        }
        return await this.remoteTestEvents(params)
    }
    public async getRemoteTestEvents(getEvents: Event) {
        const params: SamCliRemoteTestEventsParameters = {
            name: getEvents.name,
            operation: TestEventsOperation.Get,
            functionArn: getEvents.arn,
            region: getEvents.region,
        }
        return await this.remoteTestEvents(params)
    }

    private async remoteTestEvents(params: SamCliRemoteTestEventsParameters) {
        return await runSamCliRemoteTestEvents(params, getSamCliContext().invoker)
    }

    public async getSamplePayload(): Promise<string | undefined> {
        try {
            const inputs: SampleQuickPickItem[] = (await getSampleLambdaPayloads()).map((entry) => {
                return { label: entry.name ?? '', filename: entry.filename ?? '' }
            })

            const qp = picker.createQuickPick({
                items: inputs,
                options: {
                    title: localize(
                        'AWS.lambda.form.pickSampleInput',
                        'Enter keywords to filter the list of sample events'
                    ),
                },
            })

            const choices = await picker.promptUser({
                picker: qp,
            })
            const pickerResponse = picker.verifySinglePickerOutput<SampleQuickPickItem>(choices)

            if (!pickerResponse) {
                return
            }
            const sampleUrl = `${sampleRequestPath}${pickerResponse.filename}`
            const resp = await new HttpResourceFetcher(sampleUrl, { showUrl: true }).get()
            const sample = (await resp?.text()) ?? ''

            return sample
        } catch (err) {
            getLogger().error('Error getting manifest data..: %O', err as Error)
            throw ToolkitError.chain(
                err,
                localize('AWS.lambda.remoteInvoke.gettingManifestData', 'getting manifest data')
            )
        }
    }

    // Download lambda code and update the local root path
    public async downloadRemoteCode(): Promise<string | undefined> {
        return await telemetry.lambda_import.run(async (span) => {
            span.record({ runtime: this.data.Runtime as Runtime | undefined, source: 'RemoteDebug' })
            try {
                if (this.data.LambdaFunctionNode) {
                    const output = await runDownloadLambda(this.data.LambdaFunctionNode, true)
                    if (output instanceof vscode.Uri) {
                        this.data.LocalRootPath = output.fsPath
                        this.handlerFileAvailable = true
                        this.setupFileWatcher()

                        return output.fsPath
                    }
                } else {
                    getLogger().error(
                        localize(
                            'AWS.lambda.remoteInvoke.lambdaFunctionNodeUndefined',
                            'LambdaFunctionNode is undefined'
                        )
                    )
                }
                return undefined
            } catch (error) {
                throw ToolkitError.chain(
                    error,
                    localize('AWS.lambda.remoteInvoke.failedToDownloadCode', 'Failed to download remote code')
                )
            }
        })
    }

    // this serves as a lock for invoke
    public checkReadyToInvoke(): boolean {
        if (this.isInvoking) {
            void vscode.window.showWarningMessage(
                localize(
                    'AWS.lambda.remoteInvoke.invokeInProgress',
                    'A remote invoke is already in progress, please wait for previous invoke, or remove debug setup'
                )
            )
            return false
        }
        if (this.isStartingDebug) {
            void vscode.window.showWarningMessage(
                localize(
                    'AWS.lambda.remoteInvoke.debugSetupInProgress',
                    'A debugger setup is already in progress, please wait for previous setup to complete, or remove debug setup'
                )
            )
        }
        return true
    }

    // this check is run when user click remote invoke with remote debugging checked
    public async checkReadyToDebug(config: DebugConfig): Promise<boolean> {
        if (!this.data.LambdaFunctionNode) {
            return false
        }

        if (!this.handlerFileAvailable) {
            const result = await showConfirmationMessage({
                prompt: localize(
                    'AWS.lambda.remoteInvoke.handlerFileNotLocated',
                    'The handler file cannot be located in the specified Local Root Path. As a result, remote debugging will not pause at breakpoints.'
                ),
                confirm: 'Continue Anyway',
                cancel: 'Cancel',
                type: 'warning',
            })
            if (!result) {
                return false
            }
        }
        // check if snapstart is on and we are publishing a version
        if (
            config.shouldPublishVersion &&
            this.data.LambdaFunctionNode.configuration.SnapStart?.ApplyOn === 'PublishedVersions'
        ) {
            const result = await showConfirmationMessage({
                prompt: localize(
                    'AWS.lambda.remoteInvoke.snapstartWarning',
                    "This function has Snapstart enabled. If you use Remote Debug with the 'publish version' setting, you'll experience notable delays. For faster debugging, consider disabling the 'publish version' option."
                ),
                confirm: 'Continue Anyway',
                cancel: 'Cancel',
                type: 'warning',
            })
            if (!result) {
                // didn't confirm
                getLogger().warn(
                    localize('AWS.lambda.remoteInvoke.userCanceledSnapstart', 'User canceled Snapstart confirm')
                )
                return false
            }
        }

        // ready to debug
        return true
    }

    public async startDebugging(config: DebugConfig): Promise<boolean> {
        if (!this.data.LambdaFunctionNode) {
            return false
        }
        if (!(await this.checkReadyToDebug(config))) {
            return false
        }
        this.isStartingDebug = true
        try {
            await RemoteDebugController.instance.startDebugging(this.data.FunctionArn, this.data.Runtime ?? 'unknown', {
                ...config,
                handlerFile: this.handlerFile,
            })
        } catch (e) {
            throw ToolkitError.chain(
                e,
                localize('AWS.lambda.remoteInvoke.failedToStartDebugging', 'Failed to start debugging')
            )
        } finally {
            this.isStartingDebug = false
        }

        this.startDebugTimer()
        this.debugging = this.isLDKDebugging()
        return this.debugging
    }

    public async stopDebugging(): Promise<boolean> {
        if (this.isLDKDebugging()) {
            this.resetServerState()
            await RemoteDebugController.instance.stopDebugging()
        }
        this.debugging = this.isLDKDebugging()
        return this.debugging
    }

    public isLDKDebugging(): boolean {
        return RemoteDebugController.instance.isDebugging
    }

    public isWebViewDebugging(): boolean {
        return this.debugging
    }

    public getIsInvoking(): boolean {
        return this.isInvoking
    }

    public getDebugTimeRemaining(): number {
        return this.debugTimeRemaining
    }

    public getLocalPath(): string {
        return this.data.LocalRootPath ?? ''
    }

    public getHandlerAvailable(): boolean {
        return this.handlerFileAvailable
    }

    // prestatus check run at checkbox click
    public async debugPreCheck(): Promise<boolean> {
        return await telemetry.lambda_remoteDebugPrecheck.run(async (span) => {
            span.record({ runtimeString: this.data.Runtime, source: 'webview' })
            if (!this.debugging && RemoteDebugController.instance.isDebugging) {
                // another debug session in progress
                const result = await showConfirmationMessage({
                    prompt: localize(
                        'AWS.lambda.remoteInvoke.debugSessionActive',
                        'A remote debug session is already active. Stop that for this new session?'
                    ),
                    confirm: 'Stop Previous Session',
                    cancel: 'Cancel',
                    type: 'warning',
                })

                if (result) {
                    // Stop the previous session
                    if (await this.stopDebugging()) {
                        getLogger().error(
                            localize(
                                'AWS.lambda.remoteInvoke.failedToStopPreviousSession',
                                'Failed to stop previous debug session.'
                            )
                        )
                        return false
                    }
                } else {
                    // user canceled, Do nothing
                    return false
                }
            }

            const result = await RemoteDebugController.instance.installDebugExtension(this.data.Runtime)
            if (!result && result === false) {
                // install failed
                return false
            }

            await revertExistingConfig()

            // Check if the function ARN is in the cache and try to open handler file
            const cachedPath = getCachedLocalPath(this.data.FunctionArn)
            // only check cache if not comming from appbuilder
            if (cachedPath && !this.data.LambdaFunctionNode?.localDir) {
                getLogger().debug(
                    `lambda: found cached local path for function ARN: ${this.data.FunctionArn} -> ${cachedPath}`
                )
                await this.tryOpenHandlerFile(cachedPath, true)
            }

            // this is comming from appbuilder
            if (this.data.LambdaFunctionNode?.localDir) {
                await this.tryOpenHandlerFile(undefined, false)
            }

            return true
        })
    }
}

export async function invokeRemoteLambda(
    context: ExtContext,
    params: {
        /* TODO: Instead of vague scope-leaking objects: awsContext & element, it would be cleaner if this took:
         *  {
         *      lambdaClient: LambdaClient,         // or just invoke/invokeAsync interface of AWS.Lambda (see: lambda.d.ts)
         *      invokeParams: {functionArn: string} // or Lambda.Types.InvocationRequest (see: lambda.d.ts)
         *  }
         */
        outputChannel: vscode.OutputChannel
        functionNode: LambdaFunctionNode
        source?: string
    }
) {
    const inputs = await getSampleLambdaPayloads()
    const resource: LambdaFunctionNode = params.functionNode
    const source: string = params.source || 'AwsExplorerRemoteInvoke'
    const client = getLambdaClientWithAgent(resource.regionCode)

    const Panel = VueWebview.compilePanel(RemoteInvokeWebview)

    // Initialize support and debugging capabilities
    const runtime = resource.configuration.Runtime ?? 'unknown'
    const region = resource.regionCode
    const supportCodeDownload = RemoteDebugController.instance.supportCodeDownload(runtime)
    const runtimeSupportsRemoteDebug = RemoteDebugController.instance.supportRuntimeRemoteDebug(runtime)
    const remoteDebugLayer = RemoteDebugController.instance.getRemoteDebugLayer(
        region,
        resource.configuration.Architectures
    )

    const wv = new Panel(context.extensionContext, context.outputChannel, client, {
        FunctionName: resource.configuration.FunctionName ?? '',
        FunctionArn: resource.configuration.FunctionArn ?? '',
        FunctionRegion: resource.regionCode,
        InputSamples: inputs,
        TestEvents: [],
        Source: source,
        Runtime: runtime,
        LocalRootPath: params.functionNode.localDir,
        LambdaFunctionNode: params.functionNode,
        supportCodeDownload: supportCodeDownload,
        runtimeSupportsRemoteDebug: runtimeSupportsRemoteDebug,
        remoteDebugLayer: remoteDebugLayer,
    })
    // focus on first group so wv will show up in the side
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')

    const activePanel = await wv.show({
        title: localize('AWS.invokeLambda.title', 'Invoke Lambda {0}', resource.configuration.FunctionName),
        viewColumn: vscode.ViewColumn.Beside,
    })

    activePanel.onDidDispose(async () => {
        await wv.server.disposeServer()
    })
}
