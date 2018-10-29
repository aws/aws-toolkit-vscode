// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import software.aws.toolkits.jetbrains.core.explorer.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import software.aws.toolkits.jetbrains.services.lambda.upload.EditLambdaDialog

class EditFunctionAction : SingleResourceNodeAction<LambdaFunctionNode>() {
    override fun actionPerformed(selected: LambdaFunctionNode, e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        // Fetch latest version just in case
        val functionConfiguration = selected.client.getFunction {
            it.functionName(selected.functionName())
        }.configuration()

        val lambdaFunction = functionConfiguration.toDataClass(
            selected.function.credentialProviderId,
            selected.function.region
        )

        EditLambdaDialog(project, lambdaFunction).show()
    }
}