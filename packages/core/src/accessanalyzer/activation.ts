/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { renderIamPolicyChecks } from './vue/iamPolicyChecks'

/**
 * Activate Policy Checks functionality for the extension.
 */
export async function activate(extContext: ExtContext): Promise<void> {
    const extensionContext = extContext.extensionContext

    extensionContext.subscriptions.push(
        Commands.register('aws.accessanalyzer.iamPolicyChecks', async () => await renderIamPolicyChecks(extContext))
    )
}
