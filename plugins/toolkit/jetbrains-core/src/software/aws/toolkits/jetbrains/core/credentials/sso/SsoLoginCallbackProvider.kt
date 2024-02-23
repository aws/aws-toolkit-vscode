// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.progress.ProcessCanceledException
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.ConfirmUserCodeLoginDialog
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialType
import software.aws.toolkits.telemetry.Result

interface SsoLoginCallbackProvider {
    fun getProvider(ssoUrl: String): SsoLoginCallback
}

class DefaultSsoLoginCallbackProvider : SsoLoginCallbackProvider {
    override fun getProvider(ssoUrl: String): SsoLoginCallback = when (ssoUrl) {
        SONO_URL -> BearerTokenPrompt
        else -> SsoPrompt
    }
}

object SsoPrompt : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {
        computeOnEdt {
            val result = ConfirmUserCodeLoginDialog(
                authorization.userCode,
                message("credentials.sso.login.title"),
                CredentialType.SsoProfile
            ).showAndGet()

            if (result) {
                AwsTelemetry.loginWithBrowser(project = null, Result.Succeeded, CredentialType.SsoProfile)
                BrowserUtil.browse(authorization.verificationUriComplete)
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

object BearerTokenPrompt : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {
        computeOnEdt {
            val codeCopied = ConfirmUserCodeLoginDialog(
                authorization.userCode,
                message("credentials.sono.login"),
                CredentialType.BearerToken
            ).showAndGet()

            if (codeCopied) {
                AwsTelemetry.loginWithBrowser(project = null, Result.Succeeded, CredentialType.BearerToken)
                BrowserUtil.browse(authorization.verificationUriComplete)
            } else {
                AwsTelemetry.loginWithBrowser(project = null, Result.Cancelled, CredentialType.BearerToken)
            }
        }
    }

    override fun tokenRetrieved() {}

    override fun tokenRetrievalFailure(e: Exception) {}
}
