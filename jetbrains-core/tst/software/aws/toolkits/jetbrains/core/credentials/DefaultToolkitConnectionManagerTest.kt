// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
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
    fun `switch connection to null will fall back to IAM credential if applicable`() {
        val bearerConnection = ManagedBearerSsoConnection(aString(), "us-east-1", emptyList())
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

    private fun configureSut(sut: ToolkitConnectionManager, conneciton1: ToolkitConnection?) {
        val clazz = sut::class.java
        clazz.getDeclaredField("connection").apply {
            this.trySetAccessible()
            this.set(sut, conneciton1)
        }
    }
}
