// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterManager
import com.intellij.lang.javascript.JavaScriptSupportLoader
import com.intellij.lang.javascript.JavascriptLanguage
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.module.WebModuleTypeBase
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroup

class NodeJsRuntimeGroup : SdkBasedRuntimeGroup() {
    override val id: String = BuiltInRuntimeGroups.NodeJs
    override val languageIds: Set<String> = setOf(
        JavascriptLanguage.INSTANCE.id,
        JavaScriptSupportLoader.ECMA_SCRIPT_6.id
    )
    override val supportsPathMappings: Boolean = true

    override val supportedRuntimes = listOf(
        LambdaRuntime.NODEJS10_X,
        LambdaRuntime.NODEJS12_X
    )

    override fun determineRuntime(module: Module): Runtime? = determineRuntime(module.project)

    override fun determineRuntime(project: Project): Runtime? =
        NodeJsInterpreterManager.getInstance(project).interpreter?.cachedVersion?.get()?.let {
            when {
                it.major <= 10 -> Runtime.NODEJS10_X
                it.major <= 12 -> Runtime.NODEJS12_X
                else -> null
            }
        }

    /**
     * JavaScript does not define SDK. We override [determineRuntime] for fetching the correct Runtime.
     */
    override fun runtimeForSdk(sdk: Sdk): Runtime? = null

    override fun getModuleType(): ModuleType<*>? = WebModuleTypeBase.getInstance()

    override fun supportsSamBuild(): Boolean = true
}
