/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity'
import { IDENTITY_POOL_ID, IDENTITY_REGION } from './configuration'
import { IdentityManager } from './identityManager'

const cognitoIdentityClient = new CognitoIdentityClient({ region: IDENTITY_REGION })
let identityManager: IdentityManager

const IdentityManagerFactory = {
    getInstance: function () {
        if (identityManager) {
            return identityManager
        }
        identityManager = new IdentityManager(cognitoIdentityClient, IDENTITY_POOL_ID)
        return identityManager
    },
}

export { IdentityManagerFactory }
