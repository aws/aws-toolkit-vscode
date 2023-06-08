/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import {
    learnMoreUri,
    newCustomizationAvailableKey,
    newCustomizationMessageMultiple,
    newCustomizationMessageSingle,
    persistedCustomizationsKey,
    selectedCustomizationKey,
} from '../models/constants'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { AuthUtil } from './authUtil'
import { set } from './commonUtil'
import * as vscode from 'vscode'
import { createCommonButtons } from '../../shared/ui/buttons'
import { DataQuickPickItem, showQuickPick } from '../../shared/ui/pickerPrompter'
import { codeWhispererClient } from '../client/codewhisperer'
import { Customization, ResourceArn } from '../client/codewhispereruserclient'
import { codicon, getIcon } from '../../shared/icons'

export const getNewCustomizations = (availableCustomizations: Customization[]) => {
    const persistedCustomizations = getPersistedCustomizations()
    return availableCustomizations.filter(c => !persistedCustomizations.map(p => p.arn).includes(c.arn))
}

export async function notifyNewCustomizations() {
    const availableCustomizations = await getAvailableCustomizationsList()

    const selectedCustomization = getSelectedCustomization()
    if (!isSelectedCustomizationAvailable(availableCustomizations, selectedCustomization)) {
        await switchToBaseCustomizationAndNotify()
    }

    const newCustomizations = getNewCustomizations(availableCustomizations)
    if (newCustomizations.length === 0) {
        return
    }

    await setNewCustomizationAvailable(true)

    const select = localize(
        'AWS.codewhisperer.customization.notification.new_customizations.select',
        'Select Customization'
    )
    const learnMore = localize(
        'AWS.codewhisperer.customization.notification.new_customizations.learn_more',
        'Learn More'
    )
    vscode.window
        .showInformationMessage(
            newCustomizations.length === 1 ? newCustomizationMessageSingle : newCustomizationMessageMultiple,
            select,
            learnMore
        )
        .then(async resp => {
            if (resp === select) {
                showCustomizationPrompt().then()
            } else if (resp === learnMore) {
                // TODO: figure out the right uri
                vscode.env.openExternal(vscode.Uri.parse(learnMoreUri))
            }
        })
}

export const isSelectedCustomizationAvailable = (available: Customization[], selected: Customization) => {
    return !selected.arn || available.map(c => c.arn).includes(selected.arn)
}

export const baseCustomization = {
    arn: undefined,
    name: localize('AWS.codewhisperer.customization.base.label', 'CodeWhisperer foundation'),
    description: localize(
        'AWS.codewhisperer.customization.base.detail',
        'Receive suggestions from CodeWhisperer base model'
    ),
}

export const getSelectedCustomization = (): Customization => {
    if (!AuthUtil.instance.isValidEnterpriseSsoInUse() || !AuthUtil.instance.conn) {
        return baseCustomization
    }
    const selectedCustomizationArr =
        globals.context.globalState.get<{ [id: string]: Customization }>(selectedCustomizationKey) || {}
    return selectedCustomizationArr[AuthUtil.instance.conn.id] || baseCustomization
}

export const setSelectedCustomization = async (customization: Customization) => {
    if (!AuthUtil.instance.isValidEnterpriseSsoInUse() || !AuthUtil.instance.conn) {
        return
    }
    const selectedCustomizationObj =
        globals.context.globalState.get<{ [id: string]: Customization }>(selectedCustomizationKey) || {}
    selectedCustomizationObj[AuthUtil.instance.conn.id] = customization

    await set(selectedCustomizationKey, selectedCustomizationObj, globals.context.globalState)
    vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
}

export const getPersistedCustomizations = (): Customization[] => {
    if (!AuthUtil.instance.isValidEnterpriseSsoInUse() || !AuthUtil.instance.conn) {
        return []
    }
    const persistedCustomizationsObj =
        globals.context.globalState.get<{ [id: string]: Customization[] }>(persistedCustomizationsKey) || {}
    return persistedCustomizationsObj[AuthUtil.instance.conn.id] || []
}

export const setPersistedCustomizations = async (customizations: Customization[]) => {
    if (!AuthUtil.instance.isValidEnterpriseSsoInUse() || !AuthUtil.instance.conn) {
        return
    }
    const persistedCustomizationsObj =
        globals.context.globalState.get<{ [id: string]: Customization[] }>(persistedCustomizationsKey) || {}
    persistedCustomizationsObj[AuthUtil.instance.conn.id] = customizations
    await set(persistedCustomizationsKey, persistedCustomizationsObj, globals.context.globalState)
}

export const getNewCustomizationAvailable = () => {
    return globals.context.globalState.get<boolean>(newCustomizationAvailableKey) || false
}

export const setNewCustomizationAvailable = async (available: boolean) => {
    await set(newCustomizationAvailableKey, available, globals.context.globalState)
    vscode.commands.executeCommand('aws.codeWhisperer.refresh')
}

