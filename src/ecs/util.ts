/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { EcsClient } from '../shared/clients/ecsClient'
import { IamClient } from '../shared/clients/iamClient'
import { ToolkitError } from '../shared/errors'
import { isCloud9 } from '../shared/extensionUtilities'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { TaskDefinition } from 'aws-sdk/clients/ecs'
import { getLogger } from '../shared/logger'
import { SSM } from 'aws-sdk'
import { fromExtensionManifest } from '../shared/settings'
import { getDeniedSsmActions } from '../shared/remoteSession'

interface EcsTaskIdentifer {
    readonly task: string
    readonly cluster: string
    readonly container: string
}

const permissionsDocumentation = vscode.Uri.parse(
    'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html#ecs-exec-enabling-and-using',
    true
)

export async function checkPermissionsForSsm(
    client: IamClient,
    task: Pick<TaskDefinition, 'taskRoleArn'>
): Promise<void | never> {
    if (!task.taskRoleArn) {
        throw new ToolkitError('Containers must have a task role ARN', {
            code: 'NoTaskRoleArn',
            documentationUri: permissionsDocumentation,
        })
    }

    const deniedActions = await getDeniedSsmActions(client, task.taskRoleArn)

    if (deniedActions.length !== 0) {
        const message = localize(
            'AWS.command.ecs.runCommandInContainer.missingPermissions',
            'Insufficient permissions to execute command. Configure a task role as described in the documentation.'
        )

        throw new ToolkitError(message, {
            code: 'MissingPermissions',
            documentationUri: permissionsDocumentation,
            details: { deniedActions: deniedActions.map(a => a.EvalActionName) },
        })
    }
}

export async function prepareCommand(
    client: EcsClient,
    command: string,
    task: EcsTaskIdentifer
): Promise<{ path: string; args: string[]; dispose: () => void }> {
    const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9())
    const { session } = await client.executeCommand({ ...task, command })
    const args = [JSON.stringify(session), client.regionCode, 'StartSession']

    async function terminateSession() {
        const sessionId = session!.sessionId!
        const ssm = await globals.sdkClientBuilder.createAwsService(SSM, undefined, client.regionCode)
        ssm.terminateSession({ SessionId: sessionId })
            .promise()
            .catch(err => {
                getLogger().warn(`ecs: failed to terminate session "${sessionId}": %s`, err)
            })
    }

    return { path: ssmPlugin, args, dispose: () => void terminateSession() }
}

export class EcsSettings extends fromExtensionManifest('aws.ecs', { openTerminalCommand: String }) {}
