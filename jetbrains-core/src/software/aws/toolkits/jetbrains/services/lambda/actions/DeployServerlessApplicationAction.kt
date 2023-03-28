// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.cloudformation.describeStack
import software.aws.toolkits.jetbrains.services.cloudformation.executeChangeSetAndWait
import software.aws.toolkits.jetbrains.services.cloudformation.stack.StackWindowManager
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationDialog
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationSettings
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateFileUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateFileUtils.validateTemplateFile
import software.aws.toolkits.jetbrains.services.lambda.steps.DeployLambda
import software.aws.toolkits.jetbrains.services.lambda.steps.createDeployWorkflow
import software.aws.toolkits.jetbrains.services.lambda.upload.UploadFunctionContinueDialog
import software.aws.toolkits.jetbrains.settings.DeploySettings
import software.aws.toolkits.jetbrains.settings.relativeSamPath
import software.aws.toolkits.jetbrains.utils.execution.steps.BuildViewWorkflowEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyNoActiveCredentialsError
import software.aws.toolkits.jetbrains.utils.notifySamCliNotValidError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SamTelemetry

class DeployServerlessApplicationAction : AnAction(
    message("serverless.application.deploy"),
    null,
    AwsIcons.Resources.SERVERLESS_APP
) {
    private val edtContext = getCoroutineUiContext()

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
                return@thenAccept
            }

            val templateFile = SamTemplateFileUtils.retrieveSamTemplate(e, project) ?: return@thenAccept

            validateTemplateFile(project, templateFile)?.let {
                notifyError(content = it, project = project)
                return@thenAccept
            }

            runInEdt {
                // Force save before we deploy
                FileDocumentManager.getInstance().saveAllDocuments()

                val stackDialog = DeployServerlessApplicationDialog(project, templateFile)
                if (!stackDialog.showAndGet()) {
                    SamTelemetry.deploy(
                        project = project,
                        version = SamCommon.getVersionString(),
                        result = Result.Cancelled
                    )
                    return@runInEdt
                }

                val settings = stackDialog.settings()
                saveSettings(project, templateFile, settings)

                continueDeployment(project, templateFile, settings)
            }
        }
    }

    private fun continueDeployment(project: Project, templateFile: VirtualFile, settings: DeployServerlessApplicationSettings) {
        val stackName = settings.stackName
        val emitter = BuildViewWorkflowEmitter.createEmitter(
            project,
            message("serverless.application.deploy_in_progress.title", stackName),
            stackName
        )
        val workflow = StepExecutor(
            project,
            createDeployWorkflow(
                project,
                templateFile,
                settings
            ),
            emitter
        )

        workflow.onSuccess = {
            runBlocking {
                val changeSetArn = it.getRequiredAttribute(DeployLambda.CHANGE_SET_ARN)

                if (!settings.autoExecute) {
                    val response = withContext(edtContext) { UploadFunctionContinueDialog(project, changeSetArn).showAndGet() }
                    if (!response) {
                        // TODO this telemetry needs to be improved. The user can finish the deployment later so we do not know if
                        // it is actually cancelled or not
                        SamTelemetry.deploy(project = project, version = SamCommon.getVersionString(), result = Result.Cancelled)
                        return@runBlocking
                    }
                }

                val cfnClient = project.awsClient<CloudFormationClient>()

                cfnClient.describeStack(stackName) {
                    it?.run {
                        runInEdt {
                            StackWindowManager.getInstance(project).openStack(stackName(), stackId())
                        }
                    }
                }
                ApplicationManager.getApplication().executeOnPooledThread {
                    try {
                        cfnClient.executeChangeSetAndWait(stackName, changeSetArn)
                        notifyInfo(
                            message("cloudformation.service_name"),
                            message("cloudformation.execute_change_set.success", stackName),
                            project
                        )
                        SamTelemetry.deploy(
                            project = project,
                            version = SamCommon.getVersionString(),
                            result = Result.Succeeded
                        )
                        // Since we could update anything, do a full refresh of the resource cache and explorer
                        project.refreshAwsTree()
                    } catch (e: Exception) {
                        e.notifyError(message("cloudformation.execute_change_set.failed", stackName), project)
                        SamTelemetry.deploy(
                            project = project,
                            version = SamCommon.getVersionString(),
                            result = Result.Failed
                        )
                    }
                }
            }
        }

        workflow.onError = {
            it.notifyError(project = project, title = message("cloudformation.service_name"))
            SamTelemetry.deploy(
                project = project,
                version = SamCommon.getVersionString(),
                result = Result.Failed
            )
        }

        workflow.startExecution()
    }

    override fun update(e: AnActionEvent) {
        super.update(e)

        e.presentation.isVisible = false
    }

    private fun saveSettings(project: Project, templateFile: VirtualFile, settings: DeployServerlessApplicationSettings) {
        ModuleUtil.findModuleForFile(templateFile, project)?.let { module ->
            relativeSamPath(module, templateFile)?.let { samPath ->
                DeploySettings.getInstance(module)?.apply {
                    setSamStackName(samPath, settings.stackName)
                    setSamBucketName(samPath, settings.bucket)
                    setSamEcrRepoUri(samPath, settings.ecrRepo)
                    setSamAutoExecute(samPath, settings.autoExecute)
                    setSamUseContainer(samPath, settings.useContainer)
                    setEnabledCapabilities(samPath, settings.capabilities)
                }
            }
        }
    }
}
