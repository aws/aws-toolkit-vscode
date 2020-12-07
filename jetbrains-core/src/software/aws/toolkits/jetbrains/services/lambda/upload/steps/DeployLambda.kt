// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.deploy.CreateCapabilities
import software.aws.toolkits.jetbrains.services.lambda.sam.samDeployCommand
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.resources.message
import java.nio.file.Path

class DeployLambda(
    private val packagedTemplateFile: Path,
    private val stackName: String,
    private val s3Bucket: String,
    private val capabilities: List<CreateCapabilities>,
    private val parameters: Map<String, String>,
    private val envVars: Map<String, String>,
    region: AwsRegion
) : SamCliStep() {
    override val stepName = message("serverless.application.deploy.step_name.create_change_set")
    private val changeSetRegex = "(arn:${region.partitionId}:cloudformation:.*changeSet/[^\\s]*)".toRegex()

    override fun constructCommandLine(context: Context): GeneralCommandLine = getCli().samDeployCommand(
        environmentVariables = envVars,
        templatePath = packagedTemplateFile,
        stackName = stackName,
        s3Bucket = s3Bucket,
        capabilities = capabilities,
        parameters = parameters
    )

    override fun handleSuccessResult(output: String, messageEmitter: MessageEmitter, context: Context) {
        val changeSet = changeSetRegex.find(output)?.value ?: throw RuntimeException(message("serverless.application.deploy.change_set_not_found"))
        context.putAttribute(CHANGE_SET_ARN, changeSet)
    }

    companion object {
        val CHANGE_SET_ARN = AttributeBagKey.create<String>("CHANGE_SET_ARN")
    }
}
