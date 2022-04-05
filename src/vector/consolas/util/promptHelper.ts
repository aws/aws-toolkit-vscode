/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { sleep } from '../../../shared/utilities/promiseUtilities'

export class PromptHelper {
    public static async promptMessage(message: string, duration: number) {
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: message,
                cancellable: false,
            },
            async () => {
                await sleep(duration)
            }
        )
    }
}
