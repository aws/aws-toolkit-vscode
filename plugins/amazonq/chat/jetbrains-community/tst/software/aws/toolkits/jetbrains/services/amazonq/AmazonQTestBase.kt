// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.modules
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import org.junit.Before
import org.junit.Rule
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceAuthorizationGrantToken
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.services.amazonq.clients.AmazonQStreamingClient
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import java.time.Instant

open class AmazonQTestBase(
    @Rule @JvmField
    val projectRule: CodeInsightTestFixtureRule = JavaCodeInsightTestFixtureRule(),
) {
    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    internal lateinit var project: Project
    internal lateinit var module: Module
    internal lateinit var clientAdaptorSpy: AmazonQStreamingClient
    internal lateinit var toolkitConnectionManager: ToolkitConnectionManager

    @Before
    open fun setup() {
        project = projectRule.project
        toolkitConnectionManager = spy(ToolkitConnectionManager.getInstance(project))

        val accessToken = DeviceAuthorizationGrantToken(aString(), aString(), aString(), aString(), Instant.MAX, Instant.now())

        val provider = mock<BearerTokenProvider> {
            doReturn(accessToken).whenever(it).refresh()
        }

        val mockBearerProvider = mock<ToolkitBearerTokenProvider> {
            doReturn(provider).whenever(it).delegate
        }

        val connectionSettingsMock = mock<TokenConnectionSettings> {
            whenever(it.tokenProvider).thenReturn(mockBearerProvider)
        }

        val toolkitConnection = mock<AwsBearerTokenConnection> {
            doReturn(connectionSettingsMock).whenever(it).getConnectionSettings()
        }
        doReturn(toolkitConnection).whenever(toolkitConnectionManager).activeConnectionForFeature(any())

        project.replaceService(ToolkitConnectionManager::class.java, toolkitConnectionManager, disposableRule.disposable)

        clientAdaptorSpy = spy(AmazonQStreamingClient.getInstance(project))

        project.replaceService(AmazonQStreamingClient::class.java, clientAdaptorSpy, disposableRule.disposable)

        module = project.modules.firstOrNull() ?: if (projectRule is HeavyJavaCodeInsightTestFixtureRule) {
            projectRule.fixture.addModule("module1")
        } else {
            TODO()
        }
    }
}
