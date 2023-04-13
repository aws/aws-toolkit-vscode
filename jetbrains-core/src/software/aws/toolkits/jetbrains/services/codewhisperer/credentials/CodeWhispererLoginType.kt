// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

enum class CodeWhispererLoginType(val displayName: String) {
    SSO("IAM Identity Center"),
    Sono("Builder ID"),
    Accountless("Access Code"),
    Logout("Logout"),
    Expired("Expired")
}
