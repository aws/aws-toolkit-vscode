/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import * as localizedText from '../../shared/localizedText'
import { AppRunnerServiceNode } from '../explorer/apprunnerServiceNode'
import { getTelemetryLogger } from '../../shared/telemetry/recorder'

export async function deleteService(node: AppRunnerServiceNode): Promise<void> {
    const appRunnerServiceStatus = node.info.Status as telemetry.AppRunnerServiceStatus

    getTelemetryLogger('ApprunnerDeleteService').recordPassive(false)
    getTelemetryLogger('ApprunnerDeleteService').recordAppRunnerServiceStatus(appRunnerServiceStatus)

    const prompt = localize('AWS.apprunner.deleteService.title', 'Delete App Runner service?')
    const items = [
        { title: localizedText.ok },
        { title: localizedText.help },
        { title: localizedText.cancel, isCloseAffordance: true },
    ]
    const resp = await vscode.window.showWarningMessage(prompt, { modal: true }, ...items)

    if (resp?.title === localizedText.ok) {
        await node.delete()
    } else if (resp?.title === localizedText.help) {
        const uri = vscode.Uri.parse('https://docs.aws.amazon.com/apprunner/latest/dg/manage-delete.html')
        await vscode.env.openExternal(uri)
    } else {
        getTelemetryLogger('ApprunnerDeleteService').recordResult('Cancelled')
    }
}
