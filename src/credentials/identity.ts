/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials } from '@aws-sdk/types'
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts'
import { DefaultStsClient } from '../shared/clients/stsClient'
import { DEFAULT_REGION } from '../shared/regions/regionProvider'
import { telemetry } from '../shared/telemetry/telemetry'
import { assertHasProps } from '../shared/utilities/tsUtils'
import { CredentialsProvider, credentialsProviderToTelemetryType } from './providers/credentials'

interface StsIdentity extends Required<GetCallerIdentityResponse> {
    readonly source: 'sts'
}

export type Identity = StsIdentity

export async function validateConnection(credentials: Credentials, provider: CredentialsProvider): Promise<Identity> {
    return telemetry.aws_validateCredentials.run(async span => {
        span.record({
            credentialType: provider.getTelemetryType(),
            credentialSourceId: credentialsProviderToTelemetryType(provider.getProviderType()),
        })

        const region = provider.getDefaultRegion() ?? DEFAULT_REGION
        const resp = await new DefaultStsClient(region, credentials).getCallerIdentity()
        assertHasProps(resp, 'Arn', 'UserId', 'Account')

        return { source: 'sts', ...resp }
    })
}
