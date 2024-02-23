// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.auth

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.credentialStore.Credentials
import com.intellij.database.access.DatabaseCredentials
import com.intellij.database.dataSource.DatabaseAuthProvider.AuthWidget
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.DatabaseCredentialsAuthProvider
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.future
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.datagrip.auth.compatability.DatabaseAuthProviderCompatabilityAdapter
import software.aws.toolkits.jetbrains.datagrip.auth.compatability.project
import software.aws.toolkits.jetbrains.datagrip.getAwsConnectionSettings
import software.aws.toolkits.jetbrains.datagrip.getDatabaseEngine
import software.aws.toolkits.jetbrains.datagrip.secretsManagerIsApplicable
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DatabaseCredentials.SecretsManager
import software.aws.toolkits.telemetry.RdsTelemetry
import software.aws.toolkits.telemetry.RedshiftTelemetry
import software.aws.toolkits.telemetry.Result
import java.util.concurrent.CompletionStage

data class SecretsManagerConfiguration(
    val connectionSettings: ConnectionSettings,
    val secretId: String
)

class SecretsManagerAuth : DatabaseAuthProviderCompatabilityAdapter {
    private val objectMapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

    override fun getId(): String = providerId
    override fun isApplicable(dataSource: LocalDataSource): Boolean = secretsManagerIsApplicable(dataSource)

    override fun getDisplayName(): String = message("datagrip.auth.secrets_manager")

    override fun createWidget(project: Project?, creds: DatabaseCredentials, source: LocalDataSource): AuthWidget? =
        SecretsManagerAuthWidget()

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
                val connectionSettings = getConfiguration(connection)
                val dbSecret = getDbSecret(connectionSettings)
                if (
                    connection.connectionPoint.dataSource.sshConfiguration?.isEnabled != true &&
                    connection.connectionPoint.additionalProperties[GET_URL_FROM_SECRET]?.toBoolean() == true
                ) {
                    dbSecret.host ?: throw IllegalArgumentException(message("datagrip.secretsmanager.validation.no_host", connectionSettings.secretId))
                    dbSecret.port ?: throw IllegalArgumentException(message("datagrip.secretsmanager.validation.no_port", connectionSettings.secretId))
                    // we have to rewrite the url which is pretty messy. The util is not better than using split (requires magic strings
                    // to access the properties), so use split instead
                    val db = connection.url.split("/").last()
                    val jdbcUrlBeginning = connection.url.split("://").first()
                    connection.url = "$jdbcUrlBeginning://${dbSecret.host}:${dbSecret.port}/$db"
                }

                DatabaseCredentialsAuthProvider.applyCredentials(
                    connection,
                    Credentials(dbSecret.username, dbSecret.password),
                    true
                )
            } catch (e: Throwable) {
                result = Result.Failed
                throw e
            } finally {
                val engine = connection.getDatabaseEngine()
                if (engine == "redshift") {
                    RedshiftTelemetry.getCredentials(project, result, SecretsManager)
                } else {
                    RdsTelemetry.getCredentials(project, result, SecretsManager, engine)
                }
            }
        }
    }

    private fun getConfiguration(connection: ProtoConnection): SecretsManagerConfiguration {
        val connectionSettings = connection.getAwsConnectionSettings()
        val secretId = connection.connectionPoint.additionalProperties[SECRET_ID_PROPERTY]
            ?: throw IllegalArgumentException(message("datagrip.secretsmanager.validation.no_secret"))
        return SecretsManagerConfiguration(
            connectionSettings,
            secretId
        )
    }

    private fun getDbSecret(configuration: SecretsManagerConfiguration): SecretsManagerDbSecret {
        val client = AwsClientManager.getInstance().getClient<SecretsManagerClient>(
            configuration.connectionSettings.credentials,
            configuration.connectionSettings.region
        )
        val secret = client.getSecretValue { it.secretId(configuration.secretId) }
        val dbSecret = objectMapper.readValue<SecretsManagerDbSecret>(secret.secretString())
        dbSecret.username ?: throw IllegalArgumentException(message("datagrip.secretsmanager.validation.no_username", secret.name()))
        dbSecret.password ?: throw IllegalArgumentException(message("datagrip.secretsmanager.validation.no_password", secret.name()))
        return dbSecret
    }

    companion object {
        const val providerId = "aws.secretsmanager"
        private val LOG = getLogger<SecretsManagerAuth>()
    }
}
