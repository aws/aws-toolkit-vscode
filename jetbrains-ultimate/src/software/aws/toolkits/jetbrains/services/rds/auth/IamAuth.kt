// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.credentialStore.Credentials
import com.intellij.database.access.DatabaseCredentials
import com.intellij.database.dataSource.DatabaseAuthProvider
import com.intellij.database.dataSource.DatabaseAuthProvider.AuthWidget
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.DatabaseCredentialsAuthProvider
import com.intellij.database.dataSource.LocalDataSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.future.future
import software.amazon.awssdk.auth.signer.Aws4Signer
import software.amazon.awssdk.auth.signer.params.Aws4PresignerParams
import software.amazon.awssdk.http.SdkHttpFullRequest
import software.amazon.awssdk.http.SdkHttpMethod
import software.amazon.awssdk.regions.Region
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.datagrip.getAwsConnectionSettings
import software.aws.toolkits.jetbrains.datagrip.getDatabaseEngine
import software.aws.toolkits.jetbrains.datagrip.hostFromJdbcString
import software.aws.toolkits.jetbrains.datagrip.iamIsApplicable
import software.aws.toolkits.jetbrains.datagrip.portFromJdbcString
import software.aws.toolkits.jetbrains.datagrip.validateIamConfiguration
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DatabaseCredentials.IAM
import software.aws.toolkits.telemetry.RdsTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.CompletionStage

data class RdsAuth(
    val address: String,
    val port: Int,
    val user: String,
    val connectionSettings: ConnectionSettings
)

// [DatabaseAuthProvider] is marked as internal, but JetBrains advised this was a correct usage
class IamAuth : DatabaseAuthProvider, CoroutineScope by ApplicationThreadPoolScope("RdsIamAuth") {
    override fun getId(): String = providerId
    override fun getDisplayName(): String = message("rds.iam_connection_display_name")

    override fun isApplicable(dataSource: LocalDataSource): Boolean = iamIsApplicable(dataSource)
    override fun createWidget(credentials: DatabaseCredentials, dataSource: LocalDataSource): AuthWidget? = IamAuthWidget()

    override fun intercept(
        connection: ProtoConnection,
        silent: Boolean
    ): CompletionStage<ProtoConnection>? {
        LOG.info { "Intercepting db connection [$connection]" }
        return future {
            var result = Result.Succeeded
            try {
                val credentials = getCredentials(connection)
                DatabaseCredentialsAuthProvider.applyCredentials(connection, credentials, true)
            } catch (e: Throwable) {
                result = Result.Failed
                throw e
            } finally {
                RdsTelemetry.getCredentials(connection.runConfiguration.project, result, IAM, connection.getDatabaseEngine())
            }
        }
    }

    internal fun getAuthInformation(connection: ProtoConnection): RdsAuth {
        validateIamConfiguration(connection)
        val signingUrl = connection.connectionPoint.additionalJdbcProperties[RDS_SIGNING_HOST_PROPERTY]
            ?: connection.connectionPoint.url.hostFromJdbcString()
            ?: throw IllegalArgumentException(message("rds.validation.no_instance_host"))
        val signingPort = connection.connectionPoint.additionalJdbcProperties[RDS_SIGNING_PORT_PROPERTY]?.toIntOrNull()
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

    internal fun generateAuthToken(auth: RdsAuth): String {
        // TODO: Replace when SDK V2 backfills the pre-signer for rds auth token
        val httpRequest = SdkHttpFullRequest.builder()
            .method(SdkHttpMethod.GET)
            .protocol("https")
            .host(auth.address)
            .port(auth.port)
            .encodedPath("/")
            .putRawQueryParameter("DBUser", auth.user)
            .putRawQueryParameter("Action", "connect")
            .build()

        // TODO consider configurable expiration time (but 15 is the max)
        val expirationTime = Instant.now().plus(15, ChronoUnit.MINUTES)
        val presignRequest = Aws4PresignerParams.builder()
            .expirationTime(expirationTime)
            .awsCredentials(auth.connectionSettings.credentials.resolveCredentials())
            .signingName("rds-db")
            .signingRegion(Region.of(auth.connectionSettings.region.id))
            .build()

        return Aws4Signer.create().presign(httpRequest, presignRequest).uri.toString().removePrefix("https://")
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
