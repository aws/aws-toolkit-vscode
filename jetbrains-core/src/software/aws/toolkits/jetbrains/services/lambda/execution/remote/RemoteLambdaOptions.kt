// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.jetbrains.services.lambda.execution.BaseLambdaOptions

class RemoteLambdaOptions : BaseLambdaOptions() {
    @get:Property(flat = true) // flat for backwards compat
    var functionOptions = FunctionOptions()
}

class FunctionOptions {
    var functionName: String? = null
}
