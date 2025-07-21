/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import globals from '../../shared/extensionGlobals'
import { Lambda } from 'aws-sdk'
import { getRegionFromArn, isTunnelInfo, LdkClient } from './ldkClient'
import { getFamily, mapFamilyToDebugType } from '../models/samLambdaRuntime'
import { findJavaPath } from '../../shared/utilities/pathFind'
import { ToolkitError } from '../../shared/errors'
import { showConfirmationMessage, showMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'
import * as nls from 'vscode-nls'
import { getRemoteDebugLayer } from './ldkLayers'
import path from 'path'
import { glob } from 'glob'
import { Commands } from '../../shared/vscode/commands2'

const localize = nls.loadMessageBundle()
const logger = getLogger()
export const remoteDebugContextString = 'aws.lambda.remoteDebugContext'
export const remoteDebugSnapshotString = 'aws.lambda.remoteDebugSnapshot'

// Map debug types to their corresponding VS Code extension IDs
const mapDebugTypeToExtensionId = new Map<string, string[]>([
    ['python', ['ms-python.python']],
    ['java', ['redhat.java', 'vscjava.vscode-java-debug']],
    ['node', ['ms-vscode.js-debug']],
])

const mapExtensionToBackup = new Map<string, string>([['ms-vscode.js-debug', 'ms-vscode.js-debug-nightly']])

export interface DebugConfig {
    functionArn: string
    functionName: string
    port: number
    localRoot: string
    remoteRoot: string
    skipFiles: string[]
    shouldPublishVersion: boolean
    lambdaRuntime?: string // Lambda runtime (e.g., nodejs18.x)
    debuggerRuntime?: string // VS Code debugger runtime (e.g., node)
    outFiles?: string[]
    sourceMap?: boolean
    justMyCode?: boolean
    projectName?: string
    otherDebugParams?: string
    lambdaTimeout?: number
    layerArn?: string
    handlerFile?: string
}

// Helper function to create a human-readable diff message
function createDiffMessage(
    config: Lambda.FunctionConfiguration,
    currentConfig: Lambda.FunctionConfiguration,
    isRevert: boolean = true
): string {
    let message = isRevert ? 'The following changes will be reverted:\n\n' : 'The following changes will be made:\n\n'

    message +=
        '1. Timeout: ' +
        (currentConfig.Timeout || 'default') +
        ' seconds → ' +
        (config.Timeout || 'default') +
        ' seconds\n'

    message += '2. Layers: '
    const hasLdkLayer = currentConfig.Layers?.some(
        (layer) => layer.Arn?.includes('LDKLayerX86') || layer.Arn?.includes('LDKLayerArm64')
    )

    message += hasLdkLayer ? 'Remove LDK layer\n' : 'No Change\n'

    message += '3. Environment Variables: Remove AWS_LAMBDA_EXEC_WRAPPER and AWS_LDK_DESTINATION_TOKEN\n'

    return message
}

/**
 * Attempts to revert an existing debug configuration if one exists
 * @returns true if revert was successful or no config exists, false if revert failed or user chose not to revert
 */
export async function revertExistingConfig(): Promise<boolean> {
    try {
        // Check if a debug context exists from a previous session
        const savedConfig = getLambdaSnapshot()

        if (!savedConfig) {
            // No existing config to revert
            return true
        }

        // clear the snapshot for it's corrupted
        if (!savedConfig.FunctionArn || !savedConfig.FunctionName) {
            logger.error('Function ARN or Function Name is missing, cannot revert')
            void (await persistLambdaSnapshot(undefined))
            return true
        }

        // compare with current config
        const currentConfig = await LdkClient.instance.getFunctionDetail(savedConfig.FunctionArn)
        // could be permission issues, or user has deleted previous function, we should remove the snapshot
        if (!currentConfig) {
            logger.error('Failed to get current function state, cannot revert')
            void (await persistLambdaSnapshot(undefined))
            return true
        }

        if (
            currentConfig?.Timeout === savedConfig?.Timeout &&
            currentConfig?.Layers?.length === savedConfig?.Layers?.length
        ) {
            // No changes needed, remove the snapshot
            void (await persistLambdaSnapshot(undefined))
            return true
        }

        // Create a diff message to show what will be changed
        const diffMessage = currentConfig
            ? createDiffMessage(savedConfig, currentConfig, true)
            : 'Failed to get current function state'

        const response = await showConfirmationMessage({
            prompt: localize(
                'AWS.lambda.remoteDebug.revertPreviousDeployment',
                'A previous debug deployment was detected for {0}. Would you like to revert those changes before proceeding?\n\n{1}',
                savedConfig.FunctionName,
                diffMessage
            ),
            confirm: localize('AWS.lambda.remoteDebug.revert', 'Revert'),
            cancel: localize('AWS.lambda.remoteDebug.dontShowAgain', "Don't show again"),
            type: 'warning',
        })

        if (!response) {
            // User chose not to revert, remove the snapshot
            void (await persistLambdaSnapshot(undefined))
            return true
        }

        await LdkClient.instance.removeDebugDeployment(savedConfig, false)
        await persistLambdaSnapshot(undefined)
        void showMessage(
            'info',
            localize(
                'AWS.lambda.remoteDebug.successfullyReverted',
                'Successfully reverted changes to {0}',
                savedConfig.FunctionName
            )
        )

        return true
    } catch (error) {
        throw ToolkitError.chain(error, `Error in revertExistingConfig`)
    }
}

export async function activateRemoteDebugging(): Promise<void> {
    try {
        globals.context.subscriptions.push(
            Commands.register('aws.lambda.remoteDebugging.clearSnapshot', async () => {
                void (await persistLambdaSnapshot(undefined))
            })
        )
    } catch (error) {
        logger.error(`Error in registering clearSnapshot command:${error}`)
    }

    try {
        logger.info('Remote debugging is initiated')

        // Use the revertExistingConfig function to handle any existing debug configurations
        await revertExistingConfig()

        // Initialize RemoteDebugController to ensure proper startup state
        RemoteDebugController.instance.ensureCleanState()
    } catch (error) {
        // show warning
        void vscode.window.showWarningMessage(`Error in activateRemoteDebugging: ${error}`)
        logger.error(`Error in activateRemoteDebugging:${error}`)
    }
}

// this should be called when the debug session is started
async function persistLambdaSnapshot(config: Lambda.FunctionConfiguration | undefined): Promise<void> {
    try {
        await globals.globalState.update(remoteDebugSnapshotString, config)
    } catch (error) {
        // TODO raise toolkit error
        logger.error(`Error persisting debug sessions:${error}`)
    }
}

export function getLambdaSnapshot(): Lambda.FunctionConfiguration | undefined {
    return globals.globalState.get<Lambda.FunctionConfiguration>(remoteDebugSnapshotString)
}

/**
 * Helper function to check if a string is a valid VSCode glob pattern
 */
function isVscodeGlob(pattern: string): boolean {
    // Check for common glob patterns: *, **, ?, [], {}
    return /[*?[\]{}]/.test(pattern)
}

/**
 * Helper function to validate source map files exist for given outFiles patterns
 */
async function validateSourceMapFiles(outFiles: string[]): Promise<boolean> {
    const allAreGlobs = outFiles.every((pattern) => isVscodeGlob(pattern))
    if (!allAreGlobs) {
        return false
    }

    try {
        let jsfileCount = 0
        let mapfileCount = 0
        const jsFiles = await glob(outFiles, { ignore: 'node_modules/**' })

        for (const file of jsFiles) {
            if (file.includes('js')) {
                jsfileCount += 1
            }
            if (file.includes('.map')) {
                mapfileCount += 1
            }
        }

        return jsfileCount === 0 || mapfileCount === 0 ? false : true
    } catch (error) {
        getLogger().warn(`Error validating source map files: ${error}`)
        return false
    }
}

function processOutFiles(outFiles: string[], localRoot: string): string[] {
    const processedOutFiles: string[] = []

    for (let outFile of outFiles) {
        if (!outFile.includes('*')) {
            // add * in the end
            outFile = path.join(outFile, '*')
        }
        if (!path.isAbsolute(outFile)) {
            // Find which workspace contains the localRoot path
            const workspaceFolders = vscode.workspace.workspaceFolders
            if (workspaceFolders) {
                let matchingWorkspace: vscode.WorkspaceFolder | undefined

                // Check if localRoot is within any workspace
                for (const workspace of workspaceFolders) {
                    const absoluteLocalRoot = path.resolve(localRoot)
                    const workspacePath = workspace.uri.fsPath

                    if (absoluteLocalRoot.startsWith(workspacePath)) {
                        matchingWorkspace = workspace
                        break
                    }
                }

                if (matchingWorkspace) {
                    // Join workspace folder with the relative outFile path
                    processedOutFiles.push(path.join(matchingWorkspace.uri.fsPath, outFile))
                } else {
                    // If no matching workspace found, use the original outFile
                    processedOutFiles.push(outFile)
                }
            } else {
                // No workspace folders, use the original outFile
                processedOutFiles.push(outFile)
            }
        } else {
            // Already absolute path, use as is
            processedOutFiles.push(outFile)
        }
    }
    return processedOutFiles
}

async function getVscodeDebugConfig(
    functionConfig: Lambda.FunctionConfiguration,
    debugConfig: DebugConfig
): Promise<vscode.DebugConfiguration> {
    // Parse and validate otherDebugParams if provided
    let additionalParams: Record<string, any> = {}
    if (debugConfig.otherDebugParams) {
        try {
            const parsed = JSON.parse(debugConfig.otherDebugParams)
            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                additionalParams = parsed
                getLogger().info('Additional debug parameters parsed successfully: %O ', additionalParams)
            } else {
                void vscode.window.showWarningMessage(
                    localize(
                        'AWS.lambda.remoteDebug.invalidDebugParams',
                        'Other Debug Parameters must be a valid JSON object. The parameter will be ignored.'
                    )
                )
                getLogger().warn(`Invalid otherDebugParams format: expected object, got ${typeof parsed}`)
            }
        } catch (error) {
            void vscode.window.showWarningMessage(
                localize(
                    'AWS.lambda.remoteDebug.failedToParseDebugParams',
                    'Failed to parse Other Debug Parameters as JSON: {0}. The parameter will be ignored.',
                    error instanceof Error ? error.message : 'Invalid JSON'
                )
            )
            getLogger().warn(`Failed to parse otherDebugParams as JSON: ${error}`)
        }
    }

    const debugSessionName = `Debug ${functionConfig.FunctionArn!.split(':').pop()}`

    // Define debugConfig before the try block
    const debugType = mapFamilyToDebugType.get(getFamily(functionConfig.Runtime ?? ''), 'unknown')
    let vsCodeDebugConfig: vscode.DebugConfiguration
    switch (debugType) {
        case 'node':
            // source map support
            if (debugConfig.sourceMap && debugConfig.outFiles) {
                // process outFiles first, if they are relative path (not starting with /),
                // check local root path is located in which workspace. Then join workspace Folder with outFiles

                // Update debugConfig with processed outFiles
                debugConfig.outFiles = processOutFiles(debugConfig.outFiles, debugConfig.localRoot)

                // Use glob to search if there are any matching js file or source map file
                const hasSourceMaps = await validateSourceMapFiles(debugConfig.outFiles)

                if (hasSourceMaps) {
                    // support mapping common sam cli location
                    additionalParams['sourceMapPathOverrides'] = {
                        ...additionalParams['sourceMapPathOverrides'],
                        '?:*/T/?:*/*': path.join(debugConfig.localRoot, '*'),
                    }
                    debugConfig.localRoot = debugConfig.outFiles[0].split('*')[0]
                } else {
                    debugConfig.sourceMap = false
                    debugConfig.outFiles = undefined
                    await showMessage(
                        'warn',
                        localize(
                            'AWS.lambda.remoteDebug.outFileNotFound',
                            'outFiles not valid or no js and map file found in outFiles, debug will continue without sourceMap support'
                        )
                    )
                }
            }
            vsCodeDebugConfig = {
                type: debugType,
                request: 'attach',
                name: debugSessionName,
                address: 'localhost',
                port: debugConfig.port,
                localRoot: debugConfig.localRoot,
                remoteRoot: debugConfig.remoteRoot,
                skipFiles: debugConfig.skipFiles,
                sourceMaps: debugConfig.sourceMap,
                outFiles: debugConfig.outFiles,
                continueOnAttach: debugConfig.outFiles ? false : true,
                stopOnEntry: false,
                timeout: 60000,
                ...additionalParams, // Merge additional debug parameters
            }
            break
        case 'python':
            vsCodeDebugConfig = {
                type: debugType,
                request: 'attach',
                name: debugSessionName,
                port: debugConfig.port,
                cwd: debugConfig.localRoot,
                pathMappings: [
                    {
                        localRoot: debugConfig.localRoot,
                        remoteRoot: debugConfig.remoteRoot,
                    },
                ],
                justMyCode: debugConfig.justMyCode ?? true,
                ...additionalParams, // Merge additional debug parameters
            }
            break
        case 'java':
            vsCodeDebugConfig = {
                type: debugType,
                request: 'attach',
                name: debugSessionName,
                hostName: 'localhost',
                port: debugConfig.port,
                sourcePaths: [debugConfig.localRoot],
                projectName: debugConfig.projectName,
                timeout: 60000,
                ...additionalParams, // Merge additional debug parameters
            }
            break
        default:
            throw new ToolkitError(`Unsupported debug type: ${debugType}`)
    }
    getLogger().info('VS Code debug configuration: %O', vsCodeDebugConfig)
    return vsCodeDebugConfig
}

