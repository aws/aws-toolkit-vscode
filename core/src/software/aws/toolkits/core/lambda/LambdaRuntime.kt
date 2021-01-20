// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.lambda

import software.amazon.awssdk.services.lambda.model.Runtime

enum class LambdaRuntime(private val runtime: Runtime?, private val runtimeOverride: String? = null) {
    NODEJS10_X(Runtime.NODEJS10_X),
    NODEJS12_X(Runtime.NODEJS12_X),
    JAVA8(Runtime.JAVA8),
    JAVA8_AL2(Runtime.JAVA8_AL2),
    JAVA11(Runtime.JAVA11),
    PYTHON2_7(Runtime.PYTHON2_7),
    PYTHON3_6(Runtime.PYTHON3_6),
    PYTHON3_7(Runtime.PYTHON3_7),
    PYTHON3_8(Runtime.PYTHON3_8),
    DOTNETCORE2_1(Runtime.DOTNETCORE2_1),
    DOTNETCORE3_1(Runtime.DOTNETCORE3_1),
    DOTNET5_0(null, "dotnet5.0");

    override fun toString() = runtime?.toString() ?: runtimeOverride ?: throw IllegalStateException("LambdaRuntime has no runtime or override string")

    fun toSdkRuntime() = runtime.validOrNull

    companion object {
        fun fromValue(value: String?): LambdaRuntime? = if (value == null) {
            null
        } else {
            values().find { it.toString() == value }
        }

        fun fromValue(value: Runtime): LambdaRuntime? = values().find { it.runtime == value }
    }
}
