/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createQuickPick, QuickPickPrompter } from "../shared/ui/pickerPrompter"
import { DataQuickPickItem } from "../shared/ui/pickerPrompter"
import { AsyncCollection } from "../shared/utilities/asyncCollection"
import { isValidResponse } from '../shared/wizards/wizard'
import { EC2 } from 'aws-sdk'

function asQuickpickItem(stringItem: string): DataQuickPickItem<string>[] 
{
    return [{
        label: stringItem, 
        data: stringItem
    }]
}

function createInstancePrompter(instances: AsyncCollection<string>): QuickPickPrompter<string> {
    const items = instances.map(asQuickpickItem)
    const prompter = createQuickPick(items)

    return prompter
}

export async function selectInstance(instances: AsyncCollection<string>): Promise<string | undefined> {
    const prompter = createInstancePrompter(instances)
    const response = await prompter.prompt() 
    return isValidResponse(response) ? response : undefined
}

export function extractInstanceIds(reservations: AsyncCollection<EC2.ReservationList | undefined>): AsyncCollection<string> {
    return reservations
        .flatten()
        .map(instanceList => instanceList?.Instances)
        .flatten()
        .map(instance => instance?.InstanceId)
        .filter(instanceId => instanceId !== undefined)
} 