/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    isImageLambdaConfig,
    PythonDebugConfiguration,
    PythonCloud9DebugConfiguration,
    PythonPathMapping,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { ExtContext, VSCODE_EXTENSION_ID } from '../../extensions'
import { fileExists, readFileAsString } from '../../filesystemUtilities'
import { getLogger } from '../../logger'
import * as pathutil from '../../utilities/pathUtils'
import { getLocalRootVariants } from '../../utilities/pathUtils'
import { Timeout } from '../../utilities/timeoutUtils'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeInputTemplate } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { ext } from '../../extensionGlobals'
import { Runtime } from 'aws-sdk/clients/lambda'
import { getWorkspaceRelativePath } from '../../utilities/workspaceUtils'

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    return path.dirname(filepath)
}

// Add create debugging manifest/requirements.txt containing debugpy
async function makePythonDebugManifest(params: {
    isImageLambda: boolean
    samProjectCodeRoot: string
    outputDir: string
    useIkpdb: boolean
}): Promise<string | undefined> {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    // TODO: figure out how to get debugpy in the container without hacking the user's requirements
    const debugManifestPath = params.isImageLambda ? manfestPath : path.join(params.outputDir, 'debug-requirements.txt')
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
        await writeFile(debugManifestPath, manifestText)
        return debugManifestPath
    }

    // TODO: If another module name includes the string "ptvsd", this will be skipped...
    if (!params.useIkpdb && !manifestText.includes('debugpy')) {
        manifestText += `${os.EOL}debugpy>=1.0,<2`
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
        const isImageLambda = isImageLambdaConfig(config)

        if (!config.useIkpdb) {
            // Mounted in the Docker container as: /tmp/lambci_debug_files
            config.debuggerPath = ext.context.asAbsolutePath(path.join('resources', 'debugger'))
            // NOTE: SAM CLI splits on each *single* space in `--debug-args`!
            //       Extra spaces will be passed as spurious "empty" arguments :(
            const debugArgs = `/tmp/lambci_debug_files/py_debug_wrapper.py --listen 0.0.0.0:${config.debugPort} --wait-for-client`
            if (isImageLambda) {
                const params = getPythonExeAndBootstrap(config.runtime)
                config.debugArgs = [`${params.python} ${debugArgs} ${params.boostrap}`]
            } else {
                config.debugArgs = [debugArgs]
            }
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
            isImageLambda: isImageLambda,
            samProjectCodeRoot: config.codeRoot,
            outputDir: config.baseBuildDir,
            useIkpdb: !!config.useIkpdb,
        })
    }

    config.templatePath = await makeInputTemplate(config)

    let pathMappings: PythonPathMapping[]
    if (config.lambda?.pathMappings !== undefined) {
        pathMappings = config.lambda.pathMappings
    } else {
        pathMappings = getLocalRootVariants(config.codeRoot).map<PythonPathMapping>(variant => {
            return {
                localRoot: variant,
                remoteRoot: '/var/task',
            }
        })
    }

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
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([
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

async function waitForIkpdb(debugPort: number, timeout: Timeout) {
    // HACK:
    // - We cannot consumed the first message on the socket.
    // - We must wait for the debugger to be ready, else cloud9 startDebugging() waits forever.
    getLogger().info('waitForIkpdb: wait 2 seconds')
    await new Promise<void>(resolve => {
        setTimeout(resolve, 2000)
    })
}

export async function waitForPythonDebugAdapter(debugPort: number, timeout: Timeout) {
    await new Promise<void>(resolve => {
        setTimeout(resolve, 1000)
    })
}

export async function activatePythonExtensionIfInstalled() {
    const extension = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.python)

    // If the extension is not installed, it is not a failure. There may be reduced functionality.
    if (extension && !extension.isActive) {
        getLogger().info('Python CodeLens Provider is activating the python extension')
        await extension.activate()
    }
}

function getPythonExeAndBootstrap(runtime: Runtime) {
    // unfortunately new 'Image'-base images did not standardize the paths
    // https://github.com/aws/aws-sam-cli/blob/7d5101a8edeb575b6925f9adecf28f47793c403c/samcli/local/docker/lambda_debug_settings.py
    switch (runtime) {
        case 'python2.7':
            return { python: '/usr/bin/python2.7', boostrap: '/var/runtime/awslambda/bootstrap.py' }
        case 'python3.6':
            return { python: '/var/lang/bin/python3.6', boostrap: '/var/runtime/awslambda/bootstrap.py' }
        case 'python3.7':
            return { python: '/var/lang/bin/python3.7', boostrap: '/var/runtime/bootstrap' }
        case 'python3.8':
            return { python: '/var/lang/bin/python3.8', boostrap: '/var/runtime/bootstrap.py' }
        default:
            throw new Error(`Python SAM debug logic ran for invalid Python runtime: ${runtime}`)
    }
}
