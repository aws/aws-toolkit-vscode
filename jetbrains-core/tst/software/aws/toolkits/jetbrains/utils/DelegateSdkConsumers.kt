// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.nhaarman.mockitokotlin2.KStubbing
import com.nhaarman.mockitokotlin2.withSettings
import org.mockito.Mockito
import org.mockito.invocation.InvocationOnMock
import org.mockito.stubbing.Answer
import software.amazon.awssdk.core.SdkRequest

/**
 * Mockito Answer that will delegate the default helper methods (such as the consumers) to the final method that takes
 * the SdkRequest
 */
class DelegateSdkConsumers : Answer<Any> {
    override fun answer(invocation: InvocationOnMock): Any? {
        val method = invocation.method
        val paramType = method.parameters?.firstOrNull()?.type

        if (method.isDefault && (paramType == null || !SdkRequest::class.java.isAssignableFrom(paramType))) {
            return invocation.callRealMethod()
        }

        return Mockito.RETURNS_DEFAULTS.answer(invocation)
    }
}

inline fun <reified T : Any> delegateMock(): T = Mockito.mock(
    T::class.java,
    withSettings(
        defaultAnswer = DelegateSdkConsumers()
    )
)

inline fun <reified T : Any> delegateMock(stubbing: KStubbing<T>.(T) -> Unit): T = delegateMock<T>().apply {
    KStubbing(this).stubbing(this)
}
