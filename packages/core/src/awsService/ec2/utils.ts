/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SafeEc2Instance } from '../../shared/clients/ec2Client'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Ec2Selection } from './prompter'
import { sshLogFileLocation } from '../../shared/sshConfig'
import { SSM } from 'aws-sdk'
import { getLogger } from '../../shared/logger'

export function getIconCode(instance: SafeEc2Instance) {
    if (instance.LastSeenStatus === 'running') {
        return 'pass'
    }

    if (instance.LastSeenStatus === 'stopped') {
        return 'circle-slash'
    }

    if (instance.LastSeenStatus === 'terminated') {
        return 'stop'
    }

    return 'loading~spin'
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
            DEBUG_LOG: getLogger().logLevelEnabled('debug') ? 1 : 0,
        },
        process.env
    )
}
