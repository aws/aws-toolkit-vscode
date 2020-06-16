// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.DatabaseConnectionPoint
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.core.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import java.util.concurrent.ExecutionException

class IamAuthTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val iamAuth = IamAuth()
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val username = RuleUtils.randomName()
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
        val connection = iamAuth.intercept(buildConnection(), false)?.toCompletableFuture()?.get()
        assertThat(connection).isNotNull
        assertThat(connection!!.connectionProperties).containsKey("user")
        assertThat(connection.connectionProperties["user"]).isEqualTo(username)
        assertThat(connection.connectionProperties).containsKey("password")
        assertThat(connection.connectionProperties["password"])
            .contains("X-Amz-Signature")
            .contains("connect")
            .contains(username)
            .contains(dbHost)
            .doesNotStartWith("https://")
    }

    @Test(expected = ExecutionException::class)
    fun `Intercept credentials fails`() {
        iamAuth.intercept(buildConnection(hasHost = false), false)!!.toCompletableFuture().get()
    }

    @Test
    fun `Valid connection`() {
        val authInformation = iamAuth.getAuthInformation(buildConnection())
        assertThat(authInformation.port).isEqualTo(port)
        assertThat(authInformation.user).isEqualTo(username)
        assertThat(authInformation.connectionSettings.region.id).isEqualTo(defaultRegion)
        assertThat(authInformation.hostname).isEqualTo(dbHost)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No url`() {
        iamAuth.getAuthInformation(buildConnection(hasUrl = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No username`() {
        iamAuth.getAuthInformation(buildConnection(hasUsername = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No region`() {
        iamAuth.getAuthInformation(buildConnection(hasUsername = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No credentials`() {
        iamAuth.getAuthInformation(buildConnection(hasCredentials = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No port`() {
        iamAuth.getAuthInformation(buildConnection(hasPort = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No host`() {
        iamAuth.getAuthInformation(buildConnection(hasHost = false))
    }

    @Test
    fun `Generate pre-signed auth token request succeeds`() {
        val connection = iamAuth.getAuthInformation(buildConnection())
        val request = iamAuth.generateAuthToken(connection)
        assertThat(request)
            .contains("X-Amz-Signature")
            .contains("connect")
            .contains(username)
            .contains(dbHost)
            .doesNotStartWith("https://")
    }

    private fun buildConnection(
        hasUrl: Boolean = true,
        hasUsername: Boolean = true,
        hasRegion: Boolean = true,
        hasCredentials: Boolean = true,
        hasHost: Boolean = true,
        hasPort: Boolean = true
    ): ProtoConnection {
        val mockConnection = mock<LocalDataSource> {
            on { url } doReturn if (hasUrl) {
                "jdbc:postgresql://${if (hasHost) dbHost else ""}${if (hasPort) ":$port" else ""}/dev"
            } else {
                null
            }
            on { databaseDriver } doReturn null
            on { driverClass } doReturn "org.postgresql.Driver"
            on { username } doReturn if (hasUsername) username else ""
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
                m
            }
            on { dataSource } doReturn mockConnection
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
