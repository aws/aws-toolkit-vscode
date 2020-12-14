// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.auth

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.database.dataSource.DatabaseConnectionInterceptor
import com.intellij.database.dataSource.DatabaseConnectionPoint
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.ArgumentMatchers.anyString
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
        }
        val dbConnectionPoint = mock<DatabaseConnectionPoint> {
            on { additionalJdbcProperties } doAnswer {
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
        return mock {
            val m = mutableMapOf<String, String>()
            var u = if (hasUrl) {
                "jdbc:postgresql://${if (hasHost) dbHost else ""}${if (hasPort) ":$port" else ""}/dev"
            } else {
                null
            }
            on { connectionPoint } doReturn dbConnectionPoint
            on { runConfiguration } doAnswer {
                mock {
                    on { project } doAnswer { projectRule.project }
                }
            }
            on { connectionProperties } doReturn m
            on { getUrl() } doAnswer {
                u
            }
            on { setUrl(anyString()) } doAnswer {
                u = it.arguments[0] as String
                Unit
            }
        }
    }
}
