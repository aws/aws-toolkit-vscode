/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    PythonDebugConfiguration,
    PythonCloud9DebugConfiguration,
    PythonPathMapping,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { PythonDebugAdapterHeartbeat } from '../../debug/pythonDebugAdapterHeartbeat'
import { ExtContext, VSCODE_EXTENSION_ID } from '../../extensions'
import { fileExists, readFileAsString } from '../../filesystemUtilities'
import { getLogger } from '../../logger'
import * as pathutil from '../../utilities/pathUtils'
import { getLocalRootVariants } from '../../utilities/pathUtils'
import { Timeout } from '../../utilities/timeoutUtils'
import { ChannelLogger } from '../../utilities/vsCodeUtils'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeInputTemplate } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { ext } from '../../extensionGlobals'
import { getWorkspaceRelativePath } from '../../utilities/workspaceUtils'

const PYTHON_DEBUG_ADAPTER_RETRY_DELAY_MS = 1000

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    return path.dirname(filepath)
}

// Add create debugging manifest/requirements.txt containing ptvsd
async function makePythonDebugManifest(params: {
    samProjectCodeRoot: string
    outputDir: string
    useIkpdb: boolean
}): Promise<string | undefined> {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    if (await fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug(`pythonCodeLensProvider.makePythonDebugManifest params: ${JSON.stringify(params, undefined, 2)}`)
    // TODO: If another module name includes the string "ikp3db", this will be skipped...
    // HACK: Cloud9-created Lambdas hardcode ikp3db 1.1.4, which only functions with Python 3.6 (which we don't support)
    //       Remove any ikp3db dependency if it exists and manually add a non-pinned ikp3db dependency.
    if (params.useIkpdb) {
        manifestText = manifestText.replace(/[ \t]*ikp3db\b[^\r\n]*/, '')
        manifestText += `${os.EOL}ikp3db`
        const debugManifestPath = path.join(params.outputDir, 'debug-requirements.txt')
        await writeFile(debugManifestPath, manifestText)
        return debugManifestPath
    }

    // TODO: If another module name includes the string "ptvsd", this will be skipped...
    if (!params.useIkpdb && !manifestText.includes('ptvsd')) {
        manifestText += `${os.EOL}ptvsd>4.2,<5`
        const debugManifestPath = path.join(params.outputDir, 'debug-requirements.txt')
        await writeFile(debugManifestPath, manifestText)

        return debugManifestPath
    }
    // else we don't need to override the manifest. nothing to return
}

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makePythonDebugConfig(
    config: SamLaunchRequestArgs
): Promise<PythonDebugConfiguration | PythonCloud9DebugConfiguration> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }
    if (!config.codeRoot) {
        // Last-resort attempt to discover the project root (when there is no
        // `launch.json` nor `template.yaml`).
        config.codeRoot = await getSamProjectDirPathForFile(config?.templatePath ?? config.documentUri!!.fsPath)
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    config.codeRoot = pathutil.normalize(config.codeRoot)

    let manifestPath: string | undefined
    if (!config.noDebug) {
        if (!config.useIkpdb) {
            // Mounted in the Docker container as: /tmp/lambci_debug_files
            config.debuggerPath = ext.context.asAbsolutePath(path.join('resources', 'debugger'))
            // NOTE: SAM CLI splits on each *single* space in `--debug-args`!
            //       Extra spaces will be passed as spurious "empty" arguments :(
            config.debugArgs = [
                `/tmp/lambci_debug_files/py_debug_wrapper.py --host 0.0.0.0 --port ${config.debugPort} --wait`,
            ]
        } else {
            // -ikpdb-log:  https://ikpdb.readthedocs.io/en/1.x/api.html?highlight=log#ikpdb.IKPdbLogger
            //    n,N: Network  (noisy)
            //    b,B: Breakpoints
            //    e,E: Expression evaluation
            //    x,X: Execution
            //    f,F: Frame
            //    p,P: Path manipulation
            //    g,G: Global debugger
            //
            // Level "G" is not too noisy, and is required because it emits the
            // "IKP3db listening on" string (`WAIT_FOR_DEBUGGER_MESSAGES`).
            const logArg = getLogger().logLevelEnabled('debug') ? '--ikpdb-log=BEXFPG' : '--ikpdb-log=G'
            const ccwd = pathutil.normalize(
                getWorkspaceRelativePath(config.codeRoot, { workspaceFolders: [config.workspaceFolder] }) ?? 'error'
            )

            // NOTE: SAM CLI splits on each *single* space in `--debug-args`!
            //       Extra spaces will be passed as spurious "empty" arguments :(
            //
            // -u: (python arg) unbuffered binary stdout/stderr
            //
            // -ik_ccwd: Must be relative to /var/task, because ikpdb tries to
            //           resolve filepaths in the Docker container and produces
            //           nonsense as a "fallback". See `ikp3db.py:normalize_path_in()`:
            //           https://github.com/cmorisse/ikp3db/blob/eda176a1d4e0b1167466705a26ae4dd5c4188d36/ikp3db.py#L659
            // --ikpdb-protocol=vscode:
            //           For https://github.com/cmorisse/vscode-ikp3db
            //           Requires ikp3db 1.5 (unreleased): https://github.com/cmorisse/ikp3db/pull/12
            config.debugArgs = [
                `-m ikp3db --ikpdb-address=0.0.0.0 --ikpdb-port=${config.debugPort} -ik_ccwd=${ccwd} -ik_cwd=/var/task ${logArg}`,
            ]
        }

        manifestPath = await makePythonDebugManifest({
            samProjectCodeRoot: config.codeRoot,
            outputDir: config.baseBuildDir,
            useIkpdb: !!config.useIkpdb,
        })
    }

    config.templatePath = await makeInputTemplate(config)
    const pathMappings: PythonPathMapping[] = getLocalRootVariants(config.codeRoot).map<PythonPathMapping>(variant => {
        return {
            localRoot: variant,
            remoteRoot: '/var/task',
        }
    })

    if (config.useIkpdb) {
        // Documentation:
        // https://github.com/cmorisse/vscode-ikp3db/blob/master/documentation/debug_configurations_reference.md
        return {
            ...config,
            type: 'ikp3db',
            request: config.noDebug ? 'launch' : 'attach',
            runtimeFamily: RuntimeFamily.Python,
            manifestPath: manifestPath,
            sam: {
                ...config.sam,
                // Needed to build ikp3db which has a C build step.
                // https://github.com/aws/aws-sam-cli/issues/1840
                containerBuild: true,
            },

            // cloud9 debugger fields:
            port: config.debugPort ?? -1,
            localRoot: config.codeRoot,
            remoteRoot: '/var/task',
            address: 'localhost',
        }
    }

    return {
        ...config,
        type: 'python',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.Python,

        //
        // Python-specific fields.
        //
        manifestPath: manifestPath,
        port: config.debugPort ?? -1,
        host: 'localhost',
        pathMappings,
        // Disable redirectOutput, we collect child process stdout/stderr and
        // explicitly write to Debug Console.
        redirectOutput: false,
    }
}

