/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu, RegionSubmenuResponse } from '../shared/ui/common/regionSubmenu'
import { Ec2Selection, getInstancesFromRegion } from './utils'
import { DataQuickPickItem } from '../shared/ui/pickerPrompter'
import { Ec2Instance } from '../shared/clients/ec2Client'
import { PromptResult } from '../shared/ui/prompter'
import { isValidResponse } from '../shared/wizards/wizard'
import { CancellationError } from '../shared/utilities/timeoutUtils'

function asQuickpickItem(instance: Ec2Instance): DataQuickPickItem<string> {
    return {
        label: '$(terminal) \t' + (instance.name ?? '(no name)'),
        detail: instance.InstanceId,
        data: instance.InstanceId,
    }
}

function getSelectionFromResponse(response: PromptResult<RegionSubmenuResponse<string>>): Ec2Selection {
    if (isValidResponse(response)) {
        return handleEc2ConnectPrompterResponse(response)
    } else {
        throw new CancellationError('user')
    }
}

export async function promptUserForEc2Selection(): Promise<Ec2Selection> {
    const prompter = createEc2ConnectPrompter()
    const response = await prompter.prompt()

    return getSelectionFromResponse(response)
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
