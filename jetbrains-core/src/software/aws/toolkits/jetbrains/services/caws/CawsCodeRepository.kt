// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

data class CawsCodeRepository(
    val space: String,
    val project: String,
    val name: String
) {
    val presentableString by lazy { "$space/$project/$name" }
}
