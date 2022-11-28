// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import com.intellij.ide.BrowserUtil
import software.aws.toolkits.jetbrains.core.credentials.sso.Authorization
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoLoginCallback
import software.aws.toolkits.jetbrains.utils.computeOnEdt

object BearerTokenPrompt : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {
        computeOnEdt {
            BrowserUtil.browse(authorization.verificationUriComplete)
        }
    }

    override fun tokenRetrieved() {}

    override fun tokenRetrievalFailure(e: Exception) {}
}
