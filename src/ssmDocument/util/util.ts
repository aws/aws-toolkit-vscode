/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'

export async function promptUserForDocumentFormat(
    formats: string[],
    params?: { step?: number; totalSteps?: number }
): Promise<string | undefined> {
    // Prompt user to pick document format
    const quickPickItems: vscode.QuickPickItem[] = formats.map(format => {
        return {
            label: format,
            description: `Download document as ${format}`,
        }
    })

    const formatPick = picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.message.prompt.selectSsmDocumentFormat.placeholder', 'Select a document format'),
            step: params?.step,
            totalSteps: params?.totalSteps,
        },
        items: quickPickItems,
    })

    const formatChoices = await picker.promptUser({
        picker: formatPick,
    })

    const formatSelection = picker.verifySinglePickerOutput(formatChoices)

    // User pressed escape and didn't select a template
    if (formatSelection === undefined) {
        return undefined
    }

    return formatSelection.label
}

export async function showConfirmationMessage({
    prompt,
    confirm,
    cancel,
}: {
    prompt: string
    confirm: string
    cancel: string
}): Promise<boolean> {
    const confirmItem: vscode.MessageItem = { title: confirm }
    const cancelItem: vscode.MessageItem = { title: cancel, isCloseAffordance: true }

    const selection = await vscode.window.showWarningMessage(prompt, { modal: true }, confirmItem, cancelItem)
    return selection === confirmItem
}
