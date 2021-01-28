/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { chmod, ensureDir, writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import {
    DotNetCoreDebugConfiguration,
    DOTNET_CORE_DEBUGGER_PATH,
    getCodeRoot,
    isImageLambdaConfig,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../../shared/utilities/pathUtils'
import { ExtContext } from '../../extensions'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeInputTemplate, waitForPort } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { ChildProcess } from '../../utilities/childProcess'
import { HttpResourceFetcher } from '../../resourcefetcher/httpResourceFetcher'
import { ext } from '../../extensionGlobals'
import { getLogger } from '../../logger'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makeCsharpConfig(config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }
    config.codeRoot = getCodeRoot(config.workspaceFolder, config)!
    config.templatePath = await makeInputTemplate(config)
    // TODO: avoid the reassignment
    // TODO: walk the tree to find .sln, .csproj ?
    const originalCodeRoot = config.codeRoot
    config.codeRoot = getSamProjectDirPathForFile(config.templatePath)

    config = {
        ...config,
        type: 'coreclr',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.DotNetCore,
    }

    if (!config.noDebug) {
        config = await makeCoreCLRDebugConfiguration(config, originalCodeRoot)
    }

    return config
}

/**
 * Launches and attaches debugger to a SAM dotnet (csharp) project.
 *
 * We spin up a C# Lambda Docker container, download and build the debugger for
 * Linux, then mount it with the SAM app on run. User's C# workspace dir will
 * have a `.vsdbg` dir after the first run.
 */
export async function invokeCsharpLambda(ctx: ExtContext, config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([WAIT_FOR_DEBUGGER_MESSAGES.DOTNET])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForPort
    return await invokeLambdaFunction(ctx, config, async () => {
        if (!config.noDebug) {
            await _installDebugger({
                debuggerPath: config.debuggerPath!!,
            })
        }
    })
}

interface InstallDebuggerArgs {
    debuggerPath: string
}

function getDebuggerPath(parentFolder: string): string {
    return path.resolve(parentFolder, '.vsdbg')
}

