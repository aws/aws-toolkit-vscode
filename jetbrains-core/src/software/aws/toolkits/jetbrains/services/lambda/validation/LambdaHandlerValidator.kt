// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.validation

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.utils.CachingAsyncEvaluator

class LambdaHandlerValidator : CachingAsyncEvaluator<LambdaHandlerValidator.LambdaEntry, Boolean>() {

    override fun getValue(entry: LambdaEntry): Boolean =
        Lambda.isHandlerValid(entry.project, entry.runtime, entry.handler)

    data class LambdaEntry(val project: Project, val runtime: Runtime, val handler: String)
}
