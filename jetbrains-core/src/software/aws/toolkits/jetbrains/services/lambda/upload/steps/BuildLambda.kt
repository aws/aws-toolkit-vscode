// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.samBuildCommand
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.resources.message
import java.nio.file.Path

class BuildLambda(
    private val templatePath: Path,
    private val logicalId: String? = null,
    private val buildDir: Path,
    private val buildEnvVars: Map<String, String> = emptyMap(),
    private val samOptions: SamOptions
) : SamCliStep() {
    override val stepName: String = message("lambda.create.step.build")

    override fun constructCommandLine(context: Context): GeneralCommandLine = getCli().samBuildCommand(
        templatePath = templatePath,
        logicalId = logicalId,
        buildDir = buildDir,
        environmentVariables = buildEnvVars,
        samOptions = samOptions
    )

    override fun handleSuccessResult(output: String, messageEmitter: MessageEmitter, context: Context) {
        context.putAttribute(BUILT_LAMBDA, BuiltLambda(buildDir.resolve("template.yaml"), logicalId))
    }

    companion object {
        val BUILT_LAMBDA = AttributeBagKey.create<BuiltLambda>("BUILT_LAMBDA")
    }
}

/**
 * Represents the result of building a Lambda
 *
 * @param templateLocation The path to the build generated template
 * @param logicalId Optional logical id if we are building a specific function
 */
data class BuiltLambda(
    val templateLocation: Path,
    val logicalId: String?
)
