/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSError } from 'aws-sdk'
import * as nls from 'vscode-nls'
import { addCodiconToString } from '../../../shared/utilities/textUtilities'
import { getLogger } from '../../../shared/logger'
import { DefaultConsolasClient } from '../client/consolas'
import { ConsolasConstants } from '../models/constants'
import { createExitButton } from '../../../shared/ui/buttons'
import { sleep } from '../../../shared/utilities/timeoutUtils'
const localize = nls.loadMessageBundle()

export const showAccessTokenPrompt = async (
    client: DefaultConsolasClient,
    setToken: (token: string) => void
): Promise<void> => {
    const inputBox = vscode.window.createInputBox()
    const picker = vscode.window.createQuickPick()

    const restorePicker = () => {
        picker.value = inputBox.value
        picker.items = [...picker.items]
        picker.activeItems = []
        picker.selectedItems = []
        picker.busy = false
    }

    const displayError = async (isServerError: boolean) => {
        inputBox.validationMessage = isServerError
            ? localize(
                  'AWS.consolas.enterAccessToken.serverError',
                  'There was an error validating Consolas Access Code, check log for details.'
              )
            : localize('AWS.consolas.enterAccessToken.invalidToken', 'Invalid access code. Please re-enter.')
        inputBox.value = picker.value
        inputBox.enabled = false
        inputBox.ignoreFocusOut = true
        inputBox.buttons = [...picker.buttons]
        inputBox.show()
        await sleep(3000)

        picker.value = inputBox.value
        restorePicker()
        picker.show()
    }

    const validateInput = async (): Promise<void> => {
        // TODO: update the token validation when api is done
        if (!picker.value.length) {
            displayError(false)
        } else {
            picker.busy = true
            try {
                const response = await client.getAccessToken({ identityToken: picker.value })
                if (response.accessToken) {
                    setToken(response.accessToken)
                } else {
                    getLogger().error('Consolas access token was null')
                    throw new Error('Consolas access token was null')
                }
                picker.dispose()
            } catch (e) {
                getLogger().verbose(
                    `failed to get Consolas access token: ${(e as AWSError).message} RequestID: ${
                        (e as AWSError).requestId
                    }`
                )
                const statusCode = (e as AWSError).statusCode
                statusCode && statusCode > 499 ? displayError(true) : displayError(false)
            }
        }
    }

    const itemLabel = addCodiconToString(
        'link-external',
        localize('aws.consolas.inputAuthToken.title', "Don't have an access code? Request one here.")
    )
    const requestAccessButton: vscode.QuickPickItem = {
        label: itemLabel,
        alwaysShow: true,
    }

    picker.title = localize('aws.consolas.inputAuthToken.title', 'Enter Preview Access Code')
    picker.placeholder = localize(
        'aws.consolas.inputAuthToken.placeholder',
        'Enter Preview Access Code from Confirmation Email'
    )
    picker.items = [requestAccessButton]
    picker.ignoreFocusOut = true
    picker.activeItems = []
    picker.buttons = [createExitButton()]
    picker.show()

    picker.onDidAccept(() => {
        if (picker.selectedItems[0]?.label === itemLabel) {
            vscode.env.openExternal(vscode.Uri.parse(ConsolasConstants.previewSignupPortal))
            restorePicker()
        } else {
            validateInput()
        }
    })
    picker.onDidChangeValue(() => {
        picker.items = [...picker.items]
        picker.activeItems = []
    })
    picker.onDidTriggerButton(() => {
        picker.dispose()
    })
}
