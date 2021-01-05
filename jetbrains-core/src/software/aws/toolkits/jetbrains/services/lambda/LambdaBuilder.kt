// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.rootManager
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.nio.file.Paths

abstract class LambdaBuilder {

    /**
     * Returns the base directory of the Lambda handler
     *
     * @throws IllegalStateException if we cant determine a valid base directory for the handler element
     */
    abstract fun handlerBaseDirectory(module: Module, handlerElement: PsiElement): Path

    /**
     * Returns the build directory of the project. Create this if it doesn't exist yet.
     */
    open fun getBuildDirectory(module: Module): Path {
        val contentRoot = module.rootManager.contentRoots.firstOrNull()
            ?: throw IllegalStateException(message("lambda.build.module_with_no_content_root", module.name))
        return Paths.get(contentRoot.path, SamCommon.SAM_BUILD_DIR, "build")
    }

    /**
     * Returns a set of default path mappings for the specified built function
     *
     * @param sourceTemplate The original template file
     * @param logicalId The logical ID of the function
     * @param buildDir The root directory where SAM built the function into
     */
    open fun defaultPathMappings(sourceTemplate: Path, logicalId: String, buildDir: Path): List<PathMapping> = buildList {
        val codeLocation = SamTemplateUtils.getCodeLocation(sourceTemplate, logicalId)
        // First one wins, so code needs to go before build
        add(PathMapping(sourceTemplate.resolveSibling(codeLocation).normalize().toString(), TASK_PATH))
        add(PathMapping(buildDir.resolve(logicalId).normalize().toString(), TASK_PATH))
    }

    /**
     * Returns a set of additional environment variables that should be passed to SAM build
     */
    open fun additionalBuildEnvironmentVariables(module: Module, samOptions: SamOptions): Map<String, String> = emptyMap()

    companion object : RuntimeGroupExtensionPointObject<LambdaBuilder>(ExtensionPointName("aws.toolkit.lambda.builder")) {
        /*
         * The default path to the task. The default is consistent across both Zip and Image based functions.
         */
        const val TASK_PATH = "/var/task"
    }
}
