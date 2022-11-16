/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { getStartUrl } from './getStartUrl'
import { showQuickPick } from '../../shared/ui/pickerPrompter'
import { AuthUtil } from './authUtil'
import { failedToConnectAwsBuilderId } from '../models/constants'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { codicon, getIcon } from '../../shared/icons'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { ToolkitError } from '../../shared/errors'
import { createCommonButtons } from '../../shared/ui/buttons'

export const showConnectionPrompt = async () => {
    const resp = await showQuickPick(
        [createCodeWhispererBuilderIdItem(), createCodeWhispererSsoItem(), createCodeWhispererIamItem()],
        {
            title: 'CodeWhisperer: Add connection to AWS',
            placeholder: 'Select a connection option to start using CodeWhisperer',
            buttons: createCommonButtons() as vscode.QuickInputButton[],
        }
    )
    if (!isValidResponse(resp)) {
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

async function awsIdSignIn() {
    getLogger().info('selected AWS ID sign in')
    try {
        await AuthUtil.instance.connectToAwsBuilderId()
    } catch (e) {
        throw ToolkitError.chain(e, failedToConnectAwsBuilderId, { code: 'FailedToConnect' })
    }
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    await vscode.commands.executeCommand('aws.codeWhisperer.enableCodeSuggestions')
}

export const createCodeWhispererBuilderIdItem = () =>
    ({
        label: codicon`${getIcon('vscode-person')} ${localize(
            'aws.auth.builderIdItem.label',
            'Use a personal email to sign up and sign in with AWS Builder ID'
        )}`,
        data: 'builderId',
        detail: 'Create or sign in with AWS Builder ID - a new, free personal login for builders.', // TODO: need a "Learn more" button ?
    } as DataQuickPickItem<'builderId'>)

export const createCodeWhispererSsoItem = () =>
    ({
        label: codicon`${getIcon('vscode-organization')} ${localize(
            'aws.auth.ssoItem.label',
            'Connect using {0} IAM Identity Center',
            getIdeProperties().company
        )}`,
        data: 'sso',
        detail: "Sign in to your company's IAM Identity Center access portal login page.",
    } as DataQuickPickItem<'sso'>)

export const createCodeWhispererIamItem = () =>
    ({
        label: codicon`${getIcon('vscode-key')} ${localize('aws.auth.iamItem.label', 'Enter IAM Credentials')}`,
        data: 'iam',
        detail: 'Not supported by CodeWhisperer. Activates working with resources in the Explorer. Requires an access key ID and secret access key.',
        description: 'not supported',
        invalidSelection: true,
    } as DataQuickPickItem<'iam'>)
