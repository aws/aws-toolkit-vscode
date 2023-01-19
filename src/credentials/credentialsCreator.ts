/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { createInputBox, promptUser } from '../shared/ui/input'

const errorMessageUserCancelled = localize('AWS.error.mfa.userCancelled', 'User cancelled entering authentication code')

/**
 * @description Prompts user for MFA token
 *
 * Entered token is passed to the callback.
 * If user cancels out, the callback is passed an error with a fixed message string.
 *
 * @param mfaSerial Serial arn of MFA device
 * @param profileName Name of Credentials profile we are asking an MFA Token for
 * @param callback tokens/errors are passed through here
 */
export async function getMfaTokenFromUser(mfaSerial: string, profileName: string): Promise<string> {
    const inputBox = createInputBox({
        options: {
            ignoreFocusOut: true,
            placeHolder: localize('AWS.prompt.mfa.enterCode.placeholder', 'Enter Authentication Code Here'),
            title: localize('AWS.prompt.mfa.enterCode.title', 'MFA Challenge for {0}', profileName),
            prompt: localize('AWS.prompt.mfa.enterCode.prompt', 'Enter code for MFA device {0}', mfaSerial),
        },
    })

    const token = await promptUser({ inputBox: inputBox })

    // Distinguish user cancel vs code entry issues with the error message
    if (!token) {
        throw new Error(errorMessageUserCancelled)
    }

    return token
}
