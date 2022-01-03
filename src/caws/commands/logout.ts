/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CawsClient } from '../../shared/clients/cawsClient'
import { ExtContext } from '../../shared/extensions'

export async function logout(context: ExtContext, client: CawsClient): Promise<void> {
    if (!context.awsContext.getCawsCredentials()) {
        return
    }
    await client.onCredentialsChanged(undefined, undefined)
    context.awsContext.setCawsCredentials('', '')
}
