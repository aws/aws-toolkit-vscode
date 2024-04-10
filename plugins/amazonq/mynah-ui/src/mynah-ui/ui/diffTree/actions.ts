// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { MynahIcons } from '@aws/mynah-ui-chat'
import { FileNodeAction, TreeNodeDetails } from '@aws/mynah-ui-chat/dist/static'
import { DiffTreeFileInfo } from './types'

export function getDetails(filePaths: DiffTreeFileInfo[]): Record<string, TreeNodeDetails> {
    return filePaths.reduce((details, filePath) => {
        if (filePath.rejected) {
            details[filePath.zipFilePath] = {
                status: 'error',
                label: 'File rejected',
                icon: MynahIcons.CANCEL_CIRCLE,
            }
        }
        return details
    }, {} as Record<string, TreeNodeDetails>)
}

export function getActions(filePaths: DiffTreeFileInfo[]): Record<string, FileNodeAction[]> {
    return filePaths.reduce((actions, filePath) => {
        actions[filePath.zipFilePath] = [filePath.rejected ? {
            icon: MynahIcons.REVERT,
            name: 'revert-rejection',
            description: 'Revert rejection',
        } : {
            icon: MynahIcons.CANCEL_CIRCLE,
            status: 'error',
            name: 'reject-change',
            description: 'Reject change',
        }]
        return actions
    }, {} as Record<string, FileNodeAction[]>)
}
