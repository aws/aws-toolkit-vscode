// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift.actions

import com.intellij.database.DatabaseBundle
import com.intellij.database.autoconfig.DataSourceRegistry
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.PerformInBackgroundOption
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task.Backgroundable
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.redshift.RedshiftExplorerNode
import software.aws.toolkits.jetbrains.services.redshift.createDatasource
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DatabaseCredentials.IAM
import software.aws.toolkits.telemetry.RedshiftTelemetry
import software.aws.toolkits.telemetry.Result

class CreateDataSourceAction : SingleExplorerNodeAction<RedshiftExplorerNode>(message("redshift.connect_aws_credentials")), DumbAware {
    override fun actionPerformed(selected: RedshiftExplorerNode, e: AnActionEvent) {
        object : Backgroundable(
            selected.nodeProject,
            DatabaseBundle.message("message.text.refreshing.data.source"),
            true,
            PerformInBackgroundOption.ALWAYS_BACKGROUND
        ) {
            override fun run(indicator: ProgressIndicator) {
                val registry = DataSourceRegistry(selected.nodeProject)
                registry.createDatasource(selected.nodeProject, selected.cluster)
                // Asynchronously show the user the configuration dialog to let them save/edit/test the profile
                runInEdt {
                    registry.showDialog()
                }
            }

            override fun onCancel() = recordTelemetry(Result.Cancelled)
            override fun onThrowable(error: Throwable) = recordTelemetry(Result.Failed)
            override fun onSuccess() = recordTelemetry(Result.Succeeded)

            private fun recordTelemetry(result: Result) = RedshiftTelemetry.createConnectionConfiguration(
                selected.nodeProject,
                result,
                IAM
            )
        }.queue()
    }
}
