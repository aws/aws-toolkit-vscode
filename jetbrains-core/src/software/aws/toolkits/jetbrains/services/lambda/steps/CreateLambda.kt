// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message

class CreateLambda(private val lambdaClient: LambdaClient, private val details: FunctionDetails) : Step() {
    override val stepName = message("lambda.create.step.create_lambda")

    override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
        lambdaClient.createFunction {
            it.functionName(details.name)
            it.description(details.description)
            it.role(details.iamRole.arn)
            it.timeout(details.timeout)
            it.memorySize(details.memorySize)

            it.code { code ->
                when (val codeLocation = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)) {
                    is UploadedS3Code -> {
                        it.packageType(PackageType.ZIP)
                        it.handler(details.handler)
                        it.runtime(details.runtime)

                        code.s3Bucket(codeLocation.bucket)
                        code.s3Key(codeLocation.key)
                        code.s3ObjectVersion(codeLocation.version)
                    }
                    is UploadedEcrCode -> {
                        it.packageType(PackageType.IMAGE)
                        code.imageUri(codeLocation.imageUri)
                    }
                }
            }

            it.environment { env ->
                env.variables(details.envVars)
            }
            it.tracingConfig { tracing ->
                tracing.mode(details.tracingMode)
            }
        }

        stepEmitter.emitMessage(message("lambda.workflow.update_code.wait_for_stable"), isError = false)
        val response = lambdaClient.waiter().waitUntilFunctionExists { it.functionName(details.name) }.matched().response().get()

        // Also wait for it to become active
        lambdaClient.waiter().waitUntilFunctionActive { it.functionName(details.name) }

        context.putAttribute(FUNCTION_ARN, response.configuration().functionArn())
    }

    companion object {
        val FUNCTION_ARN = AttributeBagKey.create<String>("LAMBDA_FUNCTION_ARN")
    }
}
