// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.module.Module
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import java.nio.file.Path
import java.nio.file.Paths

class NodeJsLambdaBuilder : LambdaBuilder() {
    override fun handlerBaseDirectory(module: Module, handlerElement: PsiElement): Path {
        val handlerVirtualFile = runReadAction { handlerElement.containingFile?.virtualFile }
            ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")
        val sourceRootVirtualFile = inferSourceRoot(handlerVirtualFile)
            ?: throw IllegalStateException("Cannot locate package.json for $handlerVirtualFile")
        return Paths.get(sourceRootVirtualFile.path)
    }
}
