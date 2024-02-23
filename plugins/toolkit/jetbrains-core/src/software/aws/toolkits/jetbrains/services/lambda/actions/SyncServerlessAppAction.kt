// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.execution.util.ExecUtil
import com.intellij.ide.BrowserUtil
import com.intellij.notification.NotificationAction
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.text.SemVer
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.cloudformation.SamFunction
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import software.aws.toolkits.jetbrains.services.lambda.SyncServerlessAppWarningDialog
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateFileUtils.retrieveSamTemplate
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateFileUtils.validateTemplateFile
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.sync.SyncApplicationRunProfile
import software.aws.toolkits.jetbrains.services.lambda.sam.sync.SyncServerlessApplicationDialog
import software.aws.toolkits.jetbrains.services.lambda.sam.sync.SyncServerlessApplicationSettings
import software.aws.toolkits.jetbrains.settings.SamDisplayDevModeWarningSettings
import software.aws.toolkits.jetbrains.settings.SyncSettings
import software.aws.toolkits.jetbrains.settings.relativeSamPath
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyNoActiveCredentialsError
import software.aws.toolkits.jetbrains.utils.notifySamCliNotValidError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SamTelemetry
import software.aws.toolkits.telemetry.SyncedResources
import java.net.URI

class SyncServerlessAppAction : AnAction(
    message("serverless.application.sync"),
    null,
    AwsIcons.Resources.SERVERLESS_APP
) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        if (!AwsConnectionManager.getInstance(project).isValidConnectionSettings()) {
            notifyNoActiveCredentialsError(project = project)
            return
        }

        ExecutableManager.getInstance().getExecutable<SamExecutable>().thenAccept { samExecutable ->
            if (samExecutable is ExecutableInstance.InvalidExecutable || samExecutable is ExecutableInstance.UnresolvedExecutable) {
                notifySamCliNotValidError(
                    project = project,
                    content = (samExecutable as ExecutableInstance.BadExecutable).validationError
                )
                LOG.warn { "Invalid SAM CLI Executable" }
                SamTelemetry.sync(
                    project = project,
                    result = Result.Failed,
                    syncedResources = SyncedResources.AllResources,
                    reason = "InvalidSamCli"
                )
                return@thenAccept
            }

            val execVersion = SemVer.parseFromText(samExecutable.version) ?: error("SAM CLI version could not detected")
            val minVersion = SemVer("1.78.0", 1, 78, 0)

            if (!execVersion.isGreaterOrEqualThan(minVersion)) {
                notifyError(
                    message("sam.cli.version.warning"),
                    message(
                        "sam.cli.version.upgrade.required",
                        execVersion.parsedVersion,
                        minVersion.parsedVersion
                    ),
                    project = project,
                    listOf(
                        NotificationAction.createSimple(message("sam.cli.version.upgrade.reason")) {
                            BrowserUtil.browse(
                                URI(
                                    "https://aws.amazon.com/about-aws/whats-new/2023/03/aws-toolkits-jetbrains-vs-code-sam-accelerate/"
                                )
                            )
                        },
                        NotificationAction.createSimple(message("sam.cli.version.upgrade.instructions")) {
                            BrowserUtil.browse(
                                URI(
                                    "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/" +
                                        "manage-sam-cli-versions.html#manage-sam-cli-versions-upgrade"
                                )
                            )
                        }
                    )
                )
                SamTelemetry.sync(
                    project = project,
                    result = Result.Failed,
                    syncedResources = SyncedResources.AllResources,
                    reason = "OldSamCliVersion"
                )
                return@thenAccept
            }

            val templateFile = retrieveSamTemplate(e, project) ?: return@thenAccept

            validateTemplateFile(project, templateFile)?.let {
                notifyError(content = it, project = project)
                LOG.warn { it }
                SamTelemetry.sync(
                    project = project,
                    result = Result.Failed,
                    syncedResources = SyncedResources.AllResources,
                    reason = "UnparseableTemplateFile"
                )
                return@thenAccept
            }

            val templateFunctions = SamTemplateUtils.findFunctionsFromTemplate(project, templateFile)
            val hasImageFunctions: Boolean = templateFunctions.any { (it as? SamFunction)?.packageType() == PackageType.IMAGE }
            val lambdaType = if (hasImageFunctions) LambdaPackageType.Image else LambdaPackageType.Zip
            val syncedResourceType = SyncedResources.AllResources

            ProgressManager.getInstance().run(
                object : Task.WithResult<PreSyncRequirements, Exception>(
                    project,
                    message("serverless.application.sync.fetch.stacks.progress.bar"),
                    false
                ) {
                    override fun compute(indicator: ProgressIndicator): PreSyncRequirements {
                        val dockerDoesntExist = try {
                            val processOutput = ExecUtil.execAndGetOutput(GeneralCommandLine("docker", "ps"))
                            processOutput.exitCode != 0
                        } catch (e: Exception) {
                            LOG.warn(e) { "Docker could not be found" }
                            true
                        }

                        val activeStacks = project.getResourceNow(CloudFormationResources.ACTIVE_STACKS, forceFetch = true, useStale = false)
                        return PreSyncRequirements(dockerDoesntExist, activeStacks)
                    }

                    override fun onFinished() {
                        val warningSettings = SamDisplayDevModeWarningSettings.getInstance()
                        runInEdt {
                            if (warningSettings.showDevModeWarning) {
                                if (!SyncServerlessAppWarningDialog(project).showAndGet()) {
                                    SamTelemetry.sync(
                                        project = project,
                                        result = Result.Cancelled,
                                        syncedResources = syncedResourceType,
                                        lambdaPackageType = lambdaType,
                                        version = SamCommon.getVersionString()
                                    )

                                    return@runInEdt
                                }
                            }

                            FileDocumentManager.getInstance().saveAllDocuments()
                            val parameterDialog = SyncServerlessApplicationDialog(project, templateFile, result.activeStacks)

                            if (!parameterDialog.showAndGet()) {
                                SamTelemetry.sync(
                                    project = project,
                                    result = Result.Cancelled,
                                    syncedResources = syncedResourceType,
                                    lambdaPackageType = lambdaType,
                                    version = SamCommon.getVersionString()
                                )
                                return@runInEdt
                            }
                            val settings = parameterDialog.settings()

                            saveSettings(project, templateFile, settings)

                            if (settings.useContainer) {
                                when (result.dockerDoesntExist) {
                                    null -> return@runInEdt
                                    true -> {
                                        Messages.showWarningDialog(message("lambda.debug.docker.not_connected"), message("docker.not.found"))
                                        SamTelemetry.sync(
                                            project = project,
                                            result = Result.Failed,
                                            syncedResources = syncedResourceType,
                                            lambdaPackageType = lambdaType,
                                            version = SamCommon.getVersionString(),
                                            reason = "DockerNotFound"
                                        )
                                        return@runInEdt
                                    }

                                    else -> {}
                                }
                            }

                            syncApp(templateFile, project, settings, syncedResourceType, lambdaType)
                        }
                    }
                }

            )
        }
    }

    private fun syncApp(
        templateFile: VirtualFile,
        project: Project,
        settings: SyncServerlessApplicationSettings,
        syncedResources: SyncedResources,
        lambdaPackageType: LambdaPackageType
    ) {
        try {
            val templatePath = templateFile.toNioPath()
            val environment = ExecutionEnvironmentBuilder.create(
                project,
                DefaultRunExecutor.getRunExecutorInstance(),
                SyncApplicationRunProfile(project, settings, project.getConnectionSettingsOrThrow(), templatePath)
            ).build()

            environment.runner.execute(environment)
            SamTelemetry.sync(
                project = project,
                result = Result.Succeeded,
                syncedResources = syncedResources,
                lambdaPackageType = lambdaPackageType,
                version = SamCommon.getVersionString()
            )
        } catch (e: Exception) {
            SamTelemetry.sync(
                project = project,
                result = Result.Failed,
                syncedResources = syncedResources,
                lambdaPackageType = lambdaPackageType,
                version = SamCommon.getVersionString()
            )
        }
    }

    private fun saveSettings(project: Project, templateFile: VirtualFile, settings: SyncServerlessApplicationSettings) {
        ModuleUtil.findModuleForFile(templateFile, project)?.let { module ->
            relativeSamPath(module, templateFile)?.let { samPath ->
                SyncSettings.getInstance(module)?.apply {
                    setSamStackName(samPath, settings.stackName)
                    setSamBucketName(samPath, settings.bucket)
                    setSamEcrRepoUri(samPath, settings.ecrRepo)
                    setSamUseContainer(samPath, settings.useContainer)
                    setEnabledCapabilities(samPath, settings.capabilities)
                    setSamTags(samPath, settings.tags)
                    setSamTempParameterOverrides(samPath, settings.parameters)
                }
            }
        }
    }

    companion object {
        private val LOG = getLogger<SyncServerlessAppAction>()
    }
}

data class PreSyncRequirements(
    val dockerDoesntExist: Boolean? = null,
    val activeStacks: List<StackSummary>
)
