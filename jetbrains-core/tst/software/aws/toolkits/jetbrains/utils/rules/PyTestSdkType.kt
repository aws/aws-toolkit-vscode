// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.SdkAdditionalData
import com.intellij.openapi.projectRoots.SdkTypeId
import com.jetbrains.python.PyNames
import com.jetbrains.python.psi.LanguageLevel
import org.jdom.Element

class PyTestSdkType(private val level: LanguageLevel) : SdkTypeId {
    override fun getName(): String = PyNames.PYTHON_SDK_ID_NAME

    override fun getVersionString(sdk: Sdk) = "FakeCPython ${level.toPythonVersion()}"

    override fun saveAdditionalData(additionalData: SdkAdditionalData, additional: Element) {
    }

    override fun loadAdditionalData(currentSdk: Sdk, additional: Element) = null
}
