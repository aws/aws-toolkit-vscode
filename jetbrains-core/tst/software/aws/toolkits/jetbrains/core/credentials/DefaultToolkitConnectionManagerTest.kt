// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.utils.isInstanceOf

class DefaultToolkitConnectionManagerTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val credManager = MockCredentialManagerRule()

    @JvmField
    @Rule
    val authManager = MockToolkitAuthManagerRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    private lateinit var sut: DefaultToolkitConnectionManager

    @Before
    fun setUp() {
        mockClientManager.create<SsoOidcClient>()
        sut = DefaultToolkitConnectionManager(projectRule.project)
    }

    @Test
    fun `active connection is null if no connection or credentials`() {
        credManager.clear()
        assertThat(sut.activeConnection()).isNull()
    }

    @Test
    fun `active connection defaults to credentials`() {
        assertThat(sut.activeConnection()).isInstanceOf<AwsConnectionManagerConnection>()
    }

    @Test
    fun `loads connection from state`() {
        credManager.clear()
        assertThat(sut.activeConnection()).isEqualTo(null)

        val connection = authManager.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList()))
        sut.loadState(ToolkitConnectionManagerState(connection.id))

        assertThat(sut.activeConnection()).isEqualTo(connection)
    }

    @Test
    fun `loads a us-east-1 connection from state that does not contain the region string`() {
        credManager.clear()
        assertThat(sut.activeConnection()).isEqualTo(null)

        val connection = authManager.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList()))
        sut.loadState(ToolkitConnectionManagerState("sso;https://view.awsapps.com/start"))

        assertThat(sut.activeConnection()).isEqualTo(connection)
    }

    @Test
    fun `loads null connection from state which has an invalid format`() {
        credManager.clear()
        assertThat(sut.activeConnection()).isEqualTo(null)

        sut.loadState(ToolkitConnectionManagerState("An invalid active connection id"))

        assertThat(sut.activeConnection()).isEqualTo(null)
    }

    @Test
    fun `switch connection to null will fall back to IAM credential if applicable`() {
        val bearerConnection = LegacyManagedBearerSsoConnection(aString(), "us-east-1", emptyList())
        configureSut(sut, bearerConnection)

        sut.switchConnection(null)

        assertThat(sut.activeConnection()).isInstanceOf<AwsConnectionManagerConnection>()
    }

    @Test
    fun `switch connection to null will fall back to the first SSO connection in the list if IAM credential is not available`() {
        credManager.clear()
        val conneciton1 = authManager.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList()))
        authManager.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList()))
        authManager.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList()))
        configureSut(sut, conneciton1)

        sut.switchConnection(null)

        assertThat(sut.activeConnection())
            .isEqualTo(ToolkitAuthManager.getInstance().listConnections()[0])
            .isInstanceOf<AwsBearerTokenConnection>()
    }

    @Test
    fun `activeConnectionForFeature falls back to default if not pinned`() {
        credManager.clear()
        configureSut(sut, null)
        val pinningMock = mock<ConnectionPinningManager>()
        val feature = mock<FeatureWithPinnedConnection> {
            on { it.supportsConnectionType(any()) } doReturn true
            on { it.featureId } doReturn "test"
        }

        ApplicationManager.getApplication().replaceService(ConnectionPinningManager::class.java, pinningMock, disposableRule.disposable)
        assertThat(sut.activeConnectionForFeature(feature)).isNull()

        val connection = authManager.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList()))
        assertThat(sut.activeConnectionForFeature(feature)).isEqualTo(connection)
    }

    private fun configureSut(sut: ToolkitConnectionManager, conneciton1: ToolkitConnection?) {
        val clazz = sut::class.java
        clazz.getDeclaredField("connection").apply {
            this.trySetAccessible()
            this.set(sut, conneciton1)
        }
    }
}
