/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { getStartUrl } from './getStartUrl'
import { showQuickPick } from '../../shared/ui/pickerPrompter'
import { AuthUtil } from './authUtil'
import { failedToConnectAwsBuilderId } from '../models/constants'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'
import { createCommonButtons } from '../../shared/ui/buttons'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isCloud9 } from '../../shared/extensionUtilities'
import { createBuilderIdItem, createSsoItem, createIamItem } from '../../auth/utils'
import { Commands } from '../../shared/vscode/commands2'
import { vsCodeState } from '../models/model'

export const showCodeWhispererConnectionPrompt = async () => {
    const items = isCloud9('classic')
        ? [createSsoItem(), createCodeWhispererIamItem()]
        : [createBuilderIdItem(), createSsoItem(), createCodeWhispererIamItem()]

    const resp = await showQuickPick(items, {
        title: 'Amazon Q: Add Connection to AWS',
        placeholder: 'Select a connection option to start using Amazon Q',
        buttons: createCommonButtons() as vscode.QuickInputButton[],
    })

    if (!isValidResponse(resp)) {
        telemetry.ui_click.emit({ elementId: 'connection_optionescapecancel' })
        throw new CancellationError('user')
    }
    switch (resp) {
        case 'iam':
            throw new Error('IAM is not supported')
        case 'sso': {
            return await getStartUrl()
        }
        case 'builderId': {
            return await awsIdSignIn()
        }
    }
}

export async function awsIdSignIn() {
    getLogger().info('selected AWS ID sign in')
    try {
        await AuthUtil.instance.connectToAwsBuilderId()
    } catch (e) {
        throw ToolkitError.chain(e, failedToConnectAwsBuilderId, { code: 'FailedToConnect' })
    }
    vsCodeState.isFreeTierLimitReached = false
    await Commands.tryExecute('aws.amazonq.enableCodeSuggestions')
}

export const createCodeWhispererIamItem = () => {
    const item = createIamItem()
    item.detail = 'Not supported by Amazon Q'
    item.description = 'not supported'
    item.invalidSelection = true

    return item
}
