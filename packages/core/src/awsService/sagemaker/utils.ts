/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cp from 'child_process' // eslint-disable-line no-restricted-imports
import * as path from 'path'
import { AppStatus, SpaceStatus } from '@aws-sdk/client-sagemaker'
import { SagemakerSpaceApp } from '../../shared/clients/sagemaker'
import { sshLogFileLocation } from '../../shared/sshConfig'
import { fs } from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'

export const DomainKeyDelimiter = '__'

export function getDomainSpaceKey(domainId: string, spaceName: string): string {
    return `${domainId}${DomainKeyDelimiter}${spaceName}`
}

export function getDomainUserProfileKey(domainId: string, userProfileName: string): string {
    return `${domainId}${DomainKeyDelimiter}${userProfileName}`
}

export function generateSpaceStatus(spaceStatus?: string, appStatus?: string) {
    if (
        spaceStatus === SpaceStatus.Failed ||
        spaceStatus === SpaceStatus.Delete_Failed ||
        spaceStatus === SpaceStatus.Update_Failed ||
        (appStatus === AppStatus.Failed && spaceStatus !== SpaceStatus.Updating)
    ) {
        return 'Failed'
    }

    if (spaceStatus === SpaceStatus.InService && appStatus === AppStatus.InService) {
        return 'Running'
    }

    if (spaceStatus === SpaceStatus.InService && appStatus === AppStatus.Pending) {
        return 'Starting'
    }

    if (spaceStatus === SpaceStatus.Updating) {
        return 'Updating'
    }

    if (spaceStatus === SpaceStatus.InService && appStatus === AppStatus.Deleting) {
        return 'Stopping'
    }

    if (spaceStatus === SpaceStatus.InService && (appStatus === AppStatus.Deleted || !appStatus)) {
        return 'Stopped'
    }

    if (spaceStatus === SpaceStatus.Deleting) {
        return 'Deleting'
    }

    return 'Unknown'
}

export interface RemoteAppMetadata {
    DomainId: string
    UserProfileName: string
}

export function getSpaceAppsForUserProfile(
    spaceApps: SagemakerSpaceApp[],
    userProfilePrefix: string,
    domainId?: string
): string[] {
    return spaceApps.reduce((result: string[], app: SagemakerSpaceApp) => {
        if (app.OwnershipSettingsSummary?.OwnerUserProfileName?.startsWith(userProfilePrefix)) {
            if (domainId && app.DomainId !== domainId) {
                return result
            }
            result.push(
                getDomainUserProfileKey(app.DomainId || '', app.OwnershipSettingsSummary?.OwnerUserProfileName || '')
            )
        }

        return result
    }, [] as string[])
}

export function getSmSsmEnv(ssmPath: string, sagemakerLocalServerPath: string): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_SSM_CLI: ssmPath,
            SAGEMAKER_LOCAL_SERVER_FILE_PATH: sagemakerLocalServerPath,
            LOF_FILE_LOCATION: sshLogFileLocation('sagemaker', 'blah'),
        },
        process.env
    )
}

export function spawnDetachedServer(...args: Parameters<typeof cp.spawn>) {
    return cp.spawn(...args)
}

export const ActivityCheckInterval = 60000

/**
 * Updates the idle file with the current timestamp
 */
export async function updateIdleFile(idleFilePath: string): Promise<void> {
    try {
        const timestamp = new Date().toISOString()
        await fs.writeFile(idleFilePath, timestamp)
    } catch (error) {
        getLogger().error(`Failed to update SMAI idle file: ${error}`)
    }
}

/**
 * Checks for terminal activity by reading the /dev/pts directory and comparing modification times of the files.
 *
 * The /dev/pts directory is used in Unix-like operating systems to represent pseudo-terminal (PTY) devices.
 * Each active terminal session is assigned a PTY device. These devices are represented as files within the /dev/pts directory.
 * When a terminal session has activity, such as when a user inputs commands or output is written to the terminal,
 * the modification time (mtime) of the corresponding PTY device file is updated. By monitoring the modification
 * times of the files in the /dev/pts directory, we can detect terminal activity.
 *
 * If activity is detected (i.e., if any PTY device file was modified within the CHECK_INTERVAL), this function
 * updates the last activity timestamp.
 */
export async function checkTerminalActivity(idleFilePath: string): Promise<void> {
    try {
        const files = await fs.readdir('/dev/pts')
        const now = Date.now()

        for (const [fileName] of files) {
            const filePath = path.join('/dev/pts', fileName)
            try {
                const stats = await fs.stat(filePath)
                const mtime = new Date(stats.mtime).getTime()
                if (now - mtime < ActivityCheckInterval) {
                    await updateIdleFile(idleFilePath)
                    return
                }
            } catch (err) {
                getLogger().error(`Error reading file stats:`, err)
            }
        }
    } catch (err) {
        getLogger().error(`Error reading /dev/pts directory:`, err)
    }
}

/**
 * Starts monitoring terminal activity by setting an interval to check for activity in the /dev/pts directory.
 */
export function startMonitoringTerminalActivity(idleFilePath: string): NodeJS.Timeout {
    return setInterval(async () => {
        await checkTerminalActivity(idleFilePath)
    }, ActivityCheckInterval)
}
