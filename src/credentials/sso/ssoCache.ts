/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientRegistration } from './clientRegistration'
import { AccessToken } from './accessToken'

export interface SsoCache {
    loadClientRegistration(ssoRegion: string): ClientRegistration | null
    saveClientRegistration(ssoRegion: string, registration: ClientRegistration): any
    invalidateClientRegistration(ssoRegion: string): any

    loadAccessToken(ssoUrl: string): AccessToken
    saveAccessToken(ssoUrl: string, accessToken: AccessToken): any
    invalidateAccessToken(ssoUrl: string): any
}
