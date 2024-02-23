// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet.element

import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.impl.FakePsiElement
import com.jetbrains.rider.projectView.workspace.containingProjectEntity
import com.jetbrains.rider.projectView.workspace.getProjectModelEntity
import com.jetbrains.rider.projectView.workspace.getVirtualFileAsContentRoot
import com.jetbrains.rider.util.idea.getPsiFile
import software.aws.toolkits.jetbrains.core.compatability.toVirtualFile
import software.aws.toolkits.jetbrains.services.lambda.WorkspaceModel
import javax.swing.Icon

/**
 * Fake frontend PSI instance for Lambda Handler element
 *
 * Note: Rider get PSI from backend. We need to fake a frontend PSI element
 *       to proceed with frontend instances, e.g. when running or debugging lambdas
 */
class RiderLambdaHandlerFakePsiElement(
    private val project: Project,
    private val myName: String,
    private val fileId: Int,
    private val icon: Icon? = null
) : FakePsiElement() {
    override fun getParent() = null

    override fun getContainingFile(): PsiFile? = WorkspaceModel
        .getInstance(project)
        .getProjectModelEntity(fileId)
        ?.getVirtualFileAsContentRoot()
        ?.getPsiFile(FileDocumentManager.getInstance(), PsiDocumentManager.getInstance(project))

    override fun isValid() = true
    override fun getProject() = project
    override fun isWritable() = true
    override fun getIcon(open: Boolean) = icon
    override fun getName() = myName
    override fun toString() = name
    override fun getManager() = PsiManager.getInstance(project)

    fun getContainingProjectFile(): VirtualFile? = WorkspaceModel
        .getInstance(project)
        .getProjectModelEntity(fileId)
        ?.containingProjectEntity()
        ?.url
        ?.toVirtualFile()
}
