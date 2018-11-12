// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationDialog
import software.aws.toolkits.resources.message

class DeployServerlessApplicationAction : AnAction(
        message("serverless.application.deploy"),
        null,
        AwsIcons.Resources.LAMBDA_FUNCTION) {
    private var templateYamlRegex = Regex("template\\.y[a]?ml", RegexOption.IGNORE_CASE)

    override fun actionPerformed(e: AnActionEvent?) {

        val project = e?.getRequiredData(PlatformDataKeys.PROJECT) ?: throw Exception("Unable to determine project")

        val virtualFiles = e.getData(PlatformDataKeys.VIRTUAL_FILE_ARRAY) ?: throw Exception("Could not detect template file")
        val samTemplateFile = virtualFiles[0]
        val template = CloudFormationTemplate.parse(project, samTemplateFile)

        // TODO : Validate the template file (this is likely too slow to do in update())

        DeployServerlessApplicationDialog(project, template.parameters()).show()
    }

    override fun update(e: AnActionEvent?) {
        super.update(e)

        val virtualFiles = e?.getData(PlatformDataKeys.VIRTUAL_FILE_ARRAY)

        e?.presentation?.isVisible = virtualFiles?.size == 1 && templateYamlRegex.matches(virtualFiles[0].name)
    }
}
