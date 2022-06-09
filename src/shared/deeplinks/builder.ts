/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri, CancellationToken } from 'vscode'
import { DefaultStsClient } from '../clients/stsClient'
import { getLogger } from '../logger'
import { Arn, toString } from './arn'
import { RequestError } from 'got/dist/source'
import { buildLoginUri, consoleProxyUri, FederatedAccess, getFederatedAccess } from './federation'
import { withCancellationToken } from '../utilities/gotUtils'
import { isCloud9 } from '../extensionUtilities'
import { UnknownError } from '../toolkitError'

const DEEP_LINK_PATH = '/go/view'
const EXPIRATION_TOLERANCE = 30000

export class ConsoleLinkBuilder {
    // Storing a token per-region is not necessarily needed, though it helps a bit for latency
    private readonly accessTokens = new Map<string, FederatedAccess>()

    /**
     * Resolves a link to the AWS console, redirecting the user to the {@link path} after automatically
     * logging in. Links will start to expire immediately after creation. Do not cache or store these
     * links as callers have no way of knowing if they're expired or not.
     *
     * Example:
     * ```ts
     * const builder = new ConsoleLinkBuilder()
     * const link = await builder.getFederatedLink('/console/home')
     *
     * // takes the user to the console (IAD) with a temporary login
     * vscode.env.openExternal(link)
     * ```
     */
    public async getFederatedLink(region: string, path: string, cancellationToken?: CancellationToken): Promise<Uri> {
        const accessToken = await this.getAccessToken(region, cancellationToken)

        return buildLoginUri(accessToken, region, path)
    }

    /**
     * Attempts to get a link to the console for the given {@link arn}.
     *
     * This may return a federated link, though it is best-effort as being logged-in is not a requirement.
     * See {@link getFederatedLink} for more information about federation.
     *
     * ARNs are partially validated prior to generating a link. There are multiple modes of failure, so callers
     * are expected to handle errors generally.
     */
    public async getLinkFromArn(arn: Arn, cancellationToken?: CancellationToken): Promise<Uri> {
        const deepLink = await this.getConsoleLink(arn, cancellationToken)

        // Cloud9 doesn't need federation as they are already in the console
        if (isCloud9()) {
            return deepLink
        }

        const destination = `${DEEP_LINK_PATH}/${toString(arn)}`
        const target = await this.getFederatedLink(arn.region, destination, cancellationToken).catch(e => {
            getLogger().info(
                `deeplinks: unable to get federated link, opening "${toString(arn)}" without federated access`
            )
            getLogger().verbose(`deeplinks: failed to get federated link: ${UnknownError.cast(e).message}`)

            return deepLink
        })

        return target
    }

    /**
     * Clears all cached access tokens.
     *
     * This should be called whenever the current IAM role has changed.
     */
    public clearCache(): void {
        this.accessTokens.clear()
    }

    private timeRemaining(token: FederatedAccess): number {
        return token.expiration.getTime() - Date.now() - EXPIRATION_TOLERANCE
    }

    private async getAccessToken(region: string, cancellationToken?: CancellationToken): Promise<string> {
        const token = this.accessTokens.get(region)

        if (!token || this.timeRemaining(token) <= 0) {
            getLogger().debug('deeplinks: no valid federation token, getting new one')

            const client = new DefaultStsClient(region)
            const newToken = await getFederatedAccess(client, cancellationToken)
            this.accessTokens.set(region, newToken)

            return newToken.secret
        }

        return token.secret
    }

    // The response returns a header "x-amzn-redirectiontype" that can either be 'detail' or 'home' to refer
    // to the destination type. We can just ignore that for now though.
    //
    // Links returned by this method are good as-is, but it's recommended to use them as a federated link if
    // they're being automatically opened. If the user just wants the link itself, then skip the federation step.
    private async getConsoleLink(arn: Arn, cancellationToken?: CancellationToken): Promise<Uri> {
        const target = new URL(consoleProxyUri(arn.region, DEEP_LINK_PATH).toString(true))
        target.searchParams.set('arn', toString(arn))

        const response = await withCancellationToken(cancellationToken)(target.href, { followRedirect: false }).catch(
            error => {
                if (error instanceof RequestError) {
                    if (error.response?.statusCode === 400) {
                        throw new Error('ARN was malformed or request was invalid')
                    } else if (error.response?.statusCode === 404) {
                        throw new Error('Resource not supported')
                    }
                }

                throw error
            }
        )

        if (response.statusCode !== 302) {
            throw new Error(`Unexpected status code: ${response.statusCode}. Expected redirect (302).`)
        }

        if (!response.headers.location) {
            throw new Error('Expected redirect to contain "location" header')
        }

        return Uri.parse(response.headers.location)
    }
}
