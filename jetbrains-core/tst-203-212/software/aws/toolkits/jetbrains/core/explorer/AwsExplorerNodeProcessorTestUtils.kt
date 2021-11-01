// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.Disposable
import com.intellij.util.concurrency.Invoker

object AwsExplorerNodeProcessorTestUtils {
    fun getInvoker(disposable: Disposable): Invoker = Invoker.Background(disposable)
}
