// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.jetbrains.services.iam.IamRole

data class FunctionDetails(
    val name: String,
    val handler: String,
    val iamRole: IamRole,
    val runtime: Runtime,
    val description: String?,
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
