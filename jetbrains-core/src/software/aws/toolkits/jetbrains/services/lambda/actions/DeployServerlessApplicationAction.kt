// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.cloudformation.stack.StackWindowManager
import software.aws.toolkits.jetbrains.services.cloudformation.describeStack
import software.aws.toolkits.jetbrains.services.cloudformation.executeChangeSetAndWait
import software.aws.toolkits.jetbrains.services.cloudformation.validateSamTemplateHasResources
import software.aws.toolkits.jetbrains.services.cloudformation.validateSamTemplateLambdaRuntimes
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationDialog
import software.aws.toolkits.jetbrains.services.lambda.deploy.SamDeployDialog
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.settings.DeploySettings
import software.aws.toolkits.jetbrains.settings.relativeSamPath
import software.aws.toolkits.jetbrains.utils.Operation
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyNoActiveCredentialsError
import software.aws.toolkits.jetbrains.utils.notifySamCliNotValidError
import software.aws.toolkits.jetbrains.utils.warnResourceOperationAgainstCodePipeline
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SamTelemetry

class DeployServerlessApplicationAction : AnAction(
    message("serverless.application.deploy"),
    null,
    AwsIcons.Resources.SERVERLESS_APP
) {
    private val templateYamlRegex = Regex("template\\.y[a]?ml", RegexOption.IGNORE_CASE)

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        if (!ProjectAccountSettingsManager.getInstance(project).isValidConnectionSettings()) {
            notifyNoActiveCredentialsError(project = project)
            return
        }

        ExecutableManager.getInstance().getExecutable<SamExecutable>().thenAccept { samExecutable ->
            when (samExecutable) {
                is ExecutableInstance.InvalidExecutable, is ExecutableInstance.UnresolvedExecutable -> {
                    notifySamCliNotValidError(
                        project = project,
                        content = (samExecutable as ExecutableInstance.BadExecutable).validationError
                    )
                    return@thenAccept
                }
            }

            val templateFile = getSamTemplateFile(e)
            if (templateFile == null) {
                Exception(message("serverless.application.deploy.toast.template_file_failure"))
                    .notifyError(message("aws.notification.title"), project)
                return@thenAccept
            }

            validateTemplateFile(project, templateFile)?.let {
                notifyError(content = it, project = project)
                return@thenAccept
            }

            // Force save before we deploy
            FileDocumentManager.getInstance().saveAllDocuments()

            val stackDialog = DeployServerlessApplicationDialog(project, templateFile)
            stackDialog.show()
            if (!stackDialog.isOK) {
                SamTelemetry.deploy(project, Result.CANCELLED)
                return@thenAccept
            }

            saveSettings(project, templateFile, stackDialog)

            val stackName = stackDialog.stackName
            val stackId = stackDialog.stackId

            if (stackId == null) {
                continueDeployment(project, stackName, templateFile, stackDialog)
            } else {
                warnResourceOperationAgainstCodePipeline(project, stackName, stackId, TaggingResourceType.CLOUDFORMATION_STACK, Operation.DEPLOY) {
                    continueDeployment(project, stackName, templateFile, stackDialog)
                }
            }
        }
    }

    private fun continueDeployment(project: Project, stackName: String, templateFile: VirtualFile, stackDialog: DeployServerlessApplicationDialog) {
        val deployDialog = SamDeployDialog(
            project,
            stackName,
            templateFile,
            stackDialog.parameters,
            stackDialog.bucket,
            stackDialog.autoExecute,
            stackDialog.useContainer
        )

        deployDialog.show()
        if (!deployDialog.isOK) return

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
                cfnClient.executeChangeSetAndWait(stackName, deployDialog.changeSetName)
                notifyInfo(
                    message("cloudformation.execute_change_set.success.title"),
                    message("cloudformation.execute_change_set.success", stackName),
                    project
                )
                SamTelemetry.deploy(project, Result.SUCCEEDED)
            } catch (e: Exception) {
                e.notifyError(message("cloudformation.execute_change_set.failed", stackName), project)
                SamTelemetry.deploy(project, Result.FAILED)
            }
        }
    }

    override fun update(e: AnActionEvent) {
        super.update(e)

        e.presentation.isVisible = getSamTemplateFile(e) != null
    }

    /**
     * Determines the relevant Sam Template, returns null if one can't be found.
     */
    private fun getSamTemplateFile(e: AnActionEvent): VirtualFile? {
        val virtualFiles = e.getData(PlatformDataKeys.VIRTUAL_FILE_ARRAY) ?: return null
        val virtualFile = virtualFiles.singleOrNull() ?: return null

        if (templateYamlRegex.matches(virtualFile.name)) {
            return virtualFile
        }

        // If the module node was selected, see if there is a template file in the top level folder
        val module = e.getData(LangDataKeys.MODULE_CONTEXT)
        if (module != null) {
            // It is only acceptable if one template file is found
            val childTemplateFiles = ModuleRootManager.getInstance(module).contentRoots.flatMap { root ->
                root.children.filter { child -> templateYamlRegex.matches(child.name) }
            }

            if (childTemplateFiles.size == 1) {
                return childTemplateFiles.single()
            }
        }

        return null
    }

    private fun saveSettings(project: Project, templateFile: VirtualFile, stackDialog: DeployServerlessApplicationDialog) {
        ModuleUtil.findModuleForFile(templateFile, project)?.let { module ->
            relativeSamPath(module, templateFile)?.let { samPath ->
                DeploySettings.getInstance(module)?.apply {
                    setSamStackName(samPath, stackDialog.stackName)
                    setSamBucketName(samPath, stackDialog.bucket)
                    setSamAutoExecute(samPath, stackDialog.autoExecute)
                    setSamUseContainer(samPath, stackDialog.useContainer)
                }
            }
        }
    }

    private fun validateTemplateFile(project: Project, templateFile: VirtualFile): String? =
        try {
            project.validateSamTemplateHasResources(templateFile) ?: project.validateSamTemplateLambdaRuntimes(templateFile)
        } catch (e: Exception) {
            message("serverless.application.deploy.error.bad_parse", templateFile.path, e)
        }
}
