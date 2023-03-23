// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_MEMORY_SIZE
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_TIMEOUT
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.MAX_MEMORY
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.MAX_TIMEOUT
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.MEMORY_INCREMENT
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.MIN_MEMORY
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.MIN_TIMEOUT
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.ui.SliderPanel

object Lambda {
    private val LOG = getLogger<Lambda>()

    fun findPsiElementsForHandler(project: Project, runtime: LambdaRuntime, handler: String): Array<NavigatablePsiElement> {
        runtime.toSdkRuntime()?.let { return findPsiElementsForHandler(project, it, handler) } ?: return emptyArray()
    }

    fun findPsiElementsForHandler(project: Project, runtime: Runtime, handler: String): Array<NavigatablePsiElement> {
        val resolver = runtime.runtimeGroup?.let { LambdaHandlerResolver.getInstanceOrNull(it) } ?: return emptyArray()

        // Don't search through ".aws-sam" folders
        val samBuildFileScopes = GlobalSearchScope.filesScope(project, findSamBuildContents(project))
        val excludeSamBuildFileScopes = GlobalSearchScope.notScope(samBuildFileScopes)
        // only search within project content roots
        val scope = GlobalSearchScope.projectScope(project).intersectWith(excludeSamBuildFileScopes)

        val elements = resolver.findPsiElements(project, handler, scope)

        LOG.debug {
            elements.joinToString(
                prefix = "Found ${elements.size} PsiElements for Handler: $handler\n",
                separator = "\n"
            ) { it.containingFile.virtualFile.path }
        }

        return elements
    }

    fun isHandlerValid(project: Project, runtime: Runtime, handler: String): Boolean = ReadAction.compute<Boolean, Throwable> {
        runtime.runtimeGroup?.let {
            LambdaHandlerResolver.getInstanceOrNull(it)
        }?.isHandlerValid(project, handler) == true
    }

    @Suppress("MissingRecentApi")
    private fun findSamBuildContents(project: Project): Collection<VirtualFile> =
        ModuleManager.getInstance(project).modules.flatMap { findSamBuildContents(it) }

    private fun findSamBuildContents(module: Module): Collection<VirtualFile> =
        ModuleRootManager.getInstance(module).contentRoots.mapNotNull {
            it.findChild(SamCommon.SAM_BUILD_DIR)
        }.flatMap {
            VfsUtil.collectChildrenRecursively(it)
        }
}

object LambdaWidgets {
    @JvmStatic
    fun lambdaTimeout(): SliderPanel =
        SliderPanel(MIN_TIMEOUT, MAX_TIMEOUT, DEFAULT_TIMEOUT, 0, MAX_TIMEOUT, 10, 100, false)

    @JvmStatic
    fun lambdaMemory(): SliderPanel =
        SliderPanel(MIN_MEMORY, MAX_MEMORY, DEFAULT_MEMORY_SIZE, MIN_MEMORY, MAX_MEMORY, MEMORY_INCREMENT, MEMORY_INCREMENT * 15, true)
}

data class LambdaFunction(
    val name: String,
    val description: String?,
    val arn: String,
    val packageType: PackageType,
    val lastModified: String,
    val handler: String?,
    val runtime: Runtime?,
    val envVariables: Map<String, String>?,
    val timeout: Int,
    val memorySize: Int,
    val xrayEnabled: Boolean,
    val role: IamRole
)

fun FunctionConfiguration.toDataClass() = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    packageType = this.packageType() ?: PackageType.ZIP,
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    envVariables = this.environment()?.variables(),
    timeout = this.timeout(),
    memorySize = this.memorySize(),
    // TODO: make non-nullable when available in all partitions
    xrayEnabled = this.tracingConfig()?.mode() == TracingMode.ACTIVE,
    role = IamRole(this.role())
)