export class RemoteDebugController {
    static #instance: RemoteDebugController
    isDebugging: boolean = false
    qualifier: string | undefined = undefined
    private lastDebugStartTime: number = 0
    // private debugSession: DebugSession | undefined
    private debugSessionDisposables: Map<string, vscode.Disposable> = new Map()

    public static get instance() {
        if (this.#instance !== undefined) {
            return this.#instance
        }

        const self = (this.#instance = new this())
        return self
    }

    constructor() {}

    /**
     * Ensures the controller is in a clean state at startup or before a new operation
     */
    public ensureCleanState(): void {
        this.isDebugging = false
        this.qualifier = undefined

        // Clean up any leftover disposables
        for (const [key, disposable] of this.debugSessionDisposables.entries()) {
            try {
                disposable.dispose()
            } catch (e) {
                // Ignore errors during startup cleanup
            }
            this.debugSessionDisposables.delete(key)
        }
    }

    public supportCodeDownload(runtime: string | undefined): boolean {
        if (!runtime) {
            return false
        }
        try {
            return ['node', 'python'].includes(mapFamilyToDebugType.get(getFamily(runtime)) ?? '')
        } catch {
            // deprecated runtime
            return false
        }
    }

    public supportRuntimeRemoteDebug(runtime: string | undefined): boolean {
        if (!runtime) {
            return false
        }
        try {
            return ['node', 'python', 'java'].includes(mapFamilyToDebugType.get(getFamily(runtime)) ?? '')
        } catch {
            return false
        }
    }

    public getRemoteDebugLayer(
        region: string | undefined,
        architectures: Lambda.ArchitecturesList | undefined
    ): string | undefined {
        if (!region || !architectures) {
            return undefined
        }
        if (architectures.includes('x86_64')) {
            return getRemoteDebugLayer(region, 'x86_64')
        }
        if (architectures.includes('arm64')) {
            return getRemoteDebugLayer(region, 'arm64')
        }
        return undefined
    }

    public async installDebugExtension(runtime: string | undefined): Promise<boolean | undefined> {
        if (!runtime) {
            throw new ToolkitError('Runtime is undefined')
        }

        const debugType = mapFamilyToDebugType.get(getFamily(runtime))
        if (!debugType) {
            throw new ToolkitError(`Debug type is undefined for runtime ${runtime}`)
        }
        // Install needed debug extension based on runtime
        const extensions = mapDebugTypeToExtensionId.get(debugType)
        if (extensions) {
            for (const extension of extensions) {
                const extensionObj = vscode.extensions.getExtension(extension)
                const backupExtensionObj = vscode.extensions.getExtension(mapExtensionToBackup.get(extension) ?? '')

                if (!extensionObj && !backupExtensionObj) {
                    // Extension is not installed, install it
                    const choice = await showConfirmationMessage({
                        prompt: localize(
                            'AWS.lambda.remoteDebug.extensionNotInstalled',
                            'You need to install the {0} extension to debug {1} functions. Would you like to install it now?',
                            extension,
                            debugType
                        ),
                        confirm: localize('AWS.lambda.remoteDebug.install', 'Install'),
                        cancel: localize('AWS.lambda.remoteDebug.cancel', 'Cancel'),
                        type: 'warning',
                    })
                    if (!choice) {
                        return false
                    }
                    await vscode.commands.executeCommand('workbench.extensions.installExtension', extension)
                    if (vscode.extensions.getExtension(extension) === undefined) {
                        return false
                    }
                }
            }
        }

        if (debugType === 'java' && !(await findJavaPath())) {
            // jvm not available
            const choice = await showConfirmationMessage({
                prompt: localize(
                    'AWS.lambda.remoteDebug.jvmNotInstalled',
                    'You need to install a JVM to debug Java functions. Would you like to install it now?'
                ),
                confirm: localize('AWS.lambda.remoteDebug.install', 'Install'),
                cancel: localize('AWS.lambda.remoteDebug.continueAnyway', 'Continue Anyway'),
                type: 'warning',
            })
            // open https://developers.redhat.com/products/openjdk/download
            if (choice) {
                await vscode.env.openExternal(
                    vscode.Uri.parse('https://developers.redhat.com/products/openjdk/download')
                )
                return false
            }
        }
        // passed all checks
        return true
    }

    public async startDebugging(functionArn: string, runtime: string, debugConfig: DebugConfig): Promise<void> {
        if (this.isDebugging) {
            getLogger().error('Debug already in progress, remove debug setup to restart')
            return
        }

        await telemetry.lambda_remoteDebugStart.run(async (span) => {
            // Create a copy of debugConfig without functionName and functionArn for telemetry
            const debugConfigForTelemetry: Partial<DebugConfig> = { ...debugConfig }
            debugConfigForTelemetry.functionName = undefined
            debugConfigForTelemetry.functionArn = undefined
            debugConfigForTelemetry.localRoot = undefined

            span.record({
                source: 'remoteDebug',
                passive: false,
                action: JSON.stringify(debugConfigForTelemetry),
            })
            this.lastDebugStartTime = Date.now()
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Setting up debug session',
                    cancellable: false,
                },
                async (progress) => {
                    // Reset state before starting
                    this.ensureCleanState()

                    getLogger().info(`Starting debugger for ${functionArn}`)

                    const region = getRegionFromArn(functionArn)
                    if (!region) {
                        throw new ToolkitError('Could not determine region from Lambda ARN')
                    }

                    // Check if runtime / region is supported for remote debugging
                    if (!this.supportRuntimeRemoteDebug(runtime)) {
                        throw new ToolkitError(
                            `Runtime ${runtime} is not supported for remote debugging. ` +
                                `Only Python, Node.js, and Java runtimes are supported.`
                        )
                    }

                    // Check if a snapshot already exists and revert if needed
                    // Use the revertExistingConfig function from ldkController
                    progress.report({ message: 'Checking if snapshot exists...' })
                    const revertResult = await revertExistingConfig()

                    // If revert failed and user didn't choose to ignore, abort the deployment
                    if (revertResult === false) {
                        return
                    }
                    try {
                        // Anything fails before this point doesn't requires reverting
                        this.isDebugging = true

                        // the following will contain changes that requires reverting.
                        // Create a snapshot of lambda config before debug
                        // let's preserve this config to a global variable at here
                        // we will use this config to revert the changes back to it once was, once confirm it's success, update the global to undefined
                        // if somehow the changes failed to revert, in init phase(activate remote debugging), we will detect this config and prompt user to revert the changes
                        const ldkClient = LdkClient.instance
                        // get function config again in case anything changed
                        const functionConfig = await LdkClient.instance.getFunctionDetail(functionArn)
                        if (!functionConfig?.Runtime || !functionConfig?.FunctionArn) {
                            throw new ToolkitError('Could not retrieve Lambda function configuration')
                        }
                        await persistLambdaSnapshot(functionConfig)

                        // Record runtime in telemetry
                        span.record({
                            runtimeString: functionConfig.Runtime as any,
                        })

                        // Create or reuse tunnel
                        progress.report({ message: 'Creating secure tunnel...' })
                        getLogger().info('Creating secure tunnel...')
                        const tunnelInfo = await ldkClient.createOrReuseTunnel(region)
                        if (!tunnelInfo) {
                            throw new ToolkitError(`Empty tunnel info response, please retry:${tunnelInfo}`)
                        }

                        if (!isTunnelInfo(tunnelInfo)) {
                            throw new ToolkitError(`Invalid tunnel info response:${tunnelInfo}`)
                        }
                        // start update lambda funcion, await in the end
                        // Create debug deployment
                        progress.report({ message: 'Configuring Lambda function for debugging...' })
                        getLogger().info('Configuring Lambda function for debugging...')

                        const layerArn =
                            debugConfig.layerArn ?? this.getRemoteDebugLayer(region, functionConfig.Architectures)
                        if (!layerArn) {
                            throw new ToolkitError(`No Layer Arn is provided`)
                        }
                        // start this request and await in the end
                        const debugDeployPromise = ldkClient.createDebugDeployment(
                            functionConfig,
                            tunnelInfo.destinationToken,
                            debugConfig.lambdaTimeout ?? 900,
                            debugConfig.shouldPublishVersion,
                            layerArn,
                            progress
                        )

                        const vscodeDebugConfig = await getVscodeDebugConfig(functionConfig, debugConfig)
                        // show every field in debugConfig
                        // getLogger().info(`Debug configuration created successfully ${JSON.stringify(debugConfig)}`)

                        // Start local proxy with timeout and better error handling
                        progress.report({ message: 'Starting local proxy...' })

                        const proxyStartTimeout = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('Local proxy start timed out')), 30000)
                        })

                        const proxyStartAttempt = ldkClient.startProxy(region, tunnelInfo.sourceToken, debugConfig.port)

                        const proxyStarted = await Promise.race([proxyStartAttempt, proxyStartTimeout])

                        if (!proxyStarted) {
                            throw new ToolkitError('Failed to start local proxy')
                        }
                        getLogger().info('Local proxy started successfully')
                        progress.report({ message: 'Starting debugger...' })
                        // Start debugging in a non-blocking way
                        void Promise.resolve(vscode.debug.startDebugging(undefined, vscodeDebugConfig)).then(
                            async (debugStarted) => {
                                if (!debugStarted) {
                                    // this could be triggered by another stop debugging, let's check state before stopping.
                                    throw new ToolkitError('Failed to start debug session')
                                }
                            }
                        )

                        const debugSessionEndDisposable = vscode.debug.onDidTerminateDebugSession(async (session) => {
                            if (session.name === vscodeDebugConfig.name) {
                                void (await this.stopDebugging())
                            }
                        })

                        // wait until lambda function update is completed
                        progress.report({ message: 'Waiting for function update...' })
                        const qualifier = await debugDeployPromise
                        if (!qualifier || qualifier === 'Failed') {
                            throw new ToolkitError('Failed to configure Lambda function for debugging')
                        }
                        // store the published version for debugging in version
                        if (debugConfig.shouldPublishVersion) {
                            // we already reverted
                            this.qualifier = qualifier
                        }

                        // Store the disposable
                        this.debugSessionDisposables.set(functionConfig.FunctionArn, debugSessionEndDisposable)
                        progress.report({
                            message: `Debug session setup completed for ${functionConfig.FunctionArn.split(':').pop()}`,
                        })
                    } catch (error) {
                        try {
                            await this.stopDebugging()
                        } catch (errStop) {
                            getLogger().error(
                                'encountered following error when stoping debug for failed debug session:'
                            )
                            getLogger().error(errStop as Error)
                        }

                        throw ToolkitError.chain(error, 'Error StartDebugging')
                    }
                }
            )
        })
    }

    public async stopDebugging(): Promise<void> {
        await telemetry.lambda_remoteDebugStop.run(async (span) => {
            if (!this.isDebugging) {
                void showMessage(
                    'info',
                    localize('AWS.lambda.remoteDebug.debugNotInProgress', 'Debug is not in progress')
                )
                return
            }
            span.record({ sessionDuration: this.lastDebugStartTime === 0 ? 0 : Date.now() - this.lastDebugStartTime })
            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Stopping debug session',
                        cancellable: false,
                    },
                    async (progress) => {
                        progress.report({ message: 'Stopping debugging...' })
                        const ldkClient = LdkClient.instance

                        // First attempt to clean up resources from Lambda
                        const savedConfig = getLambdaSnapshot()
                        if (!savedConfig?.FunctionArn) {
                            getLogger().error('No saved configuration found during cleanup')
                            throw new ToolkitError('No saved configuration found during cleanup')
                        }

                        const disposable = this.debugSessionDisposables.get(savedConfig.FunctionArn)
                        if (disposable) {
                            disposable.dispose()
                            this.debugSessionDisposables.delete(savedConfig.FunctionArn)
                        }
                        getLogger().info(`Removing debug deployment for function: ${savedConfig.FunctionName}`)

                        await vscode.commands.executeCommand('workbench.action.debug.stop')
                        // Then stop the proxy (with more reliable error handling)
                        getLogger().info('Stopping proxy during cleanup')
                        await ldkClient.stopProxy()
                        // Ensure our resources are properly cleaned up
                        if (this.qualifier) {
                            await ldkClient.deleteDebugVersion(savedConfig.FunctionArn, this.qualifier)
                        }
                        if (await ldkClient.removeDebugDeployment(savedConfig, true)) {
                            await persistLambdaSnapshot(undefined)
                        }

                        progress.report({ message: `Debug session stopped` })
                    }
                )
                void showMessage(
                    'info',
                    localize('AWS.lambda.remoteDebug.debugSessionStopped', 'Debug session stopped')
                )
            } catch (error) {
                throw ToolkitError.chain(error, 'error when stopping remote debug')
            } finally {
                this.isDebugging = false
            }
        })
    }
}
