// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.GoLanguage
import com.goide.sdk.GoSdkService
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

    override fun runtimeForSdk(sdk: Sdk): LambdaRuntime? = null
    override fun determineRuntime(project: Project): LambdaRuntime? = null
    override fun determineRuntime(module: Module): LambdaRuntime? {
        val goSdkService = GoSdkService.getInstance(module.project)
        return if (goSdkService.isGoModule(module)) {
            LambdaRuntime.GO1_X
        } else {
            null
        }
    }
}
