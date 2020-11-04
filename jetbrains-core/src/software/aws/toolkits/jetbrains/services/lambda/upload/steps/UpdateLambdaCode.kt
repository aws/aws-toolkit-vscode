// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationResponse
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.resources.message

class UpdateLambdaCode(private val lambdaClient: LambdaClient, private val functionName: String, private val updatedDetails: FunctionDetails?) : Step() {
    override val stepName = message("lambda.create.step.update_lambda")

    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        val codeLocation = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)
        lambdaClient.updateFunctionCode {
            it.functionName(functionName)
            it.s3Bucket(codeLocation.bucket)
            it.s3Key(codeLocation.key)
            it.s3ObjectVersion(codeLocation.version)
        }

        updatedDetails?.let {
            lambdaClient.updateFunctionConfiguration(it)
        }
    }
}

fun LambdaClient.updateFunctionConfiguration(config: FunctionDetails): UpdateFunctionConfigurationResponse = this.updateFunctionConfiguration {
    it.functionName(config.name)
    it.description(config.description)
    it.handler(config.handler)
    it.role(config.iamRole.arn)
    it.runtime(config.runtime)
    it.timeout(config.timeout)
    it.memorySize(config.memorySize)
    it.environment { env ->
        env.variables(config.envVars)
    }
    it.tracingConfig { tracing ->
        tracing.mode(config.tracingMode)
    }
}
