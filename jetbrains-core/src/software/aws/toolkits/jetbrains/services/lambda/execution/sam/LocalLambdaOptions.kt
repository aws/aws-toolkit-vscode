// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.jetbrains.services.lambda.execution.BaseLambdaOptions
import java.util.LinkedHashMap

class LocalLambdaOptions : BaseLambdaOptions() {
    @get:Property(flat = true) // flat for backwards compat
    var functionOptions by property(FunctionOptions())
}

class FunctionOptions : BaseState() {
    var useTemplate by property(false)
    var templateFile by string()
    @get:OptionTag("logicalFunctionName")
    var logicalId by string()
    var runtime by string()
    var handler by string()
    var environmentVariables by map(LinkedHashMap<String, String>())
}

class SamOptions : BaseState() {
    var dockerNetwork by string()
    var useContainers by property(false)
    var skipImagePull by property(false)
}
