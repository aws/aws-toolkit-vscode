/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu, RegionSubmenuResponse } from '../shared/ui/common/regionSubmenu'
import { getInstanceIdsFromRegion } from './utils'
import { DataQuickPickItem } from '../shared/ui/pickerPrompter'

interface EC2Selection {
    instanceId: string
    region: string
}

function asQuickpickItem(instanceId: string): DataQuickPickItem<string> {
    return {
        label: instanceId,
        data: instanceId,
    }
}

export function handleEc2ConnectPrompterResponse(response: RegionSubmenuResponse<string>): EC2Selection {
    return {
        instanceId: response.data,
        region: response.region,
    }
}

export function createEC2ConnectPrompter(): RegionSubmenu<string> {
    return new RegionSubmenu(
        async region => (await getInstanceIdsFromRegion(region)).map(asQuickpickItem).promise(),
        { title: 'Select EC2 Instance Id' },
        { title: 'Select Region for EC2 Instance' }, 
        "Instances"
    )
}
