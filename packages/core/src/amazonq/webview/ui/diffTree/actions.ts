/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons } from '@aws/mynah-ui'
import { FileNodeAction, TreeNodeDetails } from '@aws/mynah-ui/dist/static'
import { DiffTreeFileInfo } from './types'
import { uiComponentsTexts } from '../texts/constants'

export function getDetails(filePaths: DiffTreeFileInfo[]): Record<string, TreeNodeDetails> {
    const details: Record<string, TreeNodeDetails> = {}
    for (const filePath of filePaths) {
        if (filePath.changeApplied) {
            details[filePath.relativePath] = {
                status: 'success',
                label: uiComponentsTexts.changeAccepted,
                icon: MynahIcons.OK,
            }
        } else if (filePath.rejected) {
            details[filePath.relativePath] = {
                status: 'error',
                label: uiComponentsTexts.changeRejected,
                icon: MynahIcons.CANCEL_CIRCLE,
            }
        }
    }
    return details
}

export function getActions(filePaths: DiffTreeFileInfo[]): Record<string, FileNodeAction[]> {
    const actions: Record<string, FileNodeAction[]> = {}
    for (const filePath of filePaths) {
        if (filePath.changeApplied) {
            continue
        }
        switch (filePath.rejected) {
            case true:
                actions[filePath.relativePath] = [
                    {
                        icon: MynahIcons.REVERT,
                        name: 'revert-rejection',
                        description: uiComponentsTexts.revertRejection,
                    },
                ]
                break
            case false:
                actions[filePath.relativePath] = [
                    {
                        icon: MynahIcons.OK,
                        status: 'success',
                        name: 'accept-change',
                        description: uiComponentsTexts.acceptChange,
                    },
                    {
                        icon: MynahIcons.CANCEL_CIRCLE,
                        status: 'error',
                        name: 'reject-change',
                        description: uiComponentsTexts.rejectChange,
                    },
                ]
                break
        }
    }
    return actions
}
