// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.extensions

import com.intellij.testFramework.DisposableRule
import org.junit.jupiter.api.extension.AfterAllCallback
import org.junit.jupiter.api.extension.ExtensionContext

/**
 * Same as [com.intellij.testFramework.DisposableExtension], but AfterAll instead of AfterEach
 */
@Deprecated("Should be injected with annotations available in 223 instead")
class DisposerAfterAllExtension : DisposableRule(), AfterAllCallback {
    override fun afterAll(context: ExtensionContext) {
        after()
    }
}
