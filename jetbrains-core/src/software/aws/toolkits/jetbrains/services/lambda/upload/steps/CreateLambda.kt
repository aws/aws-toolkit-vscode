// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.response
import software.aws.toolkits.resources.message

class CreateLambda(private val lambdaClient: LambdaClient, private val details: FunctionDetails) : Step() {
    override val stepName = message("lambda.create.step.create_lambda")

    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        val codeLocation = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)

        lambdaClient.createFunction {
            it.functionName(details.name)
            it.description(details.description)
            it.handler(details.handler)
            it.role(details.iamRole.arn)
            it.runtime(details.runtime)
            it.timeout(details.timeout)
            it.memorySize(details.memorySize)
            it.code { code ->
                code.s3Bucket(codeLocation.bucket)
                code.s3Key(codeLocation.key)
                code.s3ObjectVersion(codeLocation.version)
            }
            it.environment { env ->
                env.variables(details.envVars)
            }
            it.tracingConfig { tracing ->
                tracing.mode(details.tracingMode)
            }
        }

        messageEmitter.emitMessage(message("lambda.workflow.update_code.wait_for_stable"), isError = false)
        val response = lambdaClient.waiter().waitUntilFunctionExists() { it.functionName(details.name) }.response()

        context.putAttribute(FUNCTION_ARN, response.configuration().functionArn())
    }

    companion object {
        val FUNCTION_ARN = AttributeBagKey.create<String>("LAMBDA_FUNCTION_ARN")
    }
}
