// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.testFramework.ProjectRule
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestCoroutineScope
import org.junit.After
import org.junit.Rule
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

/*
 * BaseCoroutineTest contains utilities that are useful for testing corutines which would otherwise
 * have to be copy pasted. It is abstract so it is not implemented.
 */
@ExperimentalCoroutinesApi
abstract class BaseCoroutineTest(@Suppress("UnusedPrivateMember") timeoutSeconds: Int = 15) {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    // TODO: figure out why this doesn't work on 223 Windows
//    @JvmField
//    @Rule
//    val timeout = CoroutinesTimeout.seconds(timeoutSeconds)

    val testCoroutineScope: TestCoroutineScope = TestCoroutineScope()

    @After
    fun after() {
        testCoroutineScope.cleanupTestCoroutines()
    }
}
