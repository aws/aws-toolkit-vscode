// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

object AwsBuilderIdPrompt : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {
        computeOnEdt {
            val result = Messages.showOkCancelDialog(
                message("codewhisperer.credential.login.prompt.sono.message"),
                message("codewhisperer.credential.login.prompt.sono.title"),
                message("credentials.sso.login.open_browser"),
                Messages.getCancelButton(),
                null
            )

            if (result == Messages.OK) {
                BrowserUtil.browse(authorization.verificationUriComplete)
            } else {
                throw ProcessCanceledException(IllegalStateException("AWS Builder ID login cancelled"))
            }
        }
    }

    override fun tokenRetrieved() {}

    override fun tokenRetrievalFailure(e: Exception) {
        e.notifyError("AWS Builder ID login failed")
    }
}
