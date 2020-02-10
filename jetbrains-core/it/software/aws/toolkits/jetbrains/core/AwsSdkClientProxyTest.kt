// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.application.WriteAction
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.net.HttpConfigurable
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.spy
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
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
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client

class AwsSdkClientProxyTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

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

    @Test(expected = AssertionError::class)
    fun callCantBeMadeOnEdt() {
        runInEdtAndWait {
            makeAwsCall()
        }
    }

    @Test(expected = AssertionError::class)
    fun callCantBeMadeInReadAction() {
        ReadAction.run<Nothing> {
            makeAwsCall()
        }
    }

    @Test(expected = AssertionError::class)
    fun callCantBeMadeInWriteAction() {
        runInEdtAndWait {
            WriteAction.run<Nothing> {
                makeAwsCall()
            }
        }
    }

    private fun makeAwsCall() {
        S3Client.builder()
            .region(Region.US_WEST_2)
            .httpClient(AwsSdkClient.getInstance().sdkHttpClient)
            .build().use {
                it.listBuckets()
            }
    }
}
