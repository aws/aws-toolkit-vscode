// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.ProjectManager
import software.aws.toolkits.jetbrains.core.credentials.sso.Authorization
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCache
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoLoginCallback
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.CopyUserCodeForLoginDialog
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialType
import software.aws.toolkits.telemetry.Result

/**
 * Shared disk cache for SSO for the IDE
 */
val diskCache by lazy { DiskCache() }

object SsoPrompt : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {
        computeOnEdt {
            val result = CopyUserCodeForLoginDialog(
                ProjectManager.getInstance().defaultProject,
                authorization.userCode,
                message("credentials.sso.login.title"),
                CredentialType.SsoProfile
            ).showAndGet()
            if (result) {
                AwsTelemetry.loginWithBrowser(project = null, Result.Succeeded, CredentialType.SsoProfile)
                BrowserUtil.browse(authorization.verificationUri)
            } else {
                AwsTelemetry.loginWithBrowser(project = null, Result.Cancelled, CredentialType.SsoProfile)
                throw ProcessCanceledException(IllegalStateException(message("credentials.sso.login.cancelled")))
            }
        }
    }

    override fun tokenRetrieved() {}

    override fun tokenRetrievalFailure(e: Exception) {
        e.notifyError(message("credentials.sso.login.failed"))
    }
}

interface SsoRequiredInteractiveCredentials : InteractiveCredential {
    val ssoCache: SsoCache
    val ssoUrl: String

    override val userActionDisplayMessage: String get() = message("credentials.sso.display", displayName)
    override val userActionShortDisplayMessage: String get() = message("credentials.sso.display.short")

    override val userAction: AnAction get() = RefreshConnectionAction(message("credentials.sso.action"))

    override fun userActionRequired(): Boolean = ssoCache.loadAccessToken(ssoUrl) == null
}
