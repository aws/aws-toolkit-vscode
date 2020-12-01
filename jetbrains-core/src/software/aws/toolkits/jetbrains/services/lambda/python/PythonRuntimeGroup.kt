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
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.RuntimeInfo
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroup

class PythonRuntimeGroup : SdkBasedRuntimeGroup() {
    override val id: String = BuiltInRuntimeGroups.Python
    override val languageIds: Set<String> = setOf(PythonLanguage.INSTANCE.id)
    override val supportsPathMappings: Boolean = true

    override val supportedRuntimes = listOf(
        RuntimeInfo(Runtime.PYTHON2_7),
        RuntimeInfo(Runtime.PYTHON3_6),
        RuntimeInfo(Runtime.PYTHON3_7),
        RuntimeInfo(Runtime.PYTHON3_8)
    )

    override fun runtimeForSdk(sdk: Sdk): Runtime? = when {
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isAtLeast(LanguageLevel.PYTHON38) -> Runtime.PYTHON3_8
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isAtLeast(LanguageLevel.PYTHON37) -> Runtime.PYTHON3_7
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isPy3K -> Runtime.PYTHON3_6
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isPython2 -> Runtime.PYTHON2_7
        else -> null
    }

    override fun getModuleType(): ModuleType<*> = PythonModuleTypeBase.getInstance()

    override fun getIdeSdkType(): SdkType = PythonSdkType.getInstance()

    override fun supportsSamBuild(): Boolean = true
}
