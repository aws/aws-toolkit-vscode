// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.module.Module
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.dotnet.element.RiderLambdaHandlerFakePsiElement
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletionStage

class DotNetLambdaBuilder : LambdaBuilder() {

    override fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        envVars: Map<String, String>,
        samOptions: SamOptions,
        onStart: (ProcessHandler) -> Unit
    ): CompletionStage<BuiltLambda> {
        val customTemplate = FileUtil.createTempFile("template", ".yaml", true)
        val logicalId = "Function"

        SamTemplateUtils.writeDummySamTemplate(
            tempFile = customTemplate,
            logicalId = logicalId,
            runtime = runtime,
            codeUri = getBaseDirectory(handlerElement),
            handler = handler,
            envVars = envVars
        )

        return buildLambdaFromTemplate(module, customTemplate.toPath(), logicalId, samOptions, onStart)
    }

    private fun getBaseDirectory(element: PsiElement): String {
        val handlerElement = element as RiderLambdaHandlerFakePsiElement
        return handlerElement.getContainingProjectFile()?.parent?.path
                ?: throw IllegalStateException(message("lambda.run.configuration.handler_root_not_found"))
    }
}
