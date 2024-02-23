// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.extensions.ExtensionPointName
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject

interface RuntimeDebugSupport : SamDebugSupport {
    fun isSupported(runtime: Runtime): Boolean = true // Default behavior is all runtimes in the runtime group are supported

    companion object : RuntimeGroupExtensionPointObject<RuntimeDebugSupport>(ExtensionPointName("aws.toolkit.lambda.sam.runtimeDebugSupport"))
}
