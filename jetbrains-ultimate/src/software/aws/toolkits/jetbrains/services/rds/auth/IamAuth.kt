// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.credentialStore.Credentials
import com.intellij.database.access.DatabaseCredentials
import com.intellij.database.dataSource.DatabaseAuthProvider.AuthWidget
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.DatabaseCredentialsAuthProvider
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.future
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.rds.RdsUtilities
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.datagrip.auth.compatability.DatabaseAuthProviderCompatabilityAdapter
import software.aws.toolkits.jetbrains.datagrip.auth.compatability.project
import software.aws.toolkits.jetbrains.datagrip.getAwsConnectionSettings
import software.aws.toolkits.jetbrains.datagrip.getDatabaseEngine
import software.aws.toolkits.jetbrains.datagrip.hostFromJdbcString
import software.aws.toolkits.jetbrains.datagrip.iamIsApplicable
import software.aws.toolkits.jetbrains.datagrip.portFromJdbcString
import software.aws.toolkits.jetbrains.datagrip.validateIamConfiguration
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DatabaseCredentials.IAM
import software.aws.toolkits.telemetry.RdsTelemetry
import software.aws.toolkits.telemetry.Result
import java.util.concurrent.CompletionStage

data class RdsAuth(
    val address: String,
    val port: Int,
    val user: String,
    val connectionSettings: ConnectionSettings
)

// [DatabaseAuthProvider] is marked as internal, but JetBrains advised this was a correct usage
class IamAuth : DatabaseAuthProviderCompatabilityAdapter {
    private val rdsUtilities = RdsUtilities.builder().build()

    override fun getId(): String = providerId
    override fun getDisplayName(): String = message("rds.iam_connection_display_name")

    override fun isApplicable(dataSource: LocalDataSource): Boolean = iamIsApplicable(dataSource)

    override fun createWidget(project: Project?, credentials: DatabaseCredentials, dataSource: LocalDataSource): AuthWidget? = IamAuthWidget()

    override fun intercept(
        connection: ProtoConnection,
        silent: Boolean
    ): CompletionStage<ProtoConnection>? {
        LOG.info { "Intercepting db connection [$connection]" }
        val project = connection.project()
        val scope = projectCoroutineScope(project)
        return scope.future {
            var result = Result.Succeeded
            try {
                val credentials = getCredentials(connection)
                DatabaseCredentialsAuthProvider.applyCredentials(connection, credentials, true)
            } catch (e: Throwable) {
                result = Result.Failed
                throw e
            } finally {
                RdsTelemetry.getCredentials(project, result, IAM, connection.getDatabaseEngine())
            }
        }
    }

    internal fun getAuthInformation(connection: ProtoConnection): RdsAuth {
        validateIamConfiguration(connection)
        val signingUrl = connection.connectionPoint.additionalProperties[RDS_SIGNING_HOST_PROPERTY]
            ?: connection.connectionPoint.url.hostFromJdbcString()
            ?: throw IllegalArgumentException(message("rds.validation.no_instance_host"))
        val signingPort = connection.connectionPoint.additionalProperties[RDS_SIGNING_PORT_PROPERTY]?.toIntOrNull()
            ?: connection.connectionPoint.url.portFromJdbcString()?.toIntOrNull()
            ?: throw IllegalArgumentException(message("rds.validation.no_instance_port"))
        val user = connection.connectionPoint.dataSource.username

        if (user.isBlank()) {
            throw IllegalArgumentException(message("rds.validation.username"))
        }

        return RdsAuth(
            signingUrl,
            signingPort,
            user,
            connection.getAwsConnectionSettings()
        )
    }

    internal fun generateAuthToken(auth: RdsAuth): String = rdsUtilities.generateAuthenticationToken {
        it.credentialsProvider(auth.connectionSettings.credentials)
        it.region(Region.of(auth.connectionSettings.region.id))
        it.hostname(auth.address)
        it.port(auth.port)
        it.username(auth.user)
    }

    private fun getCredentials(connection: ProtoConnection): Credentials {
        val authInformation = getAuthInformation(connection)
        val authToken = generateAuthToken(authInformation)
        return Credentials(authInformation.user, authToken)
    }

    companion object {
        const val providerId = "aws.rds.iam"
        private val LOG = getLogger<IamAuth>()
    }
}
