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
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingMode
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
import java.util.concurrent.TimeUnit

object Lambda {
    private val LOG = getLogger<Lambda>()

    fun findPsiElementsForHandler(project: Project, runtime: Runtime, handler: String): Array<NavigatablePsiElement> {
        val resolver = runtime.runtimeGroup?.let { LambdaHandlerResolver.getInstance(it) } ?: return emptyArray()

        // Don't search through ".aws-sam" folders
        val samBuildFileScopes = GlobalSearchScope.filesScope(project, findSamBuildContents(project))
        val excludeSamBuildFileScopes = GlobalSearchScope.notScope(samBuildFileScopes)
        val scope = GlobalSearchScope.allScope(project).intersectWith(excludeSamBuildFileScopes)

        val elements = resolver.findPsiElements(project, handler, scope)

        logHandlerPsiElements(handler, elements)

        return elements
    }

    fun isHandlerValid(project: Project, runtime: Runtime, handler: String): Boolean = ReadAction.compute<Boolean, Throwable> {
        runtime.runtimeGroup?.let {
            LambdaHandlerResolver.getInstance(it)
        }?.isHandlerValid(project, handler) == true
    }

    private fun findSamBuildContents(project: Project): Collection<VirtualFile> =
        ModuleManager.getInstance(project).modules.flatMap { findSamBuildContents(it) }

    private fun findSamBuildContents(module: Module): Collection<VirtualFile> =
        ModuleRootManager.getInstance(module).contentRoots.map {
            it.findChild(SamCommon.SAM_BUILD_DIR)
        }.filterNotNull()
            .flatMap {
                VfsUtil.collectChildrenRecursively(it)
            }

    private fun logHandlerPsiElements(handler: String, elements: Array<NavigatablePsiElement>) {
        LOG.debug {
            elements.joinToString(
                prefix = "Found ${elements.size} PsiElements for Handler: $handler\n",
                separator = "\n"
            ) { it.containingFile.virtualFile.path }
        }
    }
}

// @see https://docs.aws.amazon.com/lambda/latest/dg/limits.html
object LambdaLimits {
    const val MIN_MEMORY = 128
    const val MAX_MEMORY = 3008
    const val MEMORY_INCREMENT = 64
    const val DEFAULT_MEMORY_SIZE = 128
    const val MIN_TIMEOUT = 1
    @JvmField
    val MAX_TIMEOUT = TimeUnit.MINUTES.toSeconds(15).toInt()
    @JvmField
    val DEFAULT_TIMEOUT = TimeUnit.MINUTES.toSeconds(5).toInt()
}

object LambdaWidgets {
    @JvmStatic
    fun lambdaTimeout(): SliderPanel =
        SliderPanel(MIN_TIMEOUT, MAX_TIMEOUT, DEFAULT_TIMEOUT, 0, MAX_TIMEOUT, 10, 100, false)

    @JvmStatic
    fun lambdaMemory(): SliderPanel =
        SliderPanel(MIN_MEMORY, MAX_MEMORY, DEFAULT_MEMORY_SIZE, MIN_MEMORY, MAX_MEMORY, MEMORY_INCREMENT, MEMORY_INCREMENT * 5, true)
}

data class LambdaFunction(
    val name: String,
    val description: String?,
    val arn: String,
    val lastModified: String,
    val handler: String,
    val runtime: Runtime,
    val envVariables: Map<String, String>?,
    val timeout: Int,
    val memorySize: Int,
    val xrayEnabled: Boolean,
    val role: IamRole
)

fun FunctionConfiguration.toDataClass() = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    envVariables = this.environment()?.variables(),
    timeout = this.timeout(),
    memorySize = this.memorySize(),
    xrayEnabled = this.tracingConfig().mode() == TracingMode.ACTIVE,
    role = IamRole(this.role())
)

fun CreateFunctionResponse.toDataClass() = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    envVariables = this.environment()?.variables(),
    timeout = this.timeout(),
    memorySize = this.memorySize(),
    xrayEnabled = this.tracingConfig().mode() == TracingMode.ACTIVE,
    role = IamRole(this.role())
)
