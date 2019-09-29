// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder

class NodeJsLambdaBuilder : LambdaBuilder() {
    override fun baseDirectory(module: Module, handlerElement: PsiElement): String {
        val handlerVirtualFile = ReadAction.compute<VirtualFile, Throwable> {
            handlerElement.containingFile?.virtualFile
                ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")
        }
        return getBaseDirectory(module.project, handlerVirtualFile).path
    }

    private fun getBaseDirectory(project: Project, virtualFile: VirtualFile): VirtualFile =
        inferSourceRoot(project, virtualFile) ?: throw IllegalStateException("Cannot locate content root for file")
}
