// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.intellij.database.Dbms
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.DatabaseConnectionPoint
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.RequireSsl
import software.aws.toolkits.jetbrains.services.rds.auth.IamAuth
import software.aws.toolkits.jetbrains.services.rds.auth.RDS_SIGNING_HOST_PROPERTY
import software.aws.toolkits.jetbrains.services.rds.auth.RDS_SIGNING_PORT_PROPERTY
import software.aws.toolkits.resources.message

// FIX_WHEN_MIN_IS_202 merge this with the normal one
class IamAuthTest202 {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    private val iamAuth = IamAuth()
    private val credentialId = RuleUtils.randomName()
    private val username = RuleUtils.randomName()
    private val instancePort = RuleUtils.randomNumber().toString()
    private val dbHost = "${RuleUtils.randomName()}.555555.us-west-2.rds.amazonaws.com"
    private val connectionPort = 5432

    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        credentialManager.addCredentials(credentialId, mockCreds)
    }

    @Test
    fun `Valid mysql aurora connection`() {
        val authInformation = iamAuth.getAuthInformation(buildConnection(dbmsType = Dbms.MYSQL_AURORA))
        assertThat(authInformation.port.toString()).isEqualTo(instancePort)
        assertThat(authInformation.user).isEqualTo(username)
        assertThat(authInformation.connectionSettings.region.id).isEqualTo(getDefaultRegion().id)
        assertThat(authInformation.address).isEqualTo(dbHost)
    }

    @Test
    fun `No ssl config aurora mysql throws`() {
        assertThatThrownBy { iamAuth.getAuthInformation(buildConnection(dbmsType = Dbms.MYSQL_AURORA, hasSslConfig = false)) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage(message("rds.validation.aurora_mysql_ssl_required"))
    }

    // FIX_WHEN_MIN_IS_202 merge IamAuthTest202 and make this private again
    fun buildConnection(
        hasUsername: Boolean = true,
        hasRegion: Boolean = true,
        hasHost: Boolean = true,
        hasPort: Boolean = true,
        hasCredentials: Boolean = true,
        hasBadHost: Boolean = false,
        hasSslConfig: Boolean = true,
        dbmsType: Dbms = Dbms.POSTGRES
    ): ProtoConnection {
        val mockConnection = mock<LocalDataSource> {
            on { url } doReturn "jdbc:postgresql://$dbHost:$connectionPort/dev"
            on { databaseDriver } doReturn null
            on { driverClass } doReturn "org.postgresql.Driver"
            on { username } doReturn if (hasUsername) username else ""
            on { dbms } doReturn dbmsType
            on { sslCfg } doReturn if (hasSslConfig) RequireSsl else null
        }
        val dbConnectionPoint = mock<DatabaseConnectionPoint> {
            on { url } doAnswer { if (hasBadHost) null else "jdbc:postgresql://$dbHost:$connectionPort/dev" }
            on { additionalJdbcProperties } doAnswer {
                val m = mutableMapOf<String, String>()
                if (hasCredentials) {
                    m[CREDENTIAL_ID_PROPERTY] = credentialId
                }
                if (hasRegion) {
                    m[REGION_ID_PROPERTY] = getDefaultRegion().id
                }
                if (hasHost) {
                    m[RDS_SIGNING_HOST_PROPERTY] = dbHost
                }
                if (hasPort) {
                    m[RDS_SIGNING_PORT_PROPERTY] = instancePort
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
