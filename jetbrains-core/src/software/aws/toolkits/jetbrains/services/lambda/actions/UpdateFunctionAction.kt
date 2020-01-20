// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionDialog
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionMode
import software.aws.toolkits.jetbrains.utils.Operation
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.jetbrains.utils.warnResourceOperationAgainstCodePipeline
import software.aws.toolkits.resources.message

abstract class UpdateFunctionAction(private val mode: EditFunctionMode, title: String) : SingleResourceNodeAction<LambdaFunctionNode>(title) {
    override fun actionPerformed(selected: LambdaFunctionNode, e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        ApplicationManager.getApplication().executeOnPooledThread {
            val selectedFunction = selected.value

            val client: LambdaClient = AwsClientManager.getInstance(project).getClient()

            // Fetch latest version just in case
            val functionConfiguration = client.getFunction {
                it.functionName(selected.functionName())
            }.configuration()

            val lambdaFunction = functionConfiguration.toDataClass()

            warnResourceOperationAgainstCodePipeline(
                project,
                selectedFunction.name,
                selectedFunction.arn,
                TaggingResourceType.LAMBDA_FUNCTION,
                Operation.UPDATE
            ) {
                EditFunctionDialog(project, lambdaFunction, mode = mode).show()
            }
        }
    }
}

class UpdateFunctionConfigurationAction : UpdateFunctionAction(EditFunctionMode.UPDATE_CONFIGURATION, message("lambda.function.updateConfiguration.action"))

class UpdateFunctionCodeAction : UpdateFunctionAction(EditFunctionMode.UPDATE_CODE, message("lambda.function.updateCode.action")) {
    override fun update(selected: LambdaFunctionNode, e: AnActionEvent) {
        if (selected.value.runtime.runtimeGroup?.let { LambdaBuilder.getInstance(it) } != null) {
            return
        }
        e.presentation.isVisible = false
    }
}
