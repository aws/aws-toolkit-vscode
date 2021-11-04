// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import java.nio.file.Path
import java.nio.file.Paths

class PythonLambdaBuilder : LambdaBuilder() {
    override fun handlerBaseDirectory(module: Module, handlerElement: PsiElement): Path {
        val handlerVirtualFile = ReadAction.compute<VirtualFile, Throwable> {
            handlerElement.containingFile?.virtualFile
                ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")
        }

        return Paths.get(locateRequirementsTxt(handlerVirtualFile).parent.path)
    }

    companion object {
        fun locateRequirementsTxt(startLocation: VirtualFile): VirtualFile = runReadAction {
            var dir = if (startLocation.isDirectory) startLocation else startLocation.parent
            while (dir != null) {
                val requirementsFile = dir.findChild("requirements.txt")
                if (requirementsFile != null && requirementsFile.isValid) {
                    return@runReadAction requirementsFile
                }
                dir = dir.parent
            }

            throw IllegalStateException("Cannot locate requirements.txt in a parent directory of ${startLocation.path}")
        }
    }
}
