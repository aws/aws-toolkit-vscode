/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppStatus, SpaceStatus } from '@aws-sdk/client-sagemaker'
import { SagemakerSpaceApp } from '../../shared/clients/sagemaker'

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

export function getRemoteAppMetadata(): RemoteAppMetadata {
    return {
        DomainId: 'd-abcdefg123456',
        UserProfileName: 'dernewtz-jorus',
    }
}

export function getSpaceAppsForUserProfile(spaceApps: SagemakerSpaceApp[], userProfilePrefix: string): string[] {
    return spaceApps.reduce((result: string[], app: SagemakerSpaceApp) => {
        if (app.OwnershipSettingsSummary?.OwnerUserProfileName?.startsWith(userProfilePrefix)) {
            result.push(
                getDomainUserProfileKey(app.DomainId || '', app.OwnershipSettingsSummary?.OwnerUserProfileName || '')
            )
        }

        return result
    }, [] as string[])
}
