// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import software.aws.toolkits.jetbrains.core.explorer.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionDialog
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionMode
import software.aws.toolkits.resources.message

abstract class UpdateFunctionAction(private val mode: EditFunctionMode, title: String) : SingleResourceNodeAction<LambdaFunctionNode>(title) {
    override fun actionPerformed(selected: LambdaFunctionNode, e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        ApplicationManager.getApplication().executeOnPooledThread {
            // Fetch latest version just in case
            val functionConfiguration = selected.client.getFunction {
                it.functionName(selected.functionName())
            }.configuration()

            val lambdaFunction = functionConfiguration.toDataClass(
                selected.function.credentialProviderId,
                selected.function.region
            )

            runInEdt {
                EditFunctionDialog(project, lambdaFunction, mode = mode).show()
            }
        }
    }
}

class UpdateFunctionConfigurationAction : UpdateFunctionAction(EditFunctionMode.UPDATE_CONFIGURATION, message("lambda.function.updateConfiguration.action"))

class UpdateFunctionCodeAction : UpdateFunctionAction(EditFunctionMode.UPDATE_CODE, message("lambda.function.updateCode.action")) {
    override fun update(selected: LambdaFunctionNode, e: AnActionEvent) {
        if (selected.function.runtime.runtimeGroup?.let { LambdaBuilder.getInstance(it) } != null) {
            return
        }
        e.presentation.isVisible = false
    }
}