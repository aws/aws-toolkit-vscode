// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

sealed class ToolkitInstallSettings {
    class UseArbitraryLocalPath(val localToolkitPath: String, val s3StagingBucket: String) : ToolkitInstallSettings()
    object UseSelf : ToolkitInstallSettings()
    object UseMarketPlace : ToolkitInstallSettings()
    object None : ToolkitInstallSettings()
}
