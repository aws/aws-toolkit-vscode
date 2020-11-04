// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionRequest
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.resources.message

class CreateLambda(private val lambdaClient: LambdaClient, private val details: FunctionDetails) : Step() {
    override val stepName = message("lambda.create.step.create_lambda")

    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        val codeLocation = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)

        val req = with(CreateFunctionRequest.builder()) {
            handler(details.handler)
            functionName(details.name)
            role(details.iamRole.arn)
            runtime(details.runtime)
            description(details.description)
            timeout(details.timeout)
            memorySize(details.memorySize)
            code { code ->
                code.s3Bucket(codeLocation.bucket)
                code.s3Key(codeLocation.key)
                code.s3ObjectVersion(codeLocation.version)
            }
            environment {
                it.variables(details.envVars)
            }
            tracingConfig {
                it.mode(details.tracingMode)
            }
            build()
        }

        context.putAttribute(FUNCTION_ARN, lambdaClient.createFunction(req).functionArn())
    }

    companion object {
        val FUNCTION_ARN = AttributeBagKey.create<String>("LAMBDA_FUNCTION_ARN")
    }
}
