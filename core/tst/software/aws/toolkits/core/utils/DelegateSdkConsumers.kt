// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.mockito.Mockito
import org.mockito.invocation.InvocationOnMock
import org.mockito.stubbing.Answer
import software.amazon.awssdk.core.SdkRequest
import kotlin.reflect.full.isSubclassOf

// TODO: Copy pasted from jetbrains-core, better way to share this?
class DelegateSdkConsumers : Answer<Any> {
    override fun answer(invocation: InvocationOnMock): Any? {
        val method = invocation.method
        return if (method.isDefault &&
            method?.parameters?.getOrNull(0)?.type?.kotlin?.isSubclassOf(SdkRequest::class) != true
        ) {
            invocation.callRealMethod()
        } else {
            Mockito.RETURNS_DEFAULTS.answer(invocation)
        }
    }
}
