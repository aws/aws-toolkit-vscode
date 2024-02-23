// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.samBuildCommand
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message
import java.nio.file.Path

data class BuildLambdaRequest(
    val templatePath: Path,
    val logicalId: String? = null,
    val buildDir: Path,
    val buildEnvVars: Map<String, String> = emptyMap(),
    val samOptions: SamOptions,
    val preBuildSteps: List<Step> = emptyList()
)

class BuildLambda(private val request: BuildLambdaRequest) : SamCliStep() {
    override val stepName: String = message("lambda.create.step.build")

    override fun constructCommandLine(context: Context): GeneralCommandLine = getCli().samBuildCommand(
        templatePath = request.templatePath,
        logicalId = request.logicalId,
        buildDir = request.buildDir,
        environmentVariables = request.buildEnvVars,
        samOptions = request.samOptions
    )

    override fun handleSuccessResult(output: String, stepEmitter: StepEmitter, context: Context) {
        context.putAttribute(BUILT_LAMBDA, BuiltLambda(request.buildDir.resolve("template.yaml"), request.logicalId))
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
