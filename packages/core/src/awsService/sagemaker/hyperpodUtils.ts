/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess } from '../../shared/utilities/processUtils'
import { getLogger } from '../../shared/logger/logger'

export async function clearSSHHostKey(connectionKey: string, region?: string, accountId?: string): Promise<void> {
    try {
        const keyParts = connectionKey.split(':')
        let hostKey: string
        if (keyParts.length === 3 && region && accountId) {
            // New format: hp_<cluster_name>_<namespace>_<space_name>_<region>_<account_id>
            hostKey = `hp_${keyParts[0]}_${keyParts[1]}_${keyParts[2]}_${region}_${accountId}`
        } else {
            hostKey = `hp_${connectionKey.replace(/:/g, '_')}`
        }

        const sshKeygen = new ChildProcess('ssh-keygen', ['-R', hostKey])
        await sshKeygen.run()
        getLogger().debug(`Cleared SSH host key for ${hostKey}`)
    } catch (error) {
        getLogger().debug(`SSH host key cleanup failed (non-critical): ${error}`)
    }
}

export async function clearAllHyperpodSSHKeys(): Promise<void> {
    try {
        const sshKeygen = new ChildProcess('sed', ['-i', '', '/hp_/d', `${process.env.HOME}/.ssh/known_hosts`])
        await sshKeygen.run()
        getLogger().debug('Cleared all HyperPod SSH host keys')
    } catch (error) {
        getLogger().debug(`Failed to clear all HyperPod SSH keys: ${error}`)
    }
}
