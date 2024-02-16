/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHelpButton } from '../../shared/ui/buttons'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { AppRunnerServiceNode } from '../explorer/apprunnerServiceNode'
import * as nls from 'vscode-nls'
import { isValidResponse } from '../../shared/wizards/wizard'
import { telemetry } from '../../shared/telemetry/telemetry'
import { AppRunnerServiceStatus, Result } from '../../shared/telemetry/telemetry'
const localize = nls.loadMessageBundle()

function validateName(name: string) {
    if (name !== 'delete') {
        return localize('AWS.apprunner.deleteService.name.invalid', `Type 'delete' to confirm`)
    }

    return undefined
}

export async function deleteService(node: AppRunnerServiceNode): Promise<void> {
    let telemetryResult: Result = 'Failed'
    const appRunnerServiceStatus = node.info.Status as AppRunnerServiceStatus

    try {
        const inputBox = createInputBox({
            title: localize('AWS.apprunner.deleteService.title', 'Delete App Runner service'),
            placeholder: localize('AWS.apprunner.deleteService.placeholder', 'delete'),
            buttons: [createHelpButton('https://docs.aws.amazon.com/apprunner/latest/dg/manage-delete.html')],
            validateInput: validateName,
        })

        const userInput = await inputBox.prompt()

        if (!isValidResponse(userInput)) {
            telemetryResult = 'Cancelled'
            return
        }

        await node.delete()
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.apprunner_deleteService.emit({
            result: telemetryResult,
            appRunnerServiceStatus,
            passive: false,
        })
    }
}
