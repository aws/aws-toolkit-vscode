// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.AnAction
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCache
import software.aws.toolkits.resources.message

/**
 * Shared disk cache for SSO for the IDE
 */
val diskCache by lazy { DiskCache() }

interface SsoRequiredInteractiveCredentials : InteractiveCredential {
    val ssoCache: SsoCache
    val ssoUrl: String

    override val userActionDisplayMessage: String get() = message("credentials.sso.display", displayName)
    override val userActionShortDisplayMessage: String get() = message("credentials.sso.display.short")

    override val userAction: AnAction get() = RefreshConnectionAction(message("credentials.sso.action"))

    override fun userActionRequired(): Boolean = ssoCache.loadAccessToken(ssoUrl) == null
}
