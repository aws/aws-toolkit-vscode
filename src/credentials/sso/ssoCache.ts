/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SsoClientRegistration } from './ssoClientRegistration'
import { SsoAccessToken } from './ssoAccessToken'

export interface SsoCache {
    loadClientRegistration(ssoRegion: string): SsoClientRegistration | undefined
    saveClientRegistration(ssoRegion: string, registration: SsoClientRegistration): void
    invalidateClientRegistration(ssoRegion: string): void

    loadAccessToken(ssoUrl: string): SsoAccessToken | undefined
    saveAccessToken(ssoUrl: string, accessToken: SsoAccessToken): void
    invalidateAccessToken(ssoUrl: string): void
}
