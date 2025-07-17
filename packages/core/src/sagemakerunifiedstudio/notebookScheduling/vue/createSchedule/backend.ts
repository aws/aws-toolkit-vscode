/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../../shared/logger/logger'
import { Commands } from '../../../../shared/vscode/commands2'
import { VueWebview } from '../../../../webviews/main'

export class CreateScheduleWebview extends VueWebview {
    public static readonly sourcePath: string =
        'src/sagemakerunifiedstudio/notebookScheduling/vue/createSchedule/index.js'
    public readonly id = 'createLambda'

    public constructor() {
        super(CreateScheduleWebview.sourcePath)
    }

    public test() {
        getLogger().info('CreateScheduleWebview.test:')
    }
}

const WebviewPanel = VueWebview.compilePanel(CreateScheduleWebview)

export function registerCreateScheduleCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return Commands.register('aws.sagemakerunifiedstudio.notebookscheduling.createjob', async () => {
        const webview = new WebviewPanel(context)

        await webview.show({
            title: 'Create schedule',
            viewColumn: vscode.ViewColumn.Active,
        })
    })
}
