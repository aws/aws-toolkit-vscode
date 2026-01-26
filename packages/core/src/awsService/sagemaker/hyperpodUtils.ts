/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess } from '../../shared/utilities/processUtils'
import { getLogger } from '../../shared/logger/logger'
import { promises as fs } from 'fs' // eslint-disable-line no-restricted-imports
import path from 'path'
import os from 'os'

export async function clearSSHHostKey(connectionKey: string, region?: string, accountId?: string): Promise<void> {
    const keyParts = connectionKey.split(':')
    let hostKey: string
    if (keyParts.length === 3 && region && accountId) {
        // New format: hp_<cluster_name>_<namespace>_<space_name>_<region>_<account_id>
        hostKey = `hp_${keyParts[0]}_${keyParts[1]}_${keyParts[2]}_${region}_${accountId}`
    } else {
        hostKey = `hp_${connectionKey.replace(/:/g, '_')}`
    }

    try {
        const sshKeygen = new ChildProcess('ssh-keygen', ['-R', hostKey])
        await sshKeygen.run()
        getLogger().debug(`Cleared SSH host key for ${hostKey}`)
    } catch (error) {
        // Fallback: manually edit known_hosts if ssh-keygen fails
        getLogger().debug(`SSH host key cleanup with ssh-keygen failed, trying manual cleanup: ${error}`)
        try {
            const knownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts')
            const content = await fs.readFile(knownHostsPath, 'utf8')
            const lines = content.split('\n')
            const filteredLines = lines.filter((line) => !line.startsWith(hostKey))
            await fs.writeFile(knownHostsPath, filteredLines.join('\n'))
            getLogger().debug(`Manually cleared SSH host key for ${hostKey}`)
        } catch (fallbackError) {
            getLogger().debug(`Manual SSH host key cleanup also failed (non-critical): ${fallbackError}`)
        }
    }
}

export async function clearAllHyperpodSSHKeys(): Promise<void> {
    try {
        const knownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts')
        const content = await fs.readFile(knownHostsPath, 'utf8')
        const lines = content.split('\n')
        const filteredLines = lines.filter((line) => !line.includes('hp_'))
        await fs.writeFile(knownHostsPath, filteredLines.join('\n'))
        getLogger().debug('Cleared all HyperPod SSH host keys')
    } catch (error) {
        getLogger().debug(`Failed to clear all HyperPod SSH keys: ${error}`)
    }
}
