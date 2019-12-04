// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.jetbrains.rider.ideaInterop.fileTypes.csharp.CSharpLanguage
import com.jetbrains.rider.ideaInterop.fileTypes.vb.VbLanguage
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroupInformation
import software.aws.toolkits.jetbrains.utils.DotNetRuntimeUtils

class DotNetRuntimeGroup : SdkBasedRuntimeGroupInformation() {

    override val runtimes: Set<Runtime>
        get() = setOf(
                Runtime.DOTNETCORE2_0,
                Runtime.DOTNETCORE2_1
        )

    override val languageIds: Set<String>
        get() = setOf(CSharpLanguage.id, VbLanguage.id)

    override fun runtimeForSdk(sdk: Sdk): Runtime? = null

    override fun supportsSamBuild(): Boolean = true

    override fun determineRuntime(project: Project): Runtime? =
        DotNetRuntimeUtils.getCurrentDotNetCoreRuntime()
}
