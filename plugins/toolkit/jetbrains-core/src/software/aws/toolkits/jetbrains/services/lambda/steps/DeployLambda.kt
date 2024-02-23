// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationSettings
import software.aws.toolkits.jetbrains.services.lambda.sam.samDeployCommand
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message
import java.nio.file.Path

class DeployLambda(
    private val packagedTemplateFile: Path,
    private val envVars: Map<String, String>,
    private val settings: DeployServerlessApplicationSettings,
    region: AwsRegion
) : SamCliStep() {
    override val stepName = message("serverless.application.deploy.step_name.create_change_set")
    private val changeSetRegex = "(arn:${region.partitionId}:cloudformation:.*changeSet/[^\\s]*)".toRegex()

    override fun constructCommandLine(context: Context): GeneralCommandLine = getCli().samDeployCommand(
        environmentVariables = envVars,
        templatePath = packagedTemplateFile,
        settings = settings
    )

    override fun handleSuccessResult(output: String, stepEmitter: StepEmitter, context: Context) {
        val changeSet = changeSetRegex.find(output)?.value ?: throw RuntimeException(message("serverless.application.deploy.change_set_not_found"))
        context.putAttribute(CHANGE_SET_ARN, changeSet)
    }

    companion object {
        val CHANGE_SET_ARN = AttributeBagKey.create<String>("CHANGE_SET_ARN")
    }
}
