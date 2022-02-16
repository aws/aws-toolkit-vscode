/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as caws from '../../shared/clients/cawsClient'
import globals, { checkCaws } from '../../shared/extensionGlobals'
import { createHelpButton } from '../../shared/ui/buttons'
import { IteratingQuickPickController, promptUser } from '../../shared/ui/picker'
import { IteratorTransformer } from '../../shared/utilities/collectionUtils'

/**
 * Shows a picker and returns the user-selected item.
 */
export async function selectCawsResource(
    kind: 'org' | 'project' | 'repo' | 'env'
): Promise<caws.CawsOrg | caws.CawsProject | caws.CawsRepo | caws.CawsDevEnv | undefined> {
    if (!checkCaws()) {
        return
    }
    const helpButton = createHelpButton()

    const picker = vscode.window.createQuickPick<vscode.QuickPickItem>()
    picker.busy = true
    picker.canSelectMany = false
    picker.ignoreFocusOut = true
    picker.matchOnDetail = false
    picker.matchOnDescription = true

    if (kind === 'org') {
        picker.title = 'Select a CODE.AWS Organization'
        picker.placeholder = 'Choose an organization'
    } else if (kind === 'project') {
        picker.title = 'Select a CODE.AWS Project'
        picker.placeholder = 'Choose a project'
    } else if (kind === 'env') {
        picker.title = 'Select a CODE.AWS Development Environment'
        picker.placeholder = 'Choose a dev env'
    } else {
        picker.title = 'Select a CODE.AWS Repository'
        picker.placeholder = 'Choose a repository'
    }

    const c = globals.caws
    const populator = new IteratorTransformer<vscode.QuickPickItem, vscode.QuickPickItem>(
        () => c.cawsItemsToQuickpickIter(kind),
        o => (!o ? [] : [o])
    )
    const controller = new IteratingQuickPickController(picker, populator)
    controller.startRequests()

    const choices =
        (await promptUser({
            picker: picker,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(caws.cawsHelpUrl, true))
                }
            },
        })) ?? []

    const choice = choices[0]
    if (!choice) {
        return undefined
    }
    const val = (choice as any).val
    if (kind === 'org') {
        return val as caws.CawsOrg
    } else if (kind === 'project') {
        return val as caws.CawsProject
    } else if (kind === 'env') {
        return val as caws.CawsDevEnv
    }
    return val as caws.CawsRepo
}
