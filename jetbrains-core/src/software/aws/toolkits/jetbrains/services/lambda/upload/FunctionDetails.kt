// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationResponse
import software.aws.toolkits.jetbrains.services.iam.IamRole

data class FunctionDetails(
    val name: String,
    val description: String?,
    val packageType: PackageType,
    val handler: String?,
    val iamRole: IamRole,
    val runtime: Runtime?,
    val envVars: Map<String, String>,
    val timeout: Int,
    val memorySize: Int,
    val xrayEnabled: Boolean
) {
    val tracingMode: TracingMode =
        if (xrayEnabled) {
            TracingMode.ACTIVE
        } else {
            TracingMode.PASS_THROUGH
        }
}

fun LambdaClient.updateFunctionConfiguration(config: FunctionDetails): UpdateFunctionConfigurationResponse = this.updateFunctionConfiguration {
    it.functionName(config.name)
    it.description(config.description)
    if (config.packageType == PackageType.ZIP) {
        it.runtime(config.runtime)
        it.handler(config.handler)
    }
    it.role(config.iamRole.arn)
    it.timeout(config.timeout)
    it.memorySize(config.memorySize)
    it.environment { env ->
        env.variables(config.envVars)
    }
    it.tracingConfig { tracing ->
        tracing.mode(config.tracingMode)
    }
}
