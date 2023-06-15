/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createQuickPick, QuickPickPrompter } from "../shared/ui/pickerPrompter"
import { DataQuickPickItem } from "../shared/ui/pickerPrompter"
import { AsyncCollection } from "../shared/utilities/asyncCollection"
import { isValidResponse } from '../shared/wizards/wizard'

function asQuickpickItem(stringItem: string): DataQuickPickItem<string>[] 
{
    return [{
        label: stringItem, 
        data: stringItem
    }]
}

export function createInstancePrompter(instances: AsyncCollection<string>): QuickPickPrompter<string> {
    const items = instances.map(asQuickpickItem)
    const prompter = createQuickPick(items, {title: "Select EC2 instance by id"})

    return prompter
}

export async function selectInstance(instances: AsyncCollection<string>): Promise<string | undefined> {
    const prompter = createInstancePrompter(instances)
    const response = await prompter.prompt() 
    return isValidResponse(response) ? response : undefined
}
