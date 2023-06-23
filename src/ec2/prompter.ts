/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu, RegionSubmenuResponse } from '../shared/ui/common/regionSubmenu'
import { Ec2Selection, getInstancesFromRegion } from './utils'
import { Instance } from '@aws-sdk/client-ec2'
import { DataQuickPickItem } from '../shared/ui/pickerPrompter'
import { getNameOfInstance } from '../shared/clients/ec2Client'

function asQuickpickItem(instance: Instance): DataQuickPickItem<string> {
    const instanceName = getNameOfInstance(instance)
    return {
        label: '$(terminal) \t' + (instanceName ? instanceName : instance.InstanceId),
        detail: instance.InstanceId,
        data: instance.InstanceId,
    }
}

export function handleEc2ConnectPrompterResponse(response: RegionSubmenuResponse<string>): Ec2Selection {
    return {
        instanceId: response.data,
        region: response.region,
    }
}

export function createEc2ConnectPrompter(): RegionSubmenu<string> {
    return new RegionSubmenu(
        async region => (await getInstancesFromRegion(region)).map(asQuickpickItem).promise(),
        { title: 'Select EC2 Instance Id', matchOnDetail: true },
        { title: 'Select Region for EC2 Instance' },
        'Instances'
    )
}
