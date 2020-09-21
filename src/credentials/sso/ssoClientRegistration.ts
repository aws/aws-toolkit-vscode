/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SsoClientRegistration {
    readonly clientId: string
    readonly clientSecret: string
    readonly expiresAt: string
}
