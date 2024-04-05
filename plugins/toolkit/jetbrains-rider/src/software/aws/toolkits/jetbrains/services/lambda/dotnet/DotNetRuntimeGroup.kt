// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.jetbrains.rider.ideaInterop.fileTypes.vb.VbLanguage
import com.jetbrains.rider.languages.fileTypes.csharp.CSharpLanguage
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroup
import software.aws.toolkits.jetbrains.utils.DotNetRuntimeUtils

class DotNetRuntimeGroup : SdkBasedRuntimeGroup() {
    override val id: String = BuiltInRuntimeGroups.Dotnet
    override val supportsPathMappings: Boolean = false

    override val languageIds: Set<String> = setOf(
        CSharpLanguage.id,
        VbLanguage.id
    )
    override val supportedRuntimes = listOf(
        LambdaRuntime.DOTNET6_0
    )

    override fun runtimeForSdk(sdk: Sdk): LambdaRuntime? = null

    override fun determineRuntime(project: Project): LambdaRuntime = DotNetRuntimeUtils.getCurrentDotNetCoreRuntime()
}
