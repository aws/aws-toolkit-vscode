// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.GoLanguage
import com.goide.sdk.GoSdkType
import com.goide.sdk.GoSdkUtil
import com.intellij.openapi.projectRoots.Sdk
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.RuntimeInfo
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroup

class GoRuntimeGroup : SdkBasedRuntimeGroup() {
    override val id: String = BuiltInRuntimeGroups.Go
    override val languageIds: Set<String> = setOf(GoLanguage.INSTANCE.id)
    override val supportsPathMappings: Boolean = false
    override val supportedRuntimes = listOf(
        RuntimeInfo(Runtime.GO1_X)
    )

    override fun runtimeForSdk(sdk: Sdk): Runtime? {
        if (sdk.sdkType !is GoSdkType) {
            return null
        }
        return when {
            GoSdkUtil.compareVersions(sdk.versionString, "1.0.0") < 0 -> {
                return null
            }
            GoSdkUtil.compareVersions(sdk.versionString, "2.0.0") < 0 -> {
                Runtime.GO1_X
            }
            else -> {
                null
            }
        }
    }
}
