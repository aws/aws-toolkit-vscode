// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse
import software.amazon.awssdk.services.secretsmanager.model.SecretListEntry
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.datagrip.auth.SecretsManagerDbSecret
import software.aws.toolkits.jetbrains.services.rds.RdsNode
import software.aws.toolkits.jetbrains.services.redshift.RedshiftExplorerNode
import software.aws.toolkits.jetbrains.services.redshift.RedshiftResources.redshiftEngineType

class DatabaseSecretTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    private val secretName = RuleUtils.randomName()
    private val randomHost = RuleUtils.randomName()
    private val randomEngine = RuleUtils.randomName()
    private val secret = SecretListEntry.builder().name(secretName).arn("arn").build()

    @Test
    fun `Get secret null secret returns null`() {
        assertThat(DatabaseSecret.getSecret(projectRule.project, null)).isNull()
    }

    @Test
    fun `Get secret fails returns null`() {
        mockClientManagerRule.create<SecretsManagerClient>().stub {
            on { getSecretValue(any<GetSecretValueRequest>()) } doThrow IllegalStateException("bad error")
        }
        assertThat(DatabaseSecret.getSecret(projectRule.project, secret)).isNull()
    }

    @Test
    fun `Get secret invalid json returns null`() {
        mockClientManagerRule.create<SecretsManagerClient>().stub {
            on { getSecretValue(any<GetSecretValueRequest>()) } doReturn GetSecretValueResponse.builder().secretString("{{{").build()
        }
        assertThat(DatabaseSecret.getSecret(projectRule.project, secret)).isNull()
    }

    @Test
    fun `Get secret missing all fields returns properly`() {
        mockClientManagerRule.create<SecretsManagerClient>().stub {
            on { getSecretValue(any<GetSecretValueRequest>()) } doReturn GetSecretValueResponse.builder().secretString("{}").build()
        }
        val response = DatabaseSecret.getSecret(projectRule.project, secret)
        assertThat(response).isNotNull
        assertThat(response!!.second).isEqualTo("arn")
        assertThat(response.first.username).isNull()
    }

    @Test
    fun `Get secret works`() {
        mockClientManagerRule.create<SecretsManagerClient>().stub {
            on { getSecretValue(any<GetSecretValueRequest>()) } doReturn GetSecretValueResponse.builder()
                .secretString(
                    """{
                                      "username": "awsuser",
                                      "password": "password",
                                      "engine": "redshift",
                                      "host": "redshift-cluster.55555.us-west-2.redshift.amazonaws.com",
                                      "port": 5000,
                                      "dbClusterIdentifier": "redshift-cluster"
                              }"""
                )
                .build()
        }
        val response = DatabaseSecret.getSecret(projectRule.project, secret)
        assertThat(response).isNotNull
        assertThat(response!!.second).isEqualTo("arn")
        assertThat(response.first.username).isEqualTo("awsuser")
        assertThat(response.first.engine).isEqualTo("redshift")
        assertThat(response.first.port).isEqualTo("5000")
        assertThat(response.first.password).isEqualTo("password")
        assertThat(response.first.host).isEqualTo("redshift-cluster.55555.us-west-2.redshift.amazonaws.com")
    }

    @Test
    fun `Validate secret no username`() {
        val dbSecret = buildSecretsManagerDbSecret(username = null)
        assertThat(DatabaseSecret.validateSecret(mock(), dbSecret, "")).isNotNull
    }

    @Test
    fun `Validate secret no password`() {
        val dbSecret = buildSecretsManagerDbSecret(password = null)
        assertThat(DatabaseSecret.validateSecret(mock(), dbSecret, "")).isNotNull
    }

    @Test
    fun `Validate secret root node`() {
        val dbSecret = buildSecretsManagerDbSecret()
        assertThat(DatabaseSecret.validateSecret(mock(), dbSecret, "")).isNull()
    }

    @Test
    fun `Validate secret RDS node`() {
        assertThat(DatabaseSecret.validateSecret(buildMockRdsNode(), buildSecretsManagerDbSecret(), "")).isNull()
    }

    @Test
    fun `Validate secret RDS node wrong endpoint`() {
        assertThat(DatabaseSecret.validateSecret(buildMockRdsNode(validEndpoint = false), buildSecretsManagerDbSecret(), "")).isNotNull
    }

    @Test
    fun `Validate secret RDS node wrong engine`() {
        assertThat(DatabaseSecret.validateSecret(buildMockRdsNode(validEngine = false), buildSecretsManagerDbSecret(), "")).isNotNull
    }

    @Test
    fun `Validate secret Redshift node`() {
        assertThat(DatabaseSecret.validateSecret(buildMockRedshiftNode(), buildSecretsManagerDbSecret(engine = redshiftEngineType), "")).isNull()
    }

    @Test
    fun `Validate secret Redshift node wrong endpoint`() {
        assertThat(
            DatabaseSecret.validateSecret(
                buildMockRedshiftNode(validEndpoint = false),
                buildSecretsManagerDbSecret(engine = redshiftEngineType),
                ""
            )
        ).isNotNull
    }

    @Test
    fun `Validate secret Redshift node wrong engine`() {
        assertThat(
            DatabaseSecret.validateSecret(
                buildMockRedshiftNode(validEndpoint = false),
                buildSecretsManagerDbSecret(engine = "notRedshift"),
                ""
            )
        ).isNotNull
    }

    private fun buildMockRedshiftNode(
        validEndpoint: Boolean = true
    ): RedshiftExplorerNode = mock {
        on { cluster } doAnswer {
            mock {
                on { endpoint() } doAnswer { mock { on { address() } doReturn if (validEndpoint) randomHost else "invalidHost" } }
            }
        }
    }

    private fun buildMockRdsNode(
        validEndpoint: Boolean = true,
        validEngine: Boolean = true
    ): RdsNode = mock {
        on { dbInstance } doAnswer {
            mock {
                on { engine() } doAnswer { if (validEngine) randomEngine else "notAValidEngine" }
                on { endpoint() } doAnswer { mock { on { address() } doReturn if (validEndpoint) randomHost else "invalidHost" } }
            }
        }
    }

    private fun buildSecretsManagerDbSecret(
        username: String? = "username",
        password: String? = "password",
        engine: String? = randomEngine,
        host: String? = randomHost,
        port: String? = "5000"
    ) = SecretsManagerDbSecret(username, password, engine, host, port)
}
