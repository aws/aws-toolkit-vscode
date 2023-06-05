/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createQuickPick, QuickPickPrompter } from "../shared/ui/pickerPrompter"
import { DataQuickPickItem } from "../shared/ui/pickerPrompter"
import { isValidResponse } from '../shared/wizards/wizard'

function asQuickpickItem(stringItem: string): DataQuickPickItem<string> 
{
    return {
        label: stringItem, 
        data: stringItem
    }
}

function createInstancePrompter(): QuickPickPrompter<string> {
    const someTestStrings = ["option1", "option2"]
    const items = someTestStrings.map(asQuickpickItem)
    const prompter = createQuickPick(items)

    return prompter
}

export async function selectInstance(): Promise<string | undefined> {
    const prompter = createInstancePrompter()
    const response = await prompter.prompt() 
    return isValidResponse(response) ? response : undefined
}