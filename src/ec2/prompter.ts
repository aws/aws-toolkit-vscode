/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu, RegionSubmenuResponse } from '../shared/ui/common/regionSubmenu'
import { Ec2Selection, Ec2InstanceId, getInstanceIdsFromClient } from './utils'
import { DataQuickPickItem } from '../shared/ui/pickerPrompter'
import globals from '../shared/extensionGlobals'
import { EC2 } from 'aws-sdk'

function asQuickpickItem(instanceId: string): DataQuickPickItem<string> {
    return {
        label: instanceId,
        data: instanceId,
    }
}

export function handleEc2ConnectPrompterResponse(response: RegionSubmenuResponse<Ec2InstanceId>): Ec2Selection {
    return {
        instanceId: response.data,
        region: response.region,
    }
}

export function createEc2ConnectPrompter(): RegionSubmenu<Ec2InstanceId> {
    return new RegionSubmenu(
        async region => {
            const client = await globals.sdkClientBuilder.createAwsService(EC2, undefined, region)
            return (await getInstanceIdsFromClient(client)).map(asQuickpickItem).promise()
        },
        { title: 'Select EC2 Instance Id' },
        { title: 'Select Region for EC2 Instance' }
    )
}
