// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.psi.PsiElement
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.util.io.isFile
import org.assertj.core.api.Assertions
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.zipEntries
import software.aws.toolkits.jetbrains.services.lambda.BuiltLambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.execution.PathMapping
import software.aws.toolkits.jetbrains.settings.SamSettings
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit
import kotlin.streams.toList

abstract class BaseLambdaBuilderTest {
    protected abstract val lambdaBuilder: LambdaBuilder

    @Before
    open fun setUp() {
        SamSettings.getInstance().savedExecutablePath = System.getenv().getOrDefault("SAM_CLI_EXEC", "/usr/local/bin/sam")
    }

    protected fun buildLambda(module: Module, handlerElement: PsiElement, runtime: Runtime, handler: String): BuiltLambda {
        val completableFuture = runInEdtAndGet {
            lambdaBuilder.buildLambda(module, handlerElement, handler, runtime, emptyMap(), true).toCompletableFuture()
        }

        return completableFuture.get(30, TimeUnit.SECONDS)
    }

    protected fun buildLambdaFromTemplate(module: Module, template: Path, logicalId: String): BuiltLambda {
        val completableFuture = runInEdtAndGet {
            lambdaBuilder.buildLambdaFromTemplate(module, template, logicalId, true).toCompletableFuture()
        }

        return completableFuture.get(30, TimeUnit.SECONDS)
    }

    protected fun packageLambda(module: Module, handlerElement: PsiElement, runtime: Runtime, handler: String): Path {
        val completableFuture = runInEdtAndGet {
            lambdaBuilder.packageLambda(module, handlerElement, handler, runtime).toCompletableFuture()
        }

        return completableFuture.get(30, TimeUnit.SECONDS)
    }

    protected fun verifyEntries(builtLambda: BuiltLambda, vararg entries: String) {
        val basePath = builtLambda.codeLocation
        Files.walk(builtLambda.codeLocation).use {
            val lambdaEntries = it.filter(Path::isFile)
                .map { path -> basePath.relativize(path).toString() }
                .toList()
            assertThat(lambdaEntries).containsAll(entries.toList())
        }
    }

    protected fun verifyZipEntries(lambdaZip: Path, vararg entries: String) {
        assertThat(zipEntries(lambdaZip)).containsAll(entries.toList())
    }

    protected fun verifyPathMappings(module: Module, builtLambda: BuiltLambda, vararg mappings: Pair<String, String>) {
        val basePath = ModuleRootManager.getInstance(module).contentRoots[0].path
        val updatedPaths = mappings
            .map { (path, file) ->
                PathMapping(
                    path.replace("%PROJECT_ROOT%", basePath)
                        .replace("%BUILD_ROOT%", builtLambda.codeLocation.toString()),
                    file
                )
            }
        Assertions.assertThat(builtLambda.mappings).containsAll(updatedPaths)
    }
}