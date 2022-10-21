// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants

class CodeWhispererClientManager : Disposable {
    private val client: CodeWhispererClient = AwsClientManager.getInstance().createUnmanagedClient(
        AnonymousCredentialsProvider.create(),
        CodeWhispererConstants.Config.REGION,
        CodeWhispererConstants.Config.CODEWHISPERER_ENDPOINT
    )
    fun getClient() = client

    override fun dispose() {
        client.close()
    }

    companion object {
        fun getInstance(): CodeWhispererClientManager = service()
    }
}
