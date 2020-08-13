// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.jetbrains.rider.ideaInterop.fileTypes.csharp.CSharpLanguage
import com.jetbrains.rider.ideaInterop.fileTypes.vb.VbLanguage
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroup
import software.aws.toolkits.jetbrains.utils.DotNetRuntimeUtils

class DotNetRuntimeGroup : SdkBasedRuntimeGroup() {
    override val id: String = BuiltInRuntimeGroups.Dotnet

    override val runtimes: Set<Runtime> = setOf(
        Runtime.DOTNETCORE2_1,
        Runtime.DOTNETCORE3_1
    )

    override val languageIds: Set<String> = setOf(
        CSharpLanguage.id,
        VbLanguage.id
    )

    override fun runtimeForSdk(sdk: Sdk): Runtime? = null

    override fun determineRuntime(project: Project): Runtime? = DotNetRuntimeUtils.getCurrentDotNetCoreRuntime()
}
