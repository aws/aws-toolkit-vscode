// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.projectRoots.Sdk
import com.jetbrains.python.PythonLanguage
import com.jetbrains.python.sdk.PythonSdkType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupInformation

class PythonRuntimeGroup : RuntimeGroupInformation {
    override val runtimes: Set<Runtime> = setOf(
        Runtime.PYTHON2_7,
        Runtime.PYTHON3_6
    )

    override val languageIds: Set<String> = setOf(PythonLanguage.INSTANCE.id)

    override fun runtimeForSdk(sdk: Sdk): Runtime? = when {
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isPy3K -> Runtime.PYTHON3_6
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isPython2 -> Runtime.PYTHON2_7
        else -> null
    }
}