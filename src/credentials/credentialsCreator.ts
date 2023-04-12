/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { createInputBox } from '../shared/ui/inputPrompter'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { isValidResponse } from '../shared/wizards/wizard'
const localize = nls.loadMessageBundle()

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
        ignoreFocusOut: true,
        placeholder: localize('AWS.prompt.mfa.enterCode.placeholder', 'Enter Authentication Code Here'),
        title: localize('AWS.prompt.mfa.enterCode.title', 'MFA Challenge for {0}', profileName),
        prompt: localize('AWS.prompt.mfa.enterCode.prompt', 'Enter code for MFA device {0}', mfaSerial),
    })

    const token = await inputBox.prompt()

    // Distinguish user cancel vs code entry issues with the error message
    if (!isValidResponse(token)) {
        throw new CancellationError('user')
    }

    return token
}
