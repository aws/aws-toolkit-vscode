// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.resources.message

class PythonLambdaBuilder : LambdaBuilder() {
    override fun baseDirectory(module: Module, handlerElement: PsiElement): String {
        val handlerVirtualFile = ReadAction.compute<VirtualFile, Throwable> {
            handlerElement.containingFile?.virtualFile
                ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")
        }

        return getBaseDirectory(module.project, handlerVirtualFile).path
    }

    private fun getBaseDirectory(project: Project, virtualFile: VirtualFile): VirtualFile {
        val fileIndex = ProjectFileIndex.getInstance(project)

        fileIndex.getSourceRootForFile(virtualFile)?.let {
            return it
        }

        fileIndex.getContentRootForFile(virtualFile)?.let { contentRoot ->
            var dir: VirtualFile? = virtualFile
            while (dir != null) {
                if (dir == contentRoot || dir.findChild("requirements.txt") != null) {
                    return dir
                }

                dir = dir.parent
            }
        }

        throw IllegalStateException(message("lambda.build.unable_to_locate_handler_root"))
    }
}
