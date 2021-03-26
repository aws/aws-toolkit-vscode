// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.GoLanguage
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.module.WebModuleTypeBase
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroup

class GoRuntimeGroup : SdkBasedRuntimeGroup() {
    override val id: String = BuiltInRuntimeGroups.Go
    override val languageIds: Set<String> = setOf(GoLanguage.INSTANCE.id)
    override val supportsPathMappings: Boolean = false
    override fun getModuleType(): ModuleType<*> = WebModuleTypeBase.getInstance()
    override val supportedRuntimes = listOf(
        LambdaRuntime.GO1_X
    )

    // Since we only have one option, we don't need to actually determine it. This is only called
    // when we already suspect it's a go project, so we only have one real option. In the future
    // we can look at using something like GoModuleSettings.
    override fun determineRuntime(module: Module): LambdaRuntime = determineRuntime(module.project)
    override fun determineRuntime(project: Project): LambdaRuntime = LambdaRuntime.GO1_X

    // Go kind of has this but real projects don't always have an sdk, so ignore it in favor for determineRuntime
    override fun runtimeForSdk(sdk: Sdk): LambdaRuntime? = null
}
