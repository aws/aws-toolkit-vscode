// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.resources.message
import java.io.File

object SamTemplateUtils {
    private val LOG = getLogger<SamTemplateUtils>()

    @JvmStatic
    fun findFunctionsFromTemplate(project: Project, file: File): List<Function> {
        if (!file.isFile) {
            return emptyList()
        }

        val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file) ?: throw RuntimeException(
            message("lambda.sam.template_not_found", file)
        )
        return findFunctionsFromTemplate(project, virtualFile)
    }

    @JvmStatic
    fun findFunctionsFromTemplate(project: Project, file: VirtualFile): List<Function> = try {
        CloudFormationTemplate.parse(project, file).resources()
            .filterIsInstance<Function>()
            .toList()
    } catch (e: Exception) {
        LOG.warn("Failed to parse template: $file", e)
        emptyList()
    }

    @JvmStatic
    fun functionFromElement(element: PsiElement): Function? =
        CloudFormationTemplate.convertPsiToResource(element) as? Function
}