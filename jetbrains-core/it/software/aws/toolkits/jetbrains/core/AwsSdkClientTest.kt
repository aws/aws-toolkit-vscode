// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.Experiments
import com.intellij.testFramework.ApplicationRule
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
import software.amazon.awssdk.services.lambda.LambdaClient

class AwsSdkClientTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    private val experimentId = "aws.toolkit.useProxy"

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
        Experiments.setFeatureEnabled(experimentId, true)

        val httpConfigurable = HttpConfigurable.getInstance()
        httpConfigurable.USE_HTTP_PROXY = true
        httpConfigurable.PROXY_HOST = "localhost"
        httpConfigurable.PROXY_PORT = proxyServer.uri.port
    }

    @After
    fun tearDown() {
        HttpConfigurable.getInstance().USE_HTTP_PROXY = false
        Experiments.setFeatureEnabled(experimentId, false)

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
        LambdaClient.builder()
            .region(Region.US_WEST_2)
            .httpClient(AwsSdkClient.getInstance().sdkHttpClient)
            .build().use {
                it.listFunctions()
            }
    }
}