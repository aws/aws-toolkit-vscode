/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { STS } from 'aws-sdk'

export interface StsClient {
    readonly regionCode: string

    getCallerIdentity(): Promise<STS.GetCallerIdentityResponse>
}
