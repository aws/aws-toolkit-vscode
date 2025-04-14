/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppStatus, SpaceStatus } from '@aws-sdk/client-sagemaker'

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
