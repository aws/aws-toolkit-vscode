// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.jetbrains.python.psi.LanguageLevel
import com.jetbrains.python.sdk.flavors.CPythonSdkFlavor
import com.jetbrains.python.sdk.flavors.PyFlavorData
import org.jetbrains.annotations.NotNull

internal class FakeCPython(private val languageLevel: LanguageLevel) : CPythonSdkFlavor<PyFlavorData.Empty>() {
    @NotNull
    override fun getName(): String = "FakeCPython"

    override fun getVersionString(sdkHome: String?) = "$name ${languageLevel.toPythonVersion()}"
}
