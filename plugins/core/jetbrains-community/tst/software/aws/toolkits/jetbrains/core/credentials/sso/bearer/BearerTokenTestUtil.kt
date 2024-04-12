// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceAuthorizationGrantToken
import java.time.Instant

fun anAccessToken(refreshToken: String? = aString(), expiresAt: Instant) = DeviceAuthorizationGrantToken(
    startUrl = aString(),
    region = aRegionId(),
    accessToken = aString(),
    refreshToken = refreshToken,
    expiresAt = expiresAt
)
