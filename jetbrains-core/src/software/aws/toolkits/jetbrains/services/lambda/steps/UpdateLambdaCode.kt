// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.services.lambda.steps.PackageLambda.Companion.UPLOADED_CODE_LOCATION
import software.aws.toolkits.jetbrains.services.lambda.waitForUpdatableState
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message

class UpdateLambdaCode(private val lambdaClient: LambdaClient, private val functionName: String, private val updatedHandler: String?) : Step() {
    override val stepName = message("lambda.create.step.update_lambda")

    override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
        stepEmitter.emitMessageLine(message("lambda.workflow.update_code.wait_for_updatable"), isError = false)
        lambdaClient.waitForUpdatableState(functionName)
        lambdaClient.updateFunctionCode {
            it.functionName(functionName)

            when (val codeLocation = context.getRequiredAttribute(UPLOADED_CODE_LOCATION)) {
                is UploadedS3Code -> {
                    it.s3Bucket(codeLocation.bucket)
                    it.s3Key(codeLocation.key)
                    it.s3ObjectVersion(codeLocation.version)
                }
                is UploadedEcrCode -> {
                    it.imageUri(codeLocation.imageUri)
                }
            }
        }

        updatedHandler?.let { _ ->
            stepEmitter.emitMessageLine(message("lambda.workflow.update_code.wait_for_updatable"), isError = false)
            lambdaClient.waitForUpdatableState(functionName)
            lambdaClient.updateFunctionConfiguration {
                it.functionName(functionName)
                it.handler(updatedHandler)
            }
        }

        stepEmitter.emitMessageLine(message("lambda.workflow.update_code.wait_for_stable"), isError = false)
        lambdaClient.waiter().waitUntilFunctionUpdated { it.functionName(functionName) }
    }
}
