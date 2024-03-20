// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.util.net.HttpConfigurable
import org.eclipse.jetty.proxy.ConnectHandler
import org.eclipse.jetty.proxy.ProxyServlet
import org.eclipse.jetty.server.Server
import org.eclipse.jetty.server.ServerConnector
import org.eclipse.jetty.servlet.ServletContextHandler
import org.eclipse.jetty.servlet.ServletHolder
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito.times
import org.mockito.kotlin.any
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkToken
import software.amazon.awssdk.auth.token.credentials.StaticTokenProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClientBuilder
import software.amazon.awssdk.services.codewhispererstreaming.model.GenerateAssistantResponseResponseHandler
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.MockClientManager.Companion.useRealImplementations
import java.util.concurrent.CountDownLatch

class CodeWhispererEndpointCustomizerTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private val proxyServletSpy = spy(ConnectHandler())

    private val proxyServer = Server().also {
        it.addConnector(ServerConnector(it))
        it.handler = proxyServletSpy

        val context = ServletContextHandler(proxyServletSpy, "/", ServletContextHandler.SESSIONS)

        context.addServlet(ServletHolder(ProxyServlet()), "/*")
        it.start()
    }

    @Before
    fun setUp() {
        useRealImplementations(disposableRule.disposable)
        val httpConfigurable = HttpConfigurable.getInstance()
        httpConfigurable.USE_HTTP_PROXY = true
        httpConfigurable.PROXY_HOST = "localhost"
        httpConfigurable.PROXY_PORT = proxyServer.uri.port
    }

    @After
    fun tearDown() {
        HttpConfigurable.getInstance().USE_HTTP_PROXY = false

        proxyServer.stop()
        proxyServer.join()
    }

    @Test
    fun proxyIsBypassed() {
        HttpConfigurable.getInstance().USE_HTTP_PROXY = false

        makeAwsCall()

        verify(proxyServletSpy, times(0)).handle(any(), any(), any(), any())
    }

    @Test
    fun proxyCallIsMade() {
        makeAwsCall()

        verify(proxyServletSpy).handle(any(), any(), any(), any())
    }

    private fun makeAwsCall() {
        val latch = CountDownLatch(1)

        ApplicationManager.getApplication().executeOnPooledThread {
            AwsClientManager.getInstance().createUnmanagedClient<CodeWhispererStreamingAsyncClient>(
                AnonymousCredentialsProvider.create(),
                Region.AWS_GLOBAL,
                clientCustomizer = { _, _, _, builder, _ ->
                    (builder as CodeWhispererStreamingAsyncClientBuilder).tokenProvider(
                        StaticTokenProvider.create(
                            object : SdkToken {
                                override fun token() = "testToken"
                                override fun expirationTime() = null
                            }
                        )
                    )
                }
            )
                .use {
                    it.generateAssistantResponse(
                        {},
                        GenerateAssistantResponseResponseHandler.builder()
                            .onEventStream {}
                            .onError { latch.countDown() }
                            .onComplete { latch.countDown() }
                            .build()
                    )
                }
        }

        latch.await()
    }
}
