// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.auth

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.database.dataSource.DatabaseConnectionInterceptor
import com.intellij.database.dataSource.DatabaseConnectionPoint
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.testFramework.ProjectRule
import io.mockk.every
import io.mockk.mockkStatic
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.ArgumentMatchers.anyString
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.whenever
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.unwrap
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.auth.compatability.project
import kotlin.test.assertNotNull

class SecretsManagerAuthTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val clientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    @Rule
    @JvmField
    val regionProvider = MockRegionProviderRule()

    private val objectMapper = jacksonObjectMapper()

    private val sAuth = SecretsManagerAuth()
    private val username = RuleUtils.randomName()
    private val password = RuleUtils.randomName()
    private val secret = RuleUtils.randomName()
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val dbHost = "${RuleUtils.randomName()}.555555.us-west-2.rds.amazonaws.com"
    private val port = RuleUtils.randomNumber()
    private val secretDbHost = "${RuleUtils.randomName()}.555555.us-west-2.rds.amazonaws.com"
    private val secretPort = RuleUtils.randomNumber()

    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        credentialManager.addCredentials(credentialId, mockCreds)
        regionProvider.addRegion(AwsRegion(defaultRegion, RuleUtils.randomName(), RuleUtils.randomName()))
    }

    @Test
    fun `Intercept credentials succeeds`() {
        createSecretsManagerClient()
        val connection = sAuth.intercept(buildConnection(), false)?.toCompletableFuture()?.get()
        assertNotNull(connection)
        assertThat(connection.connectionProperties).containsKey("user")
        assertThat(connection.connectionProperties["user"]).isEqualTo(username)
        assertThat(connection.connectionProperties).containsKey("password")
        assertThat(connection.connectionProperties["password"]).isEqualTo(password)
    }

    @Test
    fun `Intercept credentials succeeds with host and port from secret`() {
        createSecretsManagerClient()
        val connection = sAuth.intercept(buildConnection(usesUrlFromSecret = true), false)?.toCompletableFuture()?.get()
        assertNotNull(connection)
        assertThat(connection.connectionProperties).containsKey("user")
        assertThat(connection.connectionProperties["user"]).isEqualTo(username)
        assertThat(connection.connectionProperties).containsKey("password")
        assertThat(connection.connectionProperties["password"]).isEqualTo(password)
        assertThat(connection.url).contains("//$secretDbHost:$secretPort/")
    }

    @Test
    fun `Intercept credentials does not use host and port from secret when SSH tunnel is enabled`() {
        createSecretsManagerClient()
        val connection = sAuth.intercept(buildConnection(usesSshTunnel = true, usesUrlFromSecret = true), false)?.toCompletableFuture()?.get()
        assertNotNull(connection)
        assertThat(connection.connectionProperties).containsKey("user")
        assertThat(connection.connectionProperties["user"]).isEqualTo(username)
        assertThat(connection.connectionProperties).containsKey("password")
        assertThat(connection.connectionProperties["password"]).isEqualTo(password)
        assertThat(connection.url).doesNotContain("//$secretDbHost:$secretPort/")
    }

    @Test
    fun `No secret fails`() {
        assertThatThrownBy { sAuth.intercept(buildConnection(hasSecret = false), false)?.unwrap() }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `Bad AWS connection fails`() {
        assertThatThrownBy { sAuth.intercept(buildConnection(hasCredentials = false), false)?.unwrap() }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `No username in credentials fails`() {
        createSecretsManagerClient(hasUsername = false)
        assertThatThrownBy { sAuth.intercept(buildConnection(), false)?.unwrap() }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `No password in credentials fails`() {
        createSecretsManagerClient(hasPassword = false)
        assertThatThrownBy { sAuth.intercept(buildConnection(), false)?.unwrap() }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `When getting url from secret no host in secret fails`() {
        createSecretsManagerClient(hasHost = false)
        assertThatThrownBy { sAuth.intercept(buildConnection(usesUrlFromSecret = true), false)?.unwrap() }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `When getting url from secret no port in secret fails`() {
        createSecretsManagerClient(hasPort = false)
        assertThatThrownBy { sAuth.intercept(buildConnection(usesUrlFromSecret = true), false)?.unwrap() }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `Secrets Manager client throws fails`() {
        createSecretsManagerClient(succeeds = false)
        assertThatThrownBy { sAuth.intercept(buildConnection(), false)?.unwrap() }.isInstanceOf(RuntimeException::class.java)
    }

    private fun createSecretsManagerClient(
        succeeds: Boolean = true,
        hasUsername: Boolean = true,
        hasPassword: Boolean = true,
        hasHost: Boolean = true,
        hasPort: Boolean = true
    ): SecretsManagerClient {
        val client = clientManager.create<SecretsManagerClient>()
        val secretMap = mutableMapOf<String, String>()
        if (hasUsername) {
            secretMap["username"] = username
        }
        if (hasPassword) {
            secretMap["password"] = password
        }
        if (hasHost) {
            secretMap["host"] = secretDbHost
        }
        if (hasPort) {
            secretMap["port"] = secretPort.toString()
        }

        client.stub {
            if (succeeds) {
                on { getSecretValue(any<GetSecretValueRequest>()) } doAnswer {
                    GetSecretValueResponse.builder().name(secret).secretString(objectMapper.writeValueAsString(secretMap)).build()
                }
            } else {
                on { getSecretValue(any<GetSecretValueRequest>()) } doThrow RuntimeException("Terrible exception")
            }
        }
        return client
    }

    private fun buildConnection(
        hasUrl: Boolean = true,
        hasRegion: Boolean = true,
        hasCredentials: Boolean = true,
        hasHost: Boolean = true,
        hasPort: Boolean = true,
        hasSecret: Boolean = true,
        usesSshTunnel: Boolean = false,
        usesUrlFromSecret: Boolean = false
    ): DatabaseConnectionInterceptor.ProtoConnection {
        val mockConnection = mock<LocalDataSource> {
            on { url } doAnswer {
                if (hasUrl) {
                    "jdbc:postgresql://${if (hasHost) dbHost else ""}${if (hasPort) ":$port" else ""}/dev"
                } else {
                    null
                }
            }
            on { databaseDriver } doReturn null
            on { driverClass } doReturn "org.postgresql.Driver"
            on { sshConfiguration } doAnswer {
                if (usesSshTunnel) {
                    mockDataSourceSshTunnelConfiguration()
                } else {
                    null
                }
            }
        }
        val dbConnectionPoint = mock<DatabaseConnectionPoint> {
            on { additionalProperties } doAnswer {
                val m = mutableMapOf<String, String>()
                if (hasCredentials) {
                    m[CREDENTIAL_ID_PROPERTY] = credentialId
                }
                if (hasRegion) {
                    m[REGION_ID_PROPERTY] = defaultRegion
                }
                if (hasSecret) {
                    m[SECRET_ID_PROPERTY] = secret
                }
                if (usesUrlFromSecret) {
                    m[GET_URL_FROM_SECRET] = true.toString()
                }
                m
            }
            on { dataSource } doReturn mockConnection
            on { databaseDriver } doAnswer {
                mock {
                    on { id } doReturn "id"
                }
            }
        }
        return mock<DatabaseConnectionInterceptor.ProtoConnection> {
            val m = mutableMapOf<String, String?>()
            var u = if (hasUrl) {
                "jdbc:postgresql://${if (hasHost) dbHost else ""}${if (hasPort) ":$port" else ""}/dev"
            } else {
                null
            }
            on { connectionPoint } doReturn dbConnectionPoint
            on { connectionProperties } doReturn m
            on { url } doAnswer {
                u
            }

            // gross syntax for setter mock
            doAnswer {
                u = it.arguments[0] as String
                Unit
            }.whenever(it).url = anyString()
        }.also {
            mockkStatic("software.aws.toolkits.jetbrains.datagrip.auth.compatability.DatabaseAuthProviderCompatabilityAdapterKt")
            every {
                it.project()
            } returns projectRule.project
        }
    }
}
