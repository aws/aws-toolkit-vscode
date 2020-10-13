// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.util.ui.EmptyIcon
import com.jetbrains.python.sdk.add.PyAddSdkGroupPanel
import com.jetbrains.python.sdk.add.PyAddSdkPanel
import java.util.function.Supplier

fun createPythonSdkPanel(panels: List<PyAddSdkPanel>, defaultPanel: PyAddSdkPanel): PyAddSdkGroupPanel =
    // String and icon aren't used, they are just returned again in the icon and panelName val's
    PyAddSdkGroupPanel(Supplier { "Python SDK" }, EmptyIcon.ICON_16, panels, defaultPanel)