/**
 * Launches and attaches debugger to a SAM Python project.
 */
export async function invokePythonLambda(
    ctx: ExtContext,
    config: PythonDebugConfiguration
): Promise<PythonDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand(ctx.chanLogger, [
        WAIT_FOR_DEBUGGER_MESSAGES.PYTHON,
        WAIT_FOR_DEBUGGER_MESSAGES.PYTHON_IKPDB,
    ])
    // Must not used waitForPythonDebugAdapter() for ikpdb: the socket consumes
    // ikpdb's initial message and ikpdb does not have a --wait-for-client
    // mode, then cloud9 never sees the init message and waits forever.
    //
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = config.useIkpdb ? waitForIkpdb : waitForPythonDebugAdapter
    const c = (await invokeLambdaFunction(ctx, config, async () => {})) as PythonDebugConfiguration
    return c
}

async function waitForIkpdb(debugPort: number, timeout: Timeout, channelLogger: ChannelLogger) {
    // HACK:
    // - We cannot consumed the first message on the socket.
    // - We must wait for the debugger to be ready, else cloud9 startDebugging() waits forever.
    getLogger().info('waitForIkpdb: wait 2 seconds')
    await new Promise<void>(resolve => {
        setTimeout(resolve, 2000)
    })
}

async function waitForPythonDebugAdapter(debugPort: number, timeout: Timeout, channelLogger: ChannelLogger) {
    const logger = getLogger()

    logger.verbose(`Testing debug adapter connection on port ${debugPort}`)

    let debugServerAvailable: boolean = false

    while (!debugServerAvailable) {
        const tester = new PythonDebugAdapterHeartbeat(debugPort)

        try {
            if (await tester.connect()) {
                if (await tester.isDebugServerUp()) {
                    logger.verbose('Debug Adapter is available')
                    debugServerAvailable = true
                }
            }
        } catch (err) {
            logger.verbose('Error while testing: %O', err as Error)
        } finally {
            await tester.disconnect()
        }

        if (!debugServerAvailable) {
            if (timeout.remainingTime === 0) {
                break
            }

            logger.verbose('Debug Adapter not ready, retrying...')
            await new Promise<void>(resolve => {
                setTimeout(resolve, PYTHON_DEBUG_ADAPTER_RETRY_DELAY_MS)
            })
        }
    }

    if (!debugServerAvailable) {
        channelLogger.warn(
            'AWS.sam.local.invoke.python.server.not.available',
            'Unable to communicate with the Python Debug Adapter. The debugger might not succeed when attaching to your SAM Application.'
        )
    }
}

export async function activatePythonExtensionIfInstalled() {
    const extension = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.python)

    // If the extension is not installed, it is not a failure. There may be reduced functionality.
    if (extension && !extension.isActive) {
        getLogger().info('Python CodeLens Provider is activating the python extension')
        await extension.activate()
    }
}
