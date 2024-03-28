// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.pinning

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.AwsCredentialConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection

class ConnectionPinningManagerTest {

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    private lateinit var sut: DefaultConnectionPinningManager

    @Before
    fun setUp() {
        sut = spy(DefaultConnectionPinningManager())
    }

    @Test
    fun `switching connection to unsupported feature always pins initial connection`() {
        val feature = object : FeatureWithPinnedConnection {
            override val featureId = "mockId"
            override val featureName = "mockFeature"
            override fun supportsConnectionType(connection: ToolkitConnection) = connection.id == "oldConn"
        }

        val oldConnection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "oldConn"
        }

        val newConnection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "newConn"
        }

        val mockAuthManager = mock<ToolkitAuthManager> {
            on { it.getConnection("oldConn") }.thenReturn(oldConnection)
            on { it.getConnection("newConn") }.thenReturn(newConnection)
        }
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, mockAuthManager, disposableRule.disposable)

        sut.pinFeatures(oldConnection, newConnection, listOf(feature))

        assertThat(sut.getPinnedConnection(feature)).isEqualTo(oldConnection)
    }

    @Test
    fun `add new supported connection will pin the feature`() {
        val feature = object : FeatureWithPinnedConnection {
            override val featureId = "mockId"
            override val featureName = "mockFeature"
            override fun supportsConnectionType(connection: ToolkitConnection) = true
        }

        val newConnection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "connId"
        }

        val mockAuthManager = mock<ToolkitAuthManager> {
            on { it.getConnection("connId") }.thenReturn(newConnection)
        }
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, mockAuthManager, disposableRule.disposable)

        sut.pinFeatures(null, newConnection, listOf(feature))

        assertThat(sut.getPinnedConnection(feature)).isEqualTo(newConnection)
    }

    @Test
    fun `pins to old if new connection does not support feature`() {
        val oldConnection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "oldConn"
        }

        val newConnection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "newConn"
        }

        val feature = object : FeatureWithPinnedConnection {
            override val featureId = "mockId"
            override val featureName = "mockFeature"
            override fun supportsConnectionType(connection: ToolkitConnection) = connection.id == "oldConn"
        }

        val mockAuthManager = mock<ToolkitAuthManager> {
            on { it.getConnection("oldConn") }.thenReturn(oldConnection)
            on { it.getConnection("newConn") }.thenReturn(newConnection)
        }
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, mockAuthManager, disposableRule.disposable)

        sut.pinFeatures(oldConnection, newConnection, listOf(feature))

        assertThat(sut.getPinnedConnection(feature)).isEqualTo(oldConnection)
    }

    @Test
    fun `switching connection from unsupported feature pins connection to new connection`() {
        val oldConnectionId = "connId"

        val feature = object : FeatureWithPinnedConnection {
            override val featureId = "mockId"
            override val featureName = "mockFeature"
            override fun supportsConnectionType(connection: ToolkitConnection) =
                connection is AwsBearerTokenConnection
        }

        val oldConnection = mock<AwsCredentialConnection> {
            on { id } doReturn oldConnectionId
        }

        val newConnection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "newId"
        }
        val mockAuthManager = mock<ToolkitAuthManager> {
            on { it.getConnection(oldConnectionId) }.thenReturn(oldConnection)
            on { it.getConnection("newId") }.thenReturn(newConnection)
        }
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, mockAuthManager, disposableRule.disposable)

        sut.pinFeatures(oldConnection, newConnection, listOf(feature))

        assertThat(sut.getPinnedConnection(feature)).isEqualTo(newConnection)
    }

    @Test
    fun `pinned connection returns null if connection no longer exists in auth manager`() {
        val feature = object : FeatureWithPinnedConnection {
            override val featureId = "mockId"
            override val featureName = "mockFeature"
            override fun supportsConnectionType(connection: ToolkitConnection) = true
        }
        val connection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "connId"
        }

        sut.setPinnedConnection(feature, connection)

        assertThat(sut.getPinnedConnection(feature)).isNull()
    }

    @Test
    fun `pinned connection returns null if connection is not valid for feature`() {
        val feature = object : FeatureWithPinnedConnection {
            override val featureId = "mockId"
            override val featureName = "mockFeature"
            override fun supportsConnectionType(connection: ToolkitConnection) = false
        }
        val connection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "connId"
        }
        val mockAuthManager = mock<ToolkitAuthManager> {
            whenever(it.getConnection(any())).thenReturn(connection)
        }
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, mockAuthManager, disposableRule.disposable)

        sut.setPinnedConnection(feature, connection)

        assertThat(sut.getPinnedConnection(feature)).isNull()
    }

    @Test
    fun `respects pinned feature`() {
        val feature = object : FeatureWithPinnedConnection {
            override val featureId = "mockId"
            override val featureName = "mockFeature"
            override fun supportsConnectionType(connection: ToolkitConnection) = true
        }
        val connection = mock<AwsBearerTokenConnection> {
            on { id } doReturn "connId"
        }
        val mockAuthManager = mock<ToolkitAuthManager> {
            whenever(it.getConnection(any())).thenReturn(connection)
        }
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, mockAuthManager, disposableRule.disposable)

        sut.setPinnedConnection(feature, connection)

        assertThat(sut.getPinnedConnection(feature)).isEqualTo(connection)
    }
}
