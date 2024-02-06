/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { chmod, ensureDir, writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import {
    DotNetDebugConfiguration,
    dotnetDebuggerPath,
    getCodeRoot,
    isImageLambdaConfig,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../../shared/utilities/pathUtils'
import { ExtContext } from '../../extensions'
import { DefaultSamLocalInvokeCommand, waitForDebuggerMessages } from '../cli/samCliLocalInvoke'
import { runLambdaFunction, waitForPort } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { ChildProcess } from '../../utilities/childProcess'
import { HttpResourceFetcher } from '../../resourcefetcher/httpResourceFetcher'
import { getLogger } from '../../logger'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import globals from '../../extensionGlobals'
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
    config.codeRoot = (await getCodeRoot(config.workspaceFolder, config))!
    // TODO: avoid the reassignment
    // TODO: walk the tree to find .sln, .csproj ?
    const originalCodeRoot = config.codeRoot
    config.codeRoot = getSamProjectDirPathForFile(config.templatePath)

    config = {
        ...config,
        // https://github.com/dotnet/vscode-csharp/blob/a270be4f2f1236d9bc1b31b6214f1672096788b7/src/lsptoolshost/debugger.ts#L45C1-L54
        // The "ms-dotnettools.csharp" extension declares:
        //  - "coreclr" as the debugger type for ".NET 5+ and .NET Core"
        //  - "dotnet" as the debugger type for "C#"
        // but haven't found the actual circumstances when "dotnet" works while "coreclr" doesn't.
        // type: config.runtime == 'dotnet5.0' ? 'coreclr' : 'dotnet',
        type: 'coreclr',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.DotNet,
    }

    if (config.sam?.containerBuild) {
        config.mountWith = 'write'
    }

    if (!config.noDebug) {
        config = await makeDotnetDebugConfiguration(config, originalCodeRoot)
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
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([waitForDebuggerMessages.DOTNET])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForPort

    if (!config.noDebug) {
        if (config.architecture === 'arm64') {
            await vscode.window.showWarningMessage(
                localize(
                    'AWS.sam.noArm.dotnet.debug',
                    'The vsdbg debugger does not currently support the arm64 architecture. Function will run locally without debug.'
                )
            )
            getLogger().warn('SAM Invoke: Attempting to debug dotnet on ARM - removing debug flag.')
            config.noDebug = true
        }
    }
    return await runLambdaFunction(ctx, config, async () => {
        if (!config.noDebug) {
            await _installDebugger({
                debuggerPath: config.debuggerPath!,
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
        // TODO: If vsdbg works with qemu, have this detect Architecture and swap to `linux-arm64` if ARM.
        // See https://github.com/OmniSharp/omnisharp-vscode/issues/3277 ;
        // qemu appears to set PrivateTmp=true : https://github.com/qemu/qemu/blob/326ff8dd09556fc2e257196c49f35009700794ac/contrib/systemd/qemu-pr-helper.service#L8 ?
        const vsDbgRuntime = 'linux-x64'

        const installScriptPath = await downloadInstallScript(debuggerPath)

        let installCommand: string
        let installArgs: string[]
        if (os.platform() === 'win32') {
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

        const childProcess = new ChildProcess(installCommand, installArgs)

        const install = await childProcess.run({
            onStdout: (text: string) => {
                globals.outputChannel.append(text)
            },
            onStderr: (text: string) => {
                globals.outputChannel.append(text)
            },
        })

        if (install.exitCode) {
            throw new Error(`command failed (exit code: ${install.exitCode}): ${installCommand}`)
        }
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
    if (os.platform() === 'win32') {
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
 * Creates a .NET launch-config composed with the given `config`.
 */
export async function makeDotnetDebugConfiguration(
    config: SamLaunchRequestArgs,
    codeUri: string
): Promise<DotNetDebugConfiguration> {
    if (config.noDebug) {
        throw Error(`SAM debug: invalid config ${config}`)
    }
    const pipeArgs = ['-c', `docker exec -i $(docker ps -q -f publish=${config.debugPort}) \${debuggerCommand}`]
    config.debuggerPath = pathutil.normalize(getDebuggerPath(codeUri))
    await ensureDir(config.debuggerPath)

    const isImageLambda = await isImageLambdaConfig(config)

    if (isImageLambda && !config.noDebug) {
        config.containerEnvVars = {
            _AWS_LAMBDA_DOTNET_DEBUGGING: '1',
        }
    }

    if (os.platform() === 'win32') {
        // Coerce drive letter to uppercase. While Windows is case-insensitive, sourceFileMap is case-sensitive.
        codeUri = codeUri.replace(pathutil.driveLetterRegex, match => match.toUpperCase())
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
        runtimeFamily: RuntimeFamily.DotNet,
        request: 'attach',
        // Since SAM CLI 1.0 we cannot assume PID=1. So use processName=dotnet
        // instead of processId=1.
        processName: 'dotnet',
        pipeTransport: {
            pipeProgram: 'sh',
            pipeArgs,
            debuggerPath: dotnetDebuggerPath,
            pipeCwd: codeUri,
        },
        windows: {
            pipeTransport: {
                pipeProgram: 'powershell',
                pipeArgs,
                debuggerPath: dotnetDebuggerPath,
                pipeCwd: codeUri,
            },
        },
    }
}
