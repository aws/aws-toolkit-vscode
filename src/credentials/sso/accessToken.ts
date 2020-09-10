/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AccessToken {
    readonly startUrl: string
    readonly region: string
    readonly accessToken: string
    readonly expiresAt: string
}
