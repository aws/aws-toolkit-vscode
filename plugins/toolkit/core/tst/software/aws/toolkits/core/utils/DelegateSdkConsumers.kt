// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.mockito.Mockito
import org.mockito.invocation.InvocationOnMock
import org.mockito.kotlin.KStubbing
import org.mockito.kotlin.withSettings
import org.mockito.stubbing.Answer
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.SdkRequest
import kotlin.reflect.full.isSubclassOf

/**
 * Answer that inspects the target invocation and determines if it should call the real method or respond with a mock answer.
 * This is tied to the implementation of the Java SDK V2's generated client interfaces where lambda based calls use a default implementation to delegate
 * eventually down to a method that takes a built SdkRequest type. The final concrete method is coded to always throw an exception so that is the method that we
 * will mock.
 *
 * This will handle "simple" methods that they generate as well such as ListBuckets that takes 0 arguments.
 */
class DelegateSdkConsumers(private val sdkClass: Class<*>) : Answer<Any> {
    override fun answer(invocation: InvocationOnMock): Any? {
        val method = invocation.method
        return if (method.name == "waiter") {
            createWaiter(invocation.method.returnType, invocation)
        } else if (method.isDefault && method?.parameters?.getOrNull(0)?.type?.kotlin?.isSubclassOf(SdkRequest::class) != true) {
            invocation.callRealMethod()
        } else {
            Mockito.RETURNS_DEFAULTS.answer(invocation)
        }
    }

    private fun createWaiter(waiterType: Class<*>, invocation: InvocationOnMock): Any? {
        val builder = waiterType.getDeclaredMethod("builder").invoke(null)
        with(builder::class.java) {
            getDeclaredMethod("client", sdkClass).invoke(builder, invocation.mock)
            return getDeclaredMethod("build").invoke(builder)
        }
    }
}

inline fun <reified T : SdkClient> delegateMock(verboseLogging: Boolean = false): T = Mockito.mock(
    T::class.java,
    withSettings(
        verboseLogging = verboseLogging,
        defaultAnswer = DelegateSdkConsumers(T::class.java)
    )
)

inline fun <reified T : SdkClient> delegateMock(stubbing: KStubbing<T>.(T) -> Unit): T = delegateMock<T>().apply {
    KStubbing(this).stubbing(this)
}
