/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import { getLogger } from '../../shared'
import { SafeEc2Instance } from '../../shared/clients/ec2Client'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Ec2ConnectionManagerMap } from './activation'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { Ec2Node } from './explorer/ec2ParentNode'
import { Ec2ConnectionManager } from './model'
import { Ec2Prompter, Ec2Selection, instanceFilter } from './prompter'
import { sshLogFileLocation } from '../../shared/sshConfig'

export function getIconCode(instance: SafeEc2Instance) {
    if (instance.LastSeenStatus === 'running') {
        return 'pass'
    }

    if (instance.LastSeenStatus === 'stopped') {
        return 'circle-slash'
    }

    return 'loading~spin'
}

export async function refreshExplorerNode(node?: Ec2Node) {
    if (node) {
        const n = node instanceof Ec2InstanceNode ? node.parent : node
        try {
            await n.refreshNode()
        } catch (e) {
            getLogger().error('refreshNode failed: %s', (e as Error).message)
        }
    }
}

export async function getSelection(node?: Ec2Node, filter?: instanceFilter): Promise<Ec2Selection> {
    const prompter = new Ec2Prompter(filter)
    const selection = node && node instanceof Ec2InstanceNode ? node.toSelection() : await prompter.promptUser()
    return selection
}

export async function getConnectionManager(
    connectionManagers: Ec2ConnectionManagerMap,
    selection: Ec2Selection
): Promise<Ec2ConnectionManager> {
    if (connectionManagers.has(selection.region)) {
        return connectionManagers.get(selection.region)!
    } else {
        const newConnectionManager = new Ec2ConnectionManager(selection.region)
        connectionManagers.set(selection.region, newConnectionManager)
        return newConnectionManager
    }
}

export async function copyInstanceId(instanceId: string): Promise<void> {
    await copyToClipboard(instanceId, 'Id')
}

export function getEc2SsmEnv(
    selection: Ec2Selection,
    ssmPath: string,
    session: SSM.StartSessionResponse
): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: selection.region,
            AWS_SSM_CLI: ssmPath,
            LOG_FILE_LOCATION: sshLogFileLocation('ec2', selection.instanceId),
            STREAM_URL: session.StreamUrl,
            SESSION_ID: session.SessionId,
            TOKEN: session.TokenValue,
        },
        process.env
    )
}
