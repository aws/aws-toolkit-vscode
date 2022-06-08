/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri, CancellationToken } from 'vscode'
import { StsClient } from '../clients/stsClient'
import { withCancellationToken } from '../utilities/gotUtils'

/**
 * The proxy URI automatically redirects to the correct console endpoint based off region.
 */
export function consoleProxyUri(region: string, path = '/'): Uri {
    return Uri.parse(`https://${region}.console.${consoleTld()}`).with({ path })
}

/**
 * Creates a new URI that automatically logins into the console using a federation token
 * via {@link getFederatedAccess}.
 *
 * The {@link path} argument is relative to the console and must start with a slash (`/`).
 * Paths are always URI encoded; any encoding beforehand may lead to unexpected results.
 */
export function buildLoginUri(token: string, region: string, path = '/'): Uri {
    if (!path.startsWith('/')) {
        throw new Error('URI path should start with `/`')
    }

    // Currently have to use this weird combo of URL + URI due to a double-encoding bug
    // with VS Code's URI: https://github.com/microsoft/vscode/issues/85930
    // Otherwise we could just use `consoleProxyUri` here.
    //
    // Possible workaround for opening links (not document links): https://github.com/microsoft/vscode/pull/141944

    // TODO: we should discover the correct partition from the region

    const url = new URL(federationUrl(region))
    const destination = `https://${region}.console.${consoleTld()}${path}`

    url.searchParams.set('Action', 'login')
    url.searchParams.set('SigninToken', token)
    url.searchParams.set('Destination', destination)

    return Uri.parse(url.href)
}

export interface FederatedAccess {
    readonly secret: string
    readonly expiration: Date
}

/**
 * Creates a new access token with permissions equal to the currently assumed role.
 *
 * The expiration time is inferred and may have some degree of inaccuracy.
 */
export async function getFederatedAccess(
    client: StsClient,
    cancellationToken?: CancellationToken
): Promise<FederatedAccess> {
    const federationToken = await client.getFederationToken({}, cancellationToken)
    const url = new URL(federationUrl(client.regionCode))

    url.searchParams.set('Action', 'getSigninToken')
    url.searchParams.set('SessionType', 'json')
    url.searchParams.set(
        'Session',
        JSON.stringify({
            sessionId: federationToken.Credentials.AccessKeyId,
            sessionKey: federationToken.Credentials.SecretAccessKey,
            sessionToken: federationToken.Credentials.SessionToken,
        })
    )

    const response = await withCancellationToken(cancellationToken)(url.href).json<{ SigninToken: string }>()

    return {
        secret: response.SigninToken,
        expiration: federationToken.Credentials.Expiration,
    }
}

type SupportedPartition = 'aws' | 'aws-cn' | 'aws-us-gov'

function consoleTld(partition: SupportedPartition = 'aws'): string {
    switch (partition) {
        case 'aws':
            return 'aws.amazon.com'
        case 'aws-cn':
            return 'amazonaws.com.cn'
        case 'aws-us-gov':
            return 'amazonaws-us-gov.com'
    }
}

function federationUrl(region: string, partition: SupportedPartition = 'aws'): string {
    const topLevelDomain = partition === 'aws-cn' ? 'signin.amazonaws.cn' : `signin.${consoleTld(partition)}`
    const subDomain = ['us-east-1', 'us-gov-west-1', 'cn-north-1'].includes(region) ? '' : `${region}.`

    return `https://${subDomain}${topLevelDomain}/federation`
}
