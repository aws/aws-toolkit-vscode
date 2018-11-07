// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.ui.Messages
import icons.AwsIcons
import software.aws.toolkits.resources.message

class DeployServerlessApplicationAction : AnAction(
        message("serverless.application.deploy"),
        null,
        AwsIcons.Resources.LAMBDA_FUNCTION) {
    private var templateYamlRegex = Regex("template\\.y[a]?ml", RegexOption.IGNORE_CASE)

    override fun actionPerformed(e: AnActionEvent?) {

        val project = e?.getRequiredData(PlatformDataKeys.PROJECT)

        Messages.showWarningDialog(
                project,
                "SAM Deployment is coming soon",
                "Not Implemented"
        )

        // TODO : Validate the template file (this likely isn't fast enough to do in update())
        // TODO : Iterate through the template, publishing functions to AWS (https://github.com/aws/aws-toolkit-jetbrains/issues/395)
    }

    override fun update(e: AnActionEvent?) {
        super.update(e)

        val vfiles = e?.getData(PlatformDataKeys.VIRTUAL_FILE_ARRAY)

        e?.presentation?.isVisible = vfiles?.size == 1 && templateYamlRegex.matches(vfiles[0].name)
    }
}
