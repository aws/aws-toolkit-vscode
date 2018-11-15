// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.executeChangeSetAndWait
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationDialog
import software.aws.toolkits.jetbrains.services.lambda.deploy.SamDeployDialog
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class DeployServerlessApplicationAction : DumbAwareAction(
    message("serverless.application.deploy"),
    null,
    AwsIcons.Resources.LAMBDA_FUNCTION
) {
    private val templateYamlRegex = Regex("template\\.y[a]?ml", RegexOption.IGNORE_CASE)

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        val templateFile = getSamTemplateFile(e) ?: throw Exception("Could not detect template file")
        val template = CloudFormationTemplate.parse(project, templateFile)

        val stackDialog = DeployServerlessApplicationDialog(project, template.parameters())
        stackDialog.show()
        if (!stackDialog.isOK) return

        val stackName = stackDialog.stackName
        val deployDialog = SamDeployDialog(
            project,
            stackName,
            templateFile,
            stackDialog.parameters,
            stackDialog.region,
            stackDialog.bucket
        )

        deployDialog.show()
        if (!deployDialog.isOK) return

        val cfnClient = project.awsClient<CloudFormationClient>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                cfnClient.executeChangeSetAndWait(stackName, deployDialog.changeSetName)
                notifyInfo(
                    message("cloudformation.execute_change_set.success.title"),
                    message("cloudformation.execute_change_set.success", stackName),
                    project
                )
            } catch (e: Exception) {
                e.notifyError(message("cloudformation.execute_change_set.failed", stackName), project)
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
}
