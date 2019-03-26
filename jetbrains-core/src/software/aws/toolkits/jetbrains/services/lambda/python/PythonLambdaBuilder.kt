// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import java.util.concurrent.CompletionStage

class PythonLambdaBuilder : LambdaBuilder() {
    override fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        envVars: Map<String, String>,
        samOptions: SamOptions,
        onStart: (ProcessHandler) -> Unit
    ): CompletionStage<BuiltLambda> {
        val handlerVirtualFile = ReadAction.compute<VirtualFile, Throwable> {
            handlerElement.containingFile?.virtualFile
                ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")
        }

        val baseDir = getBaseDirectory(module.project, handlerVirtualFile).path
        val customTemplate = FileUtil.createTempFile("template", ".yaml", true)
        val logicalId = "Function"
        SamTemplateUtils.writeDummySamTemplate(customTemplate, logicalId, runtime, baseDir, handler, envVars)

        return buildLambdaFromTemplate(module, customTemplate.toPath(), logicalId, samOptions, onStart)
    }

    private fun getBaseDirectory(project: Project, virtualFile: VirtualFile): VirtualFile {
        val fileIndex = ProjectFileIndex.getInstance(project)
        return fileIndex.getSourceRootForFile(virtualFile)
            ?: fileIndex.getContentRootForFile(virtualFile)
            ?: throw IllegalStateException("Failed to locate the root of the handler")
    }
}