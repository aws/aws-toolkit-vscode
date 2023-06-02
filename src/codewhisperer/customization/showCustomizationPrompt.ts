/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createCommonButtons } from '../../shared/ui/buttons'
import { DataQuickPickItem, showQuickPick } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { Customization } from '../client/codewhispereruserclient'

export const showCustomizationPrompt = async (client: DefaultCodeWhispererClient) => {
    await showQuickPick(createCustomizationItems(client), {
        title: localize('AWS.codewhisperer.customization.quickPick.title', 'Select a Customization'),
        placeholder: localize(
            'AWS.codewhisperer.customization.quickPick.placeholder',
            'You have access to the following customizations'
        ),
        buttons: createCommonButtons() as vscode.QuickInputButton[],
    })
}

const createCustomizationItems = async (client: DefaultCodeWhispererClient) => {
    const items = []
    items.push(createBaseCustomizationItem())
    const response = await client.listAvailableCustomizations()
    response
        .map(listAvailableCustomizationsResponse => listAvailableCustomizationsResponse.customizations)
        .forEach(customizations => {
            customizations.map(customization => {
                items.push(createCustomizationItem(customization))
            })
        })

    return items
}

const createBaseCustomizationItem = () =>
    ({
        label: localize('AWS.codewhisperer.customization.base.label', 'CodeWhisperer base model'),
        onClick: () => {
            // TODO: implement on select action
        },
        description: localize('AWS.codewhisperer.customization.base.description', 'default'),
    } as DataQuickPickItem<'customization'>)

const createCustomizationItem = (customization: Customization) =>
    ({
        label: customization.name !== undefined ? customization.name : 'unknown',
        onClick: () => {
            // TODO: implement on select action
        },
        description: customization.description,
    } as DataQuickPickItem<'customization'>)
