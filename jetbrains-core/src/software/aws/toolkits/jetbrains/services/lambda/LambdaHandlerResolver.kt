package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.extensions.AbstractExtensionPointBean
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.openapi.util.LazyInstance
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.util.KeyedLazyInstance
import com.intellij.util.xmlb.annotations.Attribute
import software.amazon.awssdk.services.lambda.model.Runtime

/**
 * Used to convert a Runtime specific handler to the PSI element that represents it
 */
interface LambdaHandlerResolver {

    /**
     * Converts the handler string into PSI elements that represent it. I.e. if the Handler points to a file, return the
     * class, or if a method return the method.
     *
     * @return Matching PSI elements or empty array if unable to locate one
     */
    fun findPsiElements(project: Project, handler: String, searchScope: GlobalSearchScope): Array<NavigatablePsiElement>

    class LambdaHandlerResolverExtensionPointBean : AbstractExtensionPointBean(),
        KeyedLazyInstance<LambdaHandlerResolver> {

        @Attribute("implementation")
        lateinit var implementation: String

        /**
         * ID of the Runtime, this should be the [com.intellij.lang.Language.getID] of the parent language of the runtime.
         * i.e. Even if the Lambda is in Kotlin/Scala, the Runtime Language is still Java so Java ID is used
         */
        @Attribute("runtime")
        lateinit var runtime: String

        private val instance = object : LazyInstance<LambdaHandlerResolver>() {
            override fun getInstanceClass(): Class<LambdaHandlerResolver> {
                return findClass(implementation)
            }
        }

        override fun getKey(): String = runtime

        override fun getInstance(): LambdaHandlerResolver = instance.value
    }

    companion object {
        private const val EP_NAME = "aws.toolkit.lambda.handlerResolver"

        private val COLLECTOR =
            object : KeyedExtensionCollector<LambdaHandlerResolver, String>(EP_NAME) {
                override fun keyToString(key: String): String {
                    return key
                }
            }

        fun getResolverForRuntime(runtime: Runtime): LambdaHandlerResolver? {
            val languageId = runtime.getLanguageId()
            return languageId?.let {
                COLLECTOR.findSingle(it)
            }
        }
    }
}