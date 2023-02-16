// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.project.ProjectManager
import software.aws.toolkits.jetbrains.core.credentials.sso.Authorization
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoLoginCallback
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialType
import software.aws.toolkits.telemetry.Result

object BearerTokenPrompt : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {
        computeOnEdt {
            val codeCopied = CopyUserCodeForLoginDialog(
                ProjectManager.getInstance().defaultProject,
                authorization.userCode,
                credentialType = CredentialType.BearerToken
            ).showAndGet()
            if (codeCopied) {
                AwsTelemetry.loginWithBrowser(project = null, Result.Succeeded, CredentialType.BearerToken)
                BrowserUtil.browse(authorization.verificationUri)
            } else {
                AwsTelemetry.loginWithBrowser(project = null, Result.Cancelled, CredentialType.BearerToken)
            }
        }
    }

    override fun tokenRetrieved() {}

    override fun tokenRetrievalFailure(e: Exception) {}
}
