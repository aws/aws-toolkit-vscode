// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.registry.Registry
import com.intellij.util.net.HttpConfigurable
import software.amazon.awssdk.http.ExecutableHttpRequest
import software.amazon.awssdk.http.HttpExecuteRequest
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import java.time.Duration

class AwsSdkClient : Disposable {
    init {
        Disposer.register(ApplicationManager.getApplication(), this)
    }

    private val proxySettings = HttpConfigurable.getInstance()

    val sdkHttpClient: ValidateCorrectThreadClient by lazy {
        val underlyingHttpClient = if (Registry.`is`("aws.toolkit.useUrlConnection")) {
            UrlConnectionHttpClient.create { uri ->
                proxySettings.openHttpConnection(uri.toASCIIString()).apply {
                    connectTimeout = DEFAULT_CONNECTION_TIMEOUT.toMillis().toInt()
                    readTimeout = DEFAULT_SOCKET_READ_TIMEOUT.toMillis().toInt()
                }
            }
        } else {
            ApacheHttpClient.builder().build()
        }
        ValidateCorrectThreadClient(underlyingHttpClient)
    }

    override fun dispose() {
        sdkHttpClient.close()
    }

    class ValidateCorrectThreadClient(val base: SdkHttpClient) : SdkHttpClient by base {
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
        private val DEFAULT_SOCKET_READ_TIMEOUT = Duration.ofSeconds(30)
        private val DEFAULT_CONNECTION_TIMEOUT = Duration.ofSeconds(2)

        fun getInstance(): AwsSdkClient = ServiceManager.getService(AwsSdkClient::class.java)
    }
}
