// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift.auth

import com.intellij.credentialStore.Credentials
import com.intellij.database.access.DatabaseCredentials
import com.intellij.database.dataSource.DatabaseAuthProvider.AuthWidget
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.DatabaseCredentialsAuthProvider
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.future
import software.amazon.awssdk.services.redshift.RedshiftClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.datagrip.auth.compatability.DatabaseAuthProviderCompatabilityAdapter
import software.aws.toolkits.jetbrains.datagrip.auth.compatability.project
import software.aws.toolkits.jetbrains.datagrip.getAwsConnectionSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DatabaseCredentials.IAM
import software.aws.toolkits.telemetry.RedshiftTelemetry
import software.aws.toolkits.telemetry.Result
import java.util.concurrent.CompletionStage

data class RedshiftSettings(
    val clusterId: String,
    val username: String,
    val connectionSettings: ConnectionSettings
)

class IamAuth : DatabaseAuthProviderCompatabilityAdapter {
    override fun getId(): String = providerId
    override fun isApplicable(dataSource: LocalDataSource): Boolean = dataSource.dbms.isRedshift
    override fun getDisplayName(): String = message("redshift.auth.aws")

    override fun createWidget(project: Project?, creds: DatabaseCredentials, source: LocalDataSource): AuthWidget? = IamAuthWidget()

    override fun intercept(connection: ProtoConnection, silent: Boolean): CompletionStage<ProtoConnection>? {
        LOG.info { "Intercepting db connection [$connection]" }
        val project = connection.project()
        val scope = projectCoroutineScope(project)
        return scope.future {
            var result = Result.Succeeded
            try {
                val auth = validateConnection(connection)
                val client = AwsClientManager.getInstance().getClient<RedshiftClient>(
                    auth.connectionSettings.credentials,
                    auth.connectionSettings.region
                )
                val credentials = getCredentials(auth, client)
                DatabaseCredentialsAuthProvider.applyCredentials(connection, credentials, true)
            } catch (e: Throwable) {
                result = Result.Failed
                throw e
            } finally {
                RedshiftTelemetry.getCredentials(project = project, result = result, databaseCredentials = IAM)
            }
        }
    }

    internal fun validateConnection(connection: ProtoConnection): RedshiftSettings {
        val auth = connection.getAwsConnectionSettings()
        val clusterIdentifier = connection.connectionPoint.additionalProperties[CLUSTER_ID_PROPERTY]
            ?: throw IllegalArgumentException(message("redshift.validation.no_cluster_id"))
        val username = connection.connectionPoint.dataSource.username
        if (username.isEmpty()) {
            throw IllegalArgumentException(message("redshift.validation.username"))
        }
        return RedshiftSettings(
            clusterIdentifier,
            username,
            auth
        )
    }

    internal fun getCredentials(settings: RedshiftSettings, client: RedshiftClient): Credentials {
        if (client.describeClusters { it.clusterIdentifier(settings.clusterId).build() }.clusters().isEmpty()) {
            throw IllegalArgumentException(message("redshift.validation.cluster_does_not_exist", settings.clusterId, settings.connectionSettings.region.id))
        }
        val creds = client.getClusterCredentials {
            it.clusterIdentifier(settings.clusterId)
            it.dbUser(settings.username)
            // By default it auto-creates the user if it doesn't exist, which we don't want?
            it.autoCreate(false)
        }
        return Credentials(creds.dbUser(), creds.dbPassword())
    }

    companion object {
        const val providerId = "aws.redshift.iam"
        private val LOG = getLogger<IamAuth>()
    }
}
