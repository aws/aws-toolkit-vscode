/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { Env } from '../../shared/vscode/env'
import { S3FileNode } from '../explorer/s3FileNode'

export async function presignedURLCommand(node: S3FileNode, env = Env.vscode()): Promise<void> {
    if (!(await confirmFile(node))) {
        return
    }

    const time = await promptTime()
    const s3Client = ext.toolkitClientBuilder.createS3Client(node.bucket.region)
}

async function confirmFile(node: S3FileNode, window = vscode.window): Promise<boolean> {
    const response = await window.showInputBox({
        value: node.file.key,
        prompt: 'Confirm that this is your file',
    })

    if (!response || response != node.file.key) {
        return false
    }

    return true
}

async function promptTime(window = vscode.window): Promise<number> {
    //do i want to validate input?
    const timeStr = await window.showInputBox({
        value: '15',
        prompt: 'Please enter the valid time (in minutes) for this URL',
        placeHolder: 'Defaults to 15 minutes',
    })

    const time = Number(timeStr)

    if (isNaN(time) || time < 15) {
        return 15
    }
    //create quickpick
    // const picker = createQuickPick({
    //     options: {
    //         canPickMany: false,
    //         ignoreFocusOut: false,
    //         title: 'Please enter the valid time (in minutes) for this URL',
    //         step: 1,
    //         totalSteps: 3
    //     },
    //     buttons: [vscode.QuickInputButtons.Back]
    // })

    // const response = verifySinglePickerOutput(
    //     await promptUser({
    //         picker,
    //         onDidTriggerButton: (button, resolve, reject) => {

    //             if(button === vscode.QuickInputButtons.Back) {
    //                 resolve(undefined)
    //             }
    //         }
    //     }),
    // )

    return Promise.resolve(time)
}
