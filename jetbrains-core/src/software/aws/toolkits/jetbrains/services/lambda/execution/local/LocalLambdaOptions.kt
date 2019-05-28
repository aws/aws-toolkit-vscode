// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.jetbrains.services.lambda.execution.BaseLambdaOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions

class LocalLambdaOptions : BaseLambdaOptions() {
    @get:Property(flat = true) // flat for backwards compat
    var functionOptions by property(FunctionOptions())
    @get:Property(surroundWithTag = false)
    var samOptions by property(SamOptions())
}

class FunctionOptions : BaseState() {
    var useTemplate by property(false)
    var templateFile by string()
    @get:OptionTag("logicalFunctionName")
    var logicalId by string()
    var runtime by string()
    var handler by string()
    var environmentVariables by map<String, String>()
}