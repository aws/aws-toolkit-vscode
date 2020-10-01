// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.future.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import javax.swing.Action
import javax.swing.JComponent

class SaveQueryDialog(
    private val project: Project,
    private val connectionSettings: ConnectionSettings,
    private val query: String,
    private val logGroups: List<String>
) : DialogWrapper(project), CoroutineScope by ApplicationThreadPoolScope("SavingQuery") {
    val view = EnterQueryName()
    private val action: OkAction = object : OkAction() {
        init {
            putValue(Action.NAME, message("cloudwatch.logs.save_query"))
        }

        override fun doAction(e: ActionEvent?) {
            super.doAction(e)
            if (doValidateAll().isNotEmpty()) return
            saveQuery()

            close(OK_EXIT_CODE)
        }
    }
    private val client = let {
        val (credentials, region) = connectionSettings
        AwsClientManager.getInstance().getClient<CloudWatchLogsClient>(credentials, region)
    }
    private val resourceCache = AwsResourceCache.getInstance(project)

    init {
        super.init()
        title = message("cloudwatch.logs.save_query_dialog_name")
    }

    override fun createCenterPanel(): JComponent? = view.saveQueryPanel
    override fun doValidate(): ValidationInfo? = validateQueryName(view)
    override fun getOKAction(): Action = action

    private suspend fun getExistingQueryId(queryName: String): String? {
        val definitions = withTimeout(AwsResourceCache.DEFAULT_TIMEOUT.toMillis()) {
            resourceCache.getResource(
                CloudWatchResources.DESCRIBE_QUERY_DEFINITIONS,
                region = connectionSettings.region,
                credentialProvider = connectionSettings.credentials,
                forceFetch = true
            ).await()
        }

        return definitions.find { it.name() == queryName }?.queryDefinitionId()
    }

    fun saveQuery() = launch {
        try {
            val queryName = view.queryName.text
            action.isEnabled = false

            val existingQueryId = getExistingQueryId(queryName)
            client.putQueryDefinition {
                it.queryDefinitionId(existingQueryId)
                it.name(queryName)
                it.logGroupNames(logGroups)
                it.queryString(query)
            }
            notifyInfo(message("cloudwatch.logs.saved_query_status"), message("cloudwatch.logs.query_saved_successfully"), project)
            // invalidate cache
            resourceCache.clear(
                CloudWatchResources.DESCRIBE_QUERY_DEFINITIONS,
                region = connectionSettings.region,
                credentialProvider = connectionSettings.credentials
            )
        } catch (e: Exception) {
            LOG.error(e) { "Failed to save insights query" }
            notifyError(message("cloudwatch.logs.failed_to_save_query"), e.toString())
        } finally {
            action.isEnabled = true
        }
    }

    fun validateQueryName(view: EnterQueryName): ValidationInfo? {
        if (view.queryName.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.query_name_missing"), view.queryName)
        }
        return null
    }

    companion object {
        private val LOG = getLogger<SaveQueryDialog>()
    }
}
