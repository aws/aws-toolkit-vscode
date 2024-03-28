// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.aws.toolkits.core.credentials.SsoSessionIdentifier

data class ProfileSsoSessionIdentifier(
    val profileName: String,
    override val startUrl: String,
    override val ssoRegion: String,
    override val scopes: Set<String>
) : SsoSessionIdentifier {
    override val id = "${SsoSessionConstants.SSO_SESSION_SECTION_NAME}:$profileName"
}
