// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.Runtime

object Lambda {
    fun findPsiElementsForHandler(project: Project, runtime: Runtime, handler: String): Array<NavigatablePsiElement> {
        val resolver = runtime.runtimeGroup?.let { LambdaHandlerResolver.getInstance(it) } ?: return emptyArray()
        return resolver.findPsiElements(project, handler, GlobalSearchScope.allScope(project))
    }
}

data class LambdaFunction(
    val name: String,
    val description: String?,
    val arn: String,
    val lastModified: String,
    val handler: String,
    val client: LambdaClient,
    val runtime: Runtime
)

fun FunctionConfiguration.toDataClass(client: LambdaClient) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    client = client
)

fun CreateFunctionResponse.toDataClass(client: LambdaClient) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    client = client
)

/**
 * Grouping of Lambda [Runtime] by parent language.
 *
 * A Lambda [Runtime] belongs to a single [RuntimeGroup], a [RuntimeGroup] may have several
 * Lambda [Runtime]s, [Language]s or [Sdk]s.
 */
enum class RuntimeGroup {
    JAVA,
    GO,
    PYTHON;

    private val info by lazy {
        RuntimeGroupInformation.getInstances(this)
    }

    val runtimes: Set<Runtime> by lazy { info.flatMap { it.runtimes }.toSet() }
    val languageIds: Set<String> by lazy { info.flatMap { it.languageIds }.toSet() }
    fun runtimeForSdk(sdk: Sdk): Runtime? = info.asSequence().mapNotNull { it.runtimeForSdk(sdk) }.firstOrNull()

    internal companion object {
        /**
         * Lazily apply the predicate to each [RuntimeGroup] and return the first match (or null)
         */
        fun find(predicate: (RuntimeGroup) -> Boolean): RuntimeGroup? {
            return RuntimeGroup.values().asSequence().filter(predicate).firstOrNull()
        }

        fun runtimeForSdk(sdk: Sdk): Runtime? = values().asSequence().mapNotNull { it.runtimeForSdk(sdk) }.firstOrNull()
    }
}

/**
 * Represents information about a specific [Runtime] or [RuntimeGroup]. A single [RuntimeGroup] can have more than one RuntimeGroupInformation
 * registered.
 */
interface RuntimeGroupInformation {
    val runtimes: Set<Runtime>
    val languageIds: Set<String>
    fun runtimeForSdk(sdk: Sdk): Runtime?

    companion object : RuntimeGroupExtensionPointObject<RuntimeGroupInformation>(ExtensionPointName("aws.toolkit.lambda.runtimeGroup")) {
        fun getInstances(runtimeGroup: RuntimeGroup): List<RuntimeGroupInformation> = collector.forKey(runtimeGroup)
    }
}

val Runtime.runtimeGroup: RuntimeGroup? get() = RuntimeGroup.find { this in it.runtimes }

/**
 * For a given [com.intellij.lang.Language] determine the corresponding Lambda [RuntimeGroup]
 */
val Language.runtimeGroup: RuntimeGroup? get() = RuntimeGroup.find { this.id in it.languageIds }