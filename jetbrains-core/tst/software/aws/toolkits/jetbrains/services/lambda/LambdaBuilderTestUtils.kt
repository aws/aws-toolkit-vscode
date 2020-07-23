// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import com.intellij.util.io.isFile
import org.assertj.core.api.Assertions.assertThat
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.zipEntries
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import java.nio.file.Files
import java.nio.file.Path
import kotlin.streams.toList

object LambdaBuilderTestUtils {
    fun LambdaBuilder.buildLambda(
        module: Module,
        handlerElement: PsiElement,
        runtime: Runtime,
        handler: String,
        useContainer: Boolean = false
    ): BuiltLambda {
        val samOptions = SamOptions()
        samOptions.buildInContainer = useContainer

        return this.buildLambda(module, handlerElement, handler, runtime, 0, 0, emptyMap(), samOptions)
    }

    fun LambdaBuilder.buildLambdaFromTemplate(
        module: Module,
        template: Path,
        logicalId: String,
        useContainer: Boolean = false
    ): BuiltLambda {
        val samOptions = SamOptions()
        samOptions.buildInContainer = useContainer

        return this.buildLambdaFromTemplate(module, template, logicalId, samOptions)
    }

    fun LambdaBuilder.packageLambda(
        module: Module,
        handlerElement: PsiElement,
        runtime: Runtime,
        handler: String,
        useContainer: Boolean = false
    ): Path {
        val samOptions = SamOptions()
        samOptions.buildInContainer = useContainer

        return this.packageLambda(module, handlerElement, handler, runtime, samOptions)
    }

    fun verifyEntries(builtLambda: BuiltLambda, vararg entries: String) {
        val basePath = builtLambda.codeLocation
        Files.walk(builtLambda.codeLocation).use {
            val lambdaEntries = it.filter(Path::isFile)
                .map { path -> FileUtil.toSystemIndependentName(basePath.relativize(path).toString()) }
                .toList()
            assertThat(lambdaEntries).containsAll(entries.toList())
        }
    }

    fun verifyZipEntries(lambdaZip: Path, vararg entries: String) {
        assertThat(zipEntries(lambdaZip)).containsAll(entries.toList())
    }

    fun verifyPathMappings(module: Module, builtLambda: BuiltLambda, vararg mappings: Pair<String, String>) {
        val basePath = ModuleRootManager.getInstance(module).contentRoots[0].path
        val updatedPaths = mappings
            .map { (path, file) ->
                PathMapping(
                    path.replace("%PROJECT_ROOT%", basePath)
                        .replace("%BUILD_ROOT%", builtLambda.codeLocation.toString()),
                    file
                )
            }
        assertThat(builtLambda.mappings).containsAll(updatedPaths)
    }
}
