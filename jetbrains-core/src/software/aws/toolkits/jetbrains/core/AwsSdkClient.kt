// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.Disposer
import software.amazon.awssdk.http.ExecutableHttpRequest
import software.amazon.awssdk.http.HttpExecuteRequest
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.apache.ApacheHttpClient

class AwsSdkClient : Disposable {
    init {
        Disposer.register(ApplicationManager.getApplication(), this)
    }

    val sdkHttpClient: SdkHttpClient by lazy {
        ValidateCorrectThreadClient(ApacheHttpClient.builder().build())
    }

    override fun dispose() {
        sdkHttpClient.close()
    }

    private class ValidateCorrectThreadClient(private val base: SdkHttpClient) : SdkHttpClient by base {
        override fun prepareRequest(request: HttpExecuteRequest?): ExecutableHttpRequest {
            LOG.assertTrue(
                !ApplicationManager.getApplication().isDispatchThread ||
                        !ApplicationManager.getApplication().isWriteAccessAllowed,
                "Network calls shouldn't be made on EDT or inside write action"
            )

            return base.prepareRequest(request)
        }
    }

    companion object {
        private val LOG = Logger.getInstance(AwsSdkClient::class.java)

        fun getInstance(): AwsSdkClient = ServiceManager.getService(AwsSdkClient::class.java)
    }
}
