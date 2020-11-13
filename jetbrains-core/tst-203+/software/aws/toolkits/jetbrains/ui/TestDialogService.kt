// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.TestDialog
import com.intellij.openapi.ui.TestDialogManager
import com.intellij.openapi.ui.TestInputDialog

/**
 * Shim between the new TestDialogManager in 203+ and the old Messages.setTestDialog
 */
object TestDialogService {
    fun setTestDialog(newValue: TestDialog?): TestDialog? = TestDialogManager.setTestDialog(newValue)

    fun setTestInputDialog(newValue: TestInputDialog?): TestInputDialog? = TestDialogManager.setTestInputDialog(newValue)
}
