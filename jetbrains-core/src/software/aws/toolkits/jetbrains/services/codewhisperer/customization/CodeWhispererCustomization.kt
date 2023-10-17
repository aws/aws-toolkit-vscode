// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.customization

data class CodeWhispererCustomization(
    @JvmField
    var arn: String = "",

    @JvmField
    var name: String = "",

    @JvmField
    var description: String? = null,
)
