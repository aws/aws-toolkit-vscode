// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.lambda

import software.amazon.awssdk.services.lambda.model.Architecture

enum class LambdaArchitecture(
    private val architecture: Architecture,
    val minSam: String? = null,
) {
    X86_64(Architecture.X86_64),
    ARM64(Architecture.ARM64, minSam = "1.33.0");

    override fun toString() = architecture.toString()

    fun toSdkArchitecture() = architecture.validOrNull

    companion object {
        fun fromValue(value: String?): LambdaArchitecture? = if (value == null) {
            null
        } else {
            values().find { it.toString() == value }
        }

        fun fromValue(value: Architecture): LambdaArchitecture? = values().find { it.architecture == value }

        val DEFAULT = X86_64
        val ARM_COMPATIBLE = listOf(X86_64, ARM64)
    }
}
