// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
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
import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.DBInstance
import software.amazon.awssdk.services.rds.model.DescribeDbInstancesRequest
import software.amazon.awssdk.services.rds.model.DescribeDbInstancesResponse
import software.amazon.awssdk.services.rds.model.Endpoint
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.unwrap
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY

class IamAuthTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val iamAuth = IamAuth()
    private val credentialId = RuleUtils.randomName()
    private val defaultRegion = RuleUtils.randomName()
    private val username = RuleUtils.randomName()
    private val instanceId = RuleUtils.randomName()
    private val dbHost = "$instanceId.555555.us-west-2.rds.amazonaws.com"
    private val port = 5432

    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        MockCredentialsManager.getInstance().addCredentials(credentialId, mockCreds)
        MockRegionProvider.getInstance().addRegion(AwsRegion(defaultRegion, RuleUtils.randomName(), RuleUtils.randomName()))
        mockClientManagerRule.create<RdsClient>().stub {
            on { describeDBInstances(any<DescribeDbInstancesRequest>()) } doAnswer {
                DescribeDbInstancesResponse.builder().dbInstances(
                    DBInstance
                        .builder()
                        .dbInstanceIdentifier(instanceId)
                        .endpoint(Endpoint.builder().address(dbHost).port(port).build())
                        .build()
                ).build()
            }
        }
    }

    @Test
    fun `Intercept credentials succeeds`() {
        val connection = iamAuth.intercept(buildConnection(), false)?.unwrap()
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

    @Test(expected = IllegalArgumentException::class)
    fun `Intercept credentials fails`() {
        iamAuth.intercept(buildConnection(hasInstance = false), false)?.unwrap()
    }

    @Test(expected = RuntimeException::class)
    fun `Intercept credentials fails invalid instance`() {
        // empty mockClientManger
        mockClientManagerRule.reset()
        mockClientManagerRule.create<RdsClient>().stub {
            on { describeDBInstances(any<DescribeDbInstancesRequest>()) } doThrow RuntimeException("bad exception")
        }
        iamAuth.intercept(buildConnection(), false)?.unwrap()
    }

    @Test
    fun `Valid connection`() {
        val authInformation = iamAuth.getAuthInformation(projectRule.project, buildConnection())
        assertThat(authInformation.port).isEqualTo(port)
        assertThat(authInformation.user).isEqualTo(username)
        assertThat(authInformation.connectionSettings.region.id).isEqualTo(defaultRegion)
        assertThat(authInformation.address).isEqualTo(dbHost)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No username`() {
        iamAuth.getAuthInformation(projectRule.project, buildConnection(hasUsername = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No region`() {
        iamAuth.getAuthInformation(projectRule.project, buildConnection(hasUsername = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No credentials`() {
        iamAuth.getAuthInformation(projectRule.project, buildConnection(hasCredentials = false))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `No instance id`() {
        iamAuth.getAuthInformation(projectRule.project, buildConnection(hasInstance = false))
    }

    @Test
    fun `Generate pre-signed auth token request succeeds`() {
        val connection = iamAuth.getAuthInformation(projectRule.project, buildConnection())
        val request = iamAuth.generateAuthToken(connection)
        assertThat(request)
            .contains("X-Amz-Signature")
            .contains("connect")
            .contains(username)
            .contains(dbHost)
            .doesNotStartWith("https://")
    }

    private fun buildConnection(
        hasUsername: Boolean = true,
        hasRegion: Boolean = true,
        hasInstance: Boolean = true,
        hasCredentials: Boolean = true
    ): ProtoConnection {
        val mockConnection = mock<LocalDataSource> {
            on { url } doReturn "jdbc:postgresql://$dbHost:$port/dev"
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
                if (hasInstance) {
                    m[INSTANCE_ID_PROPERTY] = instanceId
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
