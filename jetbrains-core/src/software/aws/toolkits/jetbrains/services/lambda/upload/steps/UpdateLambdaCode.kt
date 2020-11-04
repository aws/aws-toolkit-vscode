// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.resources.message

class UpdateLambdaCode(private val lambdaClient: LambdaClient, private val functionName: String, private val updatedHandler: String?) : Step() {
    override val stepName = message("lambda.create.step.update_lambda")

    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        val codeLocation = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)
        lambdaClient.updateFunctionCode {
            it.functionName(functionName)
            it.s3Bucket(codeLocation.bucket)
            it.s3Key(codeLocation.key)
            it.s3ObjectVersion(codeLocation.version)
        }

        updatedHandler?.let { _ ->
            lambdaClient.updateFunctionConfiguration {
                it.functionName(functionName)
                it.handler(updatedHandler)
            }
        }

        messageEmitter.emitMessage(message("lambda.workflow.update_code.wait_for_stable"), isError = false)
        lambdaClient.waiter().waitUntilFunctionUpdated { it.functionName(functionName) }
    }
}
