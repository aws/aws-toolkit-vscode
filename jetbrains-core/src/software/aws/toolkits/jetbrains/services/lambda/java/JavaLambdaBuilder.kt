// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletionStage

class JavaLambdaBuilder : LambdaBuilder() {
    override fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        envVars: Map<String, String>,
        samOptions: SamOptions
    ): CompletionStage<BuiltLambda> {
        val baseDir = getBaseDirectory(module).path
        val customTemplate = FileUtil.createTempFile("template", ".yaml", true)
        val logicalId = "Function"
        SamTemplateUtils.writeDummySamTemplate(customTemplate, logicalId, runtime, baseDir, handler, envVars)

        return buildLambdaFromTemplate(module, customTemplate.toPath(), logicalId, samOptions)
    }

    private fun getBaseDirectory(module: Module): VirtualFile {
        val rootManager = ModuleRootManager.getInstance(module)
        val contentRoots = rootManager.contentRoots
        return when (contentRoots.size) {
            1 -> contentRoots[0]
            else -> throw IllegalArgumentException(message("lambda.build.too_many_content_roots"))
        }
    }
}