async function _installDebugger({ debuggerPath }: InstallDebuggerArgs): Promise<void> {
    await ensureDir(debuggerPath)

    try {
        getLogger('channel').info(
            localize(
                'AWS.samcli.local.invoke.debugger.install',
                'Installing .NET Core Debugger to {0}...',
                debuggerPath
            )
        )

        const vsDbgVersion = 'latest'
        const vsDbgRuntime = 'linux-x64'

        const installScriptPath = await downloadInstallScript(debuggerPath)

        let installCommand: string
        let installArgs: string[]
        if (os.platform() == 'win32') {
            const windir = process.env['WINDIR']
            if (!windir) {
                throw new Error('Environment variable `WINDIR` not defined')
            }

            installCommand = `${windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
            installArgs = [
                '-NonInteractive',
                '-NoProfile',
                '-WindowStyle',
                'Hidden',
                '-ExecutionPolicy',
                'RemoteSigned',
                '-File',
                installScriptPath,
                '-Version',
                vsDbgVersion,
                '-RuntimeID',
                vsDbgRuntime,
                '-InstallPath',
                debuggerPath,
            ]
        } else {
            installCommand = installScriptPath
            installArgs = ['-v', vsDbgVersion, '-r', vsDbgRuntime, '-l', debuggerPath]
        }

        const childProcess = new ChildProcess(installCommand, {}, ...installArgs)

        const installPromise = new Promise<void>(async (resolve, reject) => {
            await childProcess.start({
                onStdout: (text: string) => {
                    ext.outputChannel.append(text)
                },
                onStderr: (text: string) => {
                    ext.outputChannel.append(text)
                },
                onClose(code: number) {
                    if (code) {
                        reject(`command failed (exit code: ${code}): ${installCommand}`)
                    } else {
                        resolve()
                    }
                },
            })
        })

        await installPromise
    } catch (err) {
        getLogger('channel').info(
            localize(
                'AWS.samcli.local.invoke.debugger.install.failed',
                'Error installing .NET Core Debugger: {0}',
                err instanceof Error ? (err as Error).message : String(err)
            )
        )

        throw err
    }
}

async function downloadInstallScript(debuggerPath: string): Promise<string> {
    let installScriptUrl: string
    let installScriptPath: string
    if (os.platform() == 'win32') {
        installScriptUrl = 'https://aka.ms/getvsdbgps1'
        installScriptPath = path.join(debuggerPath, 'installVsdbgScript.ps1')
    } else {
        installScriptUrl = 'https://aka.ms/getvsdbgsh'
        installScriptPath = path.join(debuggerPath, 'installVsdbgScript.sh')
    }

    const installScriptFetcher = new HttpResourceFetcher(installScriptUrl, { showUrl: true })
    const installScript = await installScriptFetcher.get()
    if (!installScript) {
        throw Error(`Failed to download ${installScriptUrl}`)
    }

    await writeFile(installScriptPath, installScript, 'utf8')
    await chmod(installScriptPath, 0o700)

    return installScriptPath
}

function getSamProjectDirPathForFile(filepath: string): string {
    return pathutil.normalize(path.dirname(filepath))
}

/**
 * Creates a CLR launch-config composed with the given `config`.
 */
export async function makeCoreCLRDebugConfiguration(
    config: SamLaunchRequestArgs,
    codeUri: string
): Promise<DotNetCoreDebugConfiguration> {
    if (config.noDebug) {
        throw Error(`SAM debug: invalid config ${config}`)
    }
    const pipeArgs = ['-c', `docker exec -i $(docker ps -q -f publish=${config.debugPort}) \${debuggerCommand}`]
    config.debuggerPath = pathutil.normalize(getDebuggerPath(codeUri))
    await ensureDir(config.debuggerPath)

    const isImageLambda = isImageLambdaConfig(config)

    if (isImageLambda && !config.noDebug) {
        config.containerEnvVars = {
            _AWS_LAMBDA_DOTNET_DEBUGGING: '1',
        }
    }

    if (os.platform() === 'win32') {
        // Coerce drive letter to uppercase. While Windows is case-insensitive, sourceFileMap is case-sensitive.
        codeUri = codeUri.replace(pathutil.DRIVE_LETTER_REGEX, match => match.toUpperCase())
    }

    if (isImageLambda) {
        // default build path, in dotnet image-based templates
        // Not needed for ZIP lambdas, because SAM prevents dotnet from being
        // built in-container thus PDBs already point to the user workspace.
        if (!config.sourceFileMap) {
            config.sourceFileMap = {}
        }
        config.sourceFileMap['/build'] = codeUri
    }

    if (config.lambda?.pathMappings !== undefined) {
        if (!config.sourceFileMap) {
            config.sourceFileMap = {}
        }
        // we could safely leave this entry in, but might as well give the user full control if they're specifying mappings
        delete config.sourceFileMap['/build']
        config.lambda.pathMappings.forEach(mapping => {
            // this looks weird because we're mapping the PDB path to the local workspace
            config.sourceFileMap[mapping.remoteRoot] = mapping.localRoot
        })
    }

    return {
        ...config,
        runtimeFamily: RuntimeFamily.DotNetCore,
        request: 'attach',
        // Since SAM CLI 1.0 we cannot assume PID=1. So use processName=dotnet
        // instead of processId=1.
        processName: 'dotnet',
        pipeTransport: {
            pipeProgram: 'sh',
            pipeArgs,
            debuggerPath: DOTNET_CORE_DEBUGGER_PATH,
            pipeCwd: codeUri,
        },
        windows: {
            pipeTransport: {
                pipeProgram: 'powershell',
                pipeArgs,
                debuggerPath: DOTNET_CORE_DEBUGGER_PATH,
                pipeCwd: codeUri,
            },
        },
    }
}
