// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Property
import com.intellij.util.xmlb.annotations.Tag
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_MEMORY_SIZE
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_TIMEOUT
import software.aws.toolkits.jetbrains.services.lambda.execution.BaseLambdaOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions

@Tag("LocalLambdaOptions")
class LocalLambdaOptions : BaseLambdaOptions() {
    @get:Property(flat = true) // flat for backwards compat
    var functionOptions = FunctionOptions()
    @get:Property(surroundWithTag = false)
    var samOptions = SamOptions()
    var debugHost = "localhost"
}

@Tag("FunctionOptions")
class FunctionOptions {
    var useTemplate = false
    var templateFile: String? = null
    @get:OptionTag("logicalFunctionName")
    var logicalId: String? = null
    var runtime: String? = null
    var handler: String? = null
    var timeout: Int = DEFAULT_TIMEOUT
    var memorySize: Int = DEFAULT_MEMORY_SIZE
    var environmentVariables: Map<String, String> = linkedMapOf<String, String>()
}