export async function showCustomizationPrompt() {
    await setNewCustomizationAvailable(false)
    await showQuickPick(createCustomizationItems(), {
        title: localize('AWS.codewhisperer.customization.quickPick.title', 'Select a Customization'),
        placeholder: localize(
            'AWS.codewhisperer.customization.quickPick.placeholder',
            'You have access to the following customizations'
        ),
        buttons: createCommonButtons() as vscode.QuickInputButton[],
        compare: (a, b) => {
            if (a.invalidSelection) {
                return -1
            }
            if (b.invalidSelection) {
                return 1
            }
            return a.label < b.label ? -1 : 1
        },
        recentlyUsed: localize('AWS.codewhisperer.customization.selected', 'Connected'),
    })
}

const createCustomizationItems = async () => {
    const items = []
    const availableCustomizations = await getAvailableCustomizationsList()

    // Order matters
    const persistedCustomizations = getPersistedCustomizations()
    await setPersistedCustomizations(availableCustomizations)

    if (availableCustomizations.length === 0) {
        items.push(noCustomizationsItem())
        items.push(createBaseCustomizationItem())
        return items
    }

    const persistedArns = persistedCustomizations.map(c => c.arn)
    items.push(createBaseCustomizationItem())
    items.push(...availableCustomizations.map(c => createCustomizationItem(c, persistedArns)))
    return items
}

const noCustomizationsItem = () => {
    return {
        label: codicon`${getIcon('vscode-info')}`,
        // TODO: make this text auto-wrap
        description: localize(
            'AWS.codewhisperer.customization.noCustomizations.description',
            'Contact your administrator for access to CodeWhisperer customizations. After your have access, they will be displayed in the dropdown below'
        ),
        invalidSelection: true,
    } as DataQuickPickItem<string>
}

const createBaseCustomizationItem = () => {
    const label = codicon`${getIcon('vscode-circuit-board')} ${localize(
        'AWS.codewhisperer.customization.base.label',
        'CodeWhisperer foundation'
    )}`
    const selectedArn = getSelectedCustomization().arn
    return {
        label: label,
        onClick: async () => {
            await setSelectedCustomization(baseCustomization)
        },
        detail: localize(
            'AWS.codewhisperer.customization.base.description',
            'Receive suggestions from CodeWhisperer base model'
        ),
        description: renderDescriptionText(label),
        recentlyUsed: selectedArn === baseCustomization.arn,
    } as DataQuickPickItem<string>
}

const createCustomizationItem = (customization: Customization, persistedArns: (ResourceArn | undefined)[]) => {
    const isNewCustomization = !persistedArns.includes(customization.arn)
    const label = codicon`${getIcon('vscode-circuit-board')} ${
        customization.name !== undefined ? customization.name : 'unknown'
    }`
    const selectedArn = getSelectedCustomization().arn
    return {
        label: label,
        onClick: async () => {
            // If the newly selected customization is same as the old one, do nothing
            const selectedCustomization = getSelectedCustomization()
            if (selectedCustomization.arn === customization.arn) {
                return
            }
            await setSelectedCustomization(customization)
            vscode.window.showInformationMessage(
                localize(
                    'AWS.codewhisperer.customization.selected.message',
                    'CodeWhisperer suggestions are now coming from the {0} customization.',
                    customization.name
                )
            )
        },
        detail: customization.description,
        description: renderDescriptionText(label, isNewCustomization),
        data: customization.arn,
        recentlyUsed: selectedArn === customization.arn,
    } as DataQuickPickItem<string>
}

export const getAvailableCustomizationsList = async () => {
    const items: Customization[] = []
    const response = await codeWhispererClient.listAvailableCustomizations()
    response
        .map(listAvailableCustomizationsResponse => listAvailableCustomizationsResponse.customizations)
        .forEach(customizations => {
            items.push(...customizations)
        })

    return items
}

// show notification that selected customization is not available, switching back to base
export const switchToBaseCustomizationAndNotify = async () => {
    await setSelectedCustomization(baseCustomization)
    vscode.window.showInformationMessage(
        localize(
            'AWS.codewhisperer.customization.notification.selected_customization_not_available',
            'Selected CodeWhisperer customization is not available. Contact your administrator. Your instance of CodeWhisperer is using the foundation model.'
        )
    )
}

const renderDescriptionText = (label: string, isNewCustomization: boolean = false) => {
    const selectedCustomization = getSelectedCustomization()
    let description = ''
    if (isNewCustomization) {
        description += '   New'
    }
    if (label.includes(selectedCustomization.name ?? '')) {
        // A workaround to align the "Connected" text on the right
        description += isNewCustomization ? ' '.repeat(124 - label.length) : ' '.repeat(129 - label.length)
    }
    return description
}
