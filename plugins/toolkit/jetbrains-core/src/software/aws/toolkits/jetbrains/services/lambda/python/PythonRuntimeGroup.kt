// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.SdkType
import com.jetbrains.python.PythonLanguage
import com.jetbrains.python.PythonModuleTypeBase
import com.jetbrains.python.psi.LanguageLevel
import com.jetbrains.python.sdk.PythonSdkType
import com.jetbrains.python.sdk.PythonSdkUtil
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroup

class PythonRuntimeGroup : SdkBasedRuntimeGroup() {
    override val id: String = BuiltInRuntimeGroups.Python
    override val languageIds: Set<String> = setOf(PythonLanguage.INSTANCE.id)
    override val supportsPathMappings: Boolean = true

    override val supportedRuntimes = listOf(
        LambdaRuntime.PYTHON3_8,
        LambdaRuntime.PYTHON3_9,
        LambdaRuntime.PYTHON3_10,
        LambdaRuntime.PYTHON3_11,
        LambdaRuntime.PYTHON3_12
    )

    override fun runtimeForSdk(sdk: Sdk): LambdaRuntime? = when {
        !PythonSdkUtil.isPythonSdk(sdk) -> null

        PythonSdkType.getLanguageLevelForSdk(sdk).isAtLeast(LanguageLevel.PYTHON312) -> LambdaRuntime.PYTHON3_12
        PythonSdkType.getLanguageLevelForSdk(sdk).isAtLeast(LanguageLevel.PYTHON311) -> LambdaRuntime.PYTHON3_11
        PythonSdkType.getLanguageLevelForSdk(sdk).isAtLeast(LanguageLevel.PYTHON310) -> LambdaRuntime.PYTHON3_10
        PythonSdkType.getLanguageLevelForSdk(sdk).isAtLeast(LanguageLevel.PYTHON39) -> LambdaRuntime.PYTHON3_9
        PythonSdkType.getLanguageLevelForSdk(sdk).isAtLeast(LanguageLevel.PYTHON38) -> LambdaRuntime.PYTHON3_8

        else -> null
    }

    override fun getModuleType(): ModuleType<*> = PythonModuleTypeBase.getInstance()

    override fun getIdeSdkType(): SdkType = PythonSdkType.getInstance()
}
