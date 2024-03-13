// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.actions

import com.intellij.database.autoconfig.DataSourceRegistry
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.RequireSsl
import software.aws.toolkits.jetbrains.datagrip.auth.SECRET_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.auth.SecretsManagerAuth
import software.aws.toolkits.jetbrains.datagrip.auth.SecretsManagerDbSecret
import software.aws.toolkits.jetbrains.datagrip.jdbcAdapterFromRuntime
import software.aws.toolkits.jetbrains.services.rds.RdsNode
import software.aws.toolkits.jetbrains.services.redshift.RedshiftExplorerNode
import software.aws.toolkits.jetbrains.services.redshift.RedshiftExplorerParentNode
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DatabaseCredentials
import software.aws.toolkits.telemetry.RdsTelemetry
import software.aws.toolkits.telemetry.RedshiftTelemetry
import software.aws.toolkits.telemetry.Result

class AddSecretsManagerConnection : SingleExplorerNodeAction<AwsExplorerNode<*>>(message("datagrip.secretsmanager.action")), DumbAware {
    override fun actionPerformed(selected: AwsExplorerNode<*>, e: AnActionEvent) {
        var result = Result.Succeeded
        var engine: String? = null
        try {
            val dialogWrapper = SecretsManagerDialogWrapper(selected)
            val ok = dialogWrapper.showAndGet()
            if (!ok) {
                result = Result.Cancelled
                return
            }
            val secret = dialogWrapper.dbSecret
            val secretArn = dialogWrapper.dbSecretArn

            engine = secret.engine
            val registry = DataSourceRegistry(selected.nodeProject)
            val adapter = jdbcAdapterFromRuntime(engine)
                ?: throw IllegalStateException(message("datagrip.secretsmanager.validation.unkown_engine", secret.engine.toString()))
            registry.createDatasource(selected.nodeProject, secret, secretArn, adapter)
            // Show the user the configuration dialog to let them save/edit/test the profile
            runInEdt {
                registry.showDialog()
            }
        } catch (e: Throwable) {
            result = Result.Failed
            throw e
        } finally {
            recordTelemetry(selected, result, engine)
        }
    }

    private fun recordTelemetry(selected: AwsExplorerNode<*>, result: Result, engine: String? = null) {
        val dbEngine = engine ?: if (selected is RdsNode) {
            selected.database.engine
        } else {
            null
        }
        if (selected is RedshiftExplorerParentNode || selected is RedshiftExplorerNode) {
            RedshiftTelemetry.createConnectionConfiguration(
                project = selected.nodeProject,
                result = result,
                databaseCredentials = DatabaseCredentials.SecretsManager
            )
        } else {
            RdsTelemetry.createConnectionConfiguration(
                project = selected.nodeProject,
                result = result,
                databaseCredentials = DatabaseCredentials.SecretsManager,
                databaseEngine = dbEngine
            )
        }
    }
}

fun DataSourceRegistry.createDatasource(project: Project, secret: SecretsManagerDbSecret, secretArn: String, jdbcAdapter: String) {
    val connectionSettings = AwsConnectionManager.getInstance(project).connectionSettings()
    builder
        .withJdbcAdditionalProperty(CREDENTIAL_ID_PROPERTY, connectionSettings?.credentials?.id)
        .withJdbcAdditionalProperty(REGION_ID_PROPERTY, connectionSettings?.region?.id)
        .withJdbcAdditionalProperty(SECRET_ID_PROPERTY, secretArn)
        .withUser(secret.username)
        .withUrl("jdbc:$jdbcAdapter://${secret.host}:${secret.port}")
        .commit()
    // TODO FIX_WHEN_MIN_IS_203 set auth provider ID in builder. It's in 202 but doesn't work
    newDataSources.firstOrNull()?.let {
        it.authProviderId = SecretsManagerAuth.providerId
        it.sslCfg = RequireSsl
    }
}
