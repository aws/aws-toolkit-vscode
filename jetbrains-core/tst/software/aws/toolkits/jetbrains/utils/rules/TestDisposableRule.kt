// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import org.junit.rules.ExternalResource

class TestDisposableRule : ExternalResource() {
    lateinit var testDisposable: Disposable
        private set

    override fun before() {
        testDisposable = Disposer.newDisposable()
    }

    override fun after() {
        Disposer.dispose(testDisposable)
    }
}
