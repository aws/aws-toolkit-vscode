/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activate as activateCore, deactivate as deactivateCore } from 'aws-core-vscode/node'
import { awsToolkitApi } from './api'
import { Commands } from 'aws-core-vscode/shared'
import * as semver from 'semver'
import * as vscode from 'vscode'
import { telemetry } from 'aws-core-vscode/telemetry'

export async function activate(context: ExtensionContext) {
    await activateCore(context)

    // after toolkit is activated, ask Amazon Q to register toolkit api callbacks
    await Commands.tryExecute('aws.amazonq.refreshConnectionCallback', awsToolkitApi)
    void setupVscodeVersionNotification()
    return awsToolkitApi
}

export async function deactivate() {
    await deactivateCore()
}

// TODO: remove once version bump to 1.83.0 is complete.
export function setupVscodeVersionNotification() {
    let notificationDisplayed = false
    tryShowNotification()

    function tryShowNotification() {
        // Do not show the notification if the IDE version will continue to be supported.
        if (!semver.gte(vscode.version, '1.83.0')) {
            return
        }

        if (notificationDisplayed) {
            return
        }

        notificationDisplayed = true

        telemetry.toolkit_showNotification.emit({
            component: 'editor',
            id: 'versionNotification',
            reason: 'unsupportedVersion',
            result: 'Succeeded',
        })
        void vscode.window.showWarningMessage(
            'Update VS Code to version 1.83.0+, support for previous versions will be dropped soon. '
        )
    }
}
