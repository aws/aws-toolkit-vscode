// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.terminal

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.util.ExceptionUtil
import org.jetbrains.plugins.terminal.TerminalIcons
import org.jetbrains.plugins.terminal.TerminalTabState
import org.jetbrains.plugins.terminal.TerminalView
import software.amazon.awssdk.profiles.ProfileFileSystemSetting
import software.aws.toolkits.core.credentials.mergeWithExistingEnvironmentVariables
import software.aws.toolkits.core.region.mergeWithExistingEnvironmentVariables
import software.aws.toolkits.core.shortName
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialsIdentifier
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.Result

class OpenAwsLocalTerminal : DumbAwareAction(
    { message("aws.terminal.action") },
    { message("aws.terminal.action.tooltip") },
    TerminalIcons.OpenTerminal_13x13
) {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        if (AwsLocalTerminalExperiment.isEnabled()) {
            e.presentation.isEnabled = e.project?.let { AwsConnectionManager.getInstance(it) }?.isValidConnectionSettings() == true
        } else {
            e.presentation.isEnabledAndVisible = false
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        when (val state = AwsConnectionManager.getInstance(project).connectionState) {
            is ConnectionState.ValidConnection -> {
                val connection = state.connection
                ApplicationManager.getApplication().executeOnPooledThread {
                    val credentials = try {
                        connection.credentials.resolveCredentials()
                    } catch (e: Exception) {
                        LOG.error(e) { message("aws.terminal.exception.failed_to_resolve_credentials", ExceptionUtil.getThrowableText(e)) }
                        AwsTelemetry.openLocalTerminal(project, result = Result.Failed)
                        return@executeOnPooledThread
                    }
                    runInEdt {
                        val runner = AwsLocalTerminalRunner(project, connection.shortName) { envs ->
                            connection.region.mergeWithExistingEnvironmentVariables(envs, replace = true)
                            when (val identifier = connection.credentials.identifier) {
                                is ProfileCredentialsIdentifier -> envs[ProfileFileSystemSetting.AWS_PROFILE.environmentVariable()] = identifier.profileName
                                else -> credentials.mergeWithExistingEnvironmentVariables(envs, replace = true)
                            }
                        }
                        TerminalView.getInstance(project).createNewSession(runner, TerminalTabState().apply { this.myTabName = connection.shortName })
                        AwsTelemetry.openLocalTerminal(project, result = Result.Succeeded)
                    }
                }
            }
            else -> {
                LOG.error { message("aws.terminal.exception.invalid_credentials", state.displayMessage) }
                AwsTelemetry.openLocalTerminal(project, result = Result.Failed)
            }
        }
    }

    private companion object {
        private val LOG = getLogger<OpenAwsLocalTerminal>()
    }
}

object AwsLocalTerminalExperiment :
    ToolkitExperiment("connectedLocalTerminal", { message("aws.terminal.action") }, { message("aws.terminal.action.tooltip") }, default = true)
