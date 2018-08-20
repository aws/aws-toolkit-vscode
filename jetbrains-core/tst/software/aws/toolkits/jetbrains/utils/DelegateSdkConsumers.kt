package software.aws.toolkits.jetbrains.utils

import org.mockito.Mockito
import org.mockito.invocation.InvocationOnMock
import org.mockito.stubbing.Answer
import software.amazon.awssdk.core.SdkRequest
import kotlin.reflect.full.isSubclassOf

/**
 * Mockito Answer that will delegate the default helper methods (such as the consumers) to the final method that takes
 * the SdkRequest
 */
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