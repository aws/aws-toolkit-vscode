/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import path from 'path'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { TreeNode, isTreeNode } from '../treeview/resourceTreeDataProvider'
import * as CloudFormation from '../cloudformation/cloudformation'
import { TemplateItem } from '../ui/common/samTemplate'
import { RuntimeFamily, getFamily } from '../../lambda/models/samLambdaRuntime'
import { SamCliSettings } from './cli/samCliSettings'
import { ToolkitError } from '../errors'
import { SamCliInfoInvocation } from './cli/samCliInfo'
import { parse } from 'semver'
import { telemetry } from '../telemetry/telemetry'
import { isCloud9 } from '../extensionUtilities'
import { removeAnsi } from '../utilities/textUtilities'
import { ChildProcess, ChildProcessResult } from '../utilities/processUtils'
import { CancellationError } from '../utilities/timeoutUtils'

import globals from '../extensionGlobals'
import { getLogger } from '..'
import { ProcessTerminal } from './process'

/**
 * @description determines the root directory of the project given Template Item
 * @param templateItem Template item object.
 * @returns The URI of the root project folder (may differ from workspace)
 * */
export const getProjectRoot = (template: TemplateItem | undefined) =>
    template ? getProjectRootUri(template.uri) : undefined

/**
 * @description determines the root directory of the project given uri of the template file
 * @param template The template.yaml uri
 * @returns The URI of the root project folder (may differ from workspace)
 * */
export const getProjectRootUri = (templateUri: vscode.Uri) => vscode.Uri.file(path.dirname(templateUri.path))

export function getSource(arg: vscode.Uri | AWSTreeNodeBase | TreeNode | undefined): string | undefined {
    if (arg instanceof vscode.Uri) {
        return 'template'
    } else if (arg instanceof AWSTreeNodeBase) {
        return 'regionNode'
    } else if (isTreeNode(arg)) {
        return 'appBuilderDeploy'
    } else {
        return undefined
    }
}
/**
 * Returns if a corresponding SAM template (received as a URI or string content) has
 * any function using .NET runtime
 * @param path A uri with the absolute path to the template file
 * @param contents The contents of the template file, directly as a string
 */
export async function isDotnetRuntime(templateUri: vscode.Uri, contents?: string): Promise<boolean> {
    const samTemplate = await CloudFormation.tryLoad(templateUri, contents)

    if (!samTemplate.template?.Resources) {
        return false
    }
    for (const resource of Object.values(samTemplate.template.Resources)) {
        if (resource?.Type === 'AWS::Serverless::Function') {
            if (resource.Properties?.Runtime) {
                if (getFamily(resource.Properties?.Runtime) === RuntimeFamily.DotNet) {
                    return true
                }
            }
        }
    }
    const globalRuntime = samTemplate.template.Globals?.Function?.Runtime as string
    return globalRuntime ? getFamily(globalRuntime) === RuntimeFamily.DotNet : false
}

export async function getSamCliPathAndVersion() {
    const { path: samCliPath } = await SamCliSettings.instance.getOrDetectSamCli()
    if (samCliPath === undefined) {
        throw new ToolkitError('SAM CLI could not be found', { code: 'MissingExecutable' })
    }

    const info = await new SamCliInfoInvocation(samCliPath).execute()
    const parsedVersion = parse(info.version)
    telemetry.record({ version: info.version })

    if (parsedVersion?.compare('1.53.0') === -1) {
        throw new ToolkitError('SAM CLI version 1.53.0 or higher is required', { code: 'VersionTooLow' })
    }

    return { path: samCliPath, parsedVersion }
}

let oldTerminal: ProcessTerminal | undefined
export async function runInTerminal(proc: ChildProcess, cmd: string) {
    const handleResult = (result?: ChildProcessResult) => {
        if (result && result.exitCode !== 0) {
            const message = `sam ${cmd} exited with a non-zero exit code: ${result.exitCode}`
            if (result.stderr.includes('is up to date')) {
                throw ToolkitError.chain(result.error, message, {
                    code: 'NoUpdateExitCode',
                })
            }
            throw ToolkitError.chain(result.error, message, {
                code: 'NonZeroExitCode',
            })
        }
    }

    // `createTerminal` doesn't work on C9 so we use the output channel instead
    if (isCloud9()) {
        globals.outputChannel.show()

        const result = proc.run({
            onStdout: (text) => globals.outputChannel.append(removeAnsi(text)),
            onStderr: (text) => globals.outputChannel.append(removeAnsi(text)),
        })
        await proc.send('\n')

        return handleResult(await result)
    }

    // The most recent terminal won't get garbage collected until the next run
    if (oldTerminal?.stopped === true) {
        oldTerminal.close()
    }
    const pty = (oldTerminal = new ProcessTerminal(proc))
    const terminal = vscode.window.createTerminal({ pty, name: `SAM ${cmd}` })
    terminal.sendText('\n')
    terminal.show()

    const result = await new Promise<ChildProcessResult>((resolve) => pty.onDidExit(resolve))
    if (pty.cancelled) {
        throw result.error !== undefined
            ? ToolkitError.chain(result.error, 'SAM CLI was cancelled before exiting', { cancelled: true })
            : new CancellationError('user')
    } else {
        return handleResult(result)
    }
}

export function getRecentResponse(mementoRootKey: string, identifier: string, key: string): string | undefined {
    const root = globals.context.workspaceState.get(mementoRootKey, {} as Record<string, Record<string, string>>)
    return root[identifier]?.[key]
}

export async function updateRecentResponse(
    mementoRootKey: string,
    identifier: string,
    key: string,
    value: string | undefined
) {
    try {
        const root = globals.context.workspaceState.get(mementoRootKey, {} as Record<string, Record<string, string>>)
        await globals.context.workspaceState.update(mementoRootKey, {
            ...root,
            [identifier]: { ...root[identifier], [key]: value },
        })
    } catch (err) {
        getLogger().warn(`sam: unable to save response at key "${key}": %s`, err)
    }
}
