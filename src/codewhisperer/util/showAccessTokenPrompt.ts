/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSError } from 'aws-sdk'
import * as nls from 'vscode-nls'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { getLogger } from '../../shared/logger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { CodeWhispererConstants } from '../models/constants'
import { createExitButton } from '../../shared/ui/buttons'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { asyncCallWithTimeout } from './commonUtil'
const localize = nls.loadMessageBundle()

export const showAccessTokenPrompt = async (
    client: DefaultCodeWhispererClient,
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

    const displayError = async (isServerError: boolean, errorMessage: string = '') => {
        if (!isServerError) {
            inputBox.validationMessage = localize(
                'AWS.codeWhisperer.enterAccessToken.invalidToken',
                'Invalid access code. Please re-enter.'
            )
        } else {
            inputBox.validationMessage = errorMessage
                ? errorMessage
                : localize(
                      'AWS.codeWhisperer.enterAccessToken.serverError',
                      'There was an error validating CodeWhisperer Access Code, check log for details.'
                  )
        }

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
        if (!picker.value.length) {
            displayError(false)
        } else if (!picker.busy) {
            picker.busy = true
            try {
                const getAccessTokenPromise = client.getAccessToken({ identityToken: picker.value })
                const response = await asyncCallWithTimeout(
                    getAccessTokenPromise,
                    'Get access token timeout.',
                    CodeWhispererConstants.promiseTimeoutLimit * 1000
                )
                if (response.accessToken) {
                    setToken(response.accessToken)
                } else {
                    getLogger().error('CodeWhisperer access token was null')
                    throw new Error('CodeWhisperer access token was null')
                }
                picker.dispose()
            } catch (e) {
                const err = e as AWSError
                getLogger().verbose(
                    `failed to get CodeWhisperer access token: ${err.message}, status ${err.statusCode}, code ${err.code} RequestID: ${err.requestId}`
                )
                const errorMessage = err.message
                displayError(true, errorMessage)
            }
        }
    }

    const itemLabel = addCodiconToString(
        'link-external',
        localize('aws.codeWhisperer.inputAuthToken.title', "Don't have an access code? Request one here.")
    )
    const requestAccessButton: vscode.QuickPickItem = {
        label: itemLabel,
        alwaysShow: true,
    }

    picker.title = localize('aws.codeWhisperer.inputAuthToken.title', 'Enter Preview Access Code')
    picker.placeholder = localize(
        'aws.codeWhisperer.inputAuthToken.placeholder',
        'Enter Preview Access Code from Confirmation Email'
    )
    picker.items = [requestAccessButton]
    picker.ignoreFocusOut = true
    picker.activeItems = []
    picker.buttons = [createExitButton()]
    picker.show()

    picker.onDidAccept(() => {
        if (picker.selectedItems[0]?.label === itemLabel) {
            vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.previewSignupPortal))
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
