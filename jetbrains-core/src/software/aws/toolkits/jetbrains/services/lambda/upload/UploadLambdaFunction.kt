// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.orThrow
import software.aws.toolkits.jetbrains.services.lambda.runtime
import software.aws.toolkits.resources.message

class UploadLambdaFunction(private val handlerName: String) : AnAction(message("lambda.create_new"), null, AwsIcons.Actions.LAMBDA_FUNCTION_NEW) {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.getRequiredData(LangDataKeys.PROJECT)
        val runtime = event.runtime().orThrow

        EditLambdaDialog(project = project, isUpdate = false, runtime = runtime, handlerName = handlerName).show()
    }
}

data class FunctionUploadDetails(
    val name: String,
    val handler: String,
    val iamRole: IamRole,
    val runtime: Runtime,
    val description: String?,
    val envVars: Map<String, String>,
    val timeout: Int
)