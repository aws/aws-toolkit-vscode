// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift.auth

import com.intellij.credentialStore.Credentials
import com.intellij.database.access.DatabaseCredentials
import com.intellij.database.dataSource.DatabaseAuthProvider
import com.intellij.database.dataSource.DatabaseAuthProvider.AuthWidget
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.DatabaseCredentialsAuthProvider
import com.intellij.database.dataSource.LocalDataSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.future.future
import software.amazon.awssdk.services.redshift.RedshiftClient
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletionStage

data class RedshiftSettings(
    val clusterId: String,
    val username: String,
    val connectionSettings: ConnectionSettings
)

// [DatabaseAuthProvider] is marked as internal, but JetBrains advised this was a correct usage
class IamAuth : DatabaseAuthProvider, CoroutineScope by ApplicationThreadPoolScope("RedshiftIamAuth") {
    override fun getId(): String = providerId
    override fun isApplicable(dataSource: LocalDataSource): Boolean = dataSource.dbms.isRedshift
    override fun getDisplayName(): String = message("redshift.auth.aws")

    override fun createWidget(creds: DatabaseCredentials, source: LocalDataSource): AuthWidget? = IamAuthWidget()
    override fun intercept(connection: ProtoConnection, silent: Boolean): CompletionStage<ProtoConnection>? {
        LOG.info { "Intercepting db connection [$connection]" }
        return future {
            val project = connection.runConfiguration.project
            val auth = validateConnection(connection)
            val client = project.awsClient<RedshiftClient>(auth.connectionSettings.credentials, auth.connectionSettings.region)
            val credentials = getCredentials(auth, client)
            DatabaseCredentialsAuthProvider.applyCredentials(connection, credentials, true)
        }
    }

    internal fun validateConnection(connection: ProtoConnection): RedshiftSettings {
        val credentialManager = CredentialManager.getInstance()
        val clusterIdentifier = connection.connectionPoint.additionalJdbcProperties[CLUSTER_ID_PROPERTY]
            ?: throw IllegalArgumentException(message("redshift.validation.no_cluster_id"))
        val regionId = connection.connectionPoint.additionalJdbcProperties[REGION_ID_PROPERTY]
        val region = regionId?.let {
            AwsRegionProvider.getInstance().allRegions()[it]
        } ?: throw IllegalArgumentException(message("redshift.validation.invalid_region_specified", regionId.toString()))
        val credentialId = connection.connectionPoint.additionalJdbcProperties[CREDENTIAL_ID_PROPERTY]
        val credentials = credentialId?.let { id ->
            credentialManager.getCredentialIdentifierById(id)?.let {
                credentialManager.getAwsCredentialProvider(it, region)
            }
        } ?: throw IllegalArgumentException(message("redshift.validation.invalid_credential_specified", credentialId.toString()))
        val username = connection.connectionPoint.dataSource.username
        if (username.isEmpty()) {
            throw IllegalArgumentException(message("redshift.validation.username"))
        }
        return RedshiftSettings(
            clusterIdentifier,
            username,
            ConnectionSettings(credentials, region)
        )
    }

    internal fun getCredentials(settings: RedshiftSettings, client: RedshiftClient): Credentials? {
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
