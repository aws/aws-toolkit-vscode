/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons } from '@aws/mynah-ui'
import { FileNodeAction, TreeNodeDetails } from '@aws/mynah-ui/dist/static'
import { DiffTreeFileInfo } from './types'

export function getDetails(filePaths: DiffTreeFileInfo[]): Record<string, TreeNodeDetails> {
    const details: Record<string, TreeNodeDetails> = {}
    for (const filePath of filePaths) {
        if (filePath.changeApplied) {
            details[filePath.relativePath] = {
                status: 'success',
                label: 'File accepted',
                icon: MynahIcons.OK,
            }
        } else if (filePath.rejected) {
            details[filePath.relativePath] = {
                status: 'error',
                label: 'File rejected',
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
        actions[filePath.relativePath] = [
            {
                icon: MynahIcons.OK,
                status: 'success',
                name: 'accept-change',
                description: 'Accept file change',
            },
        ]
        switch (filePath.rejected) {
            case true:
                actions[filePath.relativePath].push({
                    icon: MynahIcons.REVERT,
                    name: 'revert-rejection',
                    description: 'Revert rejection',
                })
                break
            case false:
                actions[filePath.relativePath].push({
                    icon: MynahIcons.CANCEL_CIRCLE,
                    status: 'error',
                    name: 'reject-change',
                    description: 'Reject change',
                })
                break
        }
    }
    return actions
}
