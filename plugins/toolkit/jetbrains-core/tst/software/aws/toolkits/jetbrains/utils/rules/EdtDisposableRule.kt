// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.runInEdtAndWait

/**
 * A [DisposableRule] that disposes of the test fixture in the EDT.
 */
class EdtDisposableRule : DisposableRule() {
    override fun after() {
        runInEdtAndWait {
            super.after()
        }
    }
}
