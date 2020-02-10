// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.util.Disposer
import com.intellij.util.net.ssl.CertificateManager
import com.intellij.util.proxy.CommonProxy
import org.apache.http.impl.client.SystemDefaultCredentialsProvider
import org.apache.http.impl.conn.SystemDefaultRoutePlanner
import software.amazon.awssdk.http.ExecutableHttpRequest
import software.amazon.awssdk.http.HttpExecuteRequest
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.http.apache.ProxyConfiguration
import software.aws.toolkits.core.utils.assertTrue
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info

class AwsSdkClient : Disposable {
    init {
        Disposer.register(ApplicationManager.getApplication(), this)
    }

    val sdkHttpClient: SdkHttpClient by lazy {
        LOG.info { "Create new Apache client" }
        val httpClientBuilder = ApacheHttpClient.builder()
            .proxyConfiguration(ProxyConfiguration.builder().useSystemPropertyValues(false).build())
            .httpRoutePlanner(SystemDefaultRoutePlanner(CommonProxy.getInstance()))
            .credentialsProvider(SystemDefaultCredentialsProvider())
            .tlsTrustManagersProvider { arrayOf(CertificateManager.getInstance().trustManager) }

        ValidateCorrectThreadClient(httpClientBuilder.build())
    }

    override fun dispose() {
        sdkHttpClient.close()
    }

    private class ValidateCorrectThreadClient(private val base: SdkHttpClient) : SdkHttpClient by base {
        override fun prepareRequest(request: HttpExecuteRequest?): ExecutableHttpRequest {
            val application = ApplicationManager.getApplication()

            val isValidThread = !application.isWriteAccessAllowed && !application.isReadAccessAllowed
            LOG.assertTrue(isValidThread) { WRONG_THREAD }
            if (!isValidThread && application.isUnitTestMode) {
                throw AssertionError(WRONG_THREAD)
            }

            return base.prepareRequest(request)
        }
    }

    companion object {
        private val LOG = getLogger<AwsSdkClient>()
        private const val WRONG_THREAD = "Network calls can't be made inside read/write action"

        fun getInstance(): AwsSdkClient = ServiceManager.getService(AwsSdkClient::class.java)
    }
}
