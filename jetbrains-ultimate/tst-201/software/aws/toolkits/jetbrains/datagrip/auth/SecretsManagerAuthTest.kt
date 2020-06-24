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
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.unwrap
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY

class SecretsManagerAuthTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val clientManager = MockClientManagerRule(projectRule)

    private val objectMapper = jacksonObjectMapper()

    private val sAuth = SecretsManagerAuth()
    private val username = RuleUtils.randomName()
    private val password = RuleUtils.randomName()
    private val secret = RuleUtils.randomName()
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val dbHost = "${RuleUtils.randomName()}.555555.us-west-2.rds.amazonaws.com"
    private val port = 5432

    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        MockCredentialsManager.getInstance().addCredentials(credentialId, mockCreds)
        MockRegionProvider.getInstance().addRegion(AwsRegion(defaultRegion, RuleUtils.randomName(), RuleUtils.randomName()))
    }

    @Test
    fun `Intercept credentials succeeds`() {
        createSecretsManagerClient()
        val connection = sAuth.intercept(buildConnection(), false)?.toCompletableFuture()?.get()
        assertThat(connection).isNotNull
        assertThat(connection!!.connectionProperties).containsKey("user")
        assertThat(connection.connectionProperties["user"]).isEqualTo(username)
        assertThat(connection.connectionProperties).containsKey("password")
        assertThat(connection.connectionProperties["password"]).isEqualTo(password)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No secret fails`() {
        sAuth.intercept(buildConnection(hasSecret = false), false)!!.unwrap()
    }

    @Test(expected = IllegalArgumentException::class)
    fun `Bad AWS connection fails`() {
        sAuth.intercept(buildConnection(hasCredentials = false), false)!!.unwrap()
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No username in credentials fails`() {
        createSecretsManagerClient(hasUsername = false)
        sAuth.intercept(buildConnection(), false)!!.unwrap()
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No password in credentials fails`() {
        createSecretsManagerClient(hasPassword = false)
        sAuth.intercept(buildConnection(), false)!!.unwrap()
    }

    @Test(expected = RuntimeException::class)
    fun `Secrets Manager client throws fails`() {
        createSecretsManagerClient(succeeds = false)
        sAuth.intercept(buildConnection(), false)!!.unwrap()
    }

    private fun createSecretsManagerClient(
        succeeds: Boolean = true,
        hasUsername: Boolean = true,
        hasPassword: Boolean = true
    ): SecretsManagerClient {
        val client = clientManager.create<SecretsManagerClient>()
        val secretMap = mutableMapOf<String, String>()
        if (hasUsername) {
            secretMap["username"] = username
        }
        if (hasPassword) {
            secretMap["password"] = password
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
        hasSecret: Boolean = true
    ): DatabaseConnectionInterceptor.ProtoConnection {
        val mockConnection = mock<LocalDataSource> {
            on { url } doReturn if (hasUrl) {
                "jdbc:postgresql://${if (hasHost) dbHost else ""}${if (hasPort) ":$port" else ""}/dev"
            } else {
                null
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
            on { connectionPoint } doReturn dbConnectionPoint
            on { runConfiguration } doAnswer {
                mock {
                    on { project } doAnswer { projectRule.project }
                }
            }
            on { connectionProperties } doReturn m
        }
    }
}
