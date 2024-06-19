/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { EcsClient } from '../shared/clients/ecsClient'
import { DefaultIamClient, IamClient } from '../shared/clients/iamClient'
import { ToolkitError } from '../shared/errors'
import { isCloud9 } from '../shared/extensionUtilities'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { Session, TaskDefinition } from 'aws-sdk/clients/ecs'
import { getLogger } from '../shared/logger'
import { SSM } from 'aws-sdk'
import { fromExtensionManifest } from '../shared/settings'
import { ecsTaskPermissionsUrl } from '../shared/constants'

interface EcsTaskIdentifer {
    readonly task: string
    readonly cluster: string
    readonly container: string
}

/**
 * See also: https://github.com/aws-containers/amazon-ecs-exec-checker
 */
export async function checkPermissionsForSsm(
    client: IamClient,
    task: Pick<TaskDefinition, 'taskRoleArn'>
): Promise<void | never> {
    if (!task.taskRoleArn) {
        throw new ToolkitError('Containers must have a task role ARN', {
            code: 'NoTaskRoleArn',
            documentationUri: ecsTaskPermissionsUrl,
        })
    }

    // https://github.com/aws-containers/amazon-ecs-exec-checker/blob/b1d163bd95c5b6f915e2bb3ad810e6f2aecae985/check-ecs-exec.sh#L536-L539
    const deniedActions = await client.getDeniedActions({
        PolicySourceArn: task.taskRoleArn,
        ActionNames: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
        ],
    })

    if (deniedActions.length !== 0) {
        const deniedMsg = deniedActions.map(o => o.EvalActionName).join(', ')
        const message = localize(
            'AWS.command.ecs.runCommandInContainer.missingPermissions',
            'Insufficient permissions to execute command, ensure the [task role is configured]({0}). Task role {1} is not authorized to perform: {2}',
            ecsTaskPermissionsUrl.toString(),
            task.taskRoleArn,
            deniedMsg
        )

        throw new ToolkitError(message, {
            code: 'MissingPermissions',
            documentationUri: ecsTaskPermissionsUrl,
            details: { deniedActions: deniedActions.map(a => a.EvalActionName) },
        })
    }
}

export async function prepareCommand(
    client: EcsClient,
    command: string,
    taskRoleArn: string,
    task: EcsTaskIdentifer
): Promise<{ path: string; args: string[]; dispose: () => void }> {
    const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9())

    let session: Session
    try {
        session = (await client.executeCommand({ ...task, command })).session!
    } catch (execErr) {
        await checkPermissionsForSsm(new DefaultIamClient(globals.regionProvider.defaultRegionId), {
            taskRoleArn: taskRoleArn,
        }).catch(permErr => {
            throw ToolkitError.chain(permErr, `${execErr}`)
        })

        throw execErr
    }

    const args = [JSON.stringify(session), client.regionCode, 'StartSession']

    async function terminateSession() {
        const sessionId = session.sessionId!
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
