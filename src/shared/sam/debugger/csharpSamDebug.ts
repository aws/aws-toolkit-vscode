/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import {
    DotNetCoreDebugConfiguration,
    DOTNET_CORE_DEBUGGER_PATH,
    getCodeRoot,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../../shared/utilities/pathUtils'
import { DefaultDockerClient, DockerClient } from '../../clients/dockerClient'
import { ExtContext } from '../../extensions'
import { mkdir } from '../../filesystem'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../../sam/cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from '../../sam/debugger/samDebugSession'
import { getStartPort } from '../../utilities/debuggerUtils'
import { ChannelLogger, getChannelLogger } from '../../utilities/vsCodeUtils'
import { invokeLambdaFunction, makeBuildDir, makeInputTemplate, waitForDebugPort } from '../localLambdaRunner'

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makeCsharpConfig(config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    config.baseBuildDir = await makeBuildDir()
    config.codeRoot = getCodeRoot(config.workspaceFolder, config)!

    config.samTemplatePath = await makeInputTemplate(config)
    // XXX: reassignment...
    // TODO: walk the tree to find .sln, .csproj ?
    config.codeRoot = getSamProjectDirPathForFile(config.samTemplatePath)

    config = {
        ...config,
        type: 'coreclr',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.DotNetCore,
        name: 'SamLocalDebug',
    }

    if (!config.noDebug) {
        config = await makeCoreCLRDebugConfiguration(config, config.codeRoot)
    }

    return config
}

/**
 * Launches and attaches debugger to a SAM dotnet (csharp) project.
 */
export async function invokeCsharpLambda(ctx: ExtContext, config: SamLaunchRequestArgs): Promise<void> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand(getChannelLogger(ctx.outputChannel), [
        WAIT_FOR_DEBUGGER_MESSAGES.DOTNET,
    ])
    config.onWillAttachDebugger = waitForDebugPort
    await invokeLambdaFunction(ctx, config, async () => {
        if (!config.noDebug) {
            await _installDebugger(
                {
                    debuggerPath: config.debuggerPath!!,
                    lambdaRuntime: config.runtime,
                    channelLogger: ctx.chanLogger,
                },
                { dockerClient: new DefaultDockerClient(ctx.outputChannel) }
            )
        }
    })
}

interface InstallDebuggerArgs {
    debuggerPath: string
    lambdaRuntime: string
    channelLogger: ChannelLogger
}

function getDebuggerPath(parentFolder: string): string {
    return path.resolve(parentFolder, '.vsdbg')
}

async function ensureDebuggerPathExists(debuggerPath: string): Promise<void> {
    try {
        await access(debuggerPath)
    } catch {
        await mkdir(debuggerPath)
    }
}

async function _installDebugger(
    { debuggerPath, lambdaRuntime, channelLogger }: InstallDebuggerArgs,
    { dockerClient }: { dockerClient: DockerClient }
): Promise<void> {
    await ensureDebuggerPathExists(debuggerPath)

    try {
        channelLogger.info(
            'AWS.samcli.local.invoke.debugger.install',
            'Installing .NET Core Debugger to {0}...',
            debuggerPath
        )

        await dockerClient.invoke({
            command: 'run',
            image: `lambci/lambda:${lambdaRuntime}`,
            removeOnExit: true,
            mount: {
                type: 'bind',
                source: debuggerPath,
                destination: '/vsdbg',
            },
            entryPoint: {
                command: 'bash',
                args: ['-c', 'curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg'],
            },
        })
    } catch (err) {
        channelLogger.info(
            'AWS.samcli.local.invoke.debugger.install.failed',
            'Error installing .NET Core Debugger: {0}',
            err instanceof Error ? (err as Error) : String(err)
        )

        throw err
    }
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
    if (!!config.noDebug) {
        throw Error(`SAM debug: invalid config ${config}`)
    }
    config.debugPort = config.debugPort ?? (await getStartPort())
    const pipeArgs = ['-c', `docker exec -i $(docker ps -q -f publish=${config.debugPort}) \${debuggerCommand}`]
    config.debuggerPath = pathutil.normalize(getDebuggerPath(config.codeRoot))
    await ensureDebuggerPathExists(config.debuggerPath)

    if (os.platform() === 'win32') {
        // Coerce drive letter to uppercase. While Windows is case-insensitive, sourceFileMap is case-sensitive.
        codeUri = codeUri.replace(pathutil.DRIVE_LETTER_REGEX, match => match.toUpperCase())
    }

    return {
        ...config,
        name: 'SamLocalDebug',
        runtimeFamily: RuntimeFamily.DotNetCore,
        request: 'attach',
        processId: '1',
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
        sourceFileMap: {
            ['/var/task']: codeUri,
        },
    }
}
