// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.jetbrains.rd.framework.impl.RpcTimeouts
import com.jetbrains.rider.model.MethodExistingRequest
import com.jetbrains.rider.model.backendPsiHelperModel
import com.jetbrains.rider.model.publishableProjectsModel
import com.jetbrains.rider.projectView.solution
import com.jetbrains.rider.projectView.workspace.getId
import com.jetbrains.rider.projectView.workspace.getProjectModelEntities
import com.jetbrains.rider.projectView.workspace.isProject
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.protocol.HandlerExistRequest
import software.aws.toolkits.jetbrains.protocol.lambdaPsiModel
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.WorkspaceModel
import software.aws.toolkits.jetbrains.services.lambda.dotnet.element.RiderLambdaHandlerFakePsiElement
import java.nio.file.Path

class DotNetLambdaHandlerResolver : LambdaHandlerResolver {
    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        val fieldId = getFieldIdByHandlerName(project, handler)
        if (fieldId < 0) return emptyArray()

        return arrayOf(RiderLambdaHandlerFakePsiElement(project, handler, fieldId))
    }

    override fun determineHandler(element: PsiElement): String? = null

    override fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String> {
        val handler = determineHandler(element) ?: return emptySet()
        return setOf(handler)
    }

    override fun isHandlerValid(project: Project, handler: String): Boolean {
        val (assemblyName, type, methodName) = getHandlerParts(handler) ?: return false
        val projectId = getProjectId(project, assemblyName) ?: return false
        val handlerExistRequest = HandlerExistRequest(
            className = type,
            methodName = methodName,
            projectId = projectId
        )

        return project.solution.lambdaPsiModel.isHandlerExists.sync(handlerExistRequest, RpcTimeouts.default)
    }

    fun getFieldIdByHandlerName(project: Project, handler: String): Int {
        val (assemblyName, type, methodName) = getHandlerParts(handler) ?: return -1
        val projectId = getProjectId(project, assemblyName) ?: return -1

        val model = project.solution.backendPsiHelperModel
        val fileIdResponse = model.findPublicMethod.sync(
            request = MethodExistingRequest(
                className = type,
                methodName = methodName,
                targetFramework = "",
                projectId = projectId
            ),
            timeouts = RpcTimeouts.default
        )

        return fileIdResponse?.fileId ?: -1
    }

    private fun getHandlerParts(handler: String): Triple<String, String, String>? {
        val handlerParts = handler.split("::")
        if (handlerParts.size != 3) return null

        return Triple(handlerParts[0], handlerParts[1], handlerParts[2])
    }

    private fun getProjectId(project: Project, assemblyName: String): Int? {
        val workspaceModel = WorkspaceModel.getInstance(project)
        val publishableProjects = project.solution.publishableProjectsModel.publishableProjects.values.toList()
        val projectToProcess = publishableProjects.find { it.projectName == assemblyName }
        if (projectToProcess == null) {
            LOG.warn { "No publishable project with name '$assemblyName` in solution projects:  $publishableProjects" }
            return null
        }

        val projectPath = Path.of(projectToProcess.projectFilePath)
        val projectId = workspaceModel.getProjectModelEntities(projectPath, project).singleOrNull { it.isProject() }?.getId(project)
        if (projectId == null) {
            LOG.warn { "Project Id is not found for project path: '$projectPath'" }
            return null
        }

        return projectId
    }

    private companion object {
        private val LOG = getLogger<DotNetLambdaHandlerResolver>()
    }
}
