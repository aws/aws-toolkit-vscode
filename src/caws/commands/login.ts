/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CawsClient } from '../../shared/clients/cawsClient'
import { ExtContext } from '../../shared/extensions'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { LoginWizard } from '../wizards/login'

// why are there so many contexts...?
export async function login(context: ExtContext, client: CawsClient): Promise<void> {
    const ctx = context.extensionContext
    const wizard = new LoginWizard(ctx)
    const response = await wizard.run()

    if (!response) {
        return // cancelled
    }

    await client.onCredentialsChanged(undefined, response.user.cookie)
    const sess = await client.verifySession()

    if (!sess?.identity) {
        showViewLogsMessage('CODE.AWS: failed to connect')
        return
    }

    if (response?.user.newUser) {
        ctx.secrets.store(`caws/${client.user()}`, response.user.cookie)
    }

    context.awsContext.setCawsCredentials(client.user(), response.user.cookie)
}
