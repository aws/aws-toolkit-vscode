// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import software.aws.toolkits.jetbrains.core.credentials.DiskSsoSessionConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitStartupAuthFactory
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.resources.message

class SonoDiskProfileAuthFactory : ToolkitStartupAuthFactory {
    override fun buildConnections(): List<ToolkitConnection> =
        listOf(
            DiskSsoSessionConnection("codecatalyst", SONO_URL, SONO_REGION, message("aws_builder_id.service_name"))
        ).filter { (it.getConnectionSettings().tokenProvider.delegate as BearerTokenProvider).state() != BearerTokenAuthState.NOT_AUTHENTICATED }
}
