/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials } from '@aws-sdk/types'
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts'
import { DefaultStsClient } from '../shared/clients/stsClient'
// import { telemetry } from '../shared/telemetry/telemetry'
import { assertHasProps } from '../shared/utilities/tsUtils'

interface StsIdentity extends Required<GetCallerIdentityResponse> {
    readonly source: 'sts'
}

export type Identity = StsIdentity

export async function validateConnection(credentials: Credentials, region = 'us-east-1'): Promise<Identity> {
    // telemetry.aws_validateCredentials.run()
    const client = new DefaultStsClient(region, credentials)
    const resp = await client.getCallerIdentity()
    assertHasProps(resp, 'Arn', 'UserId', 'Account')

    return { source: 'sts', ...resp }
}